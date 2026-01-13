import * as vscode from 'vscode';
import * as fs from 'fs';

interface ThresholdConfig {
    lines: number;
    color: string;
}

export class LineCountDecorationProvider implements vscode.FileDecorationProvider {
    private _onDidChangeFileDecorations: vscode.EventEmitter<vscode.Uri | vscode.Uri[]> = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
    readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[]> = this._onDidChangeFileDecorations.event;

    private cache: Map<string, number> = new Map();

    refresh(): void {
        this.cache.clear();
        this._onDidChangeFileDecorations.fire(undefined as any);
    }

    private getThresholds(): ThresholdConfig[] {
        const config = vscode.workspace.getConfiguration('fileLineCounter');
        const thresholds = config.get<ThresholdConfig[]>('thresholds') || [];
        // Sort by lines descending so higher thresholds are checked first
        return [...thresholds].sort((a, b) => b.lines - a.lines);
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

                // Apply color based on configured thresholds
                const thresholds = this.getThresholds();
                for (const threshold of thresholds) {
                    if (lineCount >= threshold.lines) {
                        decoration.color = new vscode.ThemeColor(threshold.color);
                        break;
                    }
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