import * as vscode from 'vscode';
import * as fs from 'fs';

export class LineCountDecorationProvider implements vscode.FileDecorationProvider {
    private _onDidChangeFileDecorations: vscode.EventEmitter<vscode.Uri | vscode.Uri[]> = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
    readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[]> = this._onDidChangeFileDecorations.event;

    private cache: Map<string, number> = new Map();

    refresh(): void {
        this.cache.clear();
        this._onDidChangeFileDecorations.fire(undefined as any);
    }

    async provideFileDecoration(uri: vscode.Uri): Promise<vscode.FileDecoration | undefined> {
        try {
            const stat = await vscode.workspace.fs.stat(uri);

            // Only for files, not directories
            if (stat.type === vscode.FileType.File) {
                const lineCount = await this.getLineCount(uri.fsPath);

                const decoration: vscode.FileDecoration = {
                    badge: this.formatBadge(lineCount)
                };

                // Red color for files with 1000+ lines
                if (lineCount >= 1000) {
                    decoration.color = new vscode.ThemeColor('editorError.foreground');
                }
                // Yellow color for files with 500-999 lines
                else if (lineCount >= 500) {
                    decoration.color = new vscode.ThemeColor('editorWarning.foreground');
                }

                return decoration;
            }
        } catch (error) {
            // Ignore errors
        }

        return undefined;
    }

    private async getLineCount(filePath: string): Promise<number> {
        // Check cache first
        if (this.cache.has(filePath)) {
            return this.cache.get(filePath)!;
        }

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n').length;
            this.cache.set(filePath, lines);
            return lines;
        } catch (error) {
            return 0;
        }
    }

    private formatBadge(count: number): string {
        if (count < 100) {
            return `${count}`;
        } else if (count < 1000) {
            // 100-999 -> show as hundreds (1H-9H)
            return `${Math.floor(count / 100)}H`;
        } else if (count < 10000) {
            // 1000-9999 -> show as K (1K-9K)
            return `${Math.floor(count / 1000)}K`;
        } else if (count < 100000) {
            // 10000-99999 -> show as 10K-99K
            return `${Math.floor(count / 1000)}K`;
        } else {
            // 100000+ -> show as M
            return `${Math.floor(count / 1000000)}M`;
        }
    }
}