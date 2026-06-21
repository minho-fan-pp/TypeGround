import { SyntaxKind } from "ts-morph";
export enum DataType {
    Var = 1,
    Function = 2,
    FunctionParam = 3
}
export interface CodeData {
    node: any;
    type: string;
    filePath: string;
    dataType: DataType;
    FunctionName?: string;
}
export const FUNCTION_KINDS = [
    SyntaxKind.FunctionDeclaration,
    SyntaxKind.MethodDeclaration,
];
export const BLOCK_KINDS = [
    SyntaxKind.FunctionDeclaration,
    SyntaxKind.ClassDeclaration,
    SyntaxKind.Block,
    SyntaxKind.ArrowFunction,
    SyntaxKind.MethodDeclaration,
    SyntaxKind.FunctionExpression,
];
export interface FunctionCallData {
    name: string;
    position: number;
    file: string;
    arguments: string[];
}
export interface SDKFunctions {
    name: string;
    srcCode: string;
    namespace: string;
    class: string;
    file: string;
    isComponent: boolean;
}
export interface SDKClasses {
    name: string;
    srcCode: string;
    namespace: string;
    file: string;
    isComponent: boolean;
}
export const FILE_DEFINED = [
    SyntaxKind.EnumDeclaration,
    SyntaxKind.InterfaceDeclaration,
    SyntaxKind.ClassDeclaration,
];
export interface projectDefined {
    name: string;
    sourceCode: string;
    filePath: string;
}
export const ARRAY_OPERATIONS = [
    "push",
    "add",
    "filter",
    "join",
    "slice",
];
export interface ImportInfo {
    type: "import" | "from";
    module: string;
    names: string[];
    aliases: (string | null)[];
    isNamespace?: boolean;
    isDefault?: boolean;
    startLine?: number;
}
export interface SlicedData {
    code: string;
    typeRecommended: string[];
}
export interface useDefined {
    name: string;
    useCode: string;
    file: string;
}
export const IDENTIFIER_KINDS = [
    SyntaxKind.BinaryExpression,
    SyntaxKind.PropertyAssignment,
    SyntaxKind.PropertyAccessExpression,
    SyntaxKind.ElementAccessExpression,
    SyntaxKind.ReturnStatement,
    SyntaxKind.ConditionalExpression,
    SyntaxKind.NewExpression,
];
export interface ThirdPartyPackageData {
    name: string;
    sourceCode: string;
    file: string;
    type: SyntaxKind;
}
export interface DataSetData {
    cat: string;
    file: string;
    url: string;
    commit_hash: string;
    gttype: string;
    loc: number;
    name: string;
    scope: string;
}
export interface OutputData {
    cat: string;
    file: string;
    url: string;
    commit_hash: string;
    gttype: string;
    loc: number;
    name: string;
    scope: string;
    totalPrompt: string;
    slicedCode: string;
    prediction: string[];
}
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
