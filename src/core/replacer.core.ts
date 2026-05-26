import * as vscode from 'vscode';
import type { ScopeInfo, SearchOptions } from './scope-detector.core';
import { escapeRegex } from '../utils/text.util';

export interface ReplacePreview {
  lineNumber: number;
  originalText: string;
  replacedText: string;
  scope: ScopeInfo;
}

/**
 * Performs scoped find-and-replace within sibling scopes.
 */
export class Replacer {
  /**
   * Preview replacements without applying them.
   */
  preview(
    document: vscode.TextDocument,
    scopes: ScopeInfo[],
    findQuery: string,
    replaceText: string,
    options: SearchOptions,
  ): ReplacePreview[] {
    if (!findQuery || scopes.length === 0) {
      return [];
    }

    const regex = this.buildRegex(findQuery, options);
    if (!regex) {
      return [];
    }

    const previews: ReplacePreview[] = [];
    const scopesToSearch = options.includeCurrentScope
      ? scopes
      : scopes.filter((s) => !s.isCurrent);

    for (const scope of scopesToSearch) {
      for (let line = scope.startLine; line <= scope.endLine && line < document.lineCount; line++) {
        const lineText = document.lineAt(line).text;
        const lineRegex = new RegExp(regex.source, regex.flags);

        if (lineRegex.test(lineText)) {
          // Reset and apply replacement
          const replacedLine = lineText.replace(new RegExp(regex.source, regex.flags), replaceText);

          if (replacedLine !== lineText) {
            previews.push({
              lineNumber: line,
              originalText: lineText,
              replacedText: replacedLine,
              scope,
            });
          }
        }
      }
    }

    return previews;
  }

  /**
   * Apply replacements to the document.
   */
  async apply(
    document: vscode.TextDocument,
    scopes: ScopeInfo[],
    findQuery: string,
    replaceText: string,
    options: SearchOptions,
  ): Promise<boolean> {
    const previews = this.preview(document, scopes, findQuery, replaceText, options);
    if (previews.length === 0) {
      return false;
    }

    const edit = new vscode.WorkspaceEdit();

    for (const preview of previews) {
      const range = new vscode.Range(
        new vscode.Position(preview.lineNumber, 0),
        new vscode.Position(preview.lineNumber, preview.originalText.length),
      );
      edit.replace(document.uri, range, preview.replacedText);
    }

    return vscode.workspace.applyEdit(edit);
  }

  /**
   * Build a RegExp from query and options.
   */
  private buildRegex(query: string, options: SearchOptions): RegExp | null {
    try {
      let pattern = options.useRegex ? query : escapeRegex(query);

      if (options.wholeWord) {
        pattern = `\\b${pattern}\\b`;
      }

      const flags = options.caseSensitive ? 'g' : 'gi';
      return new RegExp(pattern, flags);
    } catch {
      return null;
    }
  }
}
