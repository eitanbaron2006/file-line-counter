import * as vscode from 'vscode';
import { LineCountDecorationProvider } from './LineCountDecorationProvider';
import { FileTreeProvider } from './FileTreeProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('File Line Counter is now active!');

	// 1. Register FileDecorationProvider for badges in main Explorer
	const decorationProvider = new LineCountDecorationProvider();
	context.subscriptions.push(
		vscode.window.registerFileDecorationProvider(decorationProvider)
	);

	// 2. Register TreeView for separate view with [lineCount]
	const fileTreeProvider = new FileTreeProvider();
	vscode.window.registerTreeDataProvider('lineCountView', fileTreeProvider);

	// Refresh both when files change
	const watcher = vscode.workspace.createFileSystemWatcher('**/*');
	watcher.onDidChange(() => {
		decorationProvider.refresh();
		fileTreeProvider.refresh();
	});
	watcher.onDidCreate(() => {
		decorationProvider.refresh();
		fileTreeProvider.refresh();
	});
	watcher.onDidDelete(() => {
		decorationProvider.refresh();
		fileTreeProvider.refresh();
	});

	context.subscriptions.push(watcher);
}

export function deactivate() { }