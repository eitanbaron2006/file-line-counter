import * as fs from 'fs';

export async function countLines(filePath: string): Promise<number> {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').length;
        return lines;
    } catch (error) {
        return 0;
    }
}