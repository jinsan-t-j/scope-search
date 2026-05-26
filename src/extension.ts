import * as vscode from 'vscode';
import { ScopeDetector } from './core/scope-detector.core';
import { ScopeSidebarProvider } from './ui/sidebar-panel.ui';
import { StatusBarItem } from './ui/status-bar-item.ui';
import { ScopeDecorationProvider } from './providers/scope-decoration.provider';
import { registerAllCommands } from './commands/index';
import { Searcher } from './core/searcher.core';
import { logger } from './utils/logger.util';

let cursorMoveTimer: ReturnType<typeof setTimeout> | undefined;
let selectionSearchTimer: ReturnType<typeof setTimeout> | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger.info('Scope Search activating...');

  // Initialize core services
  const scopeDetector = new ScopeDetector(context.extensionUri);
  const decorationProvider = new ScopeDecorationProvider();
  const statusBar = new StatusBarItem();
  const sidebarProvider = new ScopeSidebarProvider(context.extensionUri, scopeDetector);
  const searcher = new Searcher();

  // Helper to update the vscode context key "scopeSearch.hasActiveScope"
  const updateScopeContext = async (editor: vscode.TextEditor | undefined) => {
    if (!editor) {
      vscode.commands.executeCommand('setContext', 'scopeSearch.hasActiveScope', false);
      return;
    }
    try {
      const position = editor.selection.active;
      const scopes = await scopeDetector.getSiblingScopes(editor.document, position);
      const hasActiveScope = scopes.length > 0 && scopes[0].nodeType !== 'file';
      vscode.commands.executeCommand('setContext', 'scopeSearch.hasActiveScope', hasActiveScope);
    } catch {
      vscode.commands.executeCommand('setContext', 'scopeSearch.hasActiveScope', false);
    }
  };

  // Initialize context key
  updateScopeContext(vscode.window.activeTextEditor);

  // Register sidebar webview
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ScopeSidebarProvider.viewType, sidebarProvider),
  );

  // Register all commands
  registerAllCommands(context, scopeDetector, sidebarProvider, decorationProvider);

  // ─── Cursor Movement Listener ───────────────────────
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(async (event) => {
      const editor = event.textEditor;
      const position = editor.selection.active;
      const config = vscode.workspace.getConfiguration('scopeSearch');
      const debounceMs = config.get<number>('debounceMs', 300);

      // Debounced scope detection
      if (cursorMoveTimer) {
        clearTimeout(cursorMoveTimer);
      }
      cursorMoveTimer = setTimeout(async () => {
        try {
          const scopes = await scopeDetector.getSiblingScopes(editor.document, position);
          const currentScope = scopes.find((s) => s.isCurrent);

          // Update status bar
          if (config.get<boolean>('showStatusBar', true)) {
            statusBar.update(currentScope);
          }

          // Update decorations
          if (config.get<boolean>('highlightSiblings', true)) {
            decorationProvider.highlight(editor, scopes);
          }

          // Update sidebar
          sidebarProvider.updateScopes(scopes);

          // Update context key
          const hasActiveScope = scopes.length > 0 && scopes[0].nodeType !== 'file';
          vscode.commands.executeCommand(
            'setContext',
            'scopeSearch.hasActiveScope',
            hasActiveScope,
          );
        } catch {
          // Silently fail — don't interrupt developer workflow
        }
      }, debounceMs);

      // ─── Selection Auto-Search (optional) ──────────
      if (config.get<boolean>('searchOnSelect', false)) {
        const selection = editor.selection;
        if (selection.isEmpty) {
          return;
        }

        const selectedText = editor.document.getText(selection);
        if (selectedText.length < 2 || selectedText.length > 200) {
          return;
        }
        if (/^\s+$/.test(selectedText)) {
          return;
        }

        if (selectionSearchTimer) {
          clearTimeout(selectionSearchTimer);
        }
        selectionSearchTimer = setTimeout(async () => {
          try {
            const scopes = await scopeDetector.getSiblingScopes(editor.document, position);

            const count = searcher.countInSiblings(
              editor.document,
              scopes.filter((s) => !s.isCurrent),
              selectedText,
              {
                useRegex: false,
                caseSensitive: false,
                wholeWord: false,
                includeCurrentScope: false,
                maxResults: 100,
              },
            );

            if (count > 0) {
              statusBar.showMatchCount(count, scopes.length - 1);
            }
          } catch {
            // Silently fail
          }
        }, 500);
      }
    }),
  );

  // ─── Active Editor Change Listener ───────────────────
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      updateScopeContext(editor);
    }),
  );

  // ─── Document Change Listener ───────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      scopeDetector.invalidateCache(event.document.uri);
    }),
  );

  // ─── Show status bar ───────────────────────────────
  const config = vscode.workspace.getConfiguration('scopeSearch');
  if (config.get<boolean>('showStatusBar', true)) {
    statusBar.show();
  }

  // ─── Disposables ───────────────────────────────────
  context.subscriptions.push(
    statusBar,
    decorationProvider,
    { dispose: () => scopeDetector.dispose() },
    { dispose: () => logger.dispose() },
  );

  logger.info('Scope Search activated successfully');
}

export function deactivate(): void {
  if (cursorMoveTimer) {
    clearTimeout(cursorMoveTimer);
  }
  if (selectionSearchTimer) {
    clearTimeout(selectionSearchTimer);
  }
}
