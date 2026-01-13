import * as vscode from 'vscode';
import { LineCountDecorationProvider } from './LineCountDecorationProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('File Line Counter is now active!');

	const decorationProvider = new LineCountDecorationProvider();

	// Register the file decoration provider for the main explorer
	context.subscriptions.push(
		vscode.window.registerFileDecorationProvider(decorationProvider)
	);

	// Refresh when files change
	const watcher = vscode.workspace.createFileSystemWatcher('**/*');
	watcher.onDidChange(() => decorationProvider.refresh());
	watcher.onDidCreate(() => decorationProvider.refresh());
	watcher.onDidDelete(() => decorationProvider.refresh());

	context.subscriptions.push(watcher);
}

export function deactivate() { }