import { Project } from 'ts-morph';
import { TSTypeObject,TypeObject } from './TSTypeObject';

export class TSTypeCMPer {
    private project: Project;

    constructor(project?: Project) {
      this.project = project || new Project();
    }

    public getProject(): Project {
        return this.project;
    }

    public isExactMatch(sourceObject: TSTypeObject, targetObject: TSTypeObject) {
      const sourceType = sourceObject.getTypeObject()
      const targetType = targetObject.getTypeObject()
      if(sourceType && targetType){
        if (sourceType.typeStr === targetType.typeStr) return true;
        if (targetType.typeStr === 'any') return true;
        if (sourceType.typeStr === 'any') return false;
        if (targetType.typeStr === 'Object') return true;
        if (sourceType.typeStr === 'Object') return false;
        if (targetType.typeStr === 'Function' && sourceType.category === 'FunctionType') return true;
        if (sourceType.typeStr === 'Function' && targetType.category === 'FunctionType') return false;

        if (sourceType.userDefs.length > 0 || targetType.userDefs.length > 0){
          const sourceUsrDefs = new Set(sourceType.userDefs);
          const targetUsrDefs = new Set(targetType.userDefs);
          if (sourceUsrDefs.size === targetUsrDefs.size &&
              [...sourceUsrDefs].every(item => targetUsrDefs.has(item))) {
                return this.isTypesEquivalent(sourceType.processedTypeStr, targetType.processedTypeStr) ? true : false;
          }
          return false;
        }
        return this.isTypesEquivalent(sourceType.processedTypeStr, targetType.processedTypeStr) ? true : false;
      }else{
        throw new Error('sourceType or targetType not found');
      }
    }

    public isBaseMatch(sourceObject: TSTypeObject, targetObject: TSTypeObject) {
      const sourceType = sourceObject.getTypeObject()
      const targetType = targetObject.getTypeObject()
      if(sourceType && targetType){
        if(this.isSingleAssignto(sourceType,targetType)){
          return true;
        }else if(this.isGenSimilar(sourceType, targetType)){
          return true;
        }else{
          return false;
        }
      }else{
        throw new Error('sourceType or targetType not found');
      }
    }

    private isSingleAssignto(sourceType: TypeObject, targetType: TypeObject): boolean {
      if (sourceType.userDefs.length > 0 || targetType.userDefs.length > 0){
        const sourceUsrDefs = new Set(sourceType.userDefs);
        const targetUsrDefs = new Set(targetType.userDefs);
        if(sourceType.category === 'UnionType' || sourceType.category === 'userDefined'
          || targetType.category === 'UnionType' || targetType.category === 'userDefined'){
          const sourceType_array = sourceType.typeStr.split('|').map(item => item.trim());
          const targetType_array = targetType.typeStr.split('|').map(item => item.trim());
          for(let i = 0; i < sourceType_array.length; i++){
            for(let j = 0; j < targetType_array.length; j++){
              if(sourceType_array[i] === targetType_array[j]) return true;
            }
          }
          return false;
        }
        if(sourceType.category === 'IntersectionType' ||sourceType.category === 'userDefined'
          || targetType.category === 'IntersectionType' || targetType.category === 'userDefined'){
          const sourceType_array = sourceType.typeStr.split('&').map(item => item.trim());
          const targetType_array = targetType.typeStr.split('&').map(item => item.trim());
          for(let i = 0; i < sourceType_array.length; i++){
            for(let j = 0; j < targetType_array.length; j++){
              if(sourceType_array[i] === targetType_array[j]) return true;
            }
          }
          return false;
        }
        if (sourceUsrDefs.size === targetUsrDefs.size &&
          [...sourceUsrDefs].every(item => targetUsrDefs.has(item))) {
            return this.isAssignto(sourceType.processedTypeStr, targetType.processedTypeStr)
              || this.isAssignto(targetType.processedTypeStr, sourceType.processedTypeStr);
        }else{
          return false;
        }
      }
      return this.isAssignto(sourceType.processedTypeStr, targetType.processedTypeStr)
      || this.isAssignto(targetType.processedTypeStr, sourceType.processedTypeStr);
    }

    private isGenSimilar(sourceType: TypeObject, targetType: TypeObject): boolean {
      const NO_GEN_TYPE_CAT = [/Keyword$/, 'FunctionType', 'Object', 'Function',
                               'TupleType', 'UnionType', 'IntersectionType', 'userDefined',
                               'TypeLiteral', 'LiteralType'];

      if (sourceType.category && !NO_GEN_TYPE_CAT.includes(sourceType.category)
          && targetType.category && !NO_GEN_TYPE_CAT.includes(targetType.category)) {
        if (
          (sourceType.category === 'Array' && targetType.category === 'ArrayType') ||
          (sourceType.category === 'ArrayType' && targetType.category === 'Array')
        ) {
          return true;
        }
        if(sourceType.category === targetType.category) return true;
      }
      return false;
    }

    private levenshtein(s1: string, s2: string): number {
      const m = s1.length;
      const n = s2.length;

      const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

      for (let i = 0; i <= m; i++) {
          dp[i][0] = i;
      }

      for (let j = 0; j <= n; j++) {
          dp[0][j] = j;
      }

      for (let i = 1; i <= m; i++) {
          for (let j = 1; j <= n; j++) {
              const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;

              dp[i][j] = Math.min(
                  dp[i - 1][j] + 1,
                  dp[i][j - 1] + 1,
                  dp[i - 1][j - 1] + cost
              );
          }
      }

      return dp[m][n];
    }

    private isSimilar(sourceType: TypeObject, targetType: TypeObject){
      const dis = this.levenshtein(sourceType.typeStr,targetType.typeStr);
      console.log(`dis: ${dis}`)
      if(dis<5){
        return true;
      }else{
        return false;
      }

    }

    private isTypesEquivalent(t1:string,t2:string){
      return this.isAssignto(t1,t2) && this.isAssignto(t2,t1);
    }

    private isAssignto(ta: string, tb: string): boolean {
      const source = `let Var1 : ${ta};
                      let Var2 : ${tb} = Var1;`
      const src = this.project.createSourceFile('compile.ts', source, { overwrite: true });
      const diagnostics = src.getPreEmitDiagnostics();
      return diagnostics.length === 0;
    }

}
