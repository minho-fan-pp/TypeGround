import { join, dirname } from "path";
import { ThirdPackageInfo } from "../utils/typeDefined";
import * as fs from 'fs-extra';
export interface APIFunction {
    name: string;
    signature: string;
    docs?: string;
}
export interface APIType {
    name: string;
    kind: 'class' | 'interface' | 'type';
    fields?: any[];
    docs?: string;
}
export interface PackageAPI {
    package: string;
    version: string;
    api: Array<APIFunction | APIType>;
}
export class ThirdPackageLoader {
    private packageDataList: ThirdPackageInfo[] = [];
    private importInfos: any = [];
    private dataPath = join(dirname(__filename), "../Package_Maker/output/npm_api_summary.json");
    constructor(importInfo: any) {
        this.importInfos = importInfo;
        this.loadPackageList();
    }
    public parseSummary(packageList: string[]): ThirdPackageInfo[] {
        let jsonPath = this.dataPath;
        if (!fs.pathExistsSync(jsonPath)) {
            throw new Error(`JSON file not found: ${jsonPath}`);
        }
        const data = fs.readJsonSync(jsonPath) as ThirdPackageInfo[];
        let fixData: ThirdPackageInfo[] = [];
        for (const i of data) {
            if (packageList.includes(i.packageName)) {
                fixData.push(i);
            }
        }
        return fixData;
    }
    private loadPackageList() {
        var importInfos = this.importInfos;
        const imports = importInfos.map((importDecl: any) => ({
            modulePath: importDecl.getModuleSpecifier().getLiteralValue(),
            defaultImport: importDecl.getDefaultImport()?.getText(),
            namedImports: importDecl.getNamedImports().map((spec: any) => ({
                name: spec.getName(),
                alias: spec.getAliasNode()?.getText()
            })),
            namespaceImport: importDecl.getNamespaceImport()?.getText(),
            isTypeOnly: importDecl.isTypeOnly(),
            rawText: importDecl.getText()
        }));
        let packageList: string[] = [];
        packageList.push("typescript-stdlib");
        imports.forEach((item: any) => {
            packageList.push(item.modulePath);
        });
        let temp = this.parseSummary(packageList);
        this.packageDataList = temp;
    }
    public getFunctionByName(functionName: string): string[] {
        let ans: string[] = [];
        if (functionName.includes(".")) {
            let data = functionName.split(".").slice(-1)[0];
            if (data) {
                functionName = data;
            }
        }
        for (const data of this.packageDataList) {
            for (const fd of data.functions) {
                if (fd.name == functionName && !ans.includes(fd.signature)) {
                    ans.push(fd.signature);
                }
            }
        }
        return ans;
    }
    public getRecomendType() {
        let res: string[] = [];
        return res;
    }
}
export function loadParsedSummary(jsonPath: string): ThirdPackageInfo[] {
    if (!fs.pathExistsSync(jsonPath)) {
        throw new Error(`JSON file not found: ${jsonPath}`);
    }
    const data = fs.readJsonSync(jsonPath) as ThirdPackageInfo[];
    return data;
}
