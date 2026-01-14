import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { countLines } from './lineCounter';

interface FileInfo {
    path: string;
    name: string;
    lineCount: number;
}

interface WorkspaceStats {
    totalFiles: number;
    totalLines: number;
    averageLines: number;
    largeFiles: FileInfo[];
}

type TreeItemType = 'summaryHeader' | 'stat' | 'largeFile' | 'recommendation' | 'action' | 'filesHeader' | 'directory' | 'file';

// Translations ONLY for recommendations (as requested by user)
const recommendationTranslations: Record<string, Record<string, string>> = {
    en: {
        considerSplitting: 'Consider splitting',
        veryLargeFile: 'very large file',
        filesExceed: 'files exceed',
        linesThreshold: 'lines',
        considerRefactoring: 'Consider refactoring for better maintainability',
        highAverageSize: 'High average file size',
        considerSmaller: 'consider smaller modules',
        noIssues: '✅ No issues detected',
        wellOrganized: 'Your codebase looks well-organized!'
    },
    he: {
        considerSplitting: 'שקול לפצל את',
        veryLargeFile: 'קובץ גדול מאוד',
        filesExceed: 'קבצים עוברים את',
        linesThreshold: 'שורות',
        considerRefactoring: 'שקול שיפורים לתחזוקה טובה יותר',
        highAverageSize: 'גודל ממוצע גבוה',
        considerSmaller: 'שקול מודולים קטנים יותר',
        noIssues: '✅ לא נמצאו בעיות',
        wellOrganized: 'הקוד שלך מאורגן היטב!'
    }
};

