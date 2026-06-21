import { parentPort, workerData } from 'worker_threads';
import * as fs from 'fs';
import { SyntaxKind, Project } from "ts-morph";
import { TSTypeObject } from './TSTypeObject';
interface TypeMeta {
    file: string;
    name: string;
    line: number;
    type: string;
    type_cat: string;
    loc_cat: 'var' | 'ret' | 'arg';
}
interface WorkerData {
    reposPathPrefix: string;
}
function isTypeMetaValidWithoutFile(info: Partial<TypeMeta>): boolean {
    return !!(info.name &&
        info.line !== undefined &&
        info.type &&
        info.type_cat &&
        info.loc_cat);
}
function isTypeMetaValid(info: Partial<TypeMeta>): boolean {
    return !!(info.file &&
        info.name &&
        info.line !== undefined &&
        info.type &&
        info.type_cat &&
        info.loc_cat);
}
function collect_type_info_with_nodes(sourceFile: any) {
    const varInfos: Array<{
        info: TypeMeta;
        node: any;
    }> = [];
    const retInfos: Array<{
        info: TypeMeta;
        node: any;
    }> = [];
    const argInfos: Array<{
        info: TypeMeta;
        node: any;
    }> = [];
    let allVars = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
    allVars = allVars.filter((varNode: any) => {
        const typeNode = varNode.getTypeNode();
        return typeNode;
    });
    for (const varNode of allVars) {
        const temp: Partial<TypeMeta> = {};
        temp['name'] = varNode.getName();
        let typeText = varNode.getTypeNode().getText();
        typeText = typeText.replace(/import\([^)]+\)\./g, "");
        temp['type'] = typeText;
        temp['loc_cat'] = 'var';
        const type_obj = new TSTypeObject(typeText);
        let cat = type_obj.getTypeObject()?.category;
        temp['type_cat'] = cat ?? '';
        if (temp['name'] && temp['type'] && temp['type_cat'] && temp['loc_cat']) {
            varInfos.push({ info: temp as TypeMeta, node: varNode });
        }
    }
    let functions = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
    let methods = sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration);
    let allF = [...functions, ...methods];
    let allFWithReturn = allF.filter((fNode: any) => {
        const returnTypeNode = fNode.getReturnTypeNode();
        return returnTypeNode;
    });
    for (const fNode of allFWithReturn) {
        const temp: Partial<TypeMeta> = {};
        temp['name'] = fNode.getName();
        let typeText = fNode.getReturnTypeNode().getText();
        typeText = typeText.replace(/import\([^)]+\)\./g, "");
        temp['type'] = typeText;
        temp['loc_cat'] = 'ret';
        const type_obj = new TSTypeObject(typeText);
        temp['type_cat'] = type_obj.getTypeObject()?.category ?? '';
        if (temp['name'] && temp['type'] && temp['type_cat'] && temp['loc_cat']) {
            retInfos.push({ info: temp as TypeMeta, node: fNode });
        }
    }
    let allFWithParams = allF.filter((fNode: any) => {
        const parameters = fNode.getParameters();
        return parameters.length > 0;
    });
    for (const fNode of allFWithParams) {
        const parameters = fNode.getParameters().filter((param: any) => {
            const typeNode = param.getTypeNode();
            return typeNode;
        });
        for (const param of parameters) {
            const temp: Partial<TypeMeta> = {};
            temp['name'] = param.getName();
            let typeText = param.getTypeNode().getText();
            typeText = typeText.replace(/import\([^)]+\)\./g, "");
            temp['type'] = typeText;
            temp['loc_cat'] = 'arg';
            const type_obj = new TSTypeObject(typeText);
            temp['type_cat'] = type_obj.getTypeObject()?.category ?? '';
            if (temp['name'] && temp['type'] && temp['type_cat'] && temp['loc_cat']) {
                argInfos.push({ info: temp as TypeMeta, node: param });
            }
        }
    }
    return { varInfos, retInfos, argInfos };
}
function get_all_types(sourceFile: any) {
    const { varInfos, retInfos, argInfos } = collect_type_info_with_nodes(sourceFile);
    const res: TypeMeta[] = [];
    for (const { info, node } of varInfos) {
        try {
            info['line'] = node.getStartLineNumber();
            if (isTypeMetaValidWithoutFile(info)) {
                res.push(info);
            }
            else {
                console.warn(`Skipping variable ${info['name']} due to empty fields.`);
            }
        }
        catch (e) {
            console.warn(`Failed to get line number for variable ${info['name']}, skipping.`);
        }
    }
    for (const { info, node } of retInfos) {
        try {
            info['line'] = node.getStartLineNumber();
            if (isTypeMetaValidWithoutFile(info)) {
                res.push(info);
            }
            else {
                console.warn(`Skipping function ${info['name']} due to empty fields.`);
            }
        }
        catch (e) {
            console.warn(`Failed to get line number for function ${info['name']}, skipping.`);
        }
    }
    for (const { info, node } of argInfos) {
        try {
            info['line'] = node.getStartLineNumber();
            if (isTypeMetaValidWithoutFile(info)) {
                res.push(info);
            }
            else {
                console.warn(`Skipping parameter ${info['name']} due to empty fields.`);
            }
        }
        catch (e) {
            console.warn(`Failed to get line number for parameter ${info['name']}, skipping.`);
        }
    }
    return res;
}
if (parentPort) {
    const { reposPathPrefix }: WorkerData = workerData;
    parentPort.on('message', (task: {
        file: string;
        reposPathPrefix: string;
    }) => {
        const { file, reposPathPrefix: taskReposPathPrefix } = task;
        const targetReposPathPrefix = taskReposPathPrefix || reposPathPrefix;
        if (!fs.existsSync(file)) {
            parentPort?.postMessage({
                success: false,
                error: `File does not exist: ${file}`,
                file: file
            });
            return;
        }
        let sourceFile: any = null;
        const project = new Project();
        try {
            const code = fs.readFileSync(file, 'utf8');
            const fileExtension = file.split('.').pop() || 'ts';
            sourceFile = project.createSourceFile(`temp.${fileExtension}`, code);
            if (sourceFile) {
                sourceFile.formatText();
            }
            const allTypes = get_all_types(sourceFile);
            const relativePath = file.replace(targetReposPathPrefix, '');
            const validTypes = allTypes.filter((type: TypeMeta) => {
                type['file'] = relativePath;
                if (isTypeMetaValid(type)) {
                    return true;
                }
                else {
                    console.warn(`Skipping type ${type.name} due to empty fields after setting file.`);
                    return false;
                }
            });
            parentPort?.postMessage({
                success: true,
                types: validTypes,
                file: file
            });
        }
        catch (error: any) {
            parentPort?.postMessage({
                success: false,
                error: error?.message || String(error),
                file: file
            });
        }
        finally {
            if (sourceFile) {
                sourceFile.forget();
            }
            project.getSourceFiles().forEach(sf => sf.forget());
        }
    });
}
