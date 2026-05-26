import * as vscode from 'vscode';

/**
 * Status bar item showing current scope and match counts.
 */
export class StatusBarItem {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'scopeSearch.searchInSiblings';
    this.item.tooltip = 'Scope Search — Click to search in sibling scopes';
    this.item.text = '$(telescope) No scope';
  }

  /**
   * Update with current scope info.
   */
  update(currentScope: { name: string; parentName?: string } | undefined): void {
    if (!currentScope) {
      this.item.text = '$(telescope) No scope';
      this.item.tooltip = 'Scope Search — Cursor not in a detectable scope';
      return;
    }

    const parts: string[] = [];
    if (currentScope.parentName) {
      parts.push(currentScope.parentName);
    }
    parts.push(currentScope.name);

    this.item.text = `$(telescope) ${parts.join(' > ')}`;
    this.item.tooltip = `Scope Search — ${parts.join(' > ')}\nClick to search in sibling scopes`;
  }

  /**
   * Show match count from an active search.
   */
  showMatchCount(count: number, siblingCount: number): void {
    this.item.text = `$(telescope) ${count} match${count !== 1 ? 'es' : ''} in ${siblingCount} sibling${siblingCount !== 1 ? 's' : ''}`;
  }

  /**
   * Show search-active state.
   */
  showSearching(): void {
    this.item.text = '$(telescope) $(loading~spin) Searching...';
  }

  show(): void {
    this.item.show();
  }

  hide(): void {
    this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }
}
