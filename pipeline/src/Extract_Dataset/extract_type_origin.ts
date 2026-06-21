import * as fs from 'fs';
import { SyntaxKind, Project } from "ts-morph";
import * as path from 'path';
import * as ts from 'typescript';
import { TSTypeObject } from './TSTypeObject';
interface TypeMeta {
    file: string;
    name: string;
    line: number;
    type: string;
    type_cat: string;
    loc_cat: 'var' | 'ret' | 'arg';
}
function get_files(fp: string): string[] {
    const rawdata = fs.readFileSync(fp, 'utf-8');
    const files = JSON.parse(rawdata);
    return files;
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
function extract_data(fp: string, types_json_fp: string) {
    let files = get_files(fp)
        .map((file: string) => file.replace('/mnt/fmh_data/type4ts/result/', '/mnt/fmh_data/type4ts/repos/'))
        .slice(0, 100);
    const res: TypeMeta[] = [];
    const project = new Project();
    for (let i = 0; i < files.length; i++) {
        const file = files[i] ?? '';
        if (!fs.existsSync(file)) {
            console.warn(`File does not exist: ${file}, skipping.`);
            continue;
        }
        console.log(`Processing file ${i + 1} of ${files.length}: ${file}`);
        let sourceFile: any;
        try {
            const code = fs.readFileSync(file, 'utf8');
            sourceFile = project.createSourceFile(`temp.${file.split('.')[-1]}`, code);
            if (sourceFile) {
                sourceFile.formatText();
            }
            const allTypes = get_all_types(sourceFile);
            const relativePath = file.replace('/mnt/fmh_data/type4ts/repos/', '');
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
            res.push(...validTypes);
            const typesJsonDir = path.dirname(types_json_fp);
            if (!fs.existsSync(typesJsonDir)) {
                fs.mkdirSync(typesJsonDir, { recursive: true });
            }
            fs.writeFileSync(types_json_fp, JSON.stringify(res, null, 2), 'utf8');
        }
        finally {
            if (sourceFile) {
                sourceFile.forget();
            }
            project.getSourceFiles().forEach(sf => sf.forget());
        }
    }
}
async function main() {
    const args = process.argv.slice(2);
    let files_fp = '';
    let types_res_fp = '';
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--files_fp' && i + 1 < args.length) {
            files_fp = args[i + 1] ?? '';
            i++;
        }
        else if (args[i] === '--types_res_fp' && i + 1 < args.length) {
            types_res_fp = args[i + 1] ?? '';
            i++;
        }
    }
    if (!files_fp || !types_res_fp) {
        console.error('Usage: ts-node extract_dataset.ts --files_fp <project_files.json> --types_json_fp <output_types.json>');
        process.exit(1);
    }
    extract_data(files_fp, types_res_fp);
}
main().catch(error => {
    console.error("Unhandled error:", error);
    process.exit(1);
});
