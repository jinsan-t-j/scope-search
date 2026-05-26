// @ts-nocheck
/* eslint-disable */

/**
 * Sidebar webview script — runs inside the VSCode webview iframe.
 * Communicates with the extension host via postMessage/onMessage.
 */
(function () {
  // Acquire the VSCode API handle
  const vscode = acquireVsCodeApi();

  // DOM references
  const searchInput = document.getElementById('search-input');
  const clearSearchBtn = document.getElementById('clear-search');
  const toggleRegex = document.getElementById('toggle-regex');
  const toggleCase = document.getElementById('toggle-case');
  const toggleWord = document.getElementById('toggle-word');
  const attachedFilesContainer = document.getElementById('attached-files');
  const autocompleteDropdown = document.getElementById('autocomplete-dropdown');

  // Autocomplete & reference state
  let suggestions = [];
  let selectedIndex = -1;

  // Set VS Code finder shortcut tooltips dynamically based on OS platform
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const cmdChar = isMac ? '⌥' : 'Alt+';
  if (toggleCase) toggleCase.title = `Match Case (${cmdChar}C)`;
  if (toggleWord) toggleWord.title = `Match Whole Word (${cmdChar}W)`;
  if (toggleRegex) toggleRegex.title = `Use Regular Expression (${cmdChar}R)`;
  const resultsList = document.getElementById('results-list');
  const resultsSection = document.getElementById('results-section');
  const resultCount = document.getElementById('result-count');
  const exportBtn = document.getElementById('export-btn');
  const clearResultsBtn = document.getElementById('clear-results-btn');
  const replaceBar = document.getElementById('replace-bar');
  const replaceInput = document.getElementById('replace-input');
  const replaceBtn = document.getElementById('replace-btn');
  const loading = document.getElementById('loading');
  const loadingMessage = document.getElementById('loading-message');

  // State
  let searchDebounce = null;
  const SEARCH_DEBOUNCE_MS = 300;

  // Auto-resize textarea to fit content dynamically
  function autoResizeTextarea() {
    searchInput.style.height = 'auto';
    const newHeight = Math.min(Math.max(20, searchInput.scrollHeight), 120);
    searchInput.style.height = newHeight + 'px';
  }

  // Initialize height on load
  autoResizeTextarea();

  searchInput.addEventListener('input', () => {
    autoResizeTextarea();
    const query = searchInput.value;
    clearSearchBtn.style.display = query ? 'flex' : 'none';

    // Check if query is candidate for autocomplete (starts with # or @, or contains : or #)
    const isAutocompleteCandidate = query.startsWith('#') || query.startsWith('@') || query.includes(':') || query.includes('#');

    if (isAutocompleteCandidate) {
      vscode.postMessage({ command: 'getSuggestions', query });
    } else {
      autocompleteDropdown.style.display = 'none';
      autocompleteDropdown.innerHTML = '';
      suggestions = [];
      selectedIndex = -1;
    }

    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      // Run regular search only if not doing an active range pin autocomplete
      if (query.length >= 2 && !isAutocompleteCandidate) {
        triggerSearch(query);
      } else if (query.length === 0) {
        vscode.postMessage({ command: 'clear' });
      }
    }, SEARCH_DEBOUNCE_MS);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (autocompleteDropdown.style.display === 'block') {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % suggestions.length;
        highlightSuggestion(selectedIndex);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + suggestions.length) % suggestions.length;
        highlightSuggestion(selectedIndex);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          selectSuggestion(selectedIndex);
        } else if (suggestions.length > 0) {
          selectSuggestion(0);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        autocompleteDropdown.style.display = 'none';
        autocompleteDropdown.innerHTML = '';
        suggestions = [];
        selectedIndex = -1;
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const query = searchInput.value;
      if (query) triggerSearch(query);
    }
    if (e.key === 'Escape') {
      searchInput.value = '';
      autoResizeTextarea();
      clearSearchBtn.style.display = 'none';
      vscode.postMessage({ command: 'clear' });
    }
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !autocompleteDropdown.contains(e.target)) {
      autocompleteDropdown.style.display = 'none';
      autocompleteDropdown.innerHTML = '';
      suggestions = [];
      selectedIndex = -1;
    }
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    autoResizeTextarea();
    clearSearchBtn.style.display = 'none';
    autocompleteDropdown.style.display = 'none';
    autocompleteDropdown.innerHTML = '';
    suggestions = [];
    selectedIndex = -1;
    vscode.postMessage({ command: 'clear' });
  });

  function renderSuggestions(list) {
    suggestions = list || [];
    selectedIndex = -1;

    if (suggestions.length === 0) {
      autocompleteDropdown.style.display = 'none';
      autocompleteDropdown.innerHTML = '';
      return;
    }

    autocompleteDropdown.style.display = 'block';
    autocompleteDropdown.innerHTML = suggestions
      .map((item, index) => {
        const icon = '📄';
        const labelText = escapeHtml(item.label);
        const rangeText = item.startLine !== undefined 
          ? `L${item.startLine}${item.endLine && item.endLine !== item.startLine ? `–L${item.endLine}` : ''}`
          : '';
        const descText = escapeHtml(item.description);

        return `
          <div class="autocomplete-item" data-index="${index}">
            <div class="autocomplete-item-header">
              <span class="autocomplete-item-label">${icon} ${labelText}</span>
              ${rangeText ? `<span class="autocomplete-item-range">${rangeText}</span>` : ''}
            </div>
            <div class="autocomplete-item-desc">${descText}</div>
          </div>
        `;
      })
      .join('');

    autocompleteDropdown.querySelectorAll('.autocomplete-item').forEach((el) => {
      el.addEventListener('click', () => {
        const index = parseInt(el.dataset.index, 10);
        selectSuggestion(index);
      });
    });
  }

  function selectSuggestion(index) {
    if (index >= 0 && index < suggestions.length) {
      const item = suggestions[index];
      vscode.postMessage({
        command: 'pinTarget',
        targetUri: item.uri,
        startLine: item.startLine,
        endLine: item.endLine,
      });
      searchInput.value = '';
      autoResizeTextarea();
      clearSearchBtn.style.display = 'none';
      autocompleteDropdown.style.display = 'none';
      autocompleteDropdown.innerHTML = '';
      suggestions = [];
      selectedIndex = -1;
    }
  }

  function highlightSuggestion(index) {
    const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
    items.forEach((item) => item.classList.remove('selected'));

    if (index >= 0 && index < items.length) {
      items[index].classList.add('selected');
      items[index].scrollIntoView({ block: 'nearest' });
    }
  }

  function triggerSearch(query) {
    vscode.postMessage({
      command: 'search',
      query,
      options: {
        useRegex: toggleRegex.dataset.active === 'true',
        caseSensitive: toggleCase.dataset.active === 'true',
        wholeWord: toggleWord.dataset.active === 'true',
        includeCurrentScope: true,
      },
    });
  }

  // ─── Toggles ──────────────────────────────────────────

  [toggleCase, toggleWord, toggleRegex].forEach((btn) => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      const isActive = btn.dataset.active === 'true';
      btn.dataset.active = String(!isActive);

      // Re-trigger search if there's a query
      const query = searchInput.value;
      if (query.length >= 2) {
        triggerSearch(query);
      }
    });
  });

  // ─── Action buttons ──────────────────────────────────

  exportBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'export' });
  });

  clearResultsBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'clear' });
  });



  replaceBtn.addEventListener('click', () => {
    const find = searchInput.value;
    const replace = replaceInput.value;
    if (find) {
      vscode.postMessage({ command: 'replace', find, replace });
    }
  });



  // ─── Message Handler ─────────────────────────────────

  window.addEventListener('message', (event) => {
    const msg = event.data;

    switch (msg.type) {


      case 'resultsUpdated':
        renderResults(msg.results, msg.total, msg.crossFileResults);
        break;

      case 'resultsCleared':
        resultsSection.style.display = 'none';
        resultsList.innerHTML = '';
        replaceBar.style.display = 'none';
        break;

      case 'loading':
        loading.style.display = 'flex';
        loadingMessage.textContent = msg.message || 'Loading...';
        break;

      case 'setQuery':
        searchInput.value = msg.query;
        autoResizeTextarea();
        clearSearchBtn.style.display = msg.query ? 'flex' : 'none';
        break;

      case 'pinsUpdated':
        const pins = msg.pins;
        if (pins && pins.length > 0) {
          attachedFilesContainer.innerHTML = pins
            .map((pin) => {
              let lineText = '';
              if (pin.startLine !== undefined && pin.endLine !== undefined) {
                const s = pin.startLine + 1;
                const e = pin.endLine + 1;
                lineText = s === e ? `:L${s}` : `:L${s}-L${e}`;
              }
              return `
                <div class="file-chip" title="${escapeHtml(pin.name)} inside ${escapeHtml(pin.fileName)}">
                  <span class="file-chip-name" data-uri="${escapeHtml(pin.uri)}" data-line="${pin.startLine !== undefined ? pin.startLine : 0}">📄 ${escapeHtml(pin.fileName)}${lineText}</span>
                  <span class="file-chip-remove" data-uri="${escapeHtml(pin.uri)}">✕</span>
                </div>
              `;
            })
            .join('');

          attachedFilesContainer.querySelectorAll('.file-chip-name').forEach((el) => {
            el.addEventListener('click', () => {
              const uri = el.dataset.uri;
              const line = el.dataset.line ? parseInt(el.dataset.line, 10) : 0;
              vscode.postMessage({
                command: 'navigateTo',
                line: line,
                char: 0,
                uri: uri,
              });
            });
          });

          attachedFilesContainer.querySelectorAll('.file-chip-remove').forEach((el) => {
            el.addEventListener('click', () => {
              const uri = el.dataset.uri;
              vscode.postMessage({ command: 'unpin', uri });
            });
          });
          searchInput.placeholder = 'Search inside targeted scopes...';
        } else {
          attachedFilesContainer.innerHTML = '';
          searchInput.placeholder = "Search in scopes or included files ('#' or '@' to include file)";
        }
        autoResizeTextarea();
        searchInput.focus();
        break;

      case 'suggestionsUpdated':
        renderSuggestions(msg.suggestions);
        break;
    }
  });



  // ─── Render Results ───────────────────────────────────

  function renderResults(results, total, crossFileResults) {
    loading.style.display = 'none';
    const crossCount = crossFileResults ? crossFileResults.length : 0;

    if ((!results || results.length === 0) && crossCount === 0) {
      resultsSection.style.display = 'block';
      resultCount.textContent = '(0 matches)';
      resultsList.innerHTML = '<div class="empty-state">No matches found</div>';
      replaceBar.style.display = 'none';
      return;
    }

    resultsSection.style.display = 'block';
    const totalDisplay = total + crossCount;
    resultCount.textContent = `(${totalDisplay} match${totalDisplay !== 1 ? 'es' : ''}${crossCount > 0 ? `, ${crossCount} cross-file` : ''})`;
    replaceBar.style.display = total > 0 ? 'flex' : 'none';

    // Group in-scope results by scope name
    const groups = new Map();
    for (const r of (results || [])) {
      const key = r.scopeName;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }

    resultsList.innerHTML = '';

    // Render in batches for responsiveness
    const groupEntries = Array.from(groups.entries());
    let batchIdx = 0;

    function renderBatch() {
      const fragment = document.createDocumentFragment();

      const end = Math.min(batchIdx + 2, groupEntries.length); // 2 groups per batch
      for (let i = batchIdx; i < end; i++) {
        const [scopeName, items] = groupEntries[i];
        const groupEl = document.createElement('div');
        groupEl.className = 'result-group';

        groupEl.innerHTML = `
          <div class="result-group-header">
            ▼ ${escapeHtml(scopeName)}
            <span class="result-group-count">(${items.length} match${items.length !== 1 ? 'es' : ''})</span>
          </div>
        `;

        // Render result items
        for (const item of items) {
          const itemEl = document.createElement('div');
          itemEl.className = 'result-item';
          itemEl.dataset.line = String(item.lineNumber);
          itemEl.dataset.char = String(item.matchStart);

          const lineText = item.lineText.trim();
          const highlighted = highlightInText(lineText, item.matchText);

          itemEl.innerHTML = `
            <span class="result-line-num">L${item.lineNumber + 1}</span>
            <span class="result-text">${highlighted}</span>
          `;

          itemEl.addEventListener('click', () => {
            vscode.postMessage({
              command: 'navigateTo',
              line: item.lineNumber,
              char: item.matchStart,
              uri: item.uri,
            });
          });

          groupEl.appendChild(itemEl);
        }

        fragment.appendChild(groupEl);
      }

      resultsList.appendChild(fragment);
      batchIdx = end;

      if (batchIdx < groupEntries.length) {
        requestAnimationFrame(renderBatch);
      } else if (crossCount > 0) {
        // Append cross-file results after all in-scope batches
        renderCrossFileSection(crossFileResults);
      }
    }

    if (groupEntries.length > 0) {
      renderBatch();
    } else if (crossCount > 0) {
      renderCrossFileSection(crossFileResults);
    }
  }

  function renderCrossFileSection(crossFileResults) {
    if (!crossFileResults || crossFileResults.length === 0) return;

    // Group by file path
    const fileGroups = new Map();
    for (const loc of crossFileResults) {
      const key = loc.relativePath;
      if (!fileGroups.has(key)) fileGroups.set(key, []);
      fileGroups.get(key).push(loc);
    }

    const fragment = document.createDocumentFragment();

    // Section divider
    const divider = document.createElement('div');
    divider.style.cssText = 'padding: 6px 8px; font-size: 11px; opacity: 0.7; border-top: 1px solid var(--vscode-panel-border, #333); margin-top: 4px; font-weight: bold;';
    divider.textContent = `CROSS-FILE REFERENCES (${crossFileResults.length})`;
    fragment.appendChild(divider);

    for (const [filePath, items] of fileGroups) {
      const groupEl = document.createElement('div');
      groupEl.className = 'result-group';

      groupEl.innerHTML = `
        <div class="result-group-header">
          ▼ ${escapeHtml(filePath)}
          <span class="result-group-count">(${items.length})</span>
        </div>
      `;

      for (const item of items) {
        const itemEl = document.createElement('div');
        itemEl.className = 'result-item';

        const lineText = item.lineText.trim();
        const highlighted = highlightInText(lineText, item.matchText);

        itemEl.innerHTML = `
          <span class="result-line-num">L${item.lineNumber + 1}</span>
          <span class="result-text">${highlighted}</span>
        `;

        itemEl.addEventListener('click', () => {
          vscode.postMessage({
            command: 'navigateTo',
            line: item.lineNumber,
            char: item.matchStart,
            uri: item.uri,
          });
        });

        groupEl.appendChild(itemEl);
      }

      fragment.appendChild(groupEl);
    }

    resultsList.appendChild(fragment);
  }

  // ─── Helpers ──────────────────────────────────────────

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function highlightInText(text, matchText) {
    if (!matchText) return escapeHtml(text);

    const escaped = escapeHtml(text);
    const escapedMatch = escapeHtml(matchText);

    // Case-insensitive replacement in the escaped text
    const regex = new RegExp(escapeRegexStr(escapedMatch), 'gi');
    return escaped.replace(regex, '<mark>$&</mark>');
  }

  function escapeRegexStr(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Notify extension that webview is ready
  vscode.postMessage({ command: 'ready' });
})();
