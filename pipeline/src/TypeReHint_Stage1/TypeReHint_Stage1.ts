import { SyntaxKind } from "ts-morph";
import { Logger, LogLevel } from "./logMethods";
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { initializeProjectWithConfig } from "./ProjectReader";
import { join } from "path";
const execAsync = promisify(exec);
const toFixType = ["any", "unknown"];
const logger = new Logger({
    level: LogLevel.DEBUG,
    format: "{time} [{level}] > {message}",
});
function backupFile(filePath: string): string {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const backupPath = filePath + '.backup';
        fs.writeFileSync(backupPath, content, 'utf-8');
        logger.info(`Backed up file: ${filePath} -> ${backupPath}`);
        return backupPath;
    }
    catch (error) {
        logger.error(`Failed to backup file ${filePath}: ${error}`);
        throw error;
    }
}
function restoreFile(filePath: string, backupPath: string): void {
    try {
        const content = fs.readFileSync(backupPath, 'utf-8');
        fs.writeFileSync(filePath, content, 'utf-8');
        logger.info(`Restored file: ${filePath} from ${backupPath}`);
        fs.unlinkSync(backupPath);
    }
    catch (error) {
        logger.error(`Failed to restore file ${filePath} from ${backupPath}: ${error}`);
        throw error;
    }
}
async function performCompileCheck(projectPath: string): Promise<boolean> {
    try {
        logger.info(`Performing compile check for project: ${projectPath}`);
        const originalCwd = process.cwd();
        const targetDir = join(path.dirname(__filename), "../compile_check");
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
            if (checkResultsMatch) {
                const resultsSection = checkResultsMatch[1] || '';
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
function isLoopVariable(varNode: any): boolean {
    try {
        let parent = varNode.getParent();
        let depth = 0;
        while (parent && depth < 10) {
            depth++;
            if (parent.getKind() === SyntaxKind.ForInStatement) {
                const forInStmt = parent;
                const leftSide = forInStmt.getInitializer();
                if (leftSide) {
                    if (leftSide.getKind() === SyntaxKind.VariableDeclarationList) {
                        const declarations = leftSide.getDeclarations();
                        for (const decl of declarations) {
                            if (decl.getNameNode().getText() === varNode.getNameNode().getText()) {
                                return true;
                            }
                        }
                    }
                    else if (leftSide.getText() === varNode.getText()) {
                        return true;
                    }
                }
            }
            if (parent.getKind() === SyntaxKind.ForOfStatement) {
                const forOfStmt = parent;
                const leftSide = forOfStmt.getInitializer();
                if (leftSide) {
                    if (leftSide.getKind() === SyntaxKind.VariableDeclarationList) {
                        const declarations = leftSide.getDeclarations();
                        for (const decl of declarations) {
                            if (decl.getNameNode().getText() === varNode.getNameNode().getText()) {
                                return true;
                            }
                        }
                    }
                    else if (leftSide.getText() === varNode.getText()) {
                        return true;
                    }
                }
            }
            if (parent.getKind() === SyntaxKind.ForStatement) {
                const forStmt = parent;
                const initializer = forStmt.getInitializer();
                if (initializer) {
                    if (initializer.getKind() === SyntaxKind.VariableDeclarationList) {
                        const declarations = initializer.getDeclarations();
                        for (const decl of declarations) {
                            if (decl.getNameNode().getText() === varNode.getNameNode().getText()) {
                                return true;
                            }
                        }
                    }
                    else if (initializer.getText().includes(varNode.getText())) {
                        return true;
                    }
                }
            }
            parent = parent.getParent();
        }
        return false;
    }
    catch (e) {
        return false;
    }
}
function hasCircularTypeReference(varNode: any): boolean {
    try {
        if (!varNode || typeof varNode.getTypeNode !== 'function') {
            return false;
        }
        const typeNode = varNode.getTypeNode();
        if (!typeNode)
            return false;
        const typeText = typeNode.getText();
        if (typeof varNode.getNameNode !== 'function') {
            return false;
        }
        const varName = varNode.getNameNode().getText();
        if (typeText.includes(varName)) {
            return true;
        }
        return false;
    }
    catch (e) {
        return false;
    }
}
function hasCircularTypeReferenceInFunction(functionNode: any, typeNode: any): boolean {
    try {
        if (!typeNode)
            return false;
        const typeText = typeNode.getText();
        if (!functionNode || typeof functionNode.getNameNode !== 'function') {
            return false;
        }
        const functionName = functionNode.getNameNode()?.getText() || "anonymous";
        if (typeText.includes(functionName)) {
            return true;
        }
        return false;
    }
    catch (e) {
        return false;
    }
}
function resolveIdentifierTypeText(identifier: string, contextNode: any): string | null {
    try {
        if (identifier.includes('.'))
            return null;
        const sourceFile = contextNode.getSourceFile?.();
        if (!sourceFile)
            return null;
        const varDecl = sourceFile.getVariableDeclaration?.(identifier);
        if (varDecl) {
            return varDecl.getType().getBaseTypeOfLiteralType().getText();
        }
        const funcDecl = sourceFile.getFunction?.(identifier);
        if (funcDecl) {
            return funcDecl.getType().getText();
        }
        const classDecl = sourceFile.getClass?.(identifier);
        if (classDecl) {
            return classDecl.getType().getText();
        }
        const enumDecl = sourceFile.getEnum?.(identifier);
        if (enumDecl) {
            return enumDecl.getType().getText();
        }
        const typeAlias = sourceFile.getTypeAlias?.(identifier);
        if (typeAlias) {
            return typeAlias.getType().getText();
        }
        const interfaceDecl = sourceFile.getInterface?.(identifier);
        if (interfaceDecl) {
            return interfaceDecl.getType().getText();
        }
        return null;
    }
    catch {
        return null;
    }
}
function expandTypeofInTypeText(typeText: string, contextNode: any): string {
    if (!typeText || !typeText.includes('typeof'))
        return typeText;
    return typeText.replace(/typeof\s+([A-Za-z0-9_$.]+)/g, (_match: string, ident: string) => {
        const resolved = resolveIdentifierTypeText(ident, contextNode);
        return resolved ?? `typeof ${ident}`;
    });
}
async function writeAst2File(sourceFile: any) {
    await sourceFile.formatText();
    await sourceFile.save();
}
export async function getFileTypeData(sourceFile: any, writeToFile: boolean = true) {
    let allVars = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
    let countAny = 0;
    logger.info(`Processing file: ${sourceFile.getFilePath()}, found ${allVars.length} variable declarations`);
    for (let varNode of allVars) {
        if (isLoopVariable(varNode)) {
            continue;
        }
        try {
            let mType = varNode.getType().getBaseTypeOfLiteralType().getText();
            if (mType.includes('typeof')) {
                const expanded = expandTypeofInTypeText(mType, varNode);
                if (expanded && expanded !== mType) {
                    try {
                        varNode.setType(expanded);
                    }
                    catch { }
                    mType = expanded;
                }
            }
            if (toFixType.includes(mType)) {
                countAny += 1;
                try {
                    varNode.setType("any");
                }
                catch (manipulationError) {
                }
            }
            else {
                try {
                    varNode.setType(mType);
                    if (hasCircularTypeReference(varNode)) {
                        varNode.setType("any");
                    }
                }
                catch (manipulationError) {
                    varNode.setType("any");
                }
            }
        }
        catch (e) {
        }
    }
    let functions = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
    let methods = sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration);
    let allF = [...functions, ...methods];
    for (let fNode of allF) {
        try {
            let mType = fNode.getReturnType().getBaseTypeOfLiteralType().getText();
            if (mType.includes('typeof')) {
                const expanded = expandTypeofInTypeText(mType, fNode);
                if (expanded && expanded !== mType) {
                    try {
                        fNode.setReturnType(expanded);
                    }
                    catch { }
                    mType = expanded;
                }
            }
            if (toFixType.includes(mType)) {
                try {
                    fNode.setReturnType("any");
                }
                catch (manipulationError) {
                }
                countAny += 1;
            }
            else {
                try {
                    fNode.setReturnType(mType);
                    if (hasCircularTypeReferenceInFunction(fNode, fNode.getReturnTypeNode())) {
                        fNode.setReturnType("any");
                    }
                }
                catch (manipulationError) {
                    fNode.setReturnType("any");
                }
            }
        }
        catch (e) {
        }
    }
    for (let fNode of allF) {
        let args = fNode.getParameters();
        for (const arg of args) {
            let mType = arg.getType().getBaseTypeOfLiteralType().getText();
            if (mType.includes('typeof')) {
                const expanded = expandTypeofInTypeText(mType, arg);
                if (expanded && expanded !== mType) {
                    try {
                        arg.setType(expanded);
                    }
                    catch { }
                    mType = expanded;
                }
            }
            if (toFixType.includes(mType)) {
                countAny += 1;
            }
            try {
                arg.setType(mType);
                if (hasCircularTypeReferenceInFunction(fNode, arg.getTypeNode())) {
                    arg.setType("any");
                }
            }
            catch (manipulationError) {
                arg.setType("any");
            }
        }
    }
    if (writeToFile) {
        try {
            await writeAst2File(sourceFile);
        }
        catch (error: any) {
        }
    }
    return countAny;
}
export async function GetProjectFileTypeHints(projectPath: string, enableCompileCheck: boolean = true) {
    const { project } = initializeProjectWithConfig(projectPath);
    logger.info(`Compile check: ${enableCompileCheck ? 'ENABLED' : 'DISABLED'}`);
    if (!enableCompileCheck) {
        logger.info(`File backup disabled due to --no-compile-check flag`);
    }
    const sourceFiles = project.getSourceFiles();
    logger.info(`Found ${sourceFiles.length} source files in project`);
    const allFiles = sourceFiles
        .map((item: any) => item.getFilePath() as string)
        .filter((filePath: string) => {
        return !filePath.endsWith('.d.ts') &&
            !filePath.endsWith('.js') &&
            !filePath.endsWith('.jsx') &&
            !filePath.includes('node_modules');
    });
    logger.info(`Found ${allFiles.length} valid TypeScript files to be analyzed`);
    let fileCount = 0;
    let countAny = 0;
    let successCount = 0;
    let failedCount = 0;
    let failedFiles: string[] = [];
    for (const file of allFiles) {
        logger.info(`Processing file ${fileCount + 1}/${allFiles.length}: ${file}`);
        let backupPath: string | null = null;
        try {
            if (enableCompileCheck) {
                backupPath = backupFile(file);
            }
            const sourceFile = project.getSourceFile(file);
            logger.info(`Starting type annotation for file: ${file}`);
            const currentCountAny = await getFileTypeData(sourceFile);
            logger.info(`Type annotation completed for file: ${file}, found ${currentCountAny} any types`);
            if (sourceFile) {
                logger.info(`Writing modified content to file: ${file}`);
                await writeAst2File(sourceFile);
                logger.info(`Successfully wrote modified content to file: ${file}`);
            }
            else {
                logger.warning(`Could not find source file in project for: ${file}`);
            }
            if (enableCompileCheck) {
                const compileSuccess = await performCompileCheck(projectPath);
                if (compileSuccess) {
                    logger.info(`File ${file} compile check successfully`);
                    if (backupPath) {
                        try {
                            fs.unlinkSync(backupPath);
                            logger.info(`Deleted backup file: ${backupPath}`);
                        }
                        catch (deleteError) {
                            logger.error(`Failed to delete backup file ${backupPath}: ${deleteError}`);
                        }
                    }
                    countAny += currentCountAny;
                    successCount++;
                }
                else {
                    logger.warning(`File ${file} failed compile check, reverting changes`);
                    if (backupPath) {
                        restoreFile(file, backupPath);
                        try {
                            fs.unlinkSync(backupPath);
                            logger.info(`Deleted backup file after restore: ${backupPath}`);
                        }
                        catch (deleteError) {
                            logger.info(`Failed to delete backup file ${backupPath}: ${deleteError}`);
                        }
                    }
                    failedCount++;
                    const relativePath = path.relative(projectPath, file);
                    failedFiles.push(relativePath);
                }
            }
            else {
                logger.info(`File ${file} processed without compile check`);
                if (backupPath) {
                    try {
                        fs.unlinkSync(backupPath);
                        logger.info(`Deleted backup file: ${backupPath}`);
                    }
                    catch (deleteError) {
                        logger.error(`Failed to delete backup file ${backupPath}: ${deleteError}`);
                    }
                }
                countAny += currentCountAny;
                successCount++;
            }
        }
        catch (error: any) {
            logger.error(`Error processing file ${file}: ${error.message}`);
            failedCount++;
            if (enableCompileCheck && backupPath) {
                try {
                    restoreFile(file, backupPath);
                    try {
                        fs.unlinkSync(backupPath);
                        logger.info(`Deleted backup file after error recovery: ${backupPath}`);
                    }
                    catch (deleteError) {
                        logger.error(`Failed to delete backup file ${backupPath}: ${deleteError}`);
                    }
                }
                catch (restoreError) {
                    logger.error(`Failed to restore file ${file}: ${restoreError}`);
                    if (backupPath) {
                        try {
                            fs.unlinkSync(backupPath);
                            logger.info(`Deleted backup file after failed recovery: ${backupPath}`);
                        }
                        catch (deleteError) {
                            logger.error(`Failed to delete backup file ${backupPath}: ${deleteError}`);
                        }
                    }
                }
            }
        }
        fileCount++;
    }
    logger.info(`Total files processed: ${fileCount}`);
    logger.info(`Successfully processed: ${successCount}`);
    logger.info(`Failed/reverted: ${failedCount}`);
    logger.info(`Total any types found: ${countAny}`);
    if (failedFiles.length > 0) {
        logger.info(`Files that failed compile check:`);
        failedFiles.forEach((file, index) => {
            logger.info(`  ${index + 1}. ${file}`);
        });
    }
    else {
        logger.info(`All files passed compile check successfully.`);
    }
}
