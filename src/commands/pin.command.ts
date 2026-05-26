import * as vscode from 'vscode';
import * as path from 'path';
import type { ScopeDetector, ScopeInfo } from '../core/scope-detector.core';
import { ScopePinManager, type PinnedScope } from '../core/pin-manager.core';
import { logger } from '../utils/logger.util';
import type { ScopeSidebarProvider } from '../ui/sidebar-panel.ui';

/**
 * Register all pin-related commands.
 */
export function registerPinCommands(
  context: vscode.ExtensionContext,
  scopeDetector: ScopeDetector,
  sidebarProvider: ScopeSidebarProvider,
): void {
  const pinManager = ScopePinManager.getInstance();

  context.subscriptions.push(
    vscode.commands.registerCommand('scopeSearch.addToScopeSearch', async () => {
      logger.info('Command scopeSearch.addToScopeSearch triggered');
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        logger.warn('Add to scope search failed: No active editor');
        return;
      }

      const document = editor.document;
      const selection = editor.selection;
      const fileName = path.basename(document.fileName);

      const startLine = selection.start.line;
      const endLine = selection.end.line;

      logger.info(
        `Adding selection to scope search: ${fileName} L${startLine + 1}–L${endLine + 1}`,
      );

      const midLine = Math.floor((startLine + endLine) / 2);
      const midPosition = new vscode.Position(midLine, 0);
      const detectedScopes = await scopeDetector.getSiblingScopes(document, midPosition);

      let pin: PinnedScope;
      let scopes: ScopeInfo[] = [];

      const matchingScope =
        detectedScopes.find((s) => s.startLine <= startLine && s.endLine >= endLine) ||
        detectedScopes.find((s) => s.isCurrent);

      if (matchingScope) {
        scopes = detectedScopes;
        pin = {
          uri: document.uri,
          fileName,
          name: matchingScope.name,
          startLine: matchingScope.startLine,
          endLine: matchingScope.endLine,
          nodeType: matchingScope.nodeType,
          parentName: matchingScope.parentName,
          scopes,
        };
      } else {
        const customScope: ScopeInfo = {
          name: `Range L${startLine + 1}–L${endLine + 1}`,
          nodeType: 'custom_range',
          startLine,
          endLine,
          startChar: 0,
          endChar: document.lineAt(endLine).text.length,
          isCurrent: true,
          depth: 0,
        };
        scopes = [customScope];
        pin = {
          uri: document.uri,
          fileName,
          name: customScope.name,
          startLine,
          endLine,
          nodeType: customScope.nodeType,
          scopes,
        };
      }

      pinManager.addPin(pin);
      logger.info(`Successfully added scope context: ${pin.name} inside ${pin.fileName}`);
      await vscode.commands.executeCommand('scopeSearch.panel.focus');
      sidebarProvider.updateScopes(scopes);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('scopeSearch.unpinScope', (uriStr?: string) => {
      logger.info(`Command scopeSearch.unpinScope triggered with URI: ${uriStr || 'all'}`);
      if (uriStr) {
        try {
          const uri = vscode.Uri.parse(uriStr);
          pinManager.removePin(uri);
          logger.info(`Scope pinned context for ${uriStr} cleared successfully`);
        } catch (err) {
          logger.error(`Failed to unpin URI ${uriStr}:`, err);
        }
      } else {
        pinManager.clearPins();
        logger.info('All scope pinned contexts cleared successfully');
      }
    }),
  );
}
