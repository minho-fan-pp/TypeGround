import { parentPort, workerData } from 'worker_threads';
import { SyntaxKind, Project } from 'ts-morph';
import * as path from 'path';
import * as fs from 'fs';
interface DataMeta {
    file: string;
    name: string;
    loc_cat: 'var' | 'ret' | 'arg';
    line: number;
    type?: string;
}
interface WorkerConfig {
    baseRepoDir: string;
    maskStr: string;
    segmentLen: number;
}
interface WorkerResult {
    success: boolean;
    maskedData?: MaskedData | null;
    error?: string;
    metaId?: string;
}
interface MaskedData {
    id: string;
    maskedText: string;
    type?: string;
}
function deal_var_node(sourceFile: any, data_meta: any, mask_str: string): any {
    const name = data_meta.name;
    const line = data_meta.line;
    let allVars = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
    allVars = allVars.filter((varNode: any) => {
        return varNode.getStartLineNumber() === line && varNode.getName() === name;
    });
    let varNode = null;
    if (allVars.length === 1) {
        varNode = allVars[0];
        varNode.setType(`"${mask_str}"`);
    }
    return varNode;
}
function deal_ret_node(sourceFile: any, data_meta: any, mask_str: string): any {
    const name = data_meta.name;
    const line = data_meta.line;
    let functions = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
    let methods = sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration);
    let allF = [...functions, ...methods].filter((fNode: any) => {
        return fNode.getStartLineNumber() == line && fNode.getName() == name;
    });
    let funcNode = null;
    if (allF.length === 1) {
        funcNode = allF[0];
    }
    if (funcNode) {
        funcNode.setReturnType(`"${mask_str}"`);
    }
    return funcNode;
}
function deal_arg_node(sourceFile: any, data_meta: any, mask_str: string): any {
    const name = data_meta.name;
    const line = data_meta.line;
    let functions = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
    let methods = sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration);
    let allF = [...functions, ...methods].filter((fNode: any) => {
        return fNode.getStartLineNumber() <= line;
    });
    let argNode = null;
    for (const fNode of allF) {
        const parameters = fNode.getParameters().filter((param: any) => {
            const paramName = param.getName();
            return paramName === name && param.getStartLineNumber() == line;
        });
        if (parameters.length === 1) {
            argNode = parameters[0];
            argNode.setType(`"${mask_str}"`);
            break;
        }
    }
    return argNode;
}
function mask_data(sourceFile: any, data_meta: DataMeta, mask_str: string, segment_len: number): MaskedData | null {
    const typeVal = data_meta.type;
    if (typeof typeVal === 'string' && typeVal.trim().toLowerCase() === 'any') {
        return null;
    }
    const loc_cat = data_meta.loc_cat;
    let node = null;
    if (loc_cat === 'var') {
        node = deal_var_node(sourceFile, data_meta, mask_str);
    }
    if (loc_cat === 'ret') {
        node = deal_ret_node(sourceFile, data_meta, mask_str);
    }
    if (loc_cat === 'arg') {
        node = deal_arg_node(sourceFile, data_meta, mask_str);
    }
    const res: MaskedData = {
        id: '',
        maskedText: '',
        type: ''
    };
    if (node) {
        const id = `${data_meta.file}#${data_meta.name}#${data_meta.loc_cat}#${data_meta.line}`;
        const maskedText = sourceFile.getText().replace(`"${mask_str}"`, `${mask_str}`);
        const startLine = node.getStartLineNumber();
        const endLine = node.getEndLineNumber ? node.getEndLineNumber() : node.getEndLineNumber?.() || startLine;
        const centerLine = Math.floor((startLine + endLine) / 2);
        const segHalf = Math.floor(segment_len / 2);
        const allLines = maskedText.split('\n');
        const totalLines = allLines.length;
        const clipStart = Math.max(0, centerLine - segHalf - 1);
        const clipEnd = Math.min(totalLines, centerLine + segHalf);
        const maskedTextSnippet = allLines.slice(clipStart, clipEnd).join('\n');
        res.id = id;
        res.maskedText = maskedTextSnippet;
        res.type = data_meta.type ?? '';
        return res;
    }
    else {
        return null;
    }
}
if (parentPort) {
    const { baseRepoDir, maskStr, segmentLen }: WorkerConfig = workerData;
    parentPort.on('message', (task: {
        dataMeta: DataMeta;
    }) => {
        const { dataMeta } = task;
        const project = new Project();
        let sourceFile: any = null;
        const filePath = path.join(baseRepoDir, dataMeta.file);
        if (!fs.existsSync(filePath)) {
            parentPort?.postMessage({
                success: false,
                error: `File does not exist: ${filePath}`,
                metaId: `${dataMeta.file}#${dataMeta.name}#${dataMeta.loc_cat}#${dataMeta.line}`,
            } as WorkerResult);
            return;
        }
        try {
            sourceFile = project.addSourceFileAtPath(filePath);
            const maskedData = mask_data(sourceFile, dataMeta, maskStr, segmentLen);
            parentPort?.postMessage({
                success: true,
                maskedData,
                metaId: `${dataMeta.file}#${dataMeta.name}#${dataMeta.loc_cat}#${dataMeta.line}`,
            } as WorkerResult);
        }
        catch (error: any) {
            parentPort?.postMessage({
                success: false,
                error: error?.message || String(error),
                metaId: `${dataMeta.file}#${dataMeta.name}#${dataMeta.loc_cat}#${dataMeta.line}`,
            } as WorkerResult);
        }
        finally {
            if (sourceFile) {
                sourceFile.forget();
            }
            project.getSourceFiles().forEach(sf => sf.forget());
        }
    });
}
