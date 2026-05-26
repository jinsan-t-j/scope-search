import * as vscode from 'vscode';
import type Parser from 'web-tree-sitter';
import { getLanguageConfig, type LanguageConfig } from './language-config.core';
import { ParserFactory } from '../parsers/parser-factory.parser';
import { logger } from '../utils/logger.util';

/** Structured information about a detected scope block */
export interface ScopeInfo {
  /** Function/class/method name (or "<anonymous>") */
  name: string;
  /** Tree-sitter node type or fallback type */
  nodeType: string;
  /** 0-indexed start line */
  startLine: number;
  /** 0-indexed end line */
  endLine: number;
  /** Column of start */
  startChar: number;
  /** Column of end */
  endChar: number;
  /** Is this the scope cursor is in? */
  isCurrent: boolean;
  /** Nesting depth */
  depth: number;
  /** Parent scope name */
  parentName?: string;
}

/** A single search match within a scope */
export interface SearchResult {
  scope: ScopeInfo;
  /** 0-indexed absolute line */
  lineNumber: number;
  /** Full line text */
  lineText: string;
  /** Column of match start */
  matchStart: number;
  /** Column of match end */
  matchEnd: number;
  /** The matched text */
  matchText: string;
  /** Context snippet (lines around match) */
  preview: string;
}

/** Search options */
export interface SearchOptions {
  useRegex: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  includeCurrentScope: boolean;
  maxResults: number;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Core scope detection engine.
 * Uses Tree-sitter AST when available, falls back to bracket/indent parsing.
 */
export class ScopeDetector {
  private parserFactory: ParserFactory;

  constructor(extensionUri: vscode.Uri) {
    this.parserFactory = new ParserFactory(extensionUri);
  }

  /**
   * Main API: get sibling scopes for the cursor position.
   */
  async getSiblingScopes(
    document: vscode.TextDocument,
    cursorPosition: vscode.Position,
  ): Promise<ScopeInfo[]> {
    let result: ScopeInfo[] = [];

    // Skip files too large for AST parsing
    if (document.getText().length > MAX_FILE_SIZE) {
      logger.warn(`File too large for AST parsing: ${document.fileName}`);
      result = this.parserFactory.bracket.getSiblingScopes(document, cursorPosition);
    } else {
      const parserType = this.parserFactory.getParserType(document.languageId);

      if (parserType === 'tree-sitter') {
        try {
          result = await this.getTreeSitterScopes(document, cursorPosition);
        } catch (err) {
          logger.warn(`Tree-sitter failed, using fallback: ${err}`);
        }
      }

      // Fallback parsers
      if (result.length === 0) {
        if (parserType === 'indent') {
          result = this.parserFactory.indent.getSiblingScopes(document, cursorPosition);
        } else {
          result = this.parserFactory.bracket.getSiblingScopes(document, cursorPosition);
        }
      }
    }

    // If still no scopes detected, or if we are outside any detectable scope block,
    // fall back to the Entire File scope as a natural default container.
    if (result.length === 0) {
      logger.info('No AST scopes detected; falling back to Entire File scope.');
      result = [
        {
          name: 'Entire File',
          nodeType: 'file',
          startLine: 0,
          endLine: document.lineCount - 1,
          startChar: 0,
          endChar: document.lineAt(document.lineCount - 1).text.length,
          isCurrent: true,
          depth: 0,
        },
      ];
    }

    return result;
  }

  /**
   * Tree-sitter based scope detection.
   */
  private async getTreeSitterScopes(
    document: vscode.TextDocument,
    cursorPosition: vscode.Position,
  ): Promise<ScopeInfo[]> {
    const tree = await this.parserFactory.treeSitter.parse(document);
    if (!tree) {
      return [];
    }

    const config = getLanguageConfig(document.languageId);
    if (!config) {
      return [];
    }

    const rootNode = tree.rootNode;

    // Find the deepest scope node containing cursor
    const currentNode = this.findDeepestScope(rootNode, cursorPosition, config);

    if (!currentNode) {
      return [];
    }

    // Get parent of current scope
    const parentNode = currentNode.parent;
    if (!parentNode) {
      // Current scope is at root — only scope
      return [this.nodeToScopeInfo(currentNode, config, true, 0)];
    }

    // Collect siblings: all children of parent that are scope nodes
    const siblings = this.getSiblingNodes(parentNode, currentNode, config);
    const parentName = this.getNodeName(parentNode, config);
    const parentDepth = this.getNodeDepth(parentNode, config);

    return siblings.map((node) => {
      const isCurrent =
        node.startPosition.row === currentNode.startPosition.row &&
        node.startPosition.column === currentNode.startPosition.column;
      const info = this.nodeToScopeInfo(node, config, isCurrent, parentDepth + 1);
      info.parentName = parentName || undefined;
      return info;
    });
  }

