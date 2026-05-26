import * as vscode from 'vscode';

/**
 * Check if a position is within a line range (0-indexed).
 */
export function positionInRange(
  position: vscode.Position,
  startLine: number,
  endLine: number,
): boolean {
  return position.line >= startLine && position.line <= endLine;
}

/**
 * Check if two line ranges overlap.
 */
export function lineRangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Create a VSCode Range from 0-indexed line numbers (full lines).
 */
export function lineRange(startLine: number, endLine: number): vscode.Range {
  return new vscode.Range(
    new vscode.Position(startLine, 0),
    new vscode.Position(endLine, Number.MAX_SAFE_INTEGER),
  );
}

/**
 * Create a VSCode Range for a single line's first non-whitespace content.
 * Used for decorating scope signature lines.
 */
export function signatureLineRange(document: vscode.TextDocument, line: number): vscode.Range {
  const textLine = document.lineAt(line);
  return new vscode.Range(
    new vscode.Position(line, textLine.firstNonWhitespaceCharacterIndex),
    new vscode.Position(line, textLine.text.length),
  );
}
