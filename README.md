# 🔭 Scope Search

> Search within the current function/class/object and its siblings — not the whole file, not the whole project.

## The Problem

When writing code, you often wonder: *"Does any other method in this class do the same thing?"* or *"Is this variable name used in a sibling function?"*

- `Ctrl+F` searches the **entire file** — too much noise
- `Ctrl+Shift+F` searches **all files** — way too broad

**Scope Search** fills this gap by searching only within sibling scopes at the same nesting level.

## Features

| Feature | Description |
|---------|-------------|
| 🎯 **Auto-detect scope** | Detects your current function/class/method from cursor position |
| 👯 **Find siblings** | Identifies all blocks at the same nesting level under the same parent |
| 🔍 **Scoped search** | Literal or regex, case-sensitive toggle, whole word match |
| 📌 **Multi-file pinning** | Pin multiple files simultaneously to run parallel search/replace across their entire content |
| ⌨️ **Smart autocomplete** | Type `@` or `#` to search and attach opened tabs or workspace files instantly |
| ✏️ **Replace in siblings** | Scoped find-and-replace across sibling blocks or pinned target files |
| 📋 **Sidebar panel** | Persistent view with scope tree + search results |
| 📊 **Status bar** | Always shows current scope name |
| 🖱️ **Context menu** | Right-click → "Search in Sibling Scopes" or "Add to Scope Search" |
| 📤 **Export results** | Copy results to a new document |
| 🎨 **Scope decorations** | Visual highlighting of sibling boundaries in the editor |

## Supported Languages

| Language | Parser | Scope Types |
|----------|--------|-------------|
| JavaScript/JSX | Tree-sitter | Functions, classes, methods, arrow functions |
| TypeScript/TSX | Tree-sitter | Functions, classes, interfaces, enums, type aliases |
| Python | Tree-sitter | Functions, classes, async functions |
| Java | Tree-sitter | Methods, constructors, classes, interfaces, enums |
| C | Tree-sitter | Functions, structs, enums |
| C++ | Tree-sitter | Functions, classes, structs, namespaces, templates |
| C# | Tree-sitter | Methods, classes, interfaces, structs, namespaces |
| Go | Tree-sitter | Functions, methods, type declarations |
| Rust | Tree-sitter | Functions, impl blocks, structs, enums, traits, modules |
| Ruby | Tree-sitter | Methods, classes, modules, blocks |
| PHP | Tree-sitter | Functions, methods, classes, interfaces, traits |
| Swift | Tree-sitter | Functions, classes, structs, enums, protocols |
| Kotlin | Tree-sitter | Functions, classes, objects, companion objects |
| Scala | Tree-sitter | Functions, classes, objects, traits |
| Lua | Tree-sitter | Functions, local functions |
| Bash/Shell | Tree-sitter | Functions |
| *Other languages* | Bracket matching | `{}` block detection |

## Keybindings

| Command | Windows/Linux | macOS |
|---------|--------------|-------|
| Search in Sibling Scopes | `Ctrl+Shift+F9` | `Cmd+Shift+F9` |
| Search in Current Scope Only | `Ctrl+F9` | `Cmd+F9` |
| Replace in Sibling Scopes | `Ctrl+Shift+Alt+H` | `Cmd+Shift+Option+H` |
| Show File Scope Tree | `Ctrl+Shift+F10` | `Cmd+Shift+F10` |

## Context Menu

Right-click in the editor to see:

- **Search in Sibling Scopes** — always available when in a scope
- **Search Selection in Siblings** — when text is selected
- **Search in Current Scope Only** — always available
- **Replace in Sibling Scopes** — when text is selected
- **Show Scope Info** — always available

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `scopeSearch.searchOnSelect` | `false` | Auto-search selected text in siblings |
| `scopeSearch.highlightSiblings` | `true` | Highlight sibling scope boundaries |
| `scopeSearch.debounceMs` | `300` | Debounce cursor movement detection |
| `scopeSearch.maxResults` | `500` | Maximum search results |
| `scopeSearch.includeCurrentInSiblings` | `true` | Include current scope in search |
| `scopeSearch.showStatusBar` | `true` | Show scope in status bar |
| `scopeSearch.fallbackParser` | `"bracket"` | Fallback for unsupported languages |

## License

MIT

