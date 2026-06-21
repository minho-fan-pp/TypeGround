import * as path from 'path';
export function fixType(target: string) {
    const res = target.replace(/import\([^)]*\)\.([^)\s]+)/g, "$1");
    return res;
}
export function delyinhao(s: string) {
    const cleanedStr = s.replace(/['"]+/g, '');
    return cleanedStr;
}
export function fixExtraMask(name: string, s: string) {
    let newAns = "";
    newAns = s.replace(name + ": mask", "");
    return newAns;
}
export function getAfterFirstEqual(inputStr: string): string {
    const equalIndex = inputStr.indexOf('=');
    if (equalIndex === -1)
        return '';
    return inputStr.slice(equalIndex + 1).trim();
}
export function areFilePathsEqual(a: string, b: string, options: {
    caseSensitive?: boolean;
} = {}): boolean {
    const defaultCaseSensitive = process.platform !== 'win32';
    const caseSensitive = options.caseSensitive ?? defaultCaseSensitive;
    const resolveAndNormalize = (p: string) => path.normalize(path.resolve(p));
    const normA = resolveAndNormalize(a);
    const normB = resolveAndNormalize(b);
    if (caseSensitive) {
        return normA === normB;
    }
    else {
        return normA.toLowerCase() === normB.toLowerCase();
    }
}
export function isQuotedUnionBySplit(s: string): boolean {
    return s
        .split('|')
        .map(part => part.trim())
        .every(part => /^"[^"]+"$/.test(part));
}
export function getContext(text: string, index: number, contextLen: number = 150): {
    before: string;
    after: string;
} {
    const safeIndex = Math.min(Math.max(0, index), text.length);
    const start = Math.max(0, safeIndex - contextLen);
    const end = Math.min(text.length, safeIndex + contextLen + 1);
    const before = (start > 0 ? '...' : '') + text.slice(start, safeIndex);
    const after = text.slice(safeIndex, end) + (end < text.length ? '...' : '');
    return { before, after };
}
export function getFileName(filePath: string): string | undefined {
    if (!filePath)
        return "";
    const clean = filePath.split(/[?#]/)[0];
    const parts = clean?.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts?.length ? parts[parts.length - 1] : "";
}
