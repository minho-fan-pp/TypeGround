import { projectDefined } from "../utils/typeDefined";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { Project, SyntaxKind, Node, ArrowFunction } from "ts-morph";
import { fixType } from "../utils/tool";
import { Logger, LogLevel } from "../utils/logMethods";
const logger = new Logger({
    level: LogLevel.DEBUG,
    format: "{time} [{level}] > {message}",
});
function writeSourceCodeToFile(filename: string, dataList: projectDefined[]): void {
    try {
        const dir = dirname(filename);
        mkdirSync(dir, { recursive: true });
        const isValidProjectDefined = (val: any): val is projectDefined => {
            return (val &&
                typeof val === "object" &&
                isNonEmptyString((val as any).name) &&
                isNonEmptyString((val as any).sourceCode) &&
                isNonEmptyString((val as any).filePath));
        };
        const cleanedNew = (Array.isArray(dataList) ? dataList : []).filter(isValidProjectDefined);
        const skippedNew = (Array.isArray(dataList) ? dataList.length : 0) - cleanedNew.length;
        if (skippedNew > 0) {
            logger.info(`message ${skippedNew} message,message ${filename}`);
        }
        let existing: projectDefined[] = [];
        if (existsSync(filename)) {
            try {
                const raw = readFileSync(filename, "utf8").trim();
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        const cleanedOld = (parsed as unknown[]) as projectDefined[];
                        const skippedOld = parsed.length - cleanedOld.length;
                        if (skippedOld > 0) {
                            logger.info(`message ${skippedOld} message: ${filename}`);
                        }
                        existing = cleanedOld;
                    }
                }
            }
            catch (e) {
                logger.info(`message,message: ${filename}`);
            }
        }
        const mergedMap = new Map<string, projectDefined>();
        for (const item of existing) {
            if (item &&
                typeof item === "object" &&
                isNonEmptyString((item as any).name) &&
                isNonEmptyString((item as any).filePath)) {
                const key = `${(item as any).name}|||${(item as any).filePath}`;
                mergedMap.set(key, item);
            }
        }
        for (const item of cleanedNew) {
            const key = `${(item as any).name}|||${(item as any).filePath}`;
            mergedMap.set(key, item);
        }
        const merged = Array.from(mergedMap.values());
        const jsonString = JSON.stringify(merged, null, 2) + "\n";
        writeFileSync(filename, jsonString, "utf8");
        logger.info(`Project definition data written to ${filename}`);
    }
    catch (error: any) {
        logger.error('errors:', error.message);
    }
}
function stripQuotes(str: string): string {
    if ((str.startsWith('"') && str.endsWith('"')) ||
        (str.startsWith("'") && str.endsWith("'"))) {
        return str.slice(1, -1);
    }
    return str;
}
function isNonEmptyString(val: unknown): val is string {
    return typeof val === "string" && val.trim().length > 0;
}
function dealwithFDefined(node: any, sourceFile: any, filePath: string, projectFunctions: projectDefined[]) {
    let name = node.getName();
    let tempNode = node;
    if (tempNode) {
        while (tempNode && tempNode.getKind() != SyntaxKind.ModuleDeclaration) {
            tempNode = tempNode.getParent();
        }
        if (tempNode && tempNode.getKind() === SyntaxKind.ModuleDeclaration) {
            name = stripQuotes(tempNode.getName()) + "." + name;
        }
    }
    if (!isNonEmptyString(name)) {
        return;
    }
    let params = node.getParameters().map((item: any) => {
        let pType = fixType(item.getType().getText(sourceFile));
        let pName = item.getName();
        return `${pName}:${pType}`;
    });
    let returnType = fixType(node.getReturnType().getText(sourceFile));
    let totalCode = "";
    totalCode = `${name}(${params.join(', ')}): ${returnType}`;
    if (returnType === "any" || returnType === "unknown") {
        totalCode = node.getText();
    }
    if (node.getKind() === SyntaxKind.FunctionDeclaration) {
        totalCode = "function " + totalCode;
    }
    else {
        while (node && node.getKind() != SyntaxKind.ClassDeclaration) {
            node = node.getParent();
        }
        if (node) {
            totalCode = node.getName() + "." + totalCode;
        }
    }
    let tempData: projectDefined = {
        name: name,
        sourceCode: totalCode,
        filePath: filePath
    };
    projectFunctions.push(tempData);
}
export function extractExportedArrows(filePath: string, projectFunctions: projectDefined[]) {
    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(filePath);
    sourceFile.getVariableStatements().forEach((varStmt) => {
        if (!varStmt.isExported())
            return;
        varStmt.getDeclarations().forEach((decl) => {
            const init = decl.getInitializer();
            if (!init || !Node.isArrowFunction(init))
                return;
            const arrow = init as ArrowFunction;
            const name = decl.getName();
            if (!isNonEmptyString(name))
                return;
            const sourceCode = arrow.getText();
            const returnType = arrow.getReturnTypeNode();
            if (arrow) {
                returnType
                    ? returnType.getText()
                    : arrow.getType().getCallSignatures()[0]?.getReturnType().getText();
            }
            let tempData: projectDefined = {
                name: name,
                sourceCode: name + " = " + sourceCode,
                filePath: filePath
            };
            projectFunctions.push(tempData);
        });
    });
}
function ParseEachFile(filePath: string, projectFunctions: projectDefined[]) {
    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(filePath);
    let functionDefineds = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
    let methods = sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration);
    extractExportedArrows(filePath, projectFunctions);
    functionDefineds.forEach(item => dealwithFDefined(item, sourceFile, filePath, projectFunctions));
    methods.forEach(item => dealwithFDefined(item, sourceFile, filePath, projectFunctions));
}
export function DealProjectDefined(allFiles: string[], projectFunctionDefineds: string) {
    var projectFunctions: projectDefined[] = [];
    for (const file of allFiles) {
        ParseEachFile(file, projectFunctions);
    }
    projectFunctions = projectFunctions.filter(item => isNonEmptyString(item.name));
    writeSourceCodeToFile(projectFunctionDefineds, projectFunctions);
}
