import { Project, SyntaxKind } from "ts-morph";
import * as path from 'path';
import * as fs from 'fs';
import { Logger, LogLevel } from "./logMethods";
const logger = new Logger({
    level: LogLevel.DEBUG,
    format: "{time} [{level}] > {message}",
});
function findTypeScriptFiles(dirPath: string): string[] {
    const files: string[] = [];
    try {
        const items = fs.readdirSync(dirPath);
        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                if (!['node_modules', 'dist', 'build', '.git'].includes(item)) {
                    files.push(...findTypeScriptFiles(fullPath));
                }
            }
            else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
                if (!item.endsWith('.d.ts')) {
                    files.push(fullPath);
                }
            }
        }
    }
    catch (error) {
    }
    return files;
}
function findTsConfig(projectPath: string): string | null {
    let currentDir = projectPath;
    while (currentDir !== path.dirname(currentDir)) {
        const tsConfigPath = path.join(currentDir, 'tsconfig.json');
        if (fs.existsSync(tsConfigPath)) {
            return tsConfigPath;
        }
        currentDir = path.dirname(currentDir);
    }
    return null;
}
export function initializeProjectWithConfig(projectPath: string): {
    project: Project;
    tsConfigPath: string | null;
} {
    const tsConfigPath = findTsConfig(projectPath);
    const projectOptions: any = {
        projectRoot: projectPath,
        ...(tsConfigPath && { tsConfigFilePath: tsConfigPath }),
        skipAddingFilesFromTsConfig: false,
        excludeFiles: ["**/*.d.ts", "**/*.js", "**/*.jsx", "**/*.json"]
    };
    if (!tsConfigPath) {
        projectOptions.addSourceFilesAtPaths = [
            path.join(projectPath, "**/*.ts"),
            path.join(projectPath, "**/*.tsx")
        ];
        projectOptions.excludeDirectories = ["node_modules", "dist", "build", ".git"];
        projectOptions.excludeFiles = ["**/*.d.ts", "**/*.js", "**/*.jsx", "**/*.json"];
    }
    const project = new Project(projectOptions);
    if (tsConfigPath) {
        logger.info(`Using tsconfig.json: ${tsConfigPath}`);
        try {
            const tsConfigContent = fs.readFileSync(tsConfigPath, 'utf-8');
            const cleanContent = tsConfigContent.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
            const tsConfig = JSON.parse(cleanContent);
            if (tsConfig.extends) {
                logger.info(`tsconfig.json extends: ${tsConfig.extends}`);
            }
            if (tsConfig.references && tsConfig.references.length > 0) {
                logger.info(`tsconfig.json references: ${tsConfig.references.length} project references found`);
                tsConfig.references.forEach((ref: any, index: number) => {
                    logger.debug(`  Reference ${index + 1}: ${ref.path}`);
                });
                logger.info(`Adding files from referenced projects...`);
                for (const ref of tsConfig.references) {
                    const refPath = path.join(projectPath, ref.path);
                    const refTsConfigPath = path.join(refPath, 'tsconfig.json');
                    if (fs.existsSync(refTsConfigPath)) {
                        try {
                            const refTsConfigContent = fs.readFileSync(refTsConfigPath, 'utf-8');
                            const refTsConfig = JSON.parse(refTsConfigContent.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''));
                            if (refTsConfig.include && Array.isArray(refTsConfig.include)) {
                                refTsConfig.include.forEach((includePath: string) => {
                                    const fullPath = path.join(refPath, includePath);
                                    if (fs.existsSync(fullPath)) {
                                        if (fs.statSync(fullPath).isDirectory()) {
                                            const tsFiles = findTypeScriptFiles(fullPath);
                                            logger.debug(`Found ${tsFiles.length} TypeScript files in ${includePath}`);
                                            tsFiles.forEach((file: string) => project.addSourceFileAtPath(file));
                                        }
                                        else if ((fullPath.endsWith('.ts') && !fullPath.endsWith('.d.ts')) || fullPath.endsWith('.tsx')) {
                                            project.addSourceFileAtPath(fullPath);
                                            logger.debug(`Added source file: ${fullPath}`);
                                        }
                                    }
                                });
                            }
                            else {
                                logger.debug(`No include config found for ${ref.path}, scanning entire package directory`);
                                const tsFiles = findTypeScriptFiles(refPath);
                                logger.debug(`Found ${tsFiles.length} TypeScript files in ${ref.path}`);
                                tsFiles.forEach((file: string) => project.addSourceFileAtPath(file));
                            }
                            if (refTsConfig.references && refTsConfig.references.length > 0) {
                                logger.debug(`Processing nested references in ${ref.path}`);
                                for (const nestedRef of refTsConfig.references) {
                                    const nestedRefPath = path.join(refPath, nestedRef.path);
                                    const nestedTsFiles = findTypeScriptFiles(nestedRefPath);
                                    logger.debug(`Found ${nestedTsFiles.length} TypeScript files in nested reference ${nestedRef.path}`);
                                    nestedTsFiles.forEach((file: string) => project.addSourceFileAtPath(file));
                                }
                            }
                        }
                        catch (error) {
                            logger.warning(`Failed to process reference ${ref.path}: ${error}`);
                        }
                    }
                    else {
                        logger.debug(`No tsconfig.json found for ${ref.path}, scanning package directory directly`);
                        const tsFiles = findTypeScriptFiles(refPath);
                        logger.debug(`Found ${tsFiles.length} TypeScript files in ${ref.path}`);
                        tsFiles.forEach((file: string) => project.addSourceFileAtPath(file));
                    }
                }
            }
        }
        catch (error) {
            logger.warning(`Failed to parse tsconfig.json for logging: ${error}`);
        }
    }
    else {
        logger.info(`No tsconfig.json found, using manual file discovery`);
    }
    const filesToRemove: string[] = [];
    project.getSourceFiles().forEach(sourceFile => {
        const filePath = sourceFile.getFilePath();
        const isTs = filePath.endsWith('.ts') && !filePath.endsWith('.d.ts');
        const isTsx = filePath.endsWith('.tsx');
        const isBizTsLike = isTs || isTsx;
        if (!isBizTsLike) {
            filesToRemove.push(filePath);
            return;
        }
        const allVars = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
        const functions = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
        const methods = sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration);
        const allF = [...functions, ...methods];
        const hasTypeAnnotations = allVars.some(varNode => varNode.getTypeNode() !== undefined) ||
            allF.some(fNode => fNode.getReturnTypeNode() !== undefined ||
                fNode.getParameters().some(param => param.getTypeNode() !== undefined));
        if (!hasTypeAnnotations) {
            logger.info(`Removing file without any type annotation: ${filePath}`);
            filesToRemove.push(filePath);
        }
    });
    for (const filePath of filesToRemove) {
        const sf = project.getSourceFile(filePath);
        if (sf) {
            project.removeSourceFile(sf);
        }
    }
    return { project, tsConfigPath };
}
