import * as vscode from 'vscode';
import { getLanguageConfig } from '../core/language-config.core';
import { TreeSitterParser } from './tree-sitter-parser.parser';
import { BracketParser } from './bracket-parser.parser';
import { IndentParser } from './indent-parser.parser';

export type ParserType = 'tree-sitter' | 'bracket' | 'indent';

/**
 * Factory that selects the appropriate parser for a given language.
 */
export class ParserFactory {
  private treeSitterParser: TreeSitterParser;
  private bracketParser: BracketParser;
  private indentParser: IndentParser;

  constructor(extensionUri: vscode.Uri) {
    this.treeSitterParser = new TreeSitterParser(extensionUri);
    this.bracketParser = new BracketParser();
    this.indentParser = new IndentParser();
  }

  get treeSitter(): TreeSitterParser {
    return this.treeSitterParser;
  }

  get bracket(): BracketParser {
    return this.bracketParser;
  }

  get indent(): IndentParser {
    return this.indentParser;
  }

  /**
   * Determine which parser type to use for a given language.
   */
  getParserType(languageId: string): ParserType {
    const config = getLanguageConfig(languageId);
    if (config) {
      return 'tree-sitter';
    }

    // Fallback based on user config
    const fallbackConfig = vscode.workspace
      .getConfiguration('scopeSearch')
      .get<string>('fallbackParser', 'bracket');

    // Python/Ruby/YAML default to indent parser
    const indentLanguages = ['python', 'ruby', 'yaml', 'coffeescript', 'nim', 'haskell'];
    if (indentLanguages.includes(languageId)) {
      return 'indent';
    }

    if (fallbackConfig === 'indent') {
      return 'indent';
    }
    if (fallbackConfig === 'none') {
      return 'bracket';
    } // still return bracket, just won't match much
    return 'bracket';
  }

  /**
   * Invalidate caches for a document.
   */
  invalidateCache(uri: vscode.Uri): void {
    this.treeSitterParser.invalidateCache(uri);
  }

  dispose(): void {
    this.treeSitterParser.dispose();
  }
}
