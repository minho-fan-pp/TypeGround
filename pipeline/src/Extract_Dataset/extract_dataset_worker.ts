import { parentPort, workerData } from 'worker_threads';
import * as fs from 'fs';
import { SyntaxKind, Project } from "ts-morph";
import * as path from 'path';
import { TSTypeObject } from './TSTypeObject';
import * as ts from 'typescript';
interface TypeMeta {
    file: string;
    name: string;
    line: number;
    type: string;
    type_cat: string;
    loc_cat: 'var' | 'ret' | 'arg';
}
interface WorkerData {
    file: string;
    reposDir: string;
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
function remove_all_types(sourceFile: any) {
    let allVars = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
    for (const varNode of allVars) {
        if (varNode.getTypeNode()) {
            varNode.setType('');
        }
    }
    let functions = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
    let methods = sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration);
    let allF = [...functions, ...methods];
    for (const fNode of allF) {
        if (fNode.getReturnTypeNode()) {
            fNode.setReturnType('');
        }
    }
    for (const fNode of allF) {
        const parameters = fNode.getParameters();
        for (const param of parameters) {
            if (param.getTypeNode()) {
                param.setType('');
            }
        }
    }
}
function get_all_types(sourceFile: any) {
    const { varInfos, retInfos, argInfos } = collect_type_info_with_nodes(sourceFile);
    remove_all_types(sourceFile);
    const res: TypeMeta[] = [];
    for (const { info, node } of varInfos) {
        try {
            info['line'] = node.getStartLineNumber();
            if (info['name'] && info['line'] !== undefined && info['type'] && info['type_cat'] && info['loc_cat']) {
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
            if (info['name'] && info['line'] !== undefined && info['type'] && info['type_cat'] && info['loc_cat']) {
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
            if (info['name'] && info['line'] !== undefined && info['type'] && info['type_cat'] && info['loc_cat']) {
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
function remove_ts_comments(code: string, filePath: string): string {
    const isTsx = filePath.endsWith('.tsx');
    const source = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true, isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const printer = ts.createPrinter({ removeComments: true });
    const output = printer.printFile(source);
    return output.replace(/\n+$/, '');
}
if (parentPort) {
    const { reposDir }: WorkerData = workerData;
    parentPort.on('message', (task: {
        file: string;
        reposDir: string;
    }) => {
        const { file, reposDir: taskReposDir } = task;
        const targetReposDir = taskReposDir || reposDir;
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
            let code = fs.readFileSync(file, 'utf8');
            code = remove_ts_comments(code, file);
            sourceFile = project.createSourceFile(`temp_${file}`, code);
            sourceFile.formatText();
            const allTypes = get_all_types(sourceFile);
            code = sourceFile.getFullText();
            const relativePath = file.replace('/mnt/fmh_data/type4ts/result_testdata/', '');
            const targetPath = path.join(targetReposDir, relativePath);
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
            const targetDir = path.dirname(targetPath);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            fs.writeFileSync(targetPath, code, 'utf8');
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
