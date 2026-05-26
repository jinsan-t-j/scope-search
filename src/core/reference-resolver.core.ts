import * as vscode from 'vscode';
import { logger } from '../utils/logger.util';
import type { SearchResult } from './scope-detector.core';

export interface CrossFileLocation {
  uri: string;
  fileName: string;
  relativePath: string;
  lineNumber: number;
  lineText: string;
  matchStart: number;
  matchEnd: number;
  matchText: string;
}

/** VS Code SymbolKinds that represent structural code elements */
const STRUCTURAL_SYMBOL_KINDS = new Set<vscode.SymbolKind>([
  vscode.SymbolKind.Class,
  vscode.SymbolKind.Function,
  vscode.SymbolKind.Method,
  vscode.SymbolKind.Constructor,
  vscode.SymbolKind.Interface,
  vscode.SymbolKind.Object,
  vscode.SymbolKind.Property,
  vscode.SymbolKind.Variable,
  vscode.SymbolKind.Enum,
  vscode.SymbolKind.Struct,
  vscode.SymbolKind.Module,
  vscode.SymbolKind.TypeParameter,
]);

/**
 * Resolves cross-file references/implementations for search matches
 * AND structural symbols (classes, functions, methods, objects) within the scope.
 */
export class ReferenceResolver {
  /**
   * Resolve cross-file references by:
   * 1. Querying providers at each unique search match position
   * 2. Querying providers for every structural symbol within the scope range
   * Returns deduplicated locations from OTHER files only.
   */
  public async resolveForSearchResults(
    document: vscode.TextDocument,
    scopeResults: SearchResult[],
    pinnedUris: Set<string>,
  ): Promise<CrossFileLocation[]> {
    const seenKeys = new Set<string>();
    const crossFileLocations: CrossFileLocation[] = [];

    // Collect all positions to query: search matches + structural symbols
    const queryPositions: Array<{ position: vscode.Position; symbolName: string }> = [];

    // 1. Add unique search match positions
    const matchKeys = new Set<string>();
    for (const result of scopeResults) {
      const key = `${result.lineNumber}:${result.matchStart}`;
      if (!matchKeys.has(key)) {
        matchKeys.add(key);
        queryPositions.push({
          position: new vscode.Position(result.lineNumber, result.matchStart),
          symbolName: result.matchText,
        });
      }
    }

    // 2. Add structural symbols (classes, functions, methods, objects) within scope range
    const scopeRange = this.getScopeRange(scopeResults);
    if (scopeRange) {
      const structuralPositions = await this.extractStructuralSymbols(
        document,
        scopeRange.startLine,
        scopeRange.endLine,
      );
      for (const sp of structuralPositions) {
        const key = `${sp.position.line}:${sp.position.character}`;
        if (!matchKeys.has(key)) {
          matchKeys.add(key);
          queryPositions.push(sp);
        }
      }
    }

    if (queryPositions.length === 0) {
      return [];
    }

    // 3. Resolve references/implementations for all positions (batched)
    const BATCH_SIZE = 5;
    for (let i = 0; i < queryPositions.length; i += BATCH_SIZE) {
      const batch = queryPositions.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map((qp) => this.resolveAtPosition(document, qp.position)),
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const { symbolName } = batch[j];

        if (result.status !== 'fulfilled') {
          continue;
        }

        for (const loc of result.value) {
          const locUriStr = loc.uri.toString();

          // Exclude pinned files
          if (pinnedUris.has(locUriStr)) {
            continue;
          }

          const key = `${locUriStr}:${loc.range.start.line}:${loc.range.start.character}`;
          if (seenKeys.has(key)) {
            continue;
          }
          seenKeys.add(key);

          try {
            const refDoc = await vscode.workspace.openTextDocument(loc.uri);
            const line = loc.range.start.line;
            const lineText = line < refDoc.lineCount ? refDoc.lineAt(line).text : '';

            crossFileLocations.push({
              uri: locUriStr,
              fileName: refDoc.fileName.split('/').pop() || refDoc.fileName,
              relativePath: vscode.workspace.asRelativePath(loc.uri),
              lineNumber: line,
              lineText,
              matchStart: loc.range.start.character,
              matchEnd: loc.range.end.character,
              matchText: symbolName,
            });
          } catch (err) {
            logger.warn(`Skipping unreadable cross-file location: ${locUriStr}`, err);
          }
        }
      }
    }

    return crossFileLocations;
  }

  /**
   * Extract structural symbols (classes, functions, methods, objects, etc.)
   * within a line range using VS Code's document symbol provider.
   */
  private async extractStructuralSymbols(
    document: vscode.TextDocument,
    startLine: number,
    endLine: number,
  ): Promise<Array<{ position: vscode.Position; symbolName: string }>> {
    const positions: Array<{ position: vscode.Position; symbolName: string }> = [];

    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri,
      );

      if (!Array.isArray(symbols)) {
        return positions;
      }

      this.collectSymbolsInRange(symbols, startLine, endLine, positions);
    } catch (err) {
      logger.warn('Document symbol extraction failed, skipping structural resolution:', err);
    }

    return positions;
  }

  /**
   * Recursively walk document symbols and collect those within the scope range.
   */
  private collectSymbolsInRange(
    symbols: vscode.DocumentSymbol[],
    startLine: number,
    endLine: number,
    out: Array<{ position: vscode.Position; symbolName: string }>,
  ): void {
    for (const sym of symbols) {
      const symStart = sym.selectionRange.start.line;
      const symEnd = sym.selectionRange.end.line;

      // Skip symbols entirely outside scope
      if (symEnd < startLine || symStart > endLine) {
        continue;
      }

      // Collect structural symbols
      if (STRUCTURAL_SYMBOL_KINDS.has(sym.kind)) {
        out.push({
          position: sym.selectionRange.start,
          symbolName: sym.name,
        });
      }

      // Recurse into children (methods inside classes, etc.)
      if (sym.children.length > 0) {
        this.collectSymbolsInRange(sym.children, startLine, endLine, out);
      }
    }
  }

  /**
   * Query both reference and implementation providers at a position.
   * Returns combined, normalized Location array.
   */
  private async resolveAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Location[]> {
    const [refs, impls] = await Promise.allSettled([
      vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
        'vscode.executeReferenceProvider',
        document.uri,
        position,
      ),
      vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
        'vscode.executeImplementationProvider',
        document.uri,
        position,
      ),
    ]);

    const locations: vscode.Location[] = [];

    for (const result of [refs, impls]) {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        for (const loc of result.value) {
          if (loc && 'uri' in loc) {
            locations.push(loc as vscode.Location);
          }
        }
      }
    }

    return locations;
  }

  /**
   * Derive the scope line range from search results.
   */
  private getScopeRange(results: SearchResult[]): { startLine: number; endLine: number } | null {
    if (results.length === 0) {
      return null;
    }

    // Use the scope boundaries from the first result
    const scope = results[0].scope;
    return {
      startLine: scope.startLine,
      endLine: scope.endLine,
    };
  }
}
