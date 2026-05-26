import * as vscode from 'vscode';
import type { ScopeDetector, ScopeInfo } from '../core/scope-detector.core';
import { Replacer } from '../core/replacer.core';
import { ScopePinManager } from '../core/pin-manager.core';
import { logger } from '../utils/logger.util';
import { getSelectedText, getDefaultOptions } from './utils.command';

/**
 * Register replace-related Scope Search commands.
 */
export function registerReplaceCommand(
  context: vscode.ExtensionContext,
  scopeDetector: ScopeDetector,
): void {
  const replacer = new Replacer();
  const pinManager = ScopePinManager.getInstance();

  context.subscriptions.push(
    vscode.commands.registerCommand('scopeSearch.replaceInSiblings', async () => {
      logger.info('Command scopeSearch.replaceInSiblings triggered');
      const editor = vscode.window.activeTextEditor;

      const pin = pinManager.getPin();
      let scopes: ScopeInfo[] = [];
      let searchDoc: vscode.TextDocument | undefined;

      if (pin) {
        logger.info(`Using pinned scope context for replace: ${pin.name} inside ${pin.fileName}`);
        scopes = pin.scopes;
        try {
          searchDoc = await vscode.workspace.openTextDocument(pin.uri);
        } catch (err) {
          logger.error(`Failed to open pinned scope document:`, err);
        }
      } else {
        if (!editor) {
          logger.warn('Replace in siblings failed: No active editor and no active pinned scope');
          vscode.window.showWarningMessage(
            'Scope Search: No active file or pinned scope to run replace.',
          );
          return;
        }
        logger.info(`Detecting scopes for file: ${editor.document.fileName}`);
        scopes = await scopeDetector.getSiblingScopes(editor.document, editor.selection.active);
        searchDoc = editor.document;
      }

      if (!searchDoc || scopes.length === 0) {
        logger.info('No sibling scopes detected for replace operation');
        vscode.window.showInformationMessage('Scope Search: No active or pinned scope detected.');
        return;
      }

      const currentScope = scopes.find((s) => s.isCurrent);
      logger.info(
        `Detected ${scopes.length} sibling scope(s) for replace. Current scope: ${currentScope?.name || 'unknown'}`,
      );

      const findQuery = await vscode.window.showInputBox({
        prompt: 'Find in sibling scopes',
        value: editor ? getSelectedText(editor) : '',
      });

      if (!findQuery) {
        logger.info('Replace find query input cancelled');
        return;
      }

      const replaceText = await vscode.window.showInputBox({
        prompt: `Replace "${findQuery}" with...`,
      });

      if (replaceText === undefined) {
        logger.info('Replace text input cancelled');
        return; // Cancelled (empty string is valid)
      }

      logger.info(`Generating preview for replacing "${findQuery}" with "${replaceText}"`);
      const options = getDefaultOptions();
      const previews = replacer.preview(searchDoc, scopes, findQuery, replaceText, options);

      if (previews.length === 0) {
        logger.info(`No matches found for "${findQuery}" in sibling scopes`);
        vscode.window.showInformationMessage(
          `No matches found for "${findQuery}" in sibling scopes.`,
        );
        return;
      }

      logger.info(`Found ${previews.length} match(es) for replacement`);
      const confirm = await vscode.window.showQuickPick(
        [{ label: `Replace ${previews.length} occurrence(s)`, picked: true }, { label: 'Cancel' }],
        { title: `Replace "${findQuery}" → "${replaceText}" in sibling scopes` },
      );

      if (confirm?.label.startsWith('Replace')) {
        logger.info('Replacement confirmed by user, applying changes...');
        const success = await replacer.apply(searchDoc, scopes, findQuery, replaceText, options);

        if (success) {
          logger.info(`Successfully replaced ${previews.length} occurrence(s) in sibling scopes`);
          vscode.window.showInformationMessage(
            `Replaced ${previews.length} occurrence(s) in sibling scopes.`,
          );
        } else {
          logger.error('Failed to apply text replacement edit');
        }
      } else {
        logger.info('Replacement cancelled by user');
      }
    }),
  );
}
