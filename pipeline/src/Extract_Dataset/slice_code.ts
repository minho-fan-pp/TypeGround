import { TSlicer } from "./TSlicer/SlicingClass";
import { Init_Def_Use, Def_Use } from "../TypeReHint_Stage2/Def_Use/index";
import { DataType, CodeData } from "../TypeReHint_Stage2/utils/typeDefined";
import path from "path";
import * as fs from 'fs';
import { SyntaxKind, Project } from "ts-morph";
import { createWriteStream } from 'fs';
import { createGzip } from 'zlib';
function deal_var_node(sourceFile: any, data_meta: any): any {
    const name = data_meta.name;
    const line = data_meta.line;
    let allVars = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
    allVars = allVars.filter((varNode: any) => {
        return varNode.getStartLineNumber() === line && varNode.getName() === name;
    });
    let varNode = null;
    if (allVars.length === 1) {
        varNode = allVars[0];
        varNode.setType(`"<mask>"`);
    }
    return varNode;
}
function deal_ret_node(sourceFile: any, data_meta: any): any {
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
        funcNode.setReturnType(`"<mask>"`);
    }
    return funcNode;
}
function deal_arg_node(sourceFile: any, data_meta: any): any {
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
            argNode.setType(`"<mask>"`);
            break;
        }
    }
    return argNode;
}
export function slice_code(sourceFile: any, data_meta: any, def_use_path: string) {
    const res = {
        id: '',
        sliced_code: '',
        type: ''
    };
    const loc_cat = data_meta.loc_cat;
    let node = null;
    let data_type = DataType.Var;
    if (loc_cat === 'var') {
        node = deal_var_node(sourceFile, data_meta);
        data_type = DataType.Var;
    }
    if (loc_cat === 'ret') {
        node = deal_ret_node(sourceFile, data_meta);
        data_type = DataType.Function;
    }
    if (loc_cat === 'arg') {
        node = deal_arg_node(sourceFile, data_meta);
        data_type = DataType.FunctionParam;
    }
    if (node) {
        const id = `${data_meta.file}#${data_meta.name}#${data_meta.loc_cat}#${data_meta.line}`;
        let data: CodeData = { node: node, type: "", filePath: sourceFile.getFilePath(), dataType: data_type };
        let codeSlicer = new TSlicer(sourceFile.getFilePath(), def_use_path);
        let sliced_code = codeSlicer.Slicing(data).code.replace('"<mask>"', "<mask>");
        res.id = id;
        res.sliced_code = sliced_code;
        res.type = data_meta.type;
        return res;
    }
    return null;
}
function ensure_output_dir(output_path: string) {
    const dir = path.dirname(output_path);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
function write_results_json(output_path: string, results: any[]) {
    ensure_output_dir(output_path);
    fs.writeFileSync(output_path, JSON.stringify(results, null, 2), 'utf8');
}
function write_results_jsonl(output_path: string, results: any[], useCompression: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
        ensure_output_dir(output_path);
        const fileStream = createWriteStream(output_path);
        let writeStream: NodeJS.WritableStream = fileStream;
        let gzipStream: NodeJS.ReadWriteStream | null = null;
        if (useCompression) {
            gzipStream = createGzip();
            gzipStream.pipe(fileStream);
            writeStream = gzipStream;
        }
        fileStream.on('error', (err) => reject(err));
        if (gzipStream) {
            gzipStream.on('error', (err) => reject(err));
        }
        for (const result of results) {
            writeStream.write(JSON.stringify(result) + '\n', 'utf8');
        }
        writeStream.end();
        fileStream.on('finish', () => {
            resolve();
        });
    });
}
function parseArgs() {
    const args = process.argv.slice(2);
    const opts: Record<string, string> = {
        mask_str: "<mask>",
        segment_len: "10"
    };
    for (let i = 0; i < args.length; i++) {
        if (args[i] && args[i]?.startsWith('--')) {
            const key = args[i]?.replace(/^--/, '');
            if (i + 1 < args.length && args[i + 1] && !args[i + 1]?.startsWith('--')) {
                opts[key ?? ""] = args[i + 1] ?? "";
                i++;
            }
            else {
                opts[key ?? ""] = "true";
            }
        }
    }
    return opts;
}
async function main(base_repo_dir: string, data_metas_path: string, output_path: string, def_use_base_path: string) {
    const data_metas = JSON.parse(fs.readFileSync(data_metas_path, 'utf8')).slice(0, 10);
    console.log(`message ${data_metas.length} message`);
    let maskedDatas = [];
    let failedDatas: any[] = [];
    if (!fs.existsSync(def_use_base_path)) {
        fs.mkdirSync(def_use_base_path, { recursive: true });
    }
    const lowerPath = output_path.toLowerCase();
    const useJsonl = lowerPath.endsWith('.jsonl') || lowerPath.endsWith('.jsonl.gz');
    const useCompression = lowerPath.endsWith('.gz');
    const project = new Project();
    for (const data_meta of data_metas) {
        const repo_name = data_meta.file.split("/")[0];
        const repo_path = path.join(base_repo_dir, repo_name);
        const def_use_path = path.join(def_use_base_path, repo_name);
        if (!fs.existsSync(def_use_path)) {
            Init_Def_Use(def_use_path);
            Def_Use(repo_path, def_use_path);
        }
        const file_path = path.join(base_repo_dir, data_meta.file);
        if (!fs.existsSync(file_path)) {
            console.log(`File does not exist: ${file_path}`);
            failedDatas.push({
                type: 'file_not_found',
                data_meta: data_meta,
                message: `File does not exist: ${file_path}`
            });
            continue;
        }
        const sourceFile = project.addSourceFileAtPath(file_path);
        const maskedData = slice_code(sourceFile, data_meta, def_use_path);
        if (maskedData) {
            maskedDatas.push(maskedData);
        }
        else {
            failedDatas.push({
                type: 'mask_fail',
                data_meta: data_meta,
                message: `message(message) for ${data_meta.file}#${data_meta.name}#${data_meta.loc_cat}#${data_meta.line}`
            });
        }
        if (sourceFile) {
            sourceFile.forget();
        }
        project.getSourceFiles().forEach(sf => sf.forget());
    }
    const formatDesc = useCompression
        ? 'JSONL + GZIP (message)'
        : useJsonl
            ? 'JSONL'
            : 'JSON';
    console.log(`message,message: ${formatDesc}`);
    if (useJsonl) {
        await write_results_jsonl(output_path, maskedDatas, useCompression);
        if (useCompression) {
            console.log(`message: ${output_path}`);
        }
    }
    else {
        write_results_json(output_path, maskedDatas);
    }
    if (failedDatas.length > 0) {
        const errorLogPath = path.join(path.dirname(output_path), 'error.log');
        const errorLogContent = failedDatas.map(info => `[${info.type}] ${info.message}\n${JSON.stringify(info.data_meta, null, 2)}`).join('\n\n');
        fs.writeFileSync(errorLogPath, errorLogContent, 'utf8');
        console.log(`message: ${errorLogPath} (${failedDatas.length} message)`);
    }
    console.log(`Processing complete!message ${maskedDatas.length} message`);
}
if (require.main === module) {
    const opts = parseArgs();
    if (!opts.base_repo_dir || !opts.data_metas_path || !opts.output_path || !opts.def_use_base_path) {
        console.error("Usage: npx tsx mask_data.ts --base_repo_dir BASE_REPO_DIR --data_metas_path DATA_METAS_PATH --output_path OUTPUT_PATH --def_use_base_path DEF_USE_BASE_PATH");
        console.error("message:");
        console.error("  - .jsonl      -> JSONL message(message)");
        console.error("  - .jsonl.gz   -> JSONL + GZIP message(message,message)");
        console.error("  - .json       -> JSON message(message)");
        process.exit(1);
    }
    main(opts.base_repo_dir, opts.data_metas_path, opts.output_path, opts.def_use_base_path).catch(error => {
        console.error("Processing failed:", error);
        process.exit(1);
    });
}
