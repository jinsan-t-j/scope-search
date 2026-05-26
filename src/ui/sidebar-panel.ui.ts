import * as vscode from 'vscode';
import * as path from 'path';
import type {
  ScopeDetector,
  ScopeInfo,
  SearchResult,
  SearchOptions,
} from '../core/scope-detector.core';
import { Searcher } from '../core/searcher.core';
import { Replacer } from '../core/replacer.core';
import { ScopePinManager } from '../core/pin-manager.core';
import { logger } from '../utils/logger.util';
import { ReferenceResolver, type CrossFileLocation } from '../core/reference-resolver.core';

/**
 * Sidebar webview panel for Scope Search.
 */
export class ScopeSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'scopeSearch.panel';

  private view?: vscode.WebviewView;
  private pinSub?: vscode.Disposable;
  private currentScopes: ScopeInfo[] = [];
  private currentResults: SearchResult[] = [];
  private searcher = new Searcher();
  private replacer = new Replacer();
  private lastQuery = '';
  private lastOptions: SearchOptions = {
    useRegex: false,
    caseSensitive: false,
    wholeWord: false,
    includeCurrentScope: true,
    maxResults: 500,
  };

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly scopeDetector: ScopeDetector,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    // Dispose of previous subscription if any
    if (this.pinSub) {
      this.pinSub.dispose();
    }

    // Subscribe to pin change events to update webview state in real-time
    const pinManager = ScopePinManager.getInstance();
    const pinSub = pinManager.onDidChangePins((pins) => {
      webviewView.webview.postMessage({
        type: 'pinsUpdated',
        pins: pins.map((p) => ({
          uri: p.uri.toString(),
          fileName: p.fileName,
          name: p.name,
          startLine: p.startLine,
          endLine: p.endLine,
        })),
      });

      if (pins.length > 0) {
        this.updateScopes(pins[pins.length - 1].scopes);
      } else {
        this.refreshScopes();
      }
    });

    this.pinSub = pinSub;

    webviewView.onDidDispose(() => {
      if (this.pinSub) {
        this.pinSub.dispose();
        this.pinSub = undefined;
      }
    });

    webviewView.webview.onDidReceiveMessage((msg: WebviewMessage) => {
      switch (msg.command) {
        case 'ready': {
          const currentPins = pinManager.getPins();
          if (currentPins.length > 0) {
            webviewView.webview.postMessage({
              type: 'pinsUpdated',
              pins: currentPins.map((p) => ({
                uri: p.uri.toString(),
                fileName: p.fileName,
                name: p.name,
                startLine: p.startLine,
                endLine: p.endLine,
              })),
            });
            this.updateScopes(currentPins[currentPins.length - 1].scopes);
          } else {
            this.refreshScopes();
          }
          break;
        }
        case 'search':
          this.handleSearch(msg.query ?? '', msg.options);
          break;
        case 'navigateTo':
          this.navigateToResult(msg.line ?? 0, msg.char ?? 0, msg.uri);
          break;
        case 'replace':
          this.handleReplace(msg.find ?? '', msg.replace ?? '');
          break;
        case 'export':
          this.exportResults();
          break;
        case 'refresh':
          this.refreshScopes();
          break;
        case 'clear':
          this.clearResults();
          break;

        case 'unpin':
          vscode.commands.executeCommand('scopeSearch.unpinScope', msg.uri);
          break;
        case 'getSuggestions':
          this.handleGetSuggestions(msg.query ?? '');
          break;
        case 'pinTarget':
          if (msg.targetUri) {
            this.handlePinTarget(msg.targetUri, msg.startLine, msg.endLine);
          }
          break;
      }
    });
  }

  /**
   * Push scope updates to the webview.
   */
  updateScopes(scopes: ScopeInfo[]): void {
    this.currentScopes = scopes;
    this.view?.webview.postMessage({ type: 'scopesUpdated', scopes });
  }

  /**
   * Push search results to the webview.
   */
  updateResults(
    results: Array<SearchResult & { uri?: string }>,
    crossFileResults?: CrossFileLocation[],
  ): void {
    this.currentResults = results;

    // Serialize results for webview (strip non-serializable data)
    const serializableResults = results.map((r) => ({
      scopeName: r.scope.name,
      scopeStartLine: r.scope.startLine,
      scopeEndLine: r.scope.endLine,
      scopeIsCurrent: r.scope.isCurrent,
      lineNumber: r.lineNumber,
      lineText: r.lineText,
      matchStart: r.matchStart,
      matchEnd: r.matchEnd,
      matchText: r.matchText,
      uri: r.uri,
    }));

    this.view?.webview.postMessage({
      type: 'resultsUpdated',
      results: serializableResults,
      total: results.length,
      crossFileResults: crossFileResults || [],
    });
  }

  /**
   * Trigger a search from the sidebar.
   */
  triggerSearch(query: string, options?: Partial<SearchOptions>): void {
    this.handleSearch(query, options);
    this.view?.webview.postMessage({
      type: 'setQuery',
      query,
    });
  }

  private async handleSearch(query: string, options?: Partial<SearchOptions>): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const pins = ScopePinManager.getInstance().getPins();

    const searchDocs: vscode.TextDocument[] = [];

    if (pins.length > 0) {
      for (const pin of pins) {
        try {
          const doc = await vscode.workspace.openTextDocument(pin.uri);
          searchDocs.push(doc);
        } catch (err) {
          logger.error('Failed to open pinned document for webview search:', err);
        }
      }
    } else if (editor) {
      searchDocs.push(editor.document);
    }

    if (searchDocs.length === 0 || !query) {
      this.view?.webview.postMessage({ type: 'resultsUpdated', results: [], total: 0 });
      return;
    }

    this.lastQuery = query;
    if (options) {
      this.lastOptions = { ...this.lastOptions, ...options };
    }

    const maxResults = vscode.workspace
      .getConfiguration('scopeSearch')
      .get<number>('maxResults', 500);

    this.lastOptions.maxResults = maxResults;

    this.view?.webview.postMessage({ type: 'loading', message: 'Searching...' });

    const allResults: Array<SearchResult & { uri?: string }> = [];

    for (const doc of searchDocs) {
      let scopes = this.currentScopes;
      if (pins.length > 0) {
        const pin = pins.find((p) => p.uri.toString() === doc.uri.toString());
        if (pin && pin.nodeType !== 'file') {
          scopes = [
            {
              name: pin.name,
              nodeType: pin.nodeType,
              startLine: pin.startLine,
              endLine: pin.endLine,
              startChar: 0,
              endChar: doc.lineAt(pin.endLine).text.length,
              isCurrent: true,
              depth: 0,
            },
          ];
        } else {
          scopes = [
            {
              name: 'Entire File',
              nodeType: 'file',
              startLine: 0,
              endLine: doc.lineCount - 1,
              startChar: 0,
              endChar: doc.lineAt(doc.lineCount - 1).text.length,
              isCurrent: true,
              depth: 0,
            },
          ];
        }
      } else if (scopes.length === 0) {
        if (editor) {
          scopes = await this.scopeDetector.getSiblingScopes(
            editor.document,
            editor.selection.active,
          );
        }
        this.currentScopes = scopes;
      }

      const docResults = this.searcher.search(doc, scopes, query, this.lastOptions);
      const relativePath = vscode.workspace.asRelativePath(doc.uri);
      const mappedResults = docResults.map((r) => ({
        ...r,
        uri: doc.uri.toString(),
        scope: {
          ...r.scope,
          name: `${relativePath} > ${r.scope.name}`,
        },
      }));
      allResults.push(...mappedResults);
    }

    // Resolve cross-file references for the matched query
    let crossFileResults: CrossFileLocation[] = [];
    if (allResults.length > 0 && searchDocs.length > 0) {
      const pinnedUris = new Set(searchDocs.map((d) => d.uri.toString()));
      const resolver = new ReferenceResolver();
      try {
        crossFileResults = await resolver.resolveForSearchResults(
          searchDocs[0],
          allResults,
          pinnedUris,
        );
      } catch (err) {
        logger.warn('Cross-file reference resolution skipped:', err);
      }
    }

    this.updateResults(allResults, crossFileResults);
  }

  private async handleReplace(find: string, replace: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const pins = ScopePinManager.getInstance().getPins();

    const searchDocs: vscode.TextDocument[] = [];

    if (pins.length > 0) {
      for (const pin of pins) {
        try {
          const doc = await vscode.workspace.openTextDocument(pin.uri);
          searchDocs.push(doc);
        } catch (err) {
          logger.error('Failed to open pinned document for webview replace:', err);
        }
      }
    } else if (editor) {
      searchDocs.push(editor.document);
    }

    if (searchDocs.length === 0 || !find) {
      return;
    }

    let overallSuccess = false;

    for (const doc of searchDocs) {
      let scopes = this.currentScopes;
      if (pins.length > 0) {
        const pin = pins.find((p) => p.uri.toString() === doc.uri.toString());
        if (pin && pin.nodeType !== 'file') {
          scopes = [
            {
              name: pin.name,
              nodeType: pin.nodeType,
              startLine: pin.startLine,
              endLine: pin.endLine,
              startChar: 0,
              endChar: doc.lineAt(pin.endLine).text.length,
              isCurrent: true,
              depth: 0,
            },
          ];
        } else {
          scopes = [
            {
              name: 'Entire File',
              nodeType: 'file',
              startLine: 0,
              endLine: doc.lineCount - 1,
              startChar: 0,
              endChar: doc.lineAt(doc.lineCount - 1).text.length,
              isCurrent: true,
              depth: 0,
            },
          ];
        }
      }

      if (scopes.length === 0) {
        continue;
      }

      const success = await this.replacer.apply(doc, scopes, find, replace, this.lastOptions);
      if (success) {
        overallSuccess = true;
      }
    }

    if (overallSuccess) {
      vscode.window.showInformationMessage(
        `Scope Search: Replaced "${find}" with "${replace}" in pinned files.`,
      );
      // Re-run search to update results
      this.handleSearch(find, this.lastOptions);
    } else {
      vscode.window.showWarningMessage('Scope Search: No replacements made.');
    }
  }

  private navigateToResult(line: number, char: number, uriStr?: string): void {
    const editor = vscode.window.activeTextEditor;

    let targetUri: vscode.Uri | undefined;
    if (uriStr) {
      try {
        targetUri = vscode.Uri.parse(uriStr);
      } catch {
        // Ignore invalid URIs
      }
    }

    if (!targetUri && editor) {
      targetUri = editor.document.uri;
    }

    if (targetUri) {
      vscode.workspace.openTextDocument(targetUri).then((doc) => {
        vscode.window.showTextDocument(doc).then((openEditor) => {
          const position = new vscode.Position(line, char);
          openEditor.selection = new vscode.Selection(position, position);
          openEditor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter,
          );
        });
      });
    }
  }

  private exportResults(): void {
    if (this.currentResults.length === 0) {
      vscode.window.showInformationMessage('No results to export.');
      return;
    }

    const lines = this.currentResults.map(
      (r) => `${r.scope.name}:L${r.lineNumber + 1}: ${r.lineText.trim()}`,
    );
    const text = lines.join('\n');

    vscode.workspace
      .openTextDocument({ content: text, language: 'text' })
      .then((doc) => vscode.window.showTextDocument(doc));
  }

  private async refreshScopes(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const pin = ScopePinManager.getInstance().getPin();

    if (pin) {
      this.updateScopes(pin.scopes);
      return;
    }

    if (!editor) {
      return;
    }

    const scopes = await this.scopeDetector.getSiblingScopes(
      editor.document,
      editor.selection.active,
    );
    this.updateScopes(scopes);
  }

  private async handleGetSuggestions(query: string): Promise<void> {
    interface ParsedInput {
      fileQuery: string;
      startLine?: number;
      endLine?: number;
    }

    function parseInput(input: string): ParsedInput {
      const trimmed = input.trim();
      if (!trimmed) {
        return { fileQuery: '' };
      }

      // Format combinations: "#L10-L20", ":10", "10-20"
      const pureRangeMatch = trimmed.match(/^[#:]?L?([0-9]+)(?:-L?([0-9]+))?$/i);
      if (pureRangeMatch) {
        const start = parseInt(pureRangeMatch[1], 10);
        const end = pureRangeMatch[2] ? parseInt(pureRangeMatch[2], 10) : start;
        return {
          fileQuery: '',
          startLine: start,
          endLine: end,
        };
      }

      // Format combinations: "file.ts:10-20", "file.ts#10-20", "file.ts 10-20"
      const fileRangeMatch = trimmed.match(/^(.*?)(?::|#|\s+L?)([0-9]+)(?:-L?([0-9]+))?$/i);
      if (fileRangeMatch) {
        const start = parseInt(fileRangeMatch[2], 10);
        const end = fileRangeMatch[3] ? parseInt(fileRangeMatch[3], 10) : start;
        return {
          fileQuery: fileRangeMatch[1].replace(/^[@#]/, '').trim(),
          startLine: start,
          endLine: end,
        };
      }

      // Strip leading "@" or "#" if typing file reference
      const cleanedFileQuery = trimmed.replace(/^[@#]/, '').trim();
      return { fileQuery: cleanedFileQuery };
    }

    const parsed = parseInput(query);
    const suggestions: Array<{
      label: string;
      description: string;
      detail?: string;
      uri: string;
      startLine?: number;
      endLine?: number;
      isCurrentFile?: boolean;
    }> = [];

    // 1. Gather all currently opened files
    const openDocs = vscode.workspace.textDocuments.filter(
      (doc) => doc.uri.scheme === 'file' && !doc.isUntitled,
    );
    const uniqueOpenUris = Array.from(new Set(openDocs.map((d) => d.uri.toString())));
    const addedUris = new Set<string>();

    for (const uriStr of uniqueOpenUris) {
      const uri = vscode.Uri.parse(uriStr);
      const basename = path.basename(uri.fsPath);
      const relative = vscode.workspace.asRelativePath(uri);

      // If user typed a query filter, make sure the opened file matches
      if (parsed.fileQuery && !basename.toLowerCase().includes(parsed.fileQuery.toLowerCase())) {
        continue;
      }

      addedUris.add(uriStr);

      if (parsed.startLine !== undefined) {
        suggestions.push({
          label: basename,
          description: relative,
          detail: `Pin range: L${parsed.startLine}${parsed.endLine && parsed.endLine !== parsed.startLine ? `–L${parsed.endLine}` : ''}`,
          uri: uriStr,
          startLine: parsed.startLine,
          endLine: parsed.endLine,
        });
      } else {
        suggestions.push({
          label: basename,
          description: relative,
          uri: uriStr,
        });
      }
    }

    // 2. Workspace dynamic suggestions matching the query
    const isReferenceQuery = query.startsWith('@') || query.startsWith('#');
    if (parsed.fileQuery || isReferenceQuery) {
      try {
        const filePattern = parsed.fileQuery ? `**/*${parsed.fileQuery}*` : '**/*';
        const files = await vscode.workspace.findFiles(filePattern, '**/node_modules/**', 15);
        for (const file of files) {
          const fileStr = file.toString();
          // Skip if already added from opened files
          if (addedUris.has(fileStr)) {
            continue;
          }
          const basename = path.basename(file.fsPath);
          const relative = vscode.workspace.asRelativePath(file);

          addedUris.add(fileStr);

          if (parsed.startLine !== undefined) {
            suggestions.push({
              label: basename,
              description: relative,
              detail: `Pin range: L${parsed.startLine}${parsed.endLine && parsed.endLine !== parsed.startLine ? `–L${parsed.endLine}` : ''}`,
              uri: fileStr,
              startLine: parsed.startLine,
              endLine: parsed.endLine,
            });
          } else {
            suggestions.push({
              label: basename,
              description: relative,
              uri: fileStr,
            });
          }
        }
      } catch (err) {
        logger.error('Error getting suggestions:', err);
      }
    }

    this.view?.webview.postMessage({
      type: 'suggestionsUpdated',
      suggestions,
    });
  }

  private async handlePinTarget(
    uriStr: string,
    startLineInput?: number,
    endLineInput?: number,
  ): Promise<void> {
    try {
      const uri = vscode.Uri.parse(uriStr);
      const document = await vscode.workspace.openTextDocument(uri);
      const fileName = path.basename(document.fileName);

      const startLine = startLineInput ? Math.max(0, startLineInput - 1) : 0;
      const endLine = endLineInput
        ? Math.min(document.lineCount - 1, endLineInput - 1)
        : startLineInput
          ? Math.max(0, startLineInput - 1)
          : document.lineCount - 1;

      if (startLine > endLine) {
        vscode.window.showErrorMessage('Scope Search: Invalid range.');
        return;
      }

      const midLine = Math.floor((startLine + endLine) / 2);
      const midPosition = new vscode.Position(midLine, 0);
      const detectedScopes = await this.scopeDetector.getSiblingScopes(document, midPosition);

      let pin;
      let scopes = [];
      const matchingScope =
        detectedScopes.find((s) => s.startLine <= startLine && s.endLine >= endLine) ||
        detectedScopes.find((s) => s.isCurrent);

      if (matchingScope) {
        scopes = detectedScopes;
        pin = {
          uri: document.uri,
          fileName,
          name: matchingScope.name,
          startLine: matchingScope.startLine,
          endLine: matchingScope.endLine,
          nodeType: matchingScope.nodeType,
          parentName: matchingScope.parentName,
          scopes,
        };
      } else {
        const customScope = {
          name: `Range L${startLine + 1}–L${endLine + 1}`,
          nodeType: 'custom_range',
          startLine,
          endLine,
          startChar: 0,
          endChar: document.lineAt(endLine).text.length,
          isCurrent: true,
          depth: 0,
        };
        scopes = [customScope];
        pin = {
          uri: document.uri,
          fileName,
          name: customScope.name,
          startLine,
          endLine,
          nodeType: customScope.nodeType,
          scopes,
        };
      }

      ScopePinManager.getInstance().setPin(pin);
      this.view?.webview.postMessage({
        type: 'pinUpdated',
        pin: {
          fileName: pin.fileName,
          name: pin.name,
          startLine: pin.startLine,
          endLine: pin.endLine,
        },
      });
      this.updateScopes(scopes);
    } catch (err) {
      logger.error('Failed to pin target from autocomplete:', err);
      vscode.window.showErrorMessage('Scope Search: Failed to pin target.');
    }
  }

  private clearResults(): void {
    this.currentResults = [];
    this.view?.webview.postMessage({ type: 'resultsCleared' });
  }

  /**
   * Generate the full HTML for the webview sidebar.
   */
  private getHtmlContent(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar.css'),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar.js'),
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <title>Scope Search</title>
</head>
<body>

  <!-- Search Input -->
  <div class="search-container">
    <div class="search-input-wrapper">
      <div id="attached-files" class="attached-files-container"></div>
      <div class="search-input-row">
        <span class="search-icon">🔍</span>
        <textarea
          id="search-input"
          class="search-input"
          placeholder="Search in selected scope or file  ('#' or '@' to include file)"
          spellcheck="false"
          rows="1"
        ></textarea>
      </div>
      <div class="search-input-bottom">
        <div class="search-toggles">
          <button id="toggle-case" class="toggle-btn" title="Match Case" data-active="false">Aa</button>
          <button id="toggle-word" class="toggle-btn" title="Match Whole Word" data-active="false">ab</button>
          <button id="toggle-regex" class="toggle-btn" title="Use Regular Expression" data-active="false">.*</button>

        </div>
        <button id="clear-search" class="icon-btn clear-btn" title="Clear" style="display:none;">✕</button>
      </div>
    </div>
    <div id="autocomplete-dropdown" class="autocomplete-dropdown" style="display:none;"></div>
  </div>



  <!-- Results -->
  <div class="section" id="results-section" style="display:none;">
    <div class="section-header">
      <span>RESULTS <span id="result-count"></span></span>
      <div class="section-actions">
        <button id="export-btn" class="icon-btn" title="Export results">↩</button>
        <button id="clear-results-btn" class="icon-btn" title="Clear results">✕</button>
      </div>
    </div>
    <div id="results-list" class="results-list"></div>
  </div>

  <!-- Replace Bar -->
  <div id="replace-bar" class="replace-bar" style="display:none;">
    <input
      type="text"
      id="replace-input"
      class="search-input replace-input"
      placeholder="Replace with..."
      spellcheck="false"
    />
    <button id="replace-btn" class="action-btn">Replace All</button>
  </div>

  <!-- Loading -->
  <div id="loading" class="loading" style="display:none;">
    <span class="loading-spinner"></span>
    <span id="loading-message">Loading...</span>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

interface WebviewMessage {
  command: string;
  query?: string;
  options?: Partial<SearchOptions>;
  line?: number;
  char?: number;
  find?: string;
  replace?: string;
  targetUri?: string;
  startLine?: number;
  endLine?: number;
  uri?: string;
}
