import { Project, Node } from 'ts-morph';

export interface TypeObject {
    typeStr: string;
    processedTypeStr: string;
    category: string;
    userDefs: string[];
}

export class TSTypeObject {
    private typeObject: TypeObject | null = null;
    private readonly project: Project;
    private readonly typeGuards: { isTypeNode: (node: Node) => boolean };
    private static instanceCounter = 0;
    private static sharedProject: Project | null = null;
    private readonly instanceId: number;

    constructor(typeStr: string, project?: Project) {
        this.project = project || TSTypeObject.getSharedProject();
        this.typeGuards = { isTypeNode: Node.isTypeNode } as const;
        this.instanceId = ++TSTypeObject.instanceCounter;

        this.initializeTypeObject(typeStr);
    }

    private static getSharedProject(): Project {
        if (!TSTypeObject.sharedProject) {
            TSTypeObject.sharedProject = new Project({
                skipAddingFilesFromTsConfig: true,
                skipFileDependencyResolution: true,
                useInMemoryFileSystem: true
            });
        }
        return TSTypeObject.sharedProject;
    }

    public getTypeObject(): TypeObject | null {
        return this.typeObject;
    }

    private initializeTypeObject(typeStr: string): void {
        typeStr = typeStr.replace(/([a-zA-Z0-9_]+\.)+/g, '');
        const source = `const a:${typeStr}`;
        const fileName = `a_${this.instanceId}.ts`;
        const sourceFile = this.project.createSourceFile(fileName, source, { overwrite: true });

        try {
            const node = this.getTypeNode(sourceFile);
            if (!node) {
                throw new Error('Type node not found');
            }

            this.createTypeObject(typeStr, node, fileName);
        } finally {
            sourceFile?.forget();
            this.project.removeSourceFile(sourceFile);
        }
    }

    private getTypeNode(sourceFile: any): Node | undefined {
        try {
            const varDecl = sourceFile.getVariableDeclarationOrThrow('a');
            return varDecl.getTypeNode();
        } catch {
            return undefined;
        }
    }

    private createTypeObject(typeStr: string, node: Node, fileName: string): void {
        const userDefs = this.getUserDefinedTypes(node);

        if (userDefs.length > 0) {
            let cat = "other";
            const nodeKindName = node.getKindName();
            if (nodeKindName === 'TypeReference'){
                const identifierChild = this.findFirstChildByKind(node, 'Identifier');
                if(identifierChild){
                    if(identifierChild.getType().getText().includes('/*unresolved*/ any')){
                        cat = "userDefined";
                    }else{
                        cat = identifierChild.getText();
                    }
                }
            }else{
                cat = nodeKindName ?? "other";
            }
            const processedTypeStr = this.replaceUserDefinedTypeNames(typeStr, userDefs);
            this.typeObject = {
                typeStr,
                processedTypeStr,
                category: cat,
                userDefs
            };
        } else {
            this.createStandardTypeObject(typeStr, node);
        }
    }

    private createStandardTypeObject(typeStr: string, node: Node): void {
        this.project.getSourceFile(`a_${this.instanceId}.ts`)?.refreshFromFileSystem();

        const category = this.getTypeCategoryFromNode(node);

        this.typeObject = {
            typeStr,
            processedTypeStr: node.getText(),
            category,
            userDefs: []
        };
    }

    private getTypeCategoryFromNode(node: Node): string {
        if (node.getKindName() === 'TypeReference') {
            const identifierChild = this.findFirstChildByKind(node, 'Identifier');
            if (!identifierChild) return "other";

            return identifierChild.getText();
        }
        return node.getKindName() ?? "other";
    }

    private findFirstChildByKind(node: Node, kind: string): Node | undefined {
        return node.getChildren().find(child => child.getKindName() === kind);
    }

    public getUserDefinedTypes(node: Node): string[] {
        const typeNode = this.getValidTypeNode(node);
        if (!typeNode) return [];

        return this.getTypeReferenceUserDefs(typeNode)
    }

    private getValidTypeNode(node: Node): Node | undefined {
        return this.typeGuards.isTypeNode(node)
            ? node
            : undefined;
    }


    private getTypeReferenceUserDefs(typeNode: Node): string[] {
        const allUserDefs: string[] = [];
        const processedNodes = new Set<Node>();

        if (typeNode.getKindName() === 'TypeReference') {
            const identifierChild = this.findFirstChildByKind(typeNode, 'Identifier');
            if (!identifierChild) return [];
            const type = identifierChild.getType().getText();
            if (type.includes('/*unresolved*/ any')) {
                allUserDefs.push(identifierChild.getText());
                return allUserDefs;
            }
        }

        for (const descendant of typeNode.getDescendants()) {
            if (descendant.getKindName() === 'TypeReference' && !processedNodes.has(descendant)) {
                const identifierChild = this.findFirstChildByKind(descendant, 'Identifier');
                if (!identifierChild) continue;

                try {
                    const type = identifierChild.getType();
                    const typeText = type.getText();

                    if (typeText.includes('/*unresolved*/ any')) {
                        allUserDefs.push(identifierChild.getText());

                        for (const child of descendant.getDescendants()) {
                            processedNodes.add(child);
                        }
                        processedNodes.add(descendant);
                    }
                } catch (error) {
                    console.warn(`Cannot get type for identifier ${identifierChild.getText()}:`, error);
                    allUserDefs.push(identifierChild.getText());

                    for (const child of descendant.getDescendants()) {
                        processedNodes.add(child);
                    }
                    processedNodes.add(descendant);
                }
            }
        }

        return allUserDefs;
    }

    private replaceUserDefinedTypeNames(typeStr: string, userDefs: string[]): string {
        let processed = typeStr;
        for (const userDef of userDefs) {
            const escaped = userDef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const reg = new RegExp(`\\b${escaped}\\b`, 'g');
            processed = processed.replace(reg, 'never');
        }
        return processed;
    }
}
