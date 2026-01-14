import * as vscode from 'vscode';
import { LineCountDecorationProvider } from './LineCountDecorationProvider';
import { FileTreeProvider } from './FileTreeProvider';
import { AiAnalysisService } from './AiAnalysisService';

export function activate(context: vscode.ExtensionContext) {
	console.log('File Line Counter is now active!');

	// 1. Register FileDecorationProvider for badges in main Explorer
	const decorationProvider = new LineCountDecorationProvider();
	context.subscriptions.push(
		vscode.window.registerFileDecorationProvider(decorationProvider)
	);

	// 2. Register TreeView with Summary + Files (integrated view)
	const fileTreeProvider = new FileTreeProvider();
	vscode.window.registerTreeDataProvider('lineCountView', fileTreeProvider);

	// 3. Register AI Analysis Service and Command
	const aiService = new AiAnalysisService(fileTreeProvider);
	context.subscriptions.push(
		vscode.commands.registerCommand('file-line-counter.analyzeWithAI', () => {
			aiService.analyzeWithAI();
		})
	);

	// 4. Register Refresh Command
	context.subscriptions.push(
		vscode.commands.registerCommand('file-line-counter.refresh', () => {
			decorationProvider.refresh();
			fileTreeProvider.refresh();
		})
	);

	// Refresh providers when files change
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
