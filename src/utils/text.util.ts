import * as vscode from 'vscode';

const MAX_LINE_DISPLAY_LENGTH = 1000;
const DEFAULT_CONTEXT_LINES = 2;

/**
 * Get a preview snippet of surrounding lines around a match.
 */
export function getPreviewSnippet(
  document: vscode.TextDocument,
  lineNumber: number,
  contextLines: number = DEFAULT_CONTEXT_LINES,
): string {
  const startLine = Math.max(0, lineNumber - contextLines);
  const endLine = Math.min(document.lineCount - 1, lineNumber + contextLines);

  const lines: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    const prefix = i === lineNumber ? '>' : ' ';
    const lineText = truncateLine(document.lineAt(i).text);
    lines.push(`${prefix} ${i + 1}: ${lineText}`);
  }
  return lines.join('\n');
}

/**
 * Truncate a line to a max length for display.
 */
export function truncateLine(text: string, maxLength: number = MAX_LINE_DISPLAY_LENGTH): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '…';
}

/**
 * Escape HTML special characters for webview display.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Highlight a match within text using HTML <mark> tags.
 */
export function highlightMatch(text: string, matchStart: number, matchEnd: number): string {
  // Adjust positions after escaping — simplified approach:
  // re-highlight on the escaped text by finding the same substring
  const before = escapeHtml(text.substring(0, matchStart));
  const match = escapeHtml(text.substring(matchStart, matchEnd));
  const after = escapeHtml(text.substring(matchEnd));
  return `${before}<mark>${match}</mark>${after}`;
}

/**
 * Escape special regex characters in a string for literal matching.
 */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
