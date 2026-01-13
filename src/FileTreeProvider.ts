import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { countLines } from './lineCounter';

export class FileTreeProvider implements vscode.TreeDataProvider<FileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined | null | void> = new vscode.EventEmitter<FileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FileItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: FileItem): Promise<FileItem[]> {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

        if (!element) {
            return this.getFilesInDirectory(workspaceRoot);
        } else {
            return this.getFilesInDirectory(element.resourceUri.fsPath);
        }
    }

    private async getFilesInDirectory(dirPath: string): Promise<FileItem[]> {
        if (!fs.existsSync(dirPath)) {
            return [];
        }

        const files = fs.readdirSync(dirPath);
        const items: FileItem[] = [];

        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                items.push(new FileItem(
                    file,
                    vscode.Uri.file(filePath),
                    vscode.TreeItemCollapsibleState.Collapsed,
                    true,
                    0
                ));
            } else {
                const lineCount = await countLines(filePath);
                items.push(new FileItem(
                    file,
                    vscode.Uri.file(filePath),
                    vscode.TreeItemCollapsibleState.None,
                    false,
                    lineCount
                ));
            }
        }

        return items;
    }
}

class FileItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly resourceUri: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly isDirectory: boolean,
        public readonly lineCount: number
    ) {
        super(label, collapsibleState);

        this.tooltip = this.resourceUri.fsPath;
        this.contextValue = isDirectory ? 'directory' : 'file';

        if (!isDirectory) {
            // Show line count in brackets as description
            this.description = `[${lineCount}]`;

            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [this.resourceUri]
            };
        }
    }
}