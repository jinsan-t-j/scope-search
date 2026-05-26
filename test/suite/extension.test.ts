import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Commands are registered', async () => {
    // Explicitly activate the extension to register its commands
    const ext = vscode.extensions.getExtension('jinsantj.scope-search');
    assert.ok(ext, 'Extension should be found');
    await ext.activate();

    const commands = await vscode.commands.getCommands(true);
    const scopeCommands = commands.filter((c) => c.startsWith('scopeSearch.'));

    assert.ok(scopeCommands.includes('scopeSearch.searchInSiblings'));
    assert.ok(scopeCommands.includes('scopeSearch.searchCurrentScope'));
    assert.ok(scopeCommands.includes('scopeSearch.replaceInSiblings'));
    assert.ok(scopeCommands.includes('scopeSearch.showScopeTree'));
    assert.ok(scopeCommands.includes('scopeSearch.showScopeInfo'));
    assert.ok(scopeCommands.includes('scopeSearch.toggleHighlights'));
    assert.ok(scopeCommands.includes('scopeSearch.clearResults'));
    assert.ok(scopeCommands.includes('scopeSearch.pinCurrentScope'));
    assert.ok(scopeCommands.includes('scopeSearch.pinCustomTarget'));
    assert.ok(scopeCommands.includes('scopeSearch.unpinScope'));
  });
});
