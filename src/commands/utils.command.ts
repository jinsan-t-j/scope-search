import * as vscode from 'vscode';
import type { SearchOptions } from '../core/scope-detector.core';

/**
 * Get selected text from the active editor (capped at 200 chars).
 */
export function getSelectedText(editor: vscode.TextEditor): string {
  const selection = editor.selection;
  if (selection.isEmpty) {
    return '';
  }

  const text = editor.document.getText(selection);
  if (text.length > 200) {
    return text.substring(0, 200);
  }
  if (/^\s+$/.test(text)) {
    return '';
  } // Skip whitespace-only

  return text;
}

/**
 * Get default SearchOptions from configuration.
 */
export function getDefaultOptions(): SearchOptions {
  const config = vscode.workspace.getConfiguration('scopeSearch');
  return {
    useRegex: false,
    caseSensitive: false,
    wholeWord: false,
    includeCurrentScope: config.get<boolean>('includeCurrentInSiblings', true),
    maxResults: config.get<number>('maxResults', 500),
  };
}
