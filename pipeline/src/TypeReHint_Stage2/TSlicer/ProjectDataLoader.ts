import { SDKClasses, SDKFunctions, projectDefined, ImportInfo, useDefined } from "../utils/typeDefined";
import fs from 'fs';
import { areFilePathsEqual, getAfterFirstEqual } from "../utils/tool";
import path from 'path';
import { join } from "path";
import { TSlicer } from "./SlicingClass";
import { Project, SyntaxKind } from "ts-morph";
var ignoreFunction: string[] = [];
export class ProjectDataLoader {
    private projectFunctionDefineds;
    private projectFunctionUse;
    private projectClassDefineds;
    private baseProjectDataPath;
    private maxUseFind = 4;
    functions: SDKFunctions[] = [];
    classes: SDKClasses[] = [];
    projectFunctions: projectDefined[] = [];
    projectClasses: projectDefined[] = [];
    constructor(projectDateDef: string) {
        this.projectFunctionDefineds = join(projectDateDef, 'ProjectFunctions.json');
        this.projectClassDefineds = join(projectDateDef, 'ProjectClasses.json');
        this.projectFunctionUse = join(projectDateDef, 'useFunction.json');
        this.projectFunctions = this.parseProjectDefined(this.projectFunctionDefineds);
        this.projectClasses = this.parseProjectDefined(this.projectClassDefineds);
        this.baseProjectDataPath = projectDateDef;
        ignoreFunction.forEach(item => { this.delFunction(item); });
    }
    public reLoadProjectData() {
        this.projectFunctions = this.parseProjectDefined(this.projectFunctionDefineds);
        this.projectClasses = this.parseProjectDefined(this.projectClassDefineds);
    }
    parseSDKFunction(): SDKFunctions[] {
        let filePath = "./data/sdkFunctions_new.json";
        const absolutePath = path.resolve(__dirname, filePath);
        try {
            const rawData = fs.readFileSync(absolutePath, 'utf-8');
            const parsedData: SDKFunctions[] = JSON.parse(rawData);
            if (!Array.isArray(parsedData)) {
                throw new Error("Invalid JSON format: expected array");
            }
            parsedData.forEach(item => {
                if (!('name' in item) || typeof item.name !== 'string') {
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
    parseSDKClass(): SDKClasses[] {
        let filePath = "./data/sdkClasses_new.json";
        const absolutePath = path.resolve(__dirname, filePath);
        try {
            const rawData = fs.readFileSync(absolutePath, 'utf-8');
            const parsedData: SDKClasses[] = JSON.parse(rawData);
            if (!Array.isArray(parsedData)) {
                throw new Error("Invalid JSON format: expected array");
            }
            parsedData.forEach(item => {
                if (!('name' in item) || typeof item.name !== 'string') {
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
    parseProjectDefined(filePath: string): projectDefined[] {
        const absolutePath = path.resolve(__dirname, filePath);
        try {
            const rawData = fs.readFileSync(absolutePath, 'utf-8');
            const parsedData: projectDefined[] = JSON.parse(rawData);
            if (!Array.isArray(parsedData)) {
                throw new Error("Invalid JSON format: expected array");
            }
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
    public findFunction(funNode: any) {
        var res = new Set();
        let expression = funNode.getExpression();
        let funcName = expression.getText();
        if (funcName.includes(".")) {
            let tempData = funcName.split(".");
            let name1 = tempData[1];
            let name2 = tempData[0];
            let res1 = this.functions.find(n => n.namespace == name2 && n.name == name1);
            if (res1) {
                res.add(res1.srcCode);
            }
            let res2 = this.functions.find(n => n.name === name1 && n.class === name2);
            if (res2) {
                res.add(res2.srcCode);
            }
        }
        else {
        }
        return res;
    }
    analysizerImportInfo(importInfos: any[]) {
        const imports: ImportInfo[] = [];
        importInfos.forEach((decl: any) => {
            const moduleSpecifier = decl.getModuleSpecifierValue();
            const namedImports = decl.getNamedImports();
            const defaultImport = decl.getDefaultImport();
            const namespaceImport = decl.getNamespaceImport();
            const startLine = decl.getStartLineNumber();
            if (namedImports.length > 0) {
                const names = namedImports.map((i: any) => i.getName());
                const aliases = namedImports.map((i: any) => i.getAliasNode()?.getText() ?? null);
                imports.push({
                    type: "import",
                    module: moduleSpecifier,
                    names,
                    aliases,
                    startLine,
                });
            }
            if (defaultImport) {
                imports.push({
                    type: "import",
                    module: moduleSpecifier,
                    names: ["default"],
                    aliases: [defaultImport.getText()],
                    isDefault: true,
                    startLine,
                });
            }
            if (namespaceImport) {
                imports.push({
                    type: "import",
                    module: moduleSpecifier,
                    names: ["*"],
                    aliases: [namespaceImport.getText()],
                    isNamespace: true,
                    startLine,
                });
            }
        });
        return imports;
    }
    public findProjectDefined(funcNode: any) {
        var res = new Set();
        let expression = funcNode.getExpression();
        let funcName = expression.getText();
        let isGetFuncdefined = false;
        for (const f of this.projectFunctions) {
            if (f.name == funcName) {
                res.add(f.sourceCode);
                isGetFuncdefined = true;
            }
        }
        if (!isGetFuncdefined && funcName.includes(".")) {
            let sFuncname = funcName.split(".");
            for (const f of this.projectFunctions) {
                if (f.name.includes(".")) {
                    let temp = f.name.split(".")[1];
                    if (temp == sFuncname[sFuncname.length - 1]) {
                        res.add(f.sourceCode);
                    }
                }
                else if (sFuncname[sFuncname.length - 1] == f.name) {
                    res.add(f.sourceCode);
                }
            }
        }
        return res;
    }
    public delFunction(functionName: string) {
        this.projectFunctions = this.projectFunctions.filter(item => item.name != functionName);
    }
    public GetClassByName(name: string) {
        let ans = new Set();
        for (const c of this.projectClasses) {
            if (c.name == name) {
                ans.add(c.sourceCode);
            }
        }
        return ans;
    }
    public GetClassByType(name: string) {
        let ans = new Set();
        for (const c of this.projectClasses) {
            if (c.name == name || name.startsWith(c.name)) {
                ans.add(c.sourceCode);
            }
        }
        return ans;
    }
    public GetFunctionsByName(name: string) {
        if (this.projectFunctions.length == 0) {
            this.projectFunctions = this.parseProjectDefined(this.projectFunctionDefineds);
        }
        let allFunctions: string[] = [];
        for (const f of this.projectFunctions) {
            if (f.name == name) {
                allFunctions.push(f.sourceCode);
            }
        }
        return allFunctions;
    }
    private parseFunctionData(filePath: string): useDefined[] {
        const absolutePath = path.resolve(__dirname, filePath);
        try {
            const rawData = fs.readFileSync(absolutePath, 'utf-8');
            const parsedData: useDefined[] = JSON.parse(rawData);
            if (!Array.isArray(parsedData)) {
                throw new Error("Invalid JSON format: expected array");
            }
            parsedData.forEach(item => {
                if (!('name' in item) || typeof item.name !== 'string') {
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
    private dealWithFCall(data: useDefined) {
        const project = new Project();
        const sourceFile = project.addSourceFileAtPath(data.file);
        let callExpressiones = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
        for (const c of callExpressiones) {
            if (c.getText() == data.useCode) {
                let slicer = new TSlicer(data.file, this.baseProjectDataPath);
                let ans = slicer.SlicingParams(c, data.file);
                return ans;
            }
        }
        return undefined;
    }
    public fileCallExpression(funcName: string, sourcePath: string, callExpressionPath?: string) {
        let ans = new Set();
        if (!callExpressionPath) {
            callExpressionPath = this.projectFunctionUse;
        }
        let callData = this.parseFunctionData(callExpressionPath);
        let readFiles: string[] = [];
        readFiles.push(sourcePath);
        let count = 0;
        callData.forEach(item => {
            if (item.name == funcName && count < this.maxUseFind) {
                count += 1;
                ans.add(this.dealWithFCall(item));
            }
            else if (item.name.includes(".")) {
                let tempName = item.name.split(".");
                if (tempName[tempName.length - 1] == funcName && count < this.maxUseFind) {
                    count += 1;
                    ans.add(this.dealWithFCall(item));
                }
            }
        });
        return ans;
    }
}
