import { SyntaxKind } from "ts-morph";
import { Logger, LogLevel } from "./utils/logMethods";
import * as path from 'path';
import * as fs from 'fs';
import { TSlicer } from "./TSlicer/SlicingClass";
import { DataType, CodeData } from "./utils/typeDefined";
import { initializeProjectWithConfig } from "./utils/ProjectReader";
import { LLMAgent } from "./LLMAgent/LLMAgent";
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
const execAsync = promisify(exec);
const curDir = path.dirname(__filename);
const mask = "mask";
const logger = new Logger({
    level: LogLevel.DEBUG,
    format: "{time} [{level}] > {message}",
});
const toFixType = ["any", "unknown", "Object"];
async function performCompileCheck(projectPath: string): Promise<boolean> {
    try {
        logger.info(`Performing compile check for project: ${projectPath}`);
        const originalCwd = process.cwd();
        const targetDir = join(curDir, "../compile_check");
        const command = `cd ${targetDir} && python compile_check_dataset_modules.py --project "${projectPath}" --no-install`;
        logger.debug(`Executing command: ${command}`);
        const { stdout } = await execAsync(command, {
            shell: '/bin/bash',
            env: { ...process.env, PATH: process.env.PATH }
        });
        process.chdir(originalCwd);
        let isSuccess = false;
        if (stdout && stdout.trim()) {
            const checkResultsMatch = stdout.match(/=== Check Results ===\s*\n([\s\S]*?)(?=\n===|$)/);
            if (checkResultsMatch && checkResultsMatch[1]) {
                const resultsSection = checkResultsMatch[1];
                logger.debug(`Found check results section: ${resultsSection}`);
                if (resultsSection.includes('success')) {
                    isSuccess = true;
                }
                else if (resultsSection.includes('failed')) {
                    isSuccess = false;
                }
                else {
                    isSuccess = false;
                }
            }
            else {
                logger.debug(`Not found check results section`);
                isSuccess = false;
            }
        }
        logger.info(`Compile check ${isSuccess ? 'PASSED' : 'FAILED'}`);
        return isSuccess;
    }
    catch (error: any) {
        logger.error(`Compile check failed with error: ${error.message}`);
        return false;
    }
}
async function writeAst2File(sourceFile: any) {
    await sourceFile.formatText();
    await sourceFile.save();
}
function normalizePredictedType(typeStr: string): string {
    return typeStr.trim().replace(/^\s*:\s*/, "");
}
async function extract_types(type_pre: string, K: number): Promise<string[]> {
    const originalCwd = process.cwd();
    const targetDir = join(curDir, "./Build_Type_Set");
    let cmd = '';
    cmd = `npx tsx index.ts --select ${type_pre} ${K}`;
    const command = [
        `cd ${targetDir}`,
        cmd
    ].join(' && ');
    logger.info(`Executing command: ${command}`);
    const { stdout, stderr } = await execAsync(command, {
        shell: '/bin/bash',
        env: { ...process.env, PATH: process.env.PATH }
    });
    if (stdout)
        logger.debug(stdout);
    if (stderr)
        logger.debug(stderr);
    process.chdir(originalCwd);
    let fp = "";
    fp = `./Build_Type_Set/output/unmatched_${K}.json`;
    const jsonPath = path.resolve(fp);
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const result: string[] = JSON.parse(raw);
    return result;
}
async function build_type_set(ProjectRoot: string) {
    const originalCwd = process.cwd();
    const targetDir = join(curDir, "./Build_Type_Set");
    const command = [
        `cd ${targetDir}`,
        `npx tsx index.ts --build ${ProjectRoot}`
    ].join(' && ');
    logger.info(`Executing command: ${command}`);
    const { stdout, stderr } = await execAsync(command, {
        shell: '/bin/bash',
        env: { ...process.env, PATH: process.env.PATH }
    });
    if (stdout)
        logger.debug(stdout);
    if (stderr)
        logger.debug(stderr);
    process.chdir(originalCwd);
}
async function completeness_check(ProjectRoot: string, type_pre: string, sourceFile: any, Node: any) {
    const unmatched_types = await extract_types(type_pre, 10);
    let unmatched_types_status = unmatched_types.map(type => ({ "type": type, "status": false }));
    for (const type of unmatched_types) {
        try {
            Node.setType(type);
            await writeAst2File(sourceFile);
        }
        catch (e) {
            Node.setType(type_pre);
            await writeAst2File(sourceFile);
            continue;
        }
        logger.info(`completeness_check:${type_pre}----unmatched_type:${type}`);
        const compileSuccess = await performCompileCheck(ProjectRoot);
        if (compileSuccess) {
            unmatched_types_status.find(item => item.type === type)!.status = true;
            return { 'unmatched_types_status': unmatched_types_status, 'completeness_status': false };
        }
    }
    return { 'unmatched_types_status': unmatched_types_status, 'completeness_status': true };
}
export async function getFileTypeData(sourceFile: any, projectPath: string, def_use_dir: string) {
    let allVars = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
    allVars = allVars.filter((varNode: any) => {
        const typeNode = varNode.getTypeNode();
        return typeNode && typeNode.getText() == "any";
    });
    let res = [];
    logger.info(`Processing file: ${sourceFile.getFilePath()}, found ${allVars.length} variable declarations`);
    for (let varNode of allVars) {
        try {
            const temp: Record<string, any> = {};
            temp['name'] = varNode.getName();
            temp['file'] = sourceFile.getFilePath();
            const funcDecl = varNode.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration);
            const funcName = funcDecl?.getName() ?? 'global';
            logger.debug(`func:${funcName}`);
            const classDecl = varNode.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
            const className = classDecl?.getName() ?? 'global';
            logger.debug(`class:${className}`);
            temp['loc'] = `${funcName}@${className}`;
            temp['cat'] = 'var';
            temp['prediction'] = '';
            temp['compile_status'] = 'failed';
            temp['completeness_status'] = 'failed';
            temp['unmatched_types_status'] = [];
            const type_text = varNode.getTypeNode().getText();
            let codeSlicer = new TSlicer(sourceFile.getFilePath(), def_use_dir);
            let data: CodeData = { node: varNode, type: type_text, filePath: sourceFile.getFilePath(), dataType: DataType.Var };
            try {
                varNode.setType(mask);
            }
            catch (e) {
                logger.error(`Failed to set type for variable: ${varNode.getName()}`);
                varNode.setType(type_text);
                await writeAst2File(sourceFile);
                continue;
            }
            let ans_sliced = codeSlicer.Slicing(data);
            let llmAgent = new LLMAgent();
            let ans = normalizePredictedType((await llmAgent.GenerationType(ans_sliced.code.replace(': mask', ": <mask>"))).trim());
            temp['prediction'] = ans;
            logger.debug(`prediction:${ans}`);
            if (ans == "output is empty") {
                logger.error("Generated type is empty, terminating program");
                process.exit(1);
            }
            try {
                varNode.setType(ans);
                await writeAst2File(sourceFile);
            }
            catch (e) {
                logger.error(`Failed to set type for variable: ${varNode.getName()}`);
                varNode.setType(type_text);
                await writeAst2File(sourceFile);
                continue;
            }
            if (toFixType.includes(ans)) {
                varNode.setType(type_text);
                res.push(temp);
                await writeAst2File(sourceFile);
                continue;
            }
            const compileSuccess = await performCompileCheck(projectPath);
            if (compileSuccess) {
                logger.info("Compilation check passed");
                temp['compile_status'] = 'success';
                const { completeness_status, unmatched_types_status } = await completeness_check(projectPath, ans, sourceFile, varNode);
                temp['unmatched_types_status'] = unmatched_types_status;
                if (completeness_status) {
                    logger.info("Completeness check passed");
                    temp['completeness_status'] = 'success';
                    try {
                        varNode.setType(ans);
                        await writeAst2File(sourceFile);
                        res.push(temp);
                        continue;
                    }
                    catch (e) {
                        logger.error(`Failed to set type for variable: ${varNode.getName()}`);
                        varNode.setType(type_text);
                        await writeAst2File(sourceFile);
                        continue;
                    }
                }
                else {
                    logger.info("Completeness check failed");
                    temp['completeness_status'] = 'failed';
                    varNode.setType(type_text);
                    await writeAst2File(sourceFile);
                    res.push(temp);
                    continue;
                }
            }
            else {
                logger.warning("Compilation check failed");
                temp['compile_status'] = 'failed';
                varNode.setType(type_text);
                await writeAst2File(sourceFile);
                res.push(temp);
                continue;
            }
        }
        catch (e) {
            logger.error(`${varNode.getName()} failed!`);
            const type_text = varNode.getTypeNode().getText();
            varNode.setType(type_text);
            await writeAst2File(sourceFile);
            continue;
        }
    }
    let functions = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
    let methods = sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration);
    let allF = [...functions, ...methods];
    logger.info(`Processing file: ${sourceFile.getFilePath()}, found ${allF.length} function declarations`);
    for (let fNode of allF) {
        try {
            let returnTypeNode = fNode.getReturnTypeNode();
            if (returnTypeNode && returnTypeNode.getText() == "any") {
                const temp: Record<string, any> = {};
                temp['name'] = fNode.getName();
                temp['file'] = sourceFile.getFilePath();
                const funcName = fNode.getName();
                logger.debug(`func:${funcName}`);
                const classDecl = returnTypeNode.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
                const className = classDecl?.getName() ?? 'global';
                logger.debug(`class:${className}`);
                temp['loc'] = `${funcName}@${className}`;
                temp['cat'] = 'ret';
                temp['prediction'] = '';
                temp['compile_status'] = 'failed';
                temp['completeness_status'] = 'failed';
                temp['unmatched_types_status'] = [];
                const type_text = returnTypeNode.getText();
                let codeSlicer = new TSlicer(sourceFile.getFilePath(), def_use_dir);
                let data: CodeData = { node: fNode, type: type_text, filePath: sourceFile.getFilePath(), dataType: DataType.Function };
                try {
                    fNode.setReturnType(mask);
                }
                catch (e) {
                    logger.error(`Failed to set return type for function: ${fNode.getName()}`);
                    fNode.setReturnType(type_text);
                    await writeAst2File(sourceFile);
                    continue;
                }
                let ans_sliced = codeSlicer.Slicing(data);
                let llmAgent = new LLMAgent();
                let ans = normalizePredictedType((await llmAgent.GenerationType(ans_sliced.code.replace(': mask', ": <mask>"))).trim());
                temp['prediction'] = ans;
                logger.debug(`prediction:${ans}`);
                if (ans == "output is empty") {
                    logger.error("Generated type is empty, terminating program");
                    process.exit(1);
                }
                try {
                    fNode.setReturnType(ans);
                    await writeAst2File(sourceFile);
                }
                catch (e) {
                    logger.error(`Failed to set return type for function: ${fNode.getName()}`);
                    fNode.setReturnType(type_text);
                    await writeAst2File(sourceFile);
                    continue;
                }
                if (toFixType.includes(ans)) {
                    fNode.setReturnType(type_text);
                    await writeAst2File(sourceFile);
                    res.push(temp);
                    continue;
                }
                const compileSuccess = await performCompileCheck(projectPath);
                if (compileSuccess) {
                    logger.info("Compilation check passed");
                    temp['compile_status'] = 'success';
                    const { completeness_status, unmatched_types_status } = await completeness_check(projectPath, ans, sourceFile, fNode);
                    temp['unmatched_types_status'] = unmatched_types_status;
                    if (completeness_status) {
                        logger.info("Completeness check passed");
                        temp['completeness_status'] = 'success';
                        try {
                            fNode.setReturnType(ans);
                            await writeAst2File(sourceFile);
                            res.push(temp);
                            continue;
                        }
                        catch (e) {
                            logger.error(`Failed to set type for variable: ${fNode.getName()}`);
                            fNode.setReturnType(type_text);
                            await writeAst2File(sourceFile);
                            continue;
                        }
                    }
                    else {
                        logger.info("Completeness check failed");
                        temp['completeness_status'] = 'failed';
                        fNode.setReturnType(type_text);
                        await writeAst2File(sourceFile);
                        res.push(temp);
                        continue;
                    }
                }
                else {
                    logger.warning("Compilation check failed");
                    temp['compile_status'] = 'failed';
                    fNode.setReturnType(type_text);
                    await writeAst2File(sourceFile);
                    res.push(temp);
                    continue;
                }
            }
        }
        catch (e) {
            logger.error(`${fNode.getName()} failed!`);
            const type_text = fNode.getReturnTypeNode().getText();
            fNode.setReturnType(type_text);
            await writeAst2File(sourceFile);
            continue;
        }
    }
    for (let fNode of allF) {
        try {
            let args = fNode.getParameters();
            logger.info(`Processing function: ${fNode.getName()}, found ${args.length} parameters`);
            for (const arg of args) {
                try {
                    let typeNode = arg.getTypeNode();
                    if (typeNode && typeNode.getText() == "any") {
                        const temp: Record<string, any> = {};
                        temp['name'] = arg.getName();
                        temp['file'] = sourceFile.getFilePath();
                        const funcName = fNode.getName();
                        logger.debug(`func:${funcName}`);
                        const classDecl = typeNode.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
                        const className = classDecl?.getName() ?? 'global';
                        logger.debug(`class:${className}`);
                        temp['loc'] = `${funcName}@${className}`;
                        temp['cat'] = 'arg';
                        temp['prediction'] = '';
                        temp['compile_status'] = 'failed';
                        temp['completeness_status'] = 'failed';
                        temp['unmatched_types_status'] = [];
                        let codeSlicer = new TSlicer(sourceFile.getFilePath(), def_use_dir);
                        const type_text = typeNode.getText();
                        let data: CodeData = { node: arg, type: type_text, filePath: sourceFile.getFilePath(), dataType: DataType.FunctionParam };
                        try {
                            data.node.setType(mask);
                        }
                        catch (e) {
                            logger.error(`Failed to set type for argument: ${arg.getName()}`);
                            data.node.setType(type_text);
                            await writeAst2File(sourceFile);
                            continue;
                        }
                        let ans_sliced = codeSlicer.Slicing(data);
                        let llmAgent = new LLMAgent();
                        let ans = normalizePredictedType((await llmAgent.GenerationType(ans_sliced.code.replace(': mask', ": <mask>"))).trim());
                        temp['prediction'] = ans;
                        logger.debug(`prediction:${ans}`);
                        if (ans == "output is empty") {
                            logger.error("Generated type is empty, terminating program");
                            process.exit(1);
                        }
                        try {
                            arg.setType(ans);
                            await writeAst2File(sourceFile);
                        }
                        catch (e) {
                            logger.error(`Failed to set type for argument: ${arg.getName()}`);
                            arg.setType(type_text);
                            await writeAst2File(sourceFile);
                            continue;
                        }
                        if (toFixType.includes(ans)) {
                            arg.setType(type_text);
                            await writeAst2File(sourceFile);
                            res.push(temp);
                            continue;
                        }
                        const compileSuccess = await performCompileCheck(projectPath);
                        if (compileSuccess) {
                            logger.info("Compilation check passed");
                            temp['compile_status'] = 'success';
                            const { completeness_status, unmatched_types_status } = await completeness_check(projectPath, ans, sourceFile, arg);
                            temp['unmatched_types_status'] = unmatched_types_status;
                            if (completeness_status) {
                                logger.info("Completeness check passed");
                                temp['completeness_status'] = 'success';
                                try {
                                    arg.setType(ans);
                                    await writeAst2File(sourceFile);
                                    res.push(temp);
                                    continue;
                                }
                                catch (e) {
                                    logger.error(`Failed to set type for variable: ${arg.getName()}`);
                                    arg.setType(type_text);
                                    await writeAst2File(sourceFile);
                                    continue;
                                }
                            }
                            else {
                                logger.info("Completeness check failed");
                                temp['completeness_status'] = 'failed';
                                arg.setType(type_text);
                                await writeAst2File(sourceFile);
                                res.push(temp);
                                continue;
                            }
                        }
                        else {
                            logger.warning("Compilation check failed");
                            temp['compile_status'] = 'failed';
                            arg.setType(type_text);
                            await writeAst2File(sourceFile);
                            res.push(temp);
                            continue;
                        }
                    }
                }
                catch (e) {
                    logger.error(`${arg.getName()} failed!`);
                    const type_text = arg.getTypeNode().getText();
                    arg.setType(type_text);
                    await writeAst2File(sourceFile);
                    continue;
                }
            }
        }
        catch (e) {
            logger.error(`${fNode.getName()} failed!`);
        }
    }
    return res;
}
async function def_use(projectRoot: string, output_dir: string) {
    const initDefUseCmd = `npx tsx ${join(curDir, "./index.ts")} -Init_Def_Use ${output_dir}`;
    logger.info(`Executing Init Def-Use: ${initDefUseCmd}`);
    try {
        const { stdout, stderr } = await execAsync(initDefUseCmd, {
            shell: '/bin/bash',
            env: { ...process.env, PATH: process.env.PATH }
        });
        if (stdout)
            logger.debug(stdout);
        if (stderr)
            logger.error(stderr);
    }
    catch (e: any) {
        logger.error(`Init Def-Use Failed: ${e.message}`);
        return false;
    }
    const defUseCmd = `npx tsx ${join(curDir, "./index.ts")} --Def_Use ${projectRoot} ${output_dir}`;
    logger.info(`Executing Def-Use: ${defUseCmd}`);
    try {
        const { stdout, stderr } = await execAsync(defUseCmd, {
            shell: '/bin/bash',
            env: { ...process.env, PATH: process.env.PATH }
        });
        if (stdout)
            logger.debug(stdout);
        if (stderr)
            logger.error(stderr);
    }
    catch (e: any) {
        logger.error(`Def-Use Failed: ${e.message}`);
        return false;
    }
    return true;
}
export async function GetProjectFileTypeHints(projectPath: string, outdir: string) {
    const { project } = initializeProjectWithConfig(projectPath);
    let allFiles: string[];
    allFiles = project.getSourceFiles().map(sf => sf.getFilePath());
    const def_use_dir = join(curDir, "./Def_Use/data");
    await def_use(projectPath, def_use_dir);
    logger.info(`Found ${allFiles.length} valid TypeScript files to be analyzed`);
    let fileCount = 0;
    const projectResults: Record<string, any>[] = [];
    await build_type_set(projectPath);
    logger.info(`${projectPath} build set of types complete`);
    for (const file of allFiles) {
        logger.info(`Processing file ${fileCount + 1}/${allFiles.length}: ${file}`);
        try {
            const sourceFile = project.getSourceFile(file);
            logger.debug(`Starting type annotation for file: ${file}`);
            const res = await getFileTypeData(sourceFile, projectPath, def_use_dir);
            if (Array.isArray(res)) {
                projectResults.push(...res);
            }
            logger.debug(`Type annotation completed for file: ${file}, items: ${Array.isArray(res) ? res.length : 0}`);
            await writeAst2File(sourceFile);
            logger.debug(`Successfully wrote modified content to file: ${file}`);
        }
        catch (error: any) {
            logger.error(`Error processing file ${file}: ${error.message}`);
        }
        fileCount++;
    }
    try {
        try {
            if (!fs.existsSync(outdir)) {
                fs.mkdirSync(outdir, { recursive: true });
            }
        }
        catch (mkErr: any) {
            logger.warning(`Failed to ensure output directory exists: ${mkErr.message}`);
        }
        const outdirParent = path.dirname(outdir);
        const outputdir = path.join(outdirParent, 'eval_resample_strategy');
        if (!fs.existsSync(outputdir)) {
            fs.mkdirSync(outputdir, { recursive: true });
        }
        const outputPath = path.join(outputdir, `${projectPath.split('/').pop()}_test_resample_strategy.json`);
        fs.writeFileSync(outputPath, JSON.stringify(projectResults, null, 2), 'utf-8');
        logger.info(`Saved project type hint results to ${outputPath} with ${projectResults.length} entries.`);
    }
    catch (e: any) {
        logger.warning(`Failed to save project type hint results: ${e.message}`);
    }
}
