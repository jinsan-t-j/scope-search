import * as vscode from 'vscode';
import type { SearchResult } from '../core/scope-detector.core';

/**
 * QuickPick-based search UI for Scope Search results.
 */
export class QuickPickSearch {
  /**
   * Show search results in a QuickPick UI grouped by scope.
   */
  async showResults(results: SearchResult[], query: string): Promise<void> {
    if (results.length === 0) {
      vscode.window.showInformationMessage(`No matches found for "${query}" in sibling scopes.`);
      return;
    }

    // Group results by scope name
    const grouped = new Map<string, SearchResult[]>();
    for (const result of results) {
      const key = result.scope.name;
      const group = grouped.get(key) || [];
      group.push(result);
      grouped.set(key, group);
    }

    // Build QuickPick items
    const items: QuickPickResultItem[] = [];

    for (const [scopeName, scopeResults] of grouped) {
      // Separator
      items.push({
        label: `$(symbol-method) ${scopeName}`,
        description: `[L${scopeResults[0].scope.startLine + 1}–L${scopeResults[0].scope.endLine + 1}]`,
        detail: `${scopeResults.length} match${scopeResults.length !== 1 ? 'es' : ''}`,
        kind: vscode.QuickPickItemKind.Separator,
        result: scopeResults[0],
      });

      for (const result of scopeResults) {
        const lineNum = `L${result.lineNumber + 1}`;
        const trimmedLine = result.lineText.trim();

        items.push({
          label: `  ${lineNum}`,
          description: trimmedLine.length > 120 ? trimmedLine.substring(0, 120) + '…' : trimmedLine,
          detail: result.scope.isCurrent ? '(current scope)' : undefined,
          result,
        });
      }
    }

    const quickPick = vscode.window.createQuickPick<QuickPickResultItem>();
    quickPick.title = `🔭 Scope Search — ${results.length} results for "${query}"`;
    quickPick.placeholder = 'Select a result to navigate...';
    quickPick.items = items.filter((i) => i.kind !== vscode.QuickPickItemKind.Separator);
    quickPick.matchOnDescription = true;

    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      if (selected?.result) {
        this.navigateToResult(selected.result);
      }
      quickPick.dispose();
    });

    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
  }

  /**
   * Navigate editor to a search result.
   */
  private navigateToResult(result: SearchResult): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const position = new vscode.Position(result.lineNumber, result.matchStart);
    const matchRange = new vscode.Range(
      position,
      new vscode.Position(result.lineNumber, result.matchEnd),
    );

    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(matchRange, vscode.TextEditorRevealType.InCenter);

    // Briefly highlight the match
    const decoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor('editor.findMatchBackground'),
      borderWidth: '2px',
      borderStyle: 'solid',
      borderColor: new vscode.ThemeColor('editor.findMatchBorder'),
    });

    editor.setDecorations(decoration, [matchRange]);

    // Remove highlight after 2 seconds
    setTimeout(() => {
      decoration.dispose();
    }, 2000);
  }
}

interface QuickPickResultItem extends vscode.QuickPickItem {
  result: SearchResult;
}
