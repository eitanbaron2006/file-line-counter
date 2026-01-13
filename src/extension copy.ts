import * as vscode from 'vscode';
import { FileTreeProvider } from './FileTreeProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('File Line Counter is now active!');

	const fileTreeProvider = new FileTreeProvider();

	vscode.window.registerTreeDataProvider('fileExplorer', fileTreeProvider);

	// Refresh when files change
	const watcher = vscode.workspace.createFileSystemWatcher('**/*');
	watcher.onDidChange(() => fileTreeProvider.refresh());
	watcher.onDidCreate(() => fileTreeProvider.refresh());
	watcher.onDidDelete(() => fileTreeProvider.refresh());

	context.subscriptions.push(watcher);
}

export function deactivate() { }