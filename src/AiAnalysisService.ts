import * as vscode from 'vscode';
import { FileTreeProvider } from './FileTreeProvider';

interface FileData {
    name: string;
    lineCount: number;
}

// Translations for AI service
const aiTranslations: Record<string, Record<string, string>> = {
    en: {
        noApiKey: 'Gemini API key not configured. Please add your API key in settings.',
        openSettings: 'Open Settings',
        analyzing: 'Analyzing codebase with AI...',
        analysisFailed: 'AI Analysis failed',
        aiTitle: '🤖 AI Codebase Analysis'
    },
    he: {
        noApiKey: 'מפתח API של Gemini לא מוגדר. אנא הוסף את המפתח שלך בהגדרות.',
        openSettings: 'פתח הגדרות',
        analyzing: 'מנתח את הקוד עם AI...',
        analysisFailed: 'ניתוח AI נכשל',
        aiTitle: '🤖 ניתוח קוד עם AI'
    }
};

export class AiAnalysisService {
    private fileTreeProvider: FileTreeProvider;

    constructor(fileTreeProvider: FileTreeProvider) {
        this.fileTreeProvider = fileTreeProvider;
    }

    private getLanguage(): string {
        const config = vscode.workspace.getConfiguration('fileLineCounter');
        return config.get<string>('language') || 'en';
    }

    private t(key: string): string {
        const lang = this.getLanguage();
        return aiTranslations[lang]?.[key] || aiTranslations['en'][key] || key;
    }

    private isRtl(): boolean {
        const lang = this.getLanguage();
        return lang === 'he' || lang === 'ar';
    }

    async analyzeWithAI(): Promise<void> {
        const provider = this.getAiProvider();
        const apiKey = this.getApiKey(provider);

        if (!apiKey) {
            const message = provider === 'Gemini' ? this.t('noApiKey') : `${provider} API key not configured.`;
            const configure = await vscode.window.showWarningMessage(
                message,
                this.t('openSettings')
            );
            if (configure === this.t('openSettings')) {
                // Open the new general apiKey setting
                vscode.commands.executeCommand('workbench.action.openSettings', 'fileLineCounter.apiKey');
            }
            return;
        }

        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: this.t('analyzing'),
            cancellable: false
        }, async () => {
            try {
                const stats = await this.fileTreeProvider.getWorkspaceStats();
                let analysis = '';

                switch (provider) {
                    case 'Gemini':
                        analysis = await this.callGeminiApi(apiKey, stats);
                        break;
                    default:
                        throw new Error(`Support for ${provider} is coming soon! Currently only Gemini is fully supported.`);
                }

                this.showAnalysisPanel(analysis);
            } catch (error) {
                vscode.window.showErrorMessage(`${this.t('analysisFailed')}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
    }

    private getAiProvider(): string {
        const config = vscode.workspace.getConfiguration('fileLineCounter');
        return config.get<string>('aiProvider') || 'Gemini';
    }

    private getApiKey(provider: string): string | undefined {
        const config = vscode.workspace.getConfiguration('fileLineCounter');
        const key = config.get<string>('apiKey');

        if (key && key.trim() !== '') {
            return key;
        }

        // Fallback for Gemini using the legacy setting
        if (provider === 'Gemini') {
            const oldKey = config.get<string>('geminiApiKey');
            return oldKey && oldKey.trim() !== '' ? oldKey : undefined;
        }

        return undefined;
    }

    private async callGeminiApi(apiKey: string, stats: { totalFiles: number; totalLines: number; averageLines: number; largeFiles: FileData[] }): Promise<string> {
        const prompt = this.buildPrompt(stats);

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            throw new Error('No response from AI');
        }

        return text;
    }

    private buildPrompt(stats: { totalFiles: number; totalLines: number; averageLines: number; largeFiles: FileData[] }): string {
        const lang = this.getLanguage();
        const largeFilesList = stats.largeFiles
            .map(f => `- ${f.name}: ${f.lineCount} lines`)
            .join('\n');

        if (lang === 'he') {
            return `אתה מומחה לסקירת קוד. נתח את הסטטיסטיקות של הקוד הבא ותן המלצות מעשיות.

## סטטיסטיקות הקוד:
- סה"כ קבצים: ${stats.totalFiles}
- סה"כ שורות: ${stats.totalLines.toLocaleString()}
- ממוצע שורות לקובץ: ${stats.averageLines}

## קבצים גדולים (מועמדים לשיפור):
${largeFilesList || 'אין'}

אנא ספק:
1. הערכה כללית של מבנה הקוד
2. המלצות ספציפיות לכל קובץ גדול (אם יש)
3. הצעות לשיטות עבודה מומלצות לארגון קבצים
4. פעולות עדיפות לשיפור התחזוקה

פרמט את התשובה בMarkdown עם סקציות ברורות. כתוב בעברית.`;
        }

        return `You are a code review expert. Analyze this codebase statistics and provide actionable recommendations.

## Codebase Statistics:
- Total Files: ${stats.totalFiles}
- Total Lines: ${stats.totalLines.toLocaleString()}
- Average Lines per File: ${stats.averageLines}

## Large Files (potential refactoring candidates):
${largeFilesList || 'None'}

Please provide:
1. Overall assessment of the codebase structure
2. Specific recommendations for each large file (if any)
3. Best practices suggestions for file organization
4. Priority actions to improve maintainability

Format your response in Markdown with clear sections.`;
    }

    private showAnalysisPanel(analysis: string): void {
        const panel = vscode.window.createWebviewPanel(
            'aiAnalysis',
            this.t('aiTitle'),
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = this.getWebviewContent(analysis);
    }

    private getWebviewContent(analysis: string): string {
        const isRtl = this.isRtl();
        const direction = isRtl ? 'rtl' : 'ltr';
        const textAlign = isRtl ? 'right' : 'left';

        // Simple markdown-like rendering
        const htmlContent = analysis
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/^- (.+)$/gm, '<li>$1</li>')
            .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');

        return `<!DOCTYPE html>
<html lang="${this.getLanguage()}" dir="${direction}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Analysis</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            line-height: 1.8;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            direction: ${direction};
            text-align: ${textAlign};
        }
        h1, h2, h3 {
            color: var(--vscode-textLink-foreground);
            margin-top: 1.5em;
        }
        h1 { font-size: 1.8em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 0.3em; }
        h2 { font-size: 1.4em; }
        h3 { font-size: 1.2em; }
        code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            direction: ltr;
            unicode-bidi: embed;
        }
        li {
            margin: 0.5em 0;
            padding-${isRtl ? 'right' : 'left'}: 0.5em;
        }
        ul, ol {
            padding-${isRtl ? 'right' : 'left'}: 1.5em;
        }
        strong {
            color: var(--vscode-textPreformat-foreground);
        }
    </style>
</head>
<body>
    <p>${htmlContent}</p>
</body>
</html>`;
    }
}
