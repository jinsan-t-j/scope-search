import * as vscode from 'vscode';
import Parser from 'web-tree-sitter';
import { join } from 'path';
import { getLanguageConfig, type LanguageConfig } from '../core/language-config.core';
import { logger } from '../utils/logger.util';

/**
 * Tree-sitter WASM parser with lazy grammar loading and AST caching.
 */
export class TreeSitterParser {
  private parser: Parser | undefined;
  private initPromise: Promise<void> | undefined;
  private languageCache = new Map<string, Parser.Language>();
  private astCache = new Map<string, { version: number; tree: Parser.Tree }>();
  private extensionPath: string;

  constructor(extensionUri: vscode.Uri) {
    this.extensionPath = extensionUri.fsPath;
  }

  /**
   * Initialize the web-tree-sitter runtime (once).
   */
  private async ensureInitialized(): Promise<void> {
    if (this.parser) {
      return;
    }
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      const wasmPath = join(this.extensionPath, 'out', 'tree-sitter.wasm');
      await Parser.init({
        locateFile: () => wasmPath,
      });
      this.parser = new Parser();
      logger.info('Tree-sitter WASM runtime initialized');
    })();

    await this.initPromise;
  }

  /**
   * Load a language grammar WASM (cached per language).
   */
  private async loadLanguage(config: LanguageConfig): Promise<Parser.Language> {
    const cached = this.languageCache.get(config.wasmFile);
    if (cached) {
      return cached;
    }

    const wasmPath = join(this.extensionPath, 'out', 'grammars', config.wasmFile);
    const language = await Parser.Language.load(wasmPath);
    this.languageCache.set(config.wasmFile, language);
    logger.info(`Loaded grammar: ${config.wasmFile}`);
    return language;
  }

  /**
   * Parse a document and return its AST tree (cached by URI + version).
   */
  async parse(document: vscode.TextDocument): Promise<Parser.Tree | null> {
    const config = getLanguageConfig(document.languageId);
    if (!config) {
      return null;
    }

    const cacheKey = document.uri.toString();
    const cached = this.astCache.get(cacheKey);
    if (cached && cached.version === document.version) {
      return cached.tree;
    }

    try {
      await this.ensureInitialized();
      if (!this.parser) {
        return null;
      }

      const language = await this.loadLanguage(config);
      this.parser.setLanguage(language);

      const tree = this.parser.parse(document.getText());
      this.astCache.set(cacheKey, { version: document.version, tree });
      return tree;
    } catch (err) {
      logger.error(`Failed to parse ${document.fileName}:`, err);
      return null;
    }
  }

  /**
   * Invalidate cached AST for a document.
   */
  invalidateCache(uri: vscode.Uri): void {
    this.astCache.delete(uri.toString());
  }

  /**
   * Clear all caches and free resources.
   */
  dispose(): void {
    for (const [, entry] of this.astCache) {
      entry.tree.delete();
    }
    this.astCache.clear();
    this.languageCache.clear();
    this.parser?.delete();
    this.parser = undefined;
    this.initPromise = undefined;
  }
}
