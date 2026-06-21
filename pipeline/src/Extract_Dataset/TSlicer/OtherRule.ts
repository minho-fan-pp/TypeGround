import { console } from "inspector";
import { SyntaxKind, VariableDeclaration, NewExpression, FunctionDeclaration, MethodDeclaration, ParameterDeclaration, Node, Expression } from "ts-morph";
export function fixType(target: string) {
    const res = target.replace(/import\([^)]*\)\.([^)\s]+)/g, "$1");
    return res;
}
const usefulSymbol = ["=", ":", "(", ">", "<"];
function isUsefulSlice(slice: string) {
    for (const s of usefulSymbol) {
        if (slice.includes(s)) {
            return true;
        }
    }
    return false;
}
export function getEnclosingContext(node: ParameterDeclaration | FunctionDeclaration | MethodDeclaration): any {
    if (Node.isParameterDeclaration(node)) {
        const asMethod = node.getFirstAncestorByKind(SyntaxKind.MethodDeclaration);
        if (asMethod)
            return asMethod;
        const asFunction = node.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration);
        return asFunction ?? undefined;
    }
}
function inferExprType(expr: Expression): string {
    const kind = expr.getKind();
    if (kind === SyntaxKind.StringLiteral ||
        kind === SyntaxKind.NumericLiteral ||
        kind === SyntaxKind.TrueKeyword ||
        kind === SyntaxKind.FalseKeyword ||
        kind === SyntaxKind.NullKeyword) {
        if (kind === SyntaxKind.StringLiteral)
            return "string";
        if (kind === SyntaxKind.NumericLiteral)
            return "number";
        if (kind === SyntaxKind.TrueKeyword || kind === SyntaxKind.FalseKeyword)
            return "boolean";
        if (kind === SyntaxKind.NullKeyword)
            return "null";
    }
    if (Node.isArrayLiteralExpression(expr))
        return "Array";
    if (Node.isObjectLiteralExpression(expr))
        return "Object";
    if (Node.isCallExpression(expr)) {
        const fn = expr.getExpression();
        let name: string | undefined;
        if (Node.isIdentifier(fn)) {
            name = fn.getText();
        }
        else if (Node.isPropertyAccessExpression(fn)) {
            name = fn.getName();
        }
        if (name) {
            const sf = expr.getSourceFile();
            if (sf.getClass(name)) {
                return `class ${name}`;
            }
            else {
                return `The return of ${name} or class ${name}`;
            }
        }
    }
    if (Node.isBinaryExpression(expr)) {
        const op = expr.getOperatorToken().getKind();
        if (op === SyntaxKind.PlusToken ||
            op === SyntaxKind.MinusToken ||
            op === SyntaxKind.AsteriskToken ||
            op === SyntaxKind.SlashToken) {
            return inferExprType(expr.getLeft());
        }
    }
    return "any";
}
function inferVariableDeclarationType(varDecl: VariableDeclaration): string {
    const init = varDecl.getInitializer();
    if (init) {
        return inferExprType(init);
    }
    return "any";
}
export function AnalysizerRule(CODE: Set<any>, node: any, interfaceData: any[] = [], importInfos: any[] = [], needFindType: Set<string> = new Set(), filePath: string = "") {
    let result = new Set();
    let totalCode = "";
    let belongClassName = "";
    let fixDecNode = "";
    let styledSigurate = `
    `;
    if (filePath != "") {
    }
    let asyncRule = "This is an async declared function, and its return value must be in the Promise<...> format.\n";
    let propsPrompt = `This parameter may be of type ThemedStyledProps or PropsWithChildren, only one of these two can be selected`;
    if (node.getKind() === SyntaxKind.VariableDeclaration) {
        let initType = inferVariableDeclarationType(node);
        let init = node.getInitializer();
        fixDecNode = node.getParent()?.getText();
    }
    else if (node.getKind() === SyntaxKind.Parameter) {
        let includesStyle = false;
        for (const ipif of importInfos) {
            if (ipif.getText().includes("styled-components")) {
                includesStyle = true;
                break;
            }
        }
        if (node.getName() == "props" && filePath.endsWith(".tsx") && includesStyle) {
        }
    }
    if (node.getKind() === SyntaxKind.MethodDeclaration || (node.getKind() === SyntaxKind.Parameter && node.getParent().getKind() === SyntaxKind.MethodDeclaration)) {
        let belongClass = getEnclosingContext(node);
        let funcName = node.getKind() === SyntaxKind.MethodDeclaration ? node.getName() : node.getParent().getName();
        if (belongClass != undefined) {
            let bName = belongClass.getName();
            if (bName != undefined) {
                belongClassName = bName;
            }
            let belongWhatClass = `This function ${funcName} is a method in class ${belongClass.getName()}`;
        }
        else {
            console.log(`belongClass is undefined`);
        }
    }
    if (true) {
        importInfos.forEach(item => totalCode = totalCode + item.getText() + "\n");
    }
    if (node.getKind() === SyntaxKind.VariableDeclaration || node.getKind() === SyntaxKind.Parameter) {
        let targetName = node.getName();
    }
    if (needFindType.size > 0) {
        for (const t of needFindType) {
            if (t.startsWith("string") || t.startsWith("number") || t.startsWith("boolean")) {
                continue;
            }
        }
    }
    if (node.getKind() === SyntaxKind.VariableDeclaration && node.getText().includes("{")) {
        interfaceData.forEach(item => totalCode = totalCode + item.getText() + "\n");
    }
    if (node.getKind() === SyntaxKind.VariableDeclaration) {
        const varDecl = node as VariableDeclaration;
        const initializer = varDecl.getInitializer();
        if (initializer) {
            if (initializer.getKind() === SyntaxKind.NewExpression) {
                const newExpr = initializer as NewExpression;
                const className = newExpr.getExpression().getText();
            }
        }
    }
    for (const slice of CODE) {
        if (slice.length < 6 && !isUsefulSlice(slice)) {
            continue;
        }
        if (fixDecNode != "" && slice == node.getText()) {
            totalCode = totalCode + fixDecNode + "\n";
            continue;
        }
        totalCode = totalCode + slice + "\n";
    }
    totalCode = fixType(totalCode);
    if (node.getKind() === SyntaxKind.Parameter) {
    }
    if (belongClassName != "") {
        totalCode = totalCode.replace(/this\./g, `${belongClassName}.`);
        totalCode = totalCode.replace(/ this\;/g, ` ${belongClassName}.`);
    }
    return totalCode;
}
