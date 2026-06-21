import { parentPort, workerData } from 'worker_threads';
import path from 'path';
import * as fs from 'fs';
import { SyntaxKind, Project } from 'ts-morph';
import { TSlicer } from './TSlicer/SlicingClass';
import { DataType, CodeData } from '../TypeReHint_Stage2/utils/typeDefined';
interface DataMeta {
    file: string;
    name: string;
    loc_cat: 'var' | 'ret' | 'arg';
    line: number;
    type: string;
}
interface WorkerConfig {
    baseRepoDir: string;
    defUseBasePath: string;
    maskStr: string;
}
interface SliceData {
    id: string;
    sliced_code: string;
    type: string;
}
interface WorkerResult {
    success: boolean;
    slicedData?: SliceData | null;
    error?: string;
    metaId?: string;
}
type MaskableNode = import('ts-morph').VariableDeclaration | import('ts-morph').FunctionDeclaration | import('ts-morph').MethodDeclaration | import('ts-morph').ParameterDeclaration;
function resolveRepoName(filePath: string): string {
    const [repo] = filePath.split('/');
    return repo || filePath;
}
function getQuotedMask(maskStr: string): string {
    return JSON.stringify(maskStr ?? '<mask>');
}
function deal_var_node(sourceFile: any, data_meta: DataMeta, quotedMask: string): MaskableNode | null {
    const name = data_meta.name;
    const line = data_meta.line;
    let allVars = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
    let matchedVars = allVars.filter((varNode: any) => {
        return varNode.getStartLineNumber() === line && varNode.getName() === name;
    });
    if (matchedVars.length === 0) {
        matchedVars = allVars.filter((varNode: any) => {
            if (varNode.getStartLineNumber() !== line) {
                return false;
            }
            const nameNode = varNode.getNameNode();
            if (!nameNode) {
                return false;
            }
            const nameKind = nameNode.getKind();
            if (nameKind === SyntaxKind.ObjectBindingPattern) {
                const elements = nameNode.getElements();
                for (const element of elements) {
                    const elementName = element.getName();
                    if (elementName === name) {
                        return true;
                    }
                }
            }
            else if (nameKind === SyntaxKind.ArrayBindingPattern) {
                const elements = nameNode.getElements();
                for (const element of elements) {
                    const elementName = element.getName();
                    if (elementName === name) {
                        return true;
                    }
                }
            }
            return false;
        });
    }
    if (matchedVars.length === 1) {
        const varNode = matchedVars[0];
        const nameNode = varNode.getNameNode();
        if (nameNode) {
            const nameKind = nameNode.getKind();
            if (nameKind === SyntaxKind.ObjectBindingPattern ||
                nameKind === SyntaxKind.ArrayBindingPattern) {
                try {
                    varNode.setType(quotedMask);
                }
                catch (error: any) {
                }
                return varNode;
            }
        }
        const initializer = varNode.getInitializer();
        if (initializer) {
            const initKind = initializer.getKind();
            if ((initKind === SyntaxKind.ObjectLiteralExpression ||
                initKind === SyntaxKind.ArrayLiteralExpression) &&
                nameNode && nameNode.getKind() === SyntaxKind.Identifier) {
                const parent = varNode.getParent();
                if (parent) {
                    const parentKind = parent.getKind();
                    if (parentKind === SyntaxKind.VariableDeclarationList) {
                        const declarations = parent.getDeclarations();
                        if (declarations.length === 1) {
                            const declNameNode = declarations[0].getNameNode();
                            if (declNameNode &&
                                (declNameNode.getKind() === SyntaxKind.ObjectBindingPattern ||
                                    declNameNode.getKind() === SyntaxKind.ArrayBindingPattern)) {
                                try {
                                    varNode.setType(quotedMask);
                                }
                                catch (error: any) {
                                }
                                return varNode;
                            }
                        }
                    }
                }
            }
        }
        try {
            varNode.setType(quotedMask);
            return varNode;
        }
        catch (error: any) {
            return varNode;
        }
    }
    return null;
}
function deal_ret_node(sourceFile: any, data_meta: DataMeta, quotedMask: string): MaskableNode | null {
    const name = data_meta.name;
    const line = data_meta.line;
    const functions = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
    const methods = sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration);
    const allF = [...functions, ...methods].filter((fNode: any) => {
        return fNode.getStartLineNumber() === line && fNode.getName() === name;
    });
    if (allF.length === 1) {
        const funcNode = allF[0];
        funcNode.setReturnType(quotedMask);
        return funcNode;
    }
    return null;
}
function deal_arg_node(sourceFile: any, data_meta: DataMeta, quotedMask: string): MaskableNode | null {
    const name = data_meta.name;
    const line = data_meta.line;
    const functions = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
    const methods = sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration);
    const allF = [...functions, ...methods].filter((fNode: any) => {
        return fNode.getStartLineNumber() <= line;
    });
    for (const fNode of allF) {
        let matchedParams = fNode.getParameters().filter((param: any) => {
            const paramName = param.getName();
            return paramName === name && param.getStartLineNumber() === line;
        });
        if (matchedParams.length === 0) {
            matchedParams = fNode.getParameters().filter((param: any) => {
                if (param.getStartLineNumber() !== line) {
                    return false;
                }
                const bindingName = param.getNameNode();
                if (!bindingName) {
                    return false;
                }
                const bindingKind = bindingName.getKind();
                if (bindingKind === SyntaxKind.ObjectBindingPattern) {
                    const elements = bindingName.getElements();
                    for (const element of elements) {
                        const elementName = element.getName();
                        if (elementName === name) {
                            return true;
                        }
                    }
                }
                else if (bindingKind === SyntaxKind.ArrayBindingPattern) {
                    const elements = bindingName.getElements();
                    for (const element of elements) {
                        const elementName = element.getName();
                        if (elementName === name) {
                            return true;
                        }
                    }
                }
                return false;
            });
        }
        if (matchedParams.length === 1) {
            const argNode = matchedParams[0];
            const bindingName = argNode.getNameNode();
            if (bindingName) {
                const bindingKind = bindingName.getKind();
                if (bindingKind === SyntaxKind.ObjectBindingPattern ||
                    bindingKind === SyntaxKind.ArrayBindingPattern) {
                    try {
                        argNode.setType(quotedMask);
                    }
                    catch (error: any) {
                    }
                    return argNode;
                }
            }
            try {
                argNode.setType(quotedMask);
                return argNode;
            }
            catch (error: any) {
                return argNode;
            }
        }
    }
    return null;
}
function slice_single_file(sourceFile: any, data_meta: DataMeta, def_use_path: string, maskStr: string): SliceData | null {
    const typeVal = data_meta.type;
    if (typeof typeVal === 'string' && typeVal.trim().toLowerCase() === 'any') {
        return null;
    }
    const loc_cat = data_meta.loc_cat;
    let node: MaskableNode | null = null;
    let data_type = DataType.Var;
    const quotedMask = getQuotedMask(maskStr);
    if (loc_cat === 'var') {
        node = deal_var_node(sourceFile, data_meta, quotedMask);
        data_type = DataType.Var;
    }
    if (loc_cat === 'ret') {
        node = deal_ret_node(sourceFile, data_meta, quotedMask);
        data_type = DataType.Function;
    }
    if (loc_cat === 'arg') {
        node = deal_arg_node(sourceFile, data_meta, quotedMask);
        data_type = DataType.FunctionParam;
    }
    if (!node) {
        return null;
    }
    const id = `${data_meta.file}#${data_meta.name}#${data_meta.loc_cat}#${data_meta.line}`;
    const data: CodeData = {
        node,
        type: '',
        filePath: sourceFile.getFilePath(),
        dataType: data_type,
    };
    const codeSlicer = new TSlicer(sourceFile.getFilePath(), def_use_path);
    const sliced = codeSlicer.Slicing(data);
    if (!sliced?.code) {
        return null;
    }
    const sliced_code = sliced.code.replace(quotedMask, maskStr);
    return {
        id,
        sliced_code,
        type: data_meta.type,
    };
}
if (parentPort) {
    const workerConfig = workerData as WorkerConfig;
    const baseRepoDir = workerConfig.baseRepoDir as string;
    const defUseBasePath = workerConfig.defUseBasePath as string;
    const maskStr = workerConfig.maskStr ?? '<mask>';
    parentPort.on('message', (task: {
        dataMeta: DataMeta;
    }) => {
        const { dataMeta } = task;
        const project = new Project();
        let sourceFile: any = null;
        const filePath = path.join(baseRepoDir, dataMeta.file);
        const repoName = resolveRepoName(dataMeta.file);
        const defUsePath = path.join(defUseBasePath, repoName);
        if (!fs.existsSync(filePath)) {
            parentPort?.postMessage({
                success: false,
                error: `File does not exist: ${filePath}`,
                metaId: `${dataMeta.file}#${dataMeta.name}#${dataMeta.loc_cat}#${dataMeta.line}`,
            } as WorkerResult);
            return;
        }
        if (!fs.existsSync(defUsePath)) {
            parentPort?.postMessage({
                success: false,
                error: `Def-Use processing: ${defUsePath}`,
                metaId: `${dataMeta.file}#${dataMeta.name}#${dataMeta.loc_cat}#${dataMeta.line}`,
            } as WorkerResult);
            return;
        }
        try {
            sourceFile = project.addSourceFileAtPath(filePath);
            const slicedData = slice_single_file(sourceFile, dataMeta, defUsePath, maskStr);
            parentPort?.postMessage({
                success: true,
                slicedData,
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