  /**
   * Walk AST to find the deepest scope node containing the cursor.
   */
  private findDeepestScope(
    node: Parser.SyntaxNode,
    cursor: vscode.Position,
    config: LanguageConfig,
  ): Parser.SyntaxNode | null {
    // Check if cursor is within this node
    if (!this.nodeContainsCursor(node, cursor)) {
      return null;
    }

    // Try to find a deeper scope in children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) {
        continue;
      }

      const deeper = this.findDeepestScope(child, cursor, config);
      if (deeper) {
        return deeper;
      }
    }

    // If this node is a scope type, return it
    if (config.scopeNodeTypes.includes(node.type)) {
      return node;
    }

    return null;
  }

  /**
   * Check if a node's range contains the cursor position.
   */
  private nodeContainsCursor(node: Parser.SyntaxNode, cursor: vscode.Position): boolean {
    const startRow = node.startPosition.row;
    const endRow = node.endPosition.row;

    if (cursor.line < startRow || cursor.line > endRow) {
      return false;
    }

    if (cursor.line === startRow && cursor.character < node.startPosition.column) {
      return false;
    }
    if (cursor.line === endRow && cursor.character > node.endPosition.column) {
      return false;
    }

    return true;
  }

  /**
   * Get all sibling scope nodes under the same parent.
   */
  private getSiblingNodes(
    parentNode: Parser.SyntaxNode,
    currentNode: Parser.SyntaxNode,
    config: LanguageConfig,
  ): Parser.SyntaxNode[] {
    const siblings: Parser.SyntaxNode[] = [];

    for (let i = 0; i < parentNode.childCount; i++) {
      const child = parentNode.child(i);
      if (!child) {
        continue;
      }

      // Include children that are the same scope type as current
      // OR any scope type at this level (methods in a class, etc.)
      if (config.scopeNodeTypes.includes(child.type)) {
        siblings.push(child);
      }
    }

    // If no siblings found with exact type match, try broader match
    if (siblings.length <= 1) {
      return siblings;
    }

    return siblings;
  }

  /**
   * Convert a Tree-sitter node to a ScopeInfo.
   */
  private nodeToScopeInfo(
    node: Parser.SyntaxNode,
    config: LanguageConfig,
    isCurrent: boolean,
    depth: number,
  ): ScopeInfo {
    return {
      name: this.getNodeName(node, config) || '<anonymous>',
      nodeType: node.type,
      startLine: node.startPosition.row,
      endLine: node.endPosition.row,
      startChar: node.startPosition.column,
      endChar: node.endPosition.column,
      isCurrent,
      depth,
    };
  }

  /**
   * Extract the name of a scope node from its children.
   */
  private getNodeName(node: Parser.SyntaxNode, config: LanguageConfig): string | null {
    if (!config.nameChildType) {
      return null;
    }

    // Direct child with the name type
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) {
        continue;
      }

      if (child.type === config.nameChildType || child.type === 'identifier') {
        return child.text;
      }

      // For TypeScript: property_identifier for method names
      if (child.type === 'property_identifier') {
        return child.text;
      }
    }

    // For variable declarations: look for name in variable_declarator
    if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
      const declarator = node.childForFieldName('declarator') || node.namedChild(0);
      if (declarator) {
        const nameNode = declarator.childForFieldName('name');
        if (nameNode) {
          return nameNode.text;
        }
      }
    }

    // For decorated definitions (Python): look inside the inner definition
    if (node.type === 'decorated_definition') {
      const definition = node.namedChild(node.namedChildCount - 1);
      if (definition) {
        return this.getNodeName(definition, config);
      }
    }

    return null;
  }

  /**
   * Calculate the nesting depth of a node by counting scope ancestors.
   */
  private getNodeDepth(node: Parser.SyntaxNode, config: LanguageConfig): number {
    let depth = 0;
    let current = node.parent;
    while (current) {
      if (config.scopeNodeTypes.includes(current.type)) {
        depth++;
      }
      current = current.parent;
    }
    return depth;
  }

  /**
   * Get a breadcrumb path for the current scope.
   */
  async getScopeBreadcrumb(
    document: vscode.TextDocument,
    cursorPosition: vscode.Position,
  ): Promise<string> {
    const scopes = await this.getSiblingScopes(document, cursorPosition);
    const current = scopes.find((s) => s.isCurrent);
    if (!current) {
      return '';
    }

    const parts: string[] = [];
    if (current.parentName) {
      parts.push(current.parentName);
    }
    parts.push(current.name);

    return parts.join(' > ');
  }

  /**
   * Invalidate AST cache for a document URI.
   */
  invalidateCache(uri: vscode.Uri): void {
    this.parserFactory.invalidateCache(uri);
  }

  dispose(): void {
    this.parserFactory.dispose();
  }
}
