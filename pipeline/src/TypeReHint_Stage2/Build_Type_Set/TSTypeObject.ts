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
    private readonly typeGuards: {
        isTypeNode: (node: Node) => boolean;
    };
    private static instanceCounter = 0;
    private readonly instanceId: number;
    constructor(typeStr: string, project?: Project) {
        this.project = project || new Project();
        this.typeGuards = { isTypeNode: Node.isTypeNode } as const;
        this.instanceId = ++TSTypeObject.instanceCounter;
        this.initializeTypeObject(typeStr);
    }
    public getTypeObject(): TypeObject | null {
        return this.typeObject;
    }
    private initializeTypeObject(typeStr: string): void {
        const source = `const a:${typeStr}`;
        const fileName = `a_${this.instanceId}.ts`;
        const sourceFile = this.project.createSourceFile(fileName, source);
        const node = this.getTypeNode(sourceFile);
        if (!node) {
            throw new Error('Type node not found');
        }
        this.createTypeObject(typeStr, node);
    }
    private getTypeNode(sourceFile: any): Node | undefined {
        try {
            const varDecl = sourceFile.getVariableDeclarationOrThrow('a');
            return varDecl.getTypeNode();
        }
        catch {
            return undefined;
        }
    }
    private createTypeObject(typeStr: string, node: Node): void {
        const userDefs = this.getUserDefinedTypes(node);
        if (userDefs.length > 0) {
            const nodeKindName = node.getKindName();
            const updatedNode = this.replaceUserDefinedTypes(node, userDefs);
            const fileName = `a_${this.instanceId}.ts`;
            this.project.getSourceFile(fileName)?.refreshFromFileSystem();
            const cat = nodeKindName === 'TypeReference' ? 'userDefined' : nodeKindName ?? "other";
            this.typeObject = {
                typeStr,
                processedTypeStr: updatedNode.getText(),
                category: cat,
                userDefs
            };
        }
        else {
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
            if (!identifierChild)
                return "other";
            return identifierChild.getText();
        }
        return node.getKindName() ?? "other";
    }
    private findFirstChildByKind(node: Node, kind: string): Node | undefined {
        return node.getChildren().find(child => child.getKindName() === kind);
    }
    public getUserDefinedTypes(node: Node): string[] {
        const typeNode = this.getValidTypeNode(node);
        if (!typeNode)
            return [];
        return this.getTypeReferenceUserDefs(typeNode);
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
            if (!identifierChild)
                return [];
            const type = identifierChild.getType().getText();
            if (type.includes('/*unresolved*/ any')) {
                allUserDefs.push(identifierChild.getText());
                return allUserDefs;
            }
        }
        for (const descendant of typeNode.getDescendants()) {
            if (descendant.getKindName() === 'TypeReference' && !processedNodes.has(descendant)) {
                const identifierChild = this.findFirstChildByKind(descendant, 'Identifier');
                if (!identifierChild)
                    continue;
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
                }
                catch (error) {
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
    private replaceUserDefinedTypes(node: Node, userDefs: string[]): Node {
        const nodesToReplace: Array<{
            node: Node;
            identifier: string;
        }> = [];
        if (node.getKindName() === 'TypeReference') {
            const identifier = this.findFirstChildByKind(node, 'Identifier');
            if (!identifier)
                return node;
            if (userDefs.includes(identifier.getText())) {
                return node.replaceWithText('never');
            }
        }
        for (const descendant of node.getDescendants()) {
            if (descendant.getKindName() === 'TypeReference') {
                const identifier = this.findFirstChildByKind(descendant, 'Identifier');
                if (identifier && userDefs.includes(identifier.getText())) {
                    nodesToReplace.push({ node: descendant, identifier: identifier.getText() });
                }
            }
        }
        for (const { node: descendant, identifier } of nodesToReplace) {
            try {
                descendant.replaceWithText('never');
            }
            catch (error) {
                console.warn(`Cannot replace TypeReference ${identifier}:`, error);
            }
        }
        return node;
    }
}
