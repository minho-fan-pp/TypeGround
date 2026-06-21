import { projectDefined, useDefined } from "../utils/typeDefined";
import path, { dirname } from 'path';
import fs, { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { Project, SyntaxKind } from "ts-morph";
import { Logger, LogLevel } from "../utils/logMethods";
const logger = new Logger({
    level: LogLevel.DEBUG,
    format: "{time} [{level}] > {message}",
});
function isNonEmptyString(val: unknown): val is string {
    return typeof val === "string" && val.trim().length > 0;
}
function writeSourceCodeToFile(filename: string, dataList: useDefined[]): void {
    try {
        const dir = dirname(filename);
        mkdirSync(dir, { recursive: true });
        const isValidProjectDefined = (val: any): val is projectDefined => {
            return (val &&
                typeof val === "object" &&
                isNonEmptyString((val as any).name) &&
                isNonEmptyString((val as any).useCode) &&
                isNonEmptyString((val as any).file));
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
        const merged = [...existing, ...cleanedNew];
        const jsonString = JSON.stringify(merged, null, 2) + "\n";
        writeFileSync(filename, jsonString, "utf8");
        logger.info(`Project definition data written to ${filename}`);
    }
    catch (error: any) {
        logger.error('errors:', error.message);
    }
}
function parseProjectDefined(filePath: string): projectDefined[] {
    const absolutePath = path.resolve(__dirname, filePath);
    try {
        const rawData = fs.readFileSync(absolutePath, 'utf-8');
        const parsedData: projectDefined[] = JSON.parse(rawData);
        if (!Array.isArray(parsedData)) {
            throw new Error("Invalid JSON format: expected array");
        }
        parsedData.forEach(item => {
            if (!("name" in item) || typeof item.name !== 'string') {
                throw new Error("Missing required field: name");
            }
        });
        return parsedData;
    }
    catch (error) {
        console.error(`Error parsing JSON at ${absolutePath}:`);
        if (error instanceof SyntaxError) {
            throw new Error("Invalid JSON syntax");
        }
        throw error;
    }
}
function isProjectFunction(funcName: string, projectFunctions: projectDefined[]) {
    for (const func of projectFunctions) {
        if (func.name === funcName) {
            return true;
        }
        if (funcName.includes(".") && func.name.includes(".")) {
            if (funcName.split(".").slice(-1)[0] == func.name.split(".").slice(-1)[0]) {
                return true;
            }
        }
        else if (func.name.includes(".")) {
            if (funcName == func.name.split(".").slice(-1)[0]) {
                return true;
            }
        }
    }
    return false;
}
function ParseEachFile(filePath: string, projectFunctions: projectDefined[], totalCallData: useDefined[]) {
    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(filePath);
    let CallExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of CallExpressions) {
        let callName = call.getExpression().getText();
        if (isProjectFunction(callName, projectFunctions)) {
            let slicedCode = call.getText();
            let tempCallData: useDefined = {
                name: callName,
                useCode: slicedCode,
                file: filePath
            };
            totalCallData.push(tempCallData);
        }
    }
}
export function DealProjectUsed(allFiles: string[], projectFunctionDefineds: string, useFunctionPath: string) {
    var projectFunctions: projectDefined[] = [];
    var totalCallData: useDefined[] = [];
    projectFunctions = parseProjectDefined(projectFunctionDefineds);
    for (const file of allFiles) {
        ParseEachFile(file, projectFunctions, totalCallData);
    }
    writeSourceCodeToFile(useFunctionPath, totalCallData);
}
