import { Project } from 'ts-morph';
import { TSTypeObject } from './TSTypeObject';
export class TSTypeCMPer {
    private project: Project;
    constructor(project?: Project) {
        this.project = project || new Project();
    }
    public getProject(): Project {
        return this.project;
    }
    public isExactMatch(sourceObject: TSTypeObject, targetObject: TSTypeObject) {
        const sourceType = sourceObject.getTypeObject();
        const targetType = targetObject.getTypeObject();
        if (sourceType && targetType) {
            if (targetType.processedTypeStr === 'any')
                return true;
            if (sourceType.processedTypeStr === 'any')
                return false;
            if (sourceType.userDefs.length > 0 || targetType.userDefs.length > 0) {
                const sourceUsrDefs = new Set(sourceType.userDefs);
                const targetUsrDefs = new Set(targetType.userDefs);
                if (sourceUsrDefs.size === targetUsrDefs.size &&
                    [...sourceUsrDefs].every(item => targetUsrDefs.has(item))) {
                    return this.isTypesEquivalent(sourceType.processedTypeStr, targetType.processedTypeStr) ? true : false;
                }
                return false;
            }
            return this.isTypesEquivalent(sourceType.processedTypeStr, targetType.processedTypeStr) ? true : false;
        }
        else {
            throw new Error('sourceType or targetType not found');
        }
    }
    private isTypesEquivalent(t1: string, t2: string) {
        return this.isAssignto(t1, t2) && this.isAssignto(t2, t1);
    }
    private isAssignto(ta: string, tb: string): boolean {
        const source = `let Var1 : ${ta};
                      let Var2 : ${tb} = Var1;`;
        const src = this.project.createSourceFile('compile.ts', source, { overwrite: true });
        const diagnostics = src.getPreEmitDiagnostics();
        return diagnostics.length === 0;
    }
}
