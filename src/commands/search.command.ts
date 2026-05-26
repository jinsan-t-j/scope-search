import * as vscode from 'vscode';
import type { ScopeDetector, SearchOptions, ScopeInfo } from '../core/scope-detector.core';
import { Searcher } from '../core/searcher.core';
import type { ScopeSidebarProvider } from '../ui/sidebar-panel.ui';
import { QuickPickSearch } from '../ui/quick-pick-search.ui';
import type { ScopeDecorationProvider } from '../providers/scope-decoration.provider';
import { ScopePinManager } from '../core/pin-manager.core';
import { logger } from '../utils/logger.util';
import { getSelectedText, getDefaultOptions } from './utils.command';

/**
 * Register all search-related Scope Search commands.
 */
export function registerSearchCommands(
  context: vscode.ExtensionContext,
  scopeDetector: ScopeDetector,
  sidebarProvider: ScopeSidebarProvider,
  decorationProvider: ScopeDecorationProvider,
): void {
  const searcher = new Searcher();
  const quickPick = new QuickPickSearch();
  const pinManager = ScopePinManager.getInstance();

  context.subscriptions.push(
    vscode.commands.registerCommand('scopeSearch.searchCurrentScope', async () => {
      logger.info('Command scopeSearch.searchCurrentScope triggered');
      const editor = vscode.window.activeTextEditor;

      const pin = pinManager.getPin();
      let scopes: ScopeInfo[] = [];
      let searchDoc: vscode.TextDocument | undefined;

      if (pin) {
        logger.info(
          `Using pinned scope for current-scope search: ${pin.name} inside ${pin.fileName}`,
        );
        scopes = pin.scopes;
        try {
          searchDoc = await vscode.workspace.openTextDocument(pin.uri);
        } catch (err) {
          logger.error(`Failed to open pinned scope document:`, err);
        }
      } else {
        if (!editor) {
          logger.warn('Search current scope failed: No active editor and no active pinned scope');
          vscode.window.showWarningMessage(
            'Scope Search: No active file or pinned scope to search.',
          );
          return;
        }
        logger.info(`Detecting scopes for file: ${editor.document.fileName}`);
        scopes = await scopeDetector.getSiblingScopes(editor.document, editor.selection.active);
        searchDoc = editor.document;
      }

      if (!searchDoc || scopes.length === 0) {
        logger.info('No scopes detected to perform current-scope search');
        vscode.window.showInformationMessage('Scope Search: No active or pinned scope detected.');
        return;
      }

      const currentScope = pin
        ? scopes.find((s) => s.name === pin.name) || scopes.find((s) => s.isCurrent)
        : scopes.find((s) => s.isCurrent);

      if (!currentScope) {
        logger.info('No active scope detected at cursor or pin');
        vscode.window.showInformationMessage('Scope Search: No current scope detected.');
        return;
      }

      logger.info(
        `Detected current scope: ${currentScope.name} (Lines L${currentScope.startLine + 1}–L${currentScope.endLine + 1})`,
      );

      let query = editor ? getSelectedText(editor) : '';
      if (!query) {
        query =
          (await vscode.window.showInputBox({
            prompt: `Search in ${currentScope.name}...`,
            placeHolder: 'Enter search text...',
          })) ?? '';
      }

      if (!query) {
        logger.info('Current scope search query input cancelled or empty');
        return;
      }

      logger.info(`Running search inside current scope for query: "${query}"`);
      const options: SearchOptions = {
        ...getDefaultOptions(),
        includeCurrentScope: true,
      };

      // Search only current scope
      const results = searcher.search(searchDoc, [currentScope], query, options);
      logger.info(`Current scope search completed. Found ${results.length} result(s)`);

      sidebarProvider.updateScopes(scopes);
      sidebarProvider.updateResults(results);

      await quickPick.showResults(results, query);

      // Highlight matches in editor if it's the active document
      if (editor && editor.document.uri.toString() === searchDoc.uri.toString()) {
        decorationProvider.highlightMatches(editor, results);
      }
    }),
  );
}
