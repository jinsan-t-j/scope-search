import * as vscode from 'vscode';
import type { ScopeInfo, SearchResult, SearchOptions } from './scope-detector.core';
import { escapeRegex } from '../utils/text.util';
import { getPreviewSnippet, truncateLine } from '../utils/text.util';

/**
 * Performs text/regex search within specified scope line ranges.
 */
export class Searcher {
  /**
   * Search for a query within the given scopes.
   */
  search(
    document: vscode.TextDocument,
    scopes: ScopeInfo[],
    query: string,
    options: SearchOptions,
  ): SearchResult[] {
    if (!query || scopes.length === 0) {
      return [];
    }

    const results: SearchResult[] = [];
    const regex = this.buildRegex(query, options);
    if (!regex) {
      return [];
    }

    const scopesToSearch = options.includeCurrentScope
      ? scopes
      : scopes.filter((s) => !s.isCurrent);

    for (const scope of scopesToSearch) {
      if (results.length >= options.maxResults) {
        break;
      }

      const scopeResults = this.searchInScope(
        document,
        scope,
        regex,
        options.maxResults - results.length,
      );
      results.push(...scopeResults);
    }

    return results;
  }

  /**
   * Count matches in sibling scopes (lightweight, no result objects).
   */
  countInSiblings(
    document: vscode.TextDocument,
    scopes: ScopeInfo[],
    query: string,
    options: SearchOptions,
  ): number {
    if (!query || scopes.length === 0) {
      return 0;
    }

    const regex = this.buildRegex(query, options);
    if (!regex) {
      return 0;
    }

    let count = 0;
    const scopesToSearch = options.includeCurrentScope
      ? scopes
      : scopes.filter((s) => !s.isCurrent);

    for (const scope of scopesToSearch) {
      for (let line = scope.startLine; line <= scope.endLine && line < document.lineCount; line++) {
        const lineText = document.lineAt(line).text;
        const matches = lineText.matchAll(regex);
        for (const _ of matches) {
          count++;
          if (count >= options.maxResults) {
            return count;
          }
        }
      }
    }

    return count;
  }

  /**
   * Search within a single scope's line range.
   */
  private searchInScope(
    document: vscode.TextDocument,
    scope: ScopeInfo,
    regex: RegExp,
    maxResults: number,
  ): SearchResult[] {
    const results: SearchResult[] = [];

    for (let line = scope.startLine; line <= scope.endLine && line < document.lineCount; line++) {
      if (results.length >= maxResults) {
        break;
      }

      const lineText = document.lineAt(line).text;
      // Reset regex lastIndex for each line
      const lineRegex = new RegExp(regex.source, regex.flags);

      let match: RegExpExecArray | null;
      while ((match = lineRegex.exec(lineText)) !== null) {
        if (results.length >= maxResults) {
          break;
        }

        results.push({
          scope,
          lineNumber: line,
          lineText: truncateLine(lineText),
          matchStart: match.index,
          matchEnd: match.index + match[0].length,
          matchText: match[0],
          preview: getPreviewSnippet(document, line),
        });

        // Prevent infinite loop on zero-length matches
        if (match[0].length === 0) {
          lineRegex.lastIndex++;
        }
      }
    }

    return results;
  }

  /**
   * Build a RegExp from the search query and options.
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
      // Invalid regex
      return null;
    }
  }
}
