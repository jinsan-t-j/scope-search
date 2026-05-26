import * as vscode from 'vscode';
import type { ScopeInfo } from '../core/scope-detector.core';

/**
 * Bracket-matching fallback parser for languages without Tree-sitter WASM.
 * Walks `{}`  pairs to detect scope blocks and siblings.
 */
export class BracketParser {
  /**
   * Detect scopes from bracket pairs in a document.
   */
  getSiblingScopes(document: vscode.TextDocument, cursorPosition: vscode.Position): ScopeInfo[] {
    const text = document.getText();
    const blocks = this.findBracketBlocks(text);

    if (blocks.length === 0) {
      return [];
    }

    // Find the deepest block containing cursor
    const cursorLine = cursorPosition.line;
    let currentBlock: BracketBlock | undefined;

    for (const block of blocks) {
      if (cursorLine >= block.startLine && cursorLine <= block.endLine) {
        if (!currentBlock || block.depth > currentBlock.depth) {
          currentBlock = block;
        }
      }
    }

    if (!currentBlock) {
      return [];
    }

    // Find parent block (one depth level up, containing current)
    let parentBlock: BracketBlock | undefined;
    for (const block of blocks) {
      if (
        block.depth === currentBlock.depth - 1 &&
        block.startLine <= currentBlock.startLine &&
        block.endLine >= currentBlock.endLine
      ) {
        if (!parentBlock || block.depth > parentBlock.depth) {
          parentBlock = block;
        }
      }
    }

    // Find siblings: same depth, same parent
    const siblings = blocks.filter((block) => {
      if (block.depth !== currentBlock!.depth) {
        return false;
      }
      if (parentBlock) {
        return block.startLine >= parentBlock.startLine && block.endLine <= parentBlock.endLine;
      }
      // No parent found: all blocks at same depth are siblings
      return true;
    });

    return siblings.map((block): ScopeInfo => {
      const name = this.extractBlockName(document, block.startLine);
      return {
        name,
        nodeType: 'bracket_block',
        startLine: block.startLine,
        endLine: block.endLine,
        startChar: 0,
        endChar: document.lineAt(block.endLine).text.length,
        isCurrent:
          block.startLine === currentBlock!.startLine && block.endLine === currentBlock!.endLine,
        depth: block.depth,
        parentName: parentBlock
          ? this.extractBlockName(document, parentBlock.startLine)
          : undefined,
      };
    });
  }

  /**
   * Find all bracket-delimited blocks with their depth and line ranges.
   */
  private findBracketBlocks(text: string): BracketBlock[] {
    const blocks: BracketBlock[] = [];
    const stack: Array<{ line: number; depth: number }> = [];
    const lines = text.split('\n');
    let depth = 0;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        // Skip strings and comments (simplified)
        if (ch === '/' && i + 1 < line.length) {
          if (line[i + 1] === '/') {
            break;
          } // line comment → skip rest
          if (line[i + 1] === '*') {
            // block comment — skip until */
            const commentEnd = text.indexOf('*/', this.lineOffset(lines, lineIdx) + i + 2);
            if (commentEnd >= 0) {
              // Fast-forward; recalculate lineIdx
              const remaining = text.substring(this.lineOffset(lines, lineIdx) + i, commentEnd + 2);
              const newlines = (remaining.match(/\n/g) || []).length;
              lineIdx += newlines;
              break;
            }
          }
        }

        if (ch === '"' || ch === "'" || ch === '`') {
          // Skip string literal — find closing quote on same line
          const closeIdx = line.indexOf(ch, i + 1);
          if (closeIdx >= 0) {
            i = closeIdx; // skip to closing quote
          }
          continue;
        }

        if (ch === '{') {
          depth++;
          stack.push({ line: lineIdx, depth });
        } else if (ch === '}') {
          const open = stack.pop();
          if (open) {
            blocks.push({
              startLine: open.line,
              endLine: lineIdx,
              depth: open.depth,
            });
          }
          depth = Math.max(0, depth - 1);
        }
      }
    }

    return blocks;
  }

  /**
   * Get byte offset of a line in the text.
   */
  private lineOffset(lines: string[], lineIdx: number): number {
    let offset = 0;
    for (let i = 0; i < lineIdx; i++) {
      offset += lines[i].length + 1; // +1 for \n
    }
    return offset;
  }

  /**
   * Try to extract a function/method name from the line before a block opening brace.
   */
  private extractBlockName(document: vscode.TextDocument, startLine: number): string {
    // Look at the line with the opening brace and possibly the line before
    const lineText = document.lineAt(startLine).text.trim();

    // Common patterns: function name(...) {  /  name: function(...)  /  def name  /  class Name
    const patterns = [
      /(?:function|def|fn|func)\s+(\w+)/,
      /(?:class|struct|enum|interface|trait|impl|mod|module|namespace)\s+(\w+)/,
      /(\w+)\s*\([^)]*\)\s*\{?\s*$/,
      /(\w+)\s*:\s*(?:function|async)?\s*\(/,
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|_)\s*=>/,
    ];

    for (const pattern of patterns) {
      const match = lineText.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    // If nothing found, check previous line (brace may be on its own line)
    if (startLine > 0) {
      const prevLine = document.lineAt(startLine - 1).text.trim();
      for (const pattern of patterns) {
        const match = prevLine.match(pattern);
        if (match?.[1]) {
          return match[1];
        }
      }
    }

    return '<block>';
  }
}

interface BracketBlock {
  startLine: number;
  endLine: number;
  depth: number;
}
