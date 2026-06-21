import { writeFileSync, mkdirSync, readFileSync } from "fs";
import path, { join } from "path";
import { Project, SyntaxKind } from "ts-morph";
import { BASIC_TYPE_SET } from "./BASIC_TYPE_SET";
import { initializeProjectWithConfig } from "../utils/ProjectReader";
const curDir = path.dirname(__filename);
function normalizeTypeAnnotation(typeText: string): string {
    if (!typeText)
        return "";
    let normalized = typeText;
    normalized = normalized.replace(/\/\/.*$/gm, '');
    normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, '');
    normalized = normalized.replace(/\s+/g, ' ').trim();
    normalized = normalized
        .replace(/\s*<\s*/g, '<')
        .replace(/\s*>\s*/g, '>')
        .replace(/\s*,\s*/g, ', ')
        .replace(/\s*\|\s*/g, ' | ')
        .replace(/\s*&\s*/g, ' & ')
        .replace(/\s*\[\s*/g, '[')
        .replace(/\s*\]\s*/g, ']')
        .replace(/\s*\(\s*/g, '(')
        .replace(/\s*\)\s*/g, ')')
        .replace(/\s*:\s*/g, ': ')
        .replace(/\s*=\s*(?!>)/g, ' = ')
        .replace(/\s*=>\s*/g, '=>');
    if (!normalized || normalized === ':' || normalized === '=') {
        return "";
    }
    return normalized;
}
function extract_project_type_hinter(files: string[]) {
    const project = new Project({ skipAddingFilesFromTsConfig: true, });
    const annotations = new Set<string>();
    for (const file of files) {
        const sourceFile = project.addSourceFileAtPath(file);
        for (const v of sourceFile.getVariableDeclarations()) {
            const t = v.getTypeNode();
            if (t) {
                const normalizedType = normalizeTypeAnnotation(t.getText());
                if (normalizedType) {
                    annotations.add(normalizedType);
                }
            }
        }
        for (const f of sourceFile.getFunctions()) {
            for (const p of f.getParameters()) {
                const t = p.getTypeNode();
                if (t) {
                    const normalizedType = normalizeTypeAnnotation(t.getText());
                    if (normalizedType) {
                        annotations.add(normalizedType);
                    }
                }
            }
            const rt = f.getReturnTypeNode();
            if (rt) {
                const normalizedType = normalizeTypeAnnotation(rt.getText());
                if (normalizedType) {
                    annotations.add(normalizedType);
                }
            }
        }
        for (const cls of sourceFile.getClasses()) {
            for (const prop of cls.getProperties()) {
                const t = prop.getTypeNode();
                if (t) {
                    const normalizedType = normalizeTypeAnnotation(t.getText());
                    if (normalizedType) {
                        annotations.add(normalizedType);
                    }
                }
            }
            for (const m of cls.getMethods()) {
                for (const p of m.getParameters()) {
                    const t = p.getTypeNode();
                    if (t) {
                        const normalizedType = normalizeTypeAnnotation(t.getText());
                        if (normalizedType) {
                            annotations.add(normalizedType);
                        }
                    }
                }
                const rt = m.getReturnTypeNode();
                if (rt) {
                    const normalizedType = normalizeTypeAnnotation(rt.getText());
                    if (normalizedType) {
                        annotations.add(normalizedType);
                    }
                }
            }
        }
    }
    return annotations;
}
function ParseEachFile(filePath: string) {
    let FileClasses = [];
    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(filePath);
    let classDefined = sourceFile.getDescendantsOfKind(SyntaxKind.ClassDeclaration);
    for (const classNode of classDefined) {
        let className = classNode.getName();
        if (className != undefined) {
            let tempData = `import(\"${filePath}\").${className}`;
            FileClasses.push(tempData);
        }
    }
    let interfaceDefined = sourceFile.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration);
    for (const interfaceNode of interfaceDefined) {
        let interfaceName = interfaceNode.getName();
        if (interfaceName != undefined) {
            let tempData = `import(\"${filePath}\").${interfaceName}`;
            FileClasses.push(tempData);
        }
    }
    let typeDeined = sourceFile.getDescendantsOfKind(SyntaxKind.TypeAliasDeclaration);
    for (const typeNode of typeDeined) {
        let typeName = typeNode.getName();
        if (typeName != undefined) {
            let tempData = `import(\"${filePath}\").${typeName}`;
            FileClasses.push(tempData);
        }
    }
    return FileClasses;
}
function extract_project_type(files: string[]) {
    let ProjectClasses: string[] = [];
    for (const file of files) {
        const FileClasses = ParseEachFile(file);
        ProjectClasses = ProjectClasses.concat(FileClasses);
    }
    const annotations = new Set<string>(ProjectClasses);
    return annotations;
}
export function Build_Type_Set(projectRoot: string) {
    const { project } = initializeProjectWithConfig(projectRoot);
    const files = project.getSourceFiles().map(sf => sf.getFilePath());
    const type_hinter = extract_project_type_hinter(files);
    const type_export = extract_project_type(files);
    const type_set = new Set([...type_hinter, ...type_export, ...BASIC_TYPE_SET]);
    for (const annotation of type_set) {
        if (annotation.includes("import(")) {
            continue;
        }
        if (annotation.includes('any') || annotation.includes('unknown') ||
            annotation.includes('Object') || annotation.includes('object') ||
            annotation.includes('Function') || annotation.includes('undefined') ||
            annotation.includes('null')) {
            type_set.delete(annotation);
        }
        if (/^["']?\d+(\.\d+)?(["']?\s*\|\s*\d+(\.\d+)?)*["']?$/.test(annotation)) {
            type_set.delete(annotation);
        }
        if (/^["'].*["']$/.test(annotation) ||
            /^["'].*["']\s*\|\s*["'].*["']/.test(annotation) ||
            /^["'].*["']\s*&\s*["'].*["']/.test(annotation)) {
            type_set.delete(annotation);
        }
    }
    const outDir = join(curDir, "./output");
    mkdirSync(outDir, { recursive: true });
    const output_fp = join(outDir, "type_set.json");
    const shuffledTypes = Array.from(type_set).sort(() => Math.random() - 0.5);
    writeFileSync(output_fp, JSON.stringify(shuffledTypes, null, 2), "utf8");
}
