import * as vscode from 'vscode';
import type { ScopeInfo } from '../core/scope-detector.core';

/**
 * Indent-based fallback parser for Python, Ruby, YAML, and other whitespace-significant languages.
 * Detects blocks by consistent indentation levels.
 */
export class IndentParser {
  /**
   * Detect scopes from indentation in a document.
   */
  getSiblingScopes(document: vscode.TextDocument, cursorPosition: vscode.Position): ScopeInfo[] {
    const blocks = this.findIndentBlocks(document);
    if (blocks.length === 0) {
      return [];
    }

    const cursorLine = cursorPosition.line;

    // Find the deepest block containing cursor
    let currentBlock: IndentBlock | undefined;
    for (const block of blocks) {
      if (cursorLine >= block.startLine && cursorLine <= block.endLine) {
        if (!currentBlock || block.indent > currentBlock.indent) {
          currentBlock = block;
        }
      }
    }

    if (!currentBlock) {
      return [];
    }

    // Find parent: nearest block at lower indent level that contains current
    let parentBlock: IndentBlock | undefined;
    for (const block of blocks) {
      if (
        block.indent < currentBlock.indent &&
        block.startLine <= currentBlock.startLine &&
        block.endLine >= currentBlock.endLine
      ) {
        if (!parentBlock || block.indent > parentBlock.indent) {
          parentBlock = block;
        }
      }
    }

    // Siblings: same indent level, inside same parent
    const siblings = blocks.filter((block) => {
      if (block.indent !== currentBlock!.indent) {
        return false;
      }
      if (parentBlock) {
        return block.startLine >= parentBlock.startLine && block.endLine <= parentBlock.endLine;
      }
      return true;
    });

    return siblings.map(
      (block): ScopeInfo => ({
        name: block.name,
        nodeType: 'indent_block',
        startLine: block.startLine,
        endLine: block.endLine,
        startChar: 0,
        endChar: document.lineAt(block.endLine).text.length,
        isCurrent:
          block.startLine === currentBlock!.startLine && block.endLine === currentBlock!.endLine,
        depth: block.depth,
        parentName: parentBlock?.name,
      }),
    );
  }

  /**
   * Find all indent-based blocks in the document.
   * A block starts with a definition keyword line and includes all subsequent
   * lines with greater indentation.
   */
  private findIndentBlocks(document: vscode.TextDocument): IndentBlock[] {
    const blocks: IndentBlock[] = [];
    const lineCount = document.lineCount;

    // Only scope-defining patterns (skip control flow for sibling matching)
    const scopePatterns = [
      /^(\s*)(?:def|async\s+def)\s+(\w+)/,
      /^(\s*)(?:class)\s+(\w+)/,
      /^(\s*)(?:module)\s+(\w+)/,
    ];

    for (let i = 0; i < lineCount; i++) {
      const lineText = document.lineAt(i).text;
      if (lineText.trim() === '') {
        continue;
      }

      for (const pattern of scopePatterns) {
        const match = lineText.match(pattern);
        if (!match) {
          continue;
        }

        const indent = match[1].length;
        const name = match[2] || '<block>';

        // Find end of block: next line at same or lesser indent (non-empty)
        let endLine = i;
        for (let j = i + 1; j < lineCount; j++) {
          const nextLine = document.lineAt(j).text;
          if (nextLine.trim() === '') {
            endLine = j;
            continue;
          }
          const nextIndent = nextLine.length - nextLine.trimStart().length;
          if (nextIndent <= indent) {
            break;
          }
          endLine = j;
        }

        // Calculate depth from indent
        const depth = Math.floor(indent / this.detectIndentSize(document)) + 1;

        blocks.push({
          startLine: i,
          endLine,
          indent,
          depth,
          name,
        });
        break; // Only match first pattern per line
      }
    }

    return blocks;
  }

  /**
   * Detect the indent size used in the document (2 or 4 spaces, or tab).
   */
  private detectIndentSize(document: vscode.TextDocument): number {
    const lineCount = Math.min(document.lineCount, 100);
    const indentCounts = new Map<number, number>();

    for (let i = 0; i < lineCount; i++) {
      const text = document.lineAt(i).text;
      if (text.trim() === '') {
        continue;
      }
      const indent = text.length - text.trimStart().length;
      if (indent > 0) {
        indentCounts.set(indent, (indentCounts.get(indent) || 0) + 1);
      }
    }

    // Find GCD of all indents to detect base indent size
    let gcd = 0;
    for (const indent of indentCounts.keys()) {
      gcd = gcd === 0 ? indent : this.gcd(gcd, indent);
    }

    return gcd || 4; // Default to 4
  }

  private gcd(a: number, b: number): number {
    while (b > 0) {
      [a, b] = [b, a % b];
    }
    return a;
  }
}

interface IndentBlock {
  startLine: number;
  endLine: number;
  indent: number;
  depth: number;
  name: string;
}