export class FileTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private cachedStats: WorkspaceStats | null = null;
    private ignorePatterns: string[] = [];
    private includePatterns: string[] = [];
    private useIncludeFile = false;
    private ignorePatternsLoaded = false;

    refresh(): void {
        this.cachedStats = null;
        this.ignorePatternsLoaded = false;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }

        // Root level - show summary sections first, then files
        if (!element) {
            return this.getRootItems();
        }

        // Child items based on parent type
        return this.getChildItems(element);
    }

    private getLanguage(): string {
        const config = vscode.workspace.getConfiguration('fileLineCounter');
        return config.get<string>('language') || 'en';
    }

    // Translation only for recommendations
    private tRec(key: string): string {
        const lang = this.getLanguage();
        return recommendationTranslations[lang]?.[key] || recommendationTranslations['en'][key] || key;
    }

    private async loadIgnorePatterns(): Promise<void> {
        if (this.ignorePatternsLoaded) {
            return;
        }

        this.ignorePatterns = [];
        this.includePatterns = [];
        const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
        const config = vscode.workspace.getConfiguration('fileLineCounter');

        // Settings
        const ignoreListActive = config.get<boolean>('ignoreListActive') ?? true;
        const ignoreFilesConfig = config.get<string[]>('ignoreFiles') || [];

        const whitelistActive = config.get<boolean>('whitelistActive') ?? false;
        const includeFilesConfig = config.get<string[]>('includeFiles') || [];

        this.useIncludeFile = whitelistActive; // Reuse existing property for whitelist logic

        // Load ignore patterns if enabled
        if (ignoreListActive) {
            for (const ignoreFile of ignoreFilesConfig) {
                const ignorePath = path.join(workspaceRoot, ignoreFile);
                if (fs.existsSync(ignorePath)) {
                    try {
                        const content = fs.readFileSync(ignorePath, 'utf-8');
                        const patterns = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
                        this.ignorePatterns.push(...patterns);
                    } catch (e) { /* ignore */ }
                }
            }
        }

        // Load include patterns if enabled
        if (whitelistActive) {
            for (const includeFile of includeFilesConfig) {
                const includePath = path.join(workspaceRoot, includeFile);
                if (fs.existsSync(includePath)) {
                    try {
                        const content = fs.readFileSync(includePath, 'utf-8');
                        const patterns = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
                        this.includePatterns.push(...patterns);
                    } catch (e) { /* ignore */ }
                }
            }
        }

        this.ignorePatternsLoaded = true;
    }

    // Helper to check if a file is explicitly included (whitelist)
    private isIncluded(filePath: string, workspaceRoot: string): boolean {
        // If not using include file, everything that isn't ignored is included
        if (!this.useIncludeFile) {
            return true;
        }

        // If using include file, file MUST match at least one include pattern
        const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
        const fileName = path.basename(filePath);

        for (const pattern of this.includePatterns) {
            let cleanPattern = pattern.replace(/^\//, '').replace(/\/$/, '');

            // Check exact match
            if (relativePath === cleanPattern || fileName === cleanPattern) {
                return true;
            }
            // Check directory match
            if (relativePath.startsWith(cleanPattern + '/')) {
                return true;
            }
            // Check ** pattern
            if (cleanPattern.startsWith('**/')) {
                const subPattern = cleanPattern.slice(3);
                if (this.matchPattern(fileName, subPattern) || this.matchPattern(relativePath, subPattern)) {
                    return true;
                }
            }
            // Check *.ext
            if (cleanPattern.startsWith('*.')) {
                if (fileName.endsWith(cleanPattern.slice(1))) {
                    return true;
                }
            }
            // Check directory wildcard
            if (cleanPattern.endsWith('/**')) {
                const dirPattern = cleanPattern.slice(0, -3);
                if (relativePath === dirPattern || relativePath.startsWith(dirPattern + '/')) {
                    return true;
                }
            }
        }

        return false;
    }

    private isIgnored(filePath: string, workspaceRoot: string): boolean {
        const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
        const fileName = path.basename(filePath);

        for (const pattern of this.ignorePatterns) {
            // Clean up pattern
            let cleanPattern = pattern.replace(/^\//, '').replace(/\/$/, '');

            // Check exact match (for files like package-lock.json, .gitignore, esbuild.js)
            if (relativePath === cleanPattern || fileName === cleanPattern) {
                return true;
            }

            // Check if pattern matches directory (for patterns like 'out', 'dist', 'node_modules')
            if (relativePath === cleanPattern || relativePath.startsWith(cleanPattern + '/')) {
                return true;
            }

            // Handle ** patterns (matches any path)
            // Patterns like **/*.ts, **/*.map, **/.vscode-test.*
            if (cleanPattern.startsWith('**/')) {
                const subPattern = cleanPattern.slice(3); // Remove **/

                // Check if subPattern matches anywhere in the path
                if (this.matchPattern(fileName, subPattern) || this.matchPattern(relativePath, subPattern)) {
                    return true;
                }

                // Also check if any path segment matches
                const pathParts = relativePath.split('/');
                for (const part of pathParts) {
                    if (this.matchPattern(part, subPattern)) {
                        return true;
                    }
                }
            }

            // Handle *.ext patterns (for *.vsix, *.map, *.ts)
            if (cleanPattern.startsWith('*.')) {
                const ext = cleanPattern.slice(1); // Get .ext
                if (fileName.endsWith(ext)) {
                    return true;
                }
            }

            // Handle dir/** patterns (for .vscode/**, out/**, node_modules/**)
            if (cleanPattern.endsWith('/**')) {
                const dirPattern = cleanPattern.slice(0, -3);
                if (relativePath === dirPattern || relativePath.startsWith(dirPattern + '/')) {
                    return true;
                }
            }

            // Handle general glob patterns with * (for patterns like **/tsconfig.json)
            if (cleanPattern.includes('*')) {
                const regexPattern = cleanPattern
                    .replace(/\*\*/g, '{{DOUBLESTAR}}')
                    .replace(/\*/g, '[^/]*')
                    .replace(/{{DOUBLESTAR}}/g, '.*')
                    .replace(/\./g, '\\.')
                    .replace(/\?/g, '.');

                const regex = new RegExp('^' + regexPattern + '$');
                if (regex.test(relativePath) || regex.test(fileName)) {
                    return true;
                }
            }
        }

        return false;
    }

    private matchPattern(str: string, pattern: string): boolean {
        // Simple glob matching for patterns like *.ts, *.map, .vscode-test.*
        if (pattern.includes('*')) {
            const regexPattern = pattern
                .replace(/\./g, '\\.')
                .replace(/\*/g, '.*');
            const regex = new RegExp('^' + regexPattern + '$');
            return regex.test(str);
        }
        return str === pattern;
    }

    private async getRootItems(): Promise<TreeItem[]> {
        await this.loadIgnorePatterns();
        const stats = await this.getWorkspaceStats();
        const threshold = this.getSummaryThreshold();
        const items: TreeItem[] = [];

        // Summary section - always English
        items.push(new TreeItem(
            '📊 Summary',
            'summaryHeader',
            vscode.TreeItemCollapsibleState.Expanded,
            undefined,
            'summary'
        ));

        // Large files section - always English
        items.push(new TreeItem(
            `⚠️ Large Files (>${threshold})`,
            'summaryHeader',
            stats.largeFiles.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
            stats.largeFiles.length > 0 ? undefined : 'No large files found',
            'largeFiles'
        ));

        // Recommendations section - always English header
        items.push(new TreeItem(
            '💡 Recommendations',
            'summaryHeader',
            vscode.TreeItemCollapsibleState.Collapsed,
            undefined,
            'recommendations'
        ));

        // AI Analysis button - always English
        items.push(new TreeItem(
            '🤖 Analyze with AI',
            'action',
            vscode.TreeItemCollapsibleState.None,
            'Click to get AI-powered analysis',
            'aiAnalysis',
            {
                command: 'file-line-counter.analyzeWithAI',
                title: 'Analyze with AI'
            }
        ));

        // Files section header - always English
        items.push(new TreeItem(
            '📁 Files',
            'filesHeader',
            vscode.TreeItemCollapsibleState.Expanded,
            undefined,
            'filesRoot'
        ));

        return items;
    }

    private async getChildItems(parent: TreeItem): Promise<TreeItem[]> {
        const stats = await this.getWorkspaceStats();
        const threshold = this.getSummaryThreshold();

        switch (parent.itemId) {
            case 'summary':
                return [
                    new TreeItem(`Total Files: ${stats.totalFiles}`, 'stat', vscode.TreeItemCollapsibleState.None),
                    new TreeItem(`Total Lines: ${stats.totalLines.toLocaleString()}`, 'stat', vscode.TreeItemCollapsibleState.None),
                    new TreeItem(`Average Lines/File: ${stats.averageLines}`, 'stat', vscode.TreeItemCollapsibleState.None),
                    new TreeItem(`Files > ${threshold} lines: ${stats.largeFiles.length}`, 'stat', vscode.TreeItemCollapsibleState.None)
                ];

            case 'largeFiles':
                return stats.largeFiles.map(file => {
                    const icon = file.lineCount >= 2000 ? '🔴' : file.lineCount >= 1500 ? '🟠' : '🟡';
                    return new TreeItem(
                        `${icon} ${file.name}`,
                        'largeFile',
                        vscode.TreeItemCollapsibleState.None,
                        `${file.lineCount.toLocaleString()} lines`,
                        undefined,
                        {
                            command: 'vscode.open',
                            title: 'Open File',
                            arguments: [vscode.Uri.file(file.path)]
                        }
                    );
                });

            case 'recommendations':
                // Recommendations use translated text based on language setting
                return this.getRecommendations(stats);

            case 'filesRoot':
                const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
                return this.getFilesInDirectory(workspaceRoot);

            default:
                if (parent.itemType === 'directory' && parent.resourceUri) {
                    return this.getFilesInDirectory(parent.resourceUri.fsPath);
                }
                return [];
        }
    }

    private getRecommendations(stats: WorkspaceStats): TreeItem[] {
        const recommendations: TreeItem[] = [];
        const threshold = this.getSummaryThreshold();

        // Very large files - suggest splitting (TRANSLATED)
        const veryLargeFiles = stats.largeFiles.filter(f => f.lineCount >= 2000);
        for (const file of veryLargeFiles) {
            recommendations.push(new TreeItem(
                `${this.tRec('considerSplitting')} ${file.name}`,
                'recommendation',
                vscode.TreeItemCollapsibleState.None,
                `${file.lineCount.toLocaleString()} ${this.tRec('linesThreshold')} - ${this.tRec('veryLargeFile')}`
            ));
        }

        // General recommendation about large files (TRANSLATED)
        if (stats.largeFiles.length >= 3) {
            recommendations.push(new TreeItem(
                `${stats.largeFiles.length} ${this.tRec('filesExceed')} ${threshold} ${this.tRec('linesThreshold')}`,
                'recommendation',
                vscode.TreeItemCollapsibleState.None,
                this.tRec('considerRefactoring')
            ));
        }

        // High average lines (TRANSLATED)
        if (stats.averageLines > 300) {
            recommendations.push(new TreeItem(
                this.tRec('highAverageSize'),
                'recommendation',
                vscode.TreeItemCollapsibleState.None,
                `${stats.averageLines} ${this.tRec('linesThreshold')} - ${this.tRec('considerSmaller')}`
            ));
        }

        if (recommendations.length === 0) {
            recommendations.push(new TreeItem(
                this.tRec('noIssues'),
                'recommendation',
                vscode.TreeItemCollapsibleState.None,
                this.tRec('wellOrganized')
            ));
        }

        return recommendations;
    }

    private async getFilesInDirectory(dirPath: string): Promise<TreeItem[]> {
        if (!fs.existsSync(dirPath)) {
            return [];
        }

        const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
        const files = fs.readdirSync(dirPath);
        const items: TreeItem[] = [];

        for (const file of files) {
            const filePath = path.join(dirPath, file);

            // Skip ignored files
            if (this.isIgnored(filePath, workspaceRoot)) {
                continue;
            }

            // If include file is enabled, skip files not in include patterns
            if (!this.isIncluded(filePath, workspaceRoot)) {
                continue;
            }

            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                items.push(new TreeItem(
                    file,
                    'directory',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    undefined,
                    undefined,
                    undefined,
                    vscode.Uri.file(filePath)
                ));
            } else {
                const lineCount = await countLines(filePath);
                items.push(new TreeItem(
                    file,
                    'file',
                    vscode.TreeItemCollapsibleState.None,
                    `[${lineCount}]`,
                    undefined,
                    {
                        command: 'vscode.open',
                        title: 'Open File',
                        arguments: [vscode.Uri.file(filePath)]
                    },
                    vscode.Uri.file(filePath)
                ));
            }
        }

        return items;
    }

    private getSummaryThreshold(): number {
        const config = vscode.workspace.getConfiguration('fileLineCounter');
        return config.get<number>('summaryThreshold') || 1000;
    }

    async getWorkspaceStats(): Promise<WorkspaceStats> {
        if (this.cachedStats) {
            return this.cachedStats;
        }

        await this.loadIgnorePatterns();
        const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
        const allFiles = await this.getAllCodeFiles(workspaceRoot);
        const threshold = this.getSummaryThreshold();

        const filesWithCounts: FileInfo[] = [];
        let totalLines = 0;

        for (const filePath of allFiles) {
            const lineCount = await countLines(filePath);
            const fileName = path.basename(filePath);
            filesWithCounts.push({ path: filePath, name: fileName, lineCount });
            totalLines += lineCount;
        }

        const largeFiles = filesWithCounts
            .filter(f => f.lineCount >= threshold)
            .sort((a, b) => b.lineCount - a.lineCount);

        this.cachedStats = {
            totalFiles: filesWithCounts.length,
            totalLines,
            averageLines: filesWithCounts.length > 0 ? Math.round(totalLines / filesWithCounts.length) : 0,
            largeFiles
        };

        return this.cachedStats;
    }

    private async getAllCodeFiles(dirPath: string): Promise<string[]> {
        const files: string[] = [];
        const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;

        const scanDir = async (dir: string) => {
            try {
                const entries = fs.readdirSync(dir);
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry);

                    // Skip ignored files/directories
                    if (this.isIgnored(fullPath, workspaceRoot)) {
                        continue;
                    }

                    const stat = fs.statSync(fullPath);

                    // If include file is enabled, skip files not in include patterns
                    if (this.useIncludeFile && stat.isFile() && !this.isIncluded(fullPath, workspaceRoot)) {
                        continue;
                    }

                    if (stat.isDirectory()) {
                        await scanDir(fullPath);
                    } else if (stat.isFile()) {
                        const ext = path.extname(entry).toLowerCase();
                        const codeExtensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rb', '.php', '.swift', '.kt', '.rs', '.vue', '.svelte', '.html', '.css', '.scss', '.less', '.json', '.yaml', '.yml', '.xml', '.md', '.txt'];
                        if (codeExtensions.includes(ext)) {
                            files.push(fullPath);
                        }
                    }
                }
            } catch (error) {
                // Ignore access errors
            }
        };

        await scanDir(dirPath);
        return files;
    }
}

class TreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly itemType: TreeItemType,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly description?: string,
        public readonly itemId?: string,
        public readonly command?: vscode.Command,
        public readonly resourceUri?: vscode.Uri
    ) {
        super(label, collapsibleState);

        this.tooltip = description || label;
        this.description = description;
        this.contextValue = itemType;

        switch (itemType) {
            case 'action':
                this.iconPath = new vscode.ThemeIcon('sparkle');
                break;
            case 'directory':
                this.iconPath = vscode.ThemeIcon.Folder;
                break;
            case 'file':
                this.iconPath = vscode.ThemeIcon.File;
                break;
            case 'summaryHeader':
            case 'filesHeader':
                break;
        }
    }
}