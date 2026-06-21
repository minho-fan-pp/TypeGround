import * as fs from 'fs-extra';
import * as path from 'path';
import { Project, SyntaxKind, FunctionDeclaration, ClassDeclaration, InterfaceDeclaration, TypeAliasDeclaration } from 'ts-morph';
const OUT_DIR = path.resolve(__dirname, 'output');
const SUMMARY_FILE = path.join(OUT_DIR, 'npm_api_summary.json');
export interface functionData {
    name: string;
    signature: string;
    BelongClass?: string;
}
export interface classData {
    name: string;
    methodNames: string[];
    signature: string;
}
export interface interfaceData {
    name: string;
    propertyNames: string[];
    signature: string;
}
export interface typeData {
    name: string;
    code: string;
}
export interface ThirdPackageInfo {
    packageName: string;
    functions: functionData[];
    methods: functionData[];
    classes: classData[];
    interfaces: interfaceData[];
    types: typeData[];
}
function parseAPI(pkgDir: string): Array<functionData & {
    kind: string;
    fields?: any[];
}> {
    const project = new Project();
    project.addSourceFilesAtPaths(path.join(pkgDir, '**/*.d.ts'));
    const entries: Array<any> = [];
    for (const sf of project.getSourceFiles()) {
        for (const [name, decls] of sf.getExportedDeclarations()) {
            for (const d of decls) {
                switch (d.getKind()) {
                    case SyntaxKind.FunctionDeclaration: {
                        const fn = d.asKindOrThrow(SyntaxKind.FunctionDeclaration) as FunctionDeclaration;
                        entries.push({ kind: 'function', name, signature: fn.getText() });
                        break;
                    }
                    case SyntaxKind.ClassDeclaration: {
                        const cls = d.asKindOrThrow(SyntaxKind.ClassDeclaration) as ClassDeclaration;
                        const fields = cls.getMembers().map(m => ({ name: (m as any).getName?.(), type: (m as any).getType?.()?.getText() }));
                        entries.push({ kind: 'class', name, fields });
                        break;
                    }
                    case SyntaxKind.InterfaceDeclaration: {
                        const iface = d.asKindOrThrow(SyntaxKind.InterfaceDeclaration) as InterfaceDeclaration;
                        const fields = iface.getMembers().map(m => ({ name: (m as any).getName?.(), type: (m as any).getType?.()?.getText() }));
                        entries.push({ kind: 'interface', name, fields });
                        break;
                    }
                    case SyntaxKind.TypeAliasDeclaration: {
                        const ta = d.asKindOrThrow(SyntaxKind.TypeAliasDeclaration) as TypeAliasDeclaration;
                        const definition = ta.getTypeNode()?.getText() || '';
                        entries.push({ kind: 'type', name, definition });
                        break;
                    }
                }
            }
        }
    }
    return entries;
}
function mapToThird(info: {
    package: string;
    api: any[];
}): ThirdPackageInfo {
    const funcs: functionData[] = [];
    const meths: functionData[] = [];
    const classesArr: classData[] = [];
    const interfacesArr: interfaceData[] = [];
    const typesArr: typeData[] = [];
    for (const e of info.api) {
        if (e.kind === 'function') {
            funcs.push({ name: e.name, signature: e.signature });
        }
        else if (e.kind === 'class') {
            const methodNames = e.fields.map((f: any) => f.name);
            const sig = `class ${e.name} { ${e.fields.map((f: any) => `${f.name}: ${f.type}`).join(', ')} }`;
            classesArr.push({ name: e.name, methodNames, signature: sig });
        }
        else if (e.kind === 'interface') {
            const propNames = e.fields.map((f: any) => f.name);
            const sig = `interface ${e.name} { ${e.fields.map((f: any) => `${f.name}: ${f.type}`).join('; ')} }`;
            interfacesArr.push({ name: e.name, propertyNames: propNames, signature: sig });
        }
        else if (e.kind === 'type') {
            typesArr.push({ name: e.name, code: e.definition });
        }
    }
    return {
        packageName: info.package,
        functions: funcs,
        methods: meths,
        classes: classesArr,
        interfaces: interfacesArr,
        types: typesArr
    };
}
export async function Package_Maker(directoryPath: string): Promise<any[]> {
    const nodeModulesPath = path.join(directoryPath, "node_modules");
    if (!fs.existsSync(nodeModulesPath))
        return [];
    const pkgs = await fs.promises.readdir(nodeModulesPath);
    const filteredPkgs = pkgs.filter(pkg => {
        if (pkg.startsWith('.'))
            return false;
        if (['.modules.yaml', '.package-lock.json'].includes(pkg))
            return false;
        if (['.bin', '.pnpm', '.cache'].includes(pkg))
            return false;
        return true;
    });
    const summary: any[] = [];
    await fs.ensureDir(OUT_DIR);
    for (const pkg of filteredPkgs) {
        try {
            console.log(`Processing ${pkg}`);
            const dir = path.join(directoryPath, "node_modules", pkg);
            if (!fs.existsSync(dir)) {
                console.log(`Directory does not exist for package ${pkg}, skipping.`);
                continue;
            }
            const apiEntries = parseAPI(dir);
            summary.push(mapToThird({ package: pkg, api: apiEntries }));
        }
        catch (err: any) {
            console.error(`Failed ${pkg}:`, err.message);
        }
    }
    await fs.writeJson(SUMMARY_FILE, summary, { spaces: 2 });
    console.log(`Written summary to ${SUMMARY_FILE}`);
    return summary;
}
