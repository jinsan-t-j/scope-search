import * as vscode from 'vscode';
import type { ScopeDetector } from '../core/scope-detector.core';
import type { ScopeSidebarProvider } from '../ui/sidebar-panel.ui';
import type { ScopeDecorationProvider } from '../providers/scope-decoration.provider';
import { registerSearchCommands } from './search.command';
import { registerReplaceCommand } from './replace.command';
import { registerPinCommands } from './pin.command';

/**
 * Register all Scope Search commands by delegating to separate command modules.
 */
export function registerAllCommands(
  context: vscode.ExtensionContext,
  scopeDetector: ScopeDetector,
  sidebarProvider: ScopeSidebarProvider,
  decorationProvider: ScopeDecorationProvider,
): void {
  // Register search commands (searchCurrentScope)
  registerSearchCommands(context, scopeDetector, sidebarProvider, decorationProvider);

  // Register replace commands (replaceInSiblings)
  registerReplaceCommand(context, scopeDetector);

  // Register pin commands (addToScopeSearch, pinCurrentScope, pinCustomTarget, unpinScope)
  registerPinCommands(context, scopeDetector, sidebarProvider);
}
