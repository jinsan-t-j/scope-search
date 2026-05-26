import * as vscode from 'vscode';

/** Output channel for Scope Search debug logging */
let outputChannel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Scope Search');
  }
  return outputChannel;
}

export const logger = {
  info(message: string, ...args: unknown[]): void {
    getChannel().appendLine(`[INFO] ${message} ${args.length ? JSON.stringify(args) : ''}`);
  },

  warn(message: string, ...args: unknown[]): void {
    getChannel().appendLine(`[WARN] ${message} ${args.length ? JSON.stringify(args) : ''}`);
  },

  error(message: string, ...args: unknown[]): void {
    getChannel().appendLine(`[ERROR] ${message} ${args.length ? JSON.stringify(args) : ''}`);
  },

  debug(message: string, ...args: unknown[]): void {
    getChannel().appendLine(`[DEBUG] ${message} ${args.length ? JSON.stringify(args) : ''}`);
  },

  show(): void {
    getChannel().show(true);
  },

  dispose(): void {
    outputChannel?.dispose();
    outputChannel = undefined;
  },
};
