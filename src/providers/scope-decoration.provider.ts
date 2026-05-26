import * as vscode from 'vscode';
import type { ScopeInfo, SearchResult } from '../core/scope-detector.core';
import { signatureLineRange } from '../utils/range.util';

/**
 * Provides editor decorations for scope highlighting.
 */
export class ScopeDecorationProvider {
  private currentScopeDecoration: vscode.TextEditorDecorationType;
  private siblingScopeDecoration: vscode.TextEditorDecorationType;
  private pinnedScopeDecoration: vscode.TextEditorDecorationType;
  private matchHighlightDecoration: vscode.TextEditorDecorationType;

  constructor() {
    this.currentScopeDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
      borderWidth: '0 0 0 3px',
      borderStyle: 'solid',
      borderColor: new vscode.ThemeColor('editorCursor.foreground'),
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Center,
      isWholeLine: false,
    });

    this.siblingScopeDecoration = vscode.window.createTextEditorDecorationType({
      borderWidth: '0 0 0 2px',
      borderStyle: 'solid',
      borderColor: new vscode.ThemeColor('editorIndentGuide.activeBackground'),
      backgroundColor: new vscode.ThemeColor('editor.hoverHighlightBackground'),
      isWholeLine: false,
    });

    this.pinnedScopeDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor('editor.selectionHighlightBackground'),
      borderWidth: '0 0 0 3px',
      borderStyle: 'dashed',
      borderColor: new vscode.ThemeColor('editorCursor.foreground'),
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.selectionHighlightForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Center,
      isWholeLine: false,
    });

    this.matchHighlightDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor('editor.findMatchBackground'),
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: new vscode.ThemeColor('editor.findMatchBorder'),
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Center,
    });
  }

  /**
   * Highlight sibling scope signature lines in the editor.
   */
  highlight(editor: vscode.TextEditor, scopes: ScopeInfo[], pinnedScopeName?: string): void {
    const currentRanges: vscode.Range[] = [];
    const siblingRanges: vscode.Range[] = [];
    const pinnedRanges: vscode.Range[] = [];

    for (const scope of scopes) {
      const range = signatureLineRange(editor.document, scope.startLine);

      if (pinnedScopeName && scope.name === pinnedScopeName) {
        pinnedRanges.push(range);
      } else if (scope.isCurrent) {
        currentRanges.push(range);
      } else {
        siblingRanges.push(range);
      }
    }

    editor.setDecorations(this.pinnedScopeDecoration, pinnedRanges);
    editor.setDecorations(this.currentScopeDecoration, currentRanges);
    editor.setDecorations(this.siblingScopeDecoration, siblingRanges);
  }

  /**
   * Highlight search match positions in the editor.
   */
  highlightMatches(editor: vscode.TextEditor, results: SearchResult[]): void {
    const ranges = results.map(
      (r) =>
        new vscode.Range(
          new vscode.Position(r.lineNumber, r.matchStart),
          new vscode.Position(r.lineNumber, r.matchEnd),
        ),
    );

    editor.setDecorations(this.matchHighlightDecoration, ranges);
  }

  /**
   * Clear all decorations from the editor.
   */
  clearAll(editor: vscode.TextEditor): void {
    editor.setDecorations(this.currentScopeDecoration, []);
    editor.setDecorations(this.siblingScopeDecoration, []);
    editor.setDecorations(this.pinnedScopeDecoration, []);
    editor.setDecorations(this.matchHighlightDecoration, []);
  }

  /**
   * Clear only match highlights (preserve scope highlights).
   */
  clearMatches(editor: vscode.TextEditor): void {
    editor.setDecorations(this.matchHighlightDecoration, []);
  }

  dispose(): void {
    this.currentScopeDecoration.dispose();
    this.siblingScopeDecoration.dispose();
    this.pinnedScopeDecoration.dispose();
    this.matchHighlightDecoration.dispose();
  }
}
