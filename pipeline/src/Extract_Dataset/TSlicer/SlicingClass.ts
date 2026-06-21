import { Project, SyntaxKind, VariableDeclaration, ParameterDeclaration, ElementAccessExpression, CallExpression, PropertyAccessExpression, BinaryExpression, Node } from 'ts-morph';
import { DataType, CodeData, FUNCTION_KINDS, BLOCK_KINDS, FILE_DEFINED, ARRAY_OPERATIONS, SlicedData, IDENTIFIER_KINDS } from "./typeDefined";
import { AnalysizerRule } from "./OtherRule";
import { ProjectDataLoader } from "./ProjectDataLoader";
export function fixType(target: string) {
    const res = target.replace(/import\([^)]*\)\.([^)\s]+)/g, "$1");
    return res;
}
const mask = "mask";
const limitBlockLength = 512;
var slicingFuncName = "";
var needFindFunction: Set<string> = new Set();
export class TSlicer {
    private projectDataLoader;
    private allReadyFound: Map<string, any> = new Map();
    private needFoundType: Set<string> = new Set();
    private recursionDepth: Map<string, number> = new Map();
    private readonly MAX_RECURSION_DEPTH = 100;
    private processingStack: Set<string> = new Set();
    private callStack: string[] = [];
    constructor(filePath: string, projectDataPath: string) {
        let importInfos = this.getImportInfo(filePath);
        this.projectDataLoader = new ProjectDataLoader(projectDataPath);
    }
    public Slicing(data: CodeData) {
        needFindFunction.clear();
        let resData: SlicedData = {
            code: "",
            typeRecommended: []
        };
        let ans = new Set();
        let importInfos = this.getImportInfo(data.filePath);
        let interfaceData = this.getintrefaceData(data.filePath);
        if (data.dataType === DataType.Var) {
            let node = data.node;
            if (this.isLocalVariable(node)) {
                let rootNode = this.getRootNode(node);
                let varName = node.getName();
                let declareRes = this.SlicingDeclareNode(varName, node, data.filePath);
                declareRes.forEach(item => ans.add(item));
                let res = this.getBlockNameVar(rootNode, varName, data.filePath);
                res.forEach(item => ans.add(item));
            }
            else {
                let a = node.getParent();
                if (!a) {
                    return resData;
                }
                while (a.getParent()) {
                    a = a.getParent();
                }
                let varName = node.getName();
                let declareRes = this.SlicingDeclareNode(varName, node, data.filePath);
                declareRes.forEach(item => ans.add(item));
                let res = this.getBlockNameVar(a, varName, data.filePath);
                res.forEach(item => ans.add(item));
            }
        }
        else if (data.dataType === DataType.Function) {
            let functionCode = data.node.getText();
            const project = new Project();
            const sourceFile = project.addSourceFileAtPath(data.filePath);
            let node = data.node;
            let nodeType = node.getKind();
            const functionName = data.FunctionName != undefined ? data.FunctionName : node.getName();
            slicingFuncName = functionName;
            let tempDefined = this.findFunctionDefined(node);
            tempDefined.forEach(item => ans.add(item));
            this.projectDataLoader.delFunction(functionName);
            node.forEachDescendant((item: any) => {
                if (item.getKind() === SyntaxKind.CallExpression) {
                    let callName = item.getExpression().getText();
                    let targetName = "";
                    if (callName.includes(".")) {
                        let splitList = callName.split(".");
                        targetName = splitList.slice(-1)[0];
                        let tarClassName = splitList[0];
                        let classDefined = this.GetDeclarationNode(tarClassName, node);
                        if (classDefined != null) {
                            ans.add(classDefined.getText());
                        }
                    }
                    else {
                        targetName = callName;
                    }
                    let ansf = this.projectDataLoader.GetFunctionsByName(targetName);
                    ansf.forEach(item => ans.add(item));
                }
                else if (item.getKind() === SyntaxKind.ReturnStatement) {
                    let returnNodeIdentifys = item.getDescendantsOfKind(SyntaxKind.Identifier);
                    returnNodeIdentifys.forEach((i: any) => {
                        let returnVars = this.GetDeclarationNode(i.getText(), node, node.getKind() === SyntaxKind.MethodDeclaration);
                        if (returnVars != null) {
                            ans.add(returnVars.getText());
                        }
                    });
                }
            });
            ans.add(node.getName() == undefined ? functionCode.replace("function", "function " + functionName) : functionCode);
            sourceFile.forEachDescendant(n => {
                let tempKind = n.getKind();
                if (tempKind === SyntaxKind.CallExpression) {
                    let callExpr = n as CallExpression;
                    let expr = callExpr.getExpression();
                    let funcName: string | undefined;
                    let exprKind = expr.getKind();
                    if (exprKind === SyntaxKind.Identifier) {
                        funcName = expr.getText();
                    }
                    else if (exprKind === SyntaxKind.PropertyAccessExpression) {
                        let tempexpr = expr as PropertyAccessExpression;
                        if (node.getKind() === SyntaxKind.MethodDeclaration) {
                            funcName = tempexpr.getName();
                        }
                        else {
                            funcName = "";
                        }
                    }
                    else if (exprKind === SyntaxKind.ElementAccessExpression) {
                        let tempexpr = expr as ElementAccessExpression;
                        funcName = tempexpr.getArgumentExpression()?.getText();
                    }
                    else {
                        funcName = expr.getText();
                    }
                    if (funcName != null && funcName == functionName) {
                        let res = this.trackCallExpression2(n, data.filePath, true);
                        res.forEach(item => ans.add(item));
                    }
                }
                if (nodeType === SyntaxKind.MethodDeclaration) {
                    if (tempKind === SyntaxKind.PropertyAccessExpression &&
                        n.getParent()?.getKind() === SyntaxKind.CallExpression &&
                        n.getText().split(".").slice(-1)[0] == functionName &&
                        n.getParent()?.getText().startsWith(n.getText())) {
                        let res = this.trackCallExpression2(n, data.filePath, true);
                        res.forEach(item => ans.add(item));
                    }
                }
            });
            let otherCall = this.projectDataLoader.fileCallExpression(functionName, data.filePath);
            otherCall.forEach(item => ans.add(item));
        }
        else if (data.dataType === DataType.FunctionParam) {
            let node = data.node;
            let targetName = node.getName();
            let rootNode = this.getRootNode(node);
            let functionName = "";
            const nodeParent = node.getParent();
            if (!nodeParent) {
                return resData;
            }
            if (nodeParent.getKind() === SyntaxKind.FunctionDeclaration || nodeParent.getKind() === SyntaxKind.MethodDeclaration) {
                functionName = nodeParent.getName() == undefined ? data.FunctionName : nodeParent.getName();
            }
            else {
                let p = node.getParent();
                if (p && p.getKind() === SyntaxKind.ArrowFunction) {
                    let pp = p.getParent();
                    if (pp && pp.getKind() === SyntaxKind.CallExpression) {
                        let definesData = this.trackCallExpression2(pp, data.filePath, false, false);
                        definesData.forEach(item => { ans.add(item); });
                    }
                }
                functionName = "";
            }
            if (functionName == "") {
                if (ans.size == 0 && nodeParent) {
                    ans.add(nodeParent.getText());
                }
                let funcNodeCode = nodeParent ? nodeParent.getText() : "";
                let res = this.getBlockNameVar(rootNode, targetName, data.filePath, false, functionName, true);
                res.forEach(item => {
                    if (!funcNodeCode.includes(item)) {
                        ans.add(item);
                    }
                });
            }
            else {
                slicingFuncName = functionName;
                if (nodeParent) {
                    ans.add(nodeParent.getKind() != SyntaxKind.ArrowFunction && nodeParent.getName() == undefined ? nodeParent.getText().replace("function", "function " + functionName) : nodeParent.getText());
                }
                this.projectDataLoader.delFunction(functionName);
                let isMemberMethod = nodeParent?.getKind() === SyntaxKind.MethodDeclaration;
                let res = this.getBlockNameVar(rootNode, targetName, data.filePath, false, functionName, true);
                res.forEach(item => ans.add(item));
                const project = new Project();
                const sourceFile = project.addSourceFileAtPath(data.filePath);
                sourceFile.forEachDescendant(n => {
                    if (n.getKind() === SyntaxKind.Identifier &&
                        n.getText() === functionName &&
                        n.getParent()?.getKind() === SyntaxKind.CallExpression) {
                        let res = this.trackCallExpression2(n, data.filePath, true, true);
                        res.forEach(item => ans.add(item));
                    }
                    if (isMemberMethod) {
                        if (n.getKind() === SyntaxKind.PropertyAccessExpression &&
                            n.getParent()?.getKind() === SyntaxKind.CallExpression &&
                            n.getText().split(".").slice(-1)[0] == functionName &&
                            n.getParent()?.getText().startsWith(n.getText())) {
                            let res = this.trackCallExpression2(n, data.filePath, true, true);
                            res.forEach(item => ans.add(item));
                        }
                    }
                });
                let otherCall = this.projectDataLoader.fileCallExpression(functionName, data.filePath);
                otherCall.forEach(item => ans.add(item));
            }
        }
        let ansCode = AnalysizerRule(ans, data.node, interfaceData, importInfos, this.needFoundType, data.filePath);
        resData.code = ansCode;
        return resData;
    }
    public isLocalVariable(node: any) {
        let parent = node.getParent();
        while (parent) {
            const kind = parent.getKind();
            if (BLOCK_KINDS.includes(kind)) {
                return true;
            }
            parent = parent.getParent();
        }
        return false;
    }
    public getFileDefinedData(fileNode: any) {
        var ans = new Set();
        let rootNode = this.getRootNode(fileNode);
        rootNode.forEachDescendant((item: any) => {
            if (FILE_DEFINED.includes(item.getKind)) {
                ans.add(item.getText());
            }
        });
        return ans;
    }
    public SlicingParams(node: any, filePath: string) {
        let ans = this.trackFparam(node, filePath, true);
        let totalCode = "";
        ans.forEach(item => totalCode = totalCode + item + "\n");
        return totalCode;
    }
    public getImportInfo(filePath: string) {
        const project = new Project();
        const sourceFile = project.addSourceFileAtPath(filePath);
        var importInfos = sourceFile.getDescendantsOfKind(SyntaxKind.ImportDeclaration);
        return importInfos;
    }
    public getintrefaceData(filePath: string) {
        const project = new Project();
        const sourceFile = project.addSourceFileAtPath(filePath);
        var interfaceData = sourceFile.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration);
        return interfaceData;
    }
    public getRootNode(node: any, isClass: boolean = false) {
        let parent = node.getParent();
        if (!parent) {
            return node;
        }
        if (BLOCK_KINDS.includes(parent.getKind())) {
            return parent;
        }
        while (parent.getParent()) {
            const kind = parent.getParent()?.getKind();
            if (kind === undefined) {
                break;
            }
            if (!isClass) {
                if (BLOCK_KINDS.includes(kind)) {
                    return parent.getParent();
                }
            }
            else {
                if (kind === SyntaxKind.ClassDeclaration) {
                    return parent.getParent();
                }
            }
            parent = parent.getParent();
        }
        return parent;
    }
    public trackBinaryExpression(node: any, targetName: string, filePath: string, tempNode: any) {
        let res = new Set();
        if (node.getKind() === SyntaxKind.BinaryExpression && node.getOperatorToken().getKind() === SyntaxKind.EqualsToken && node?.getLeft().getText() == targetName) {
            res.add(tempNode.getText());
            let rightNode = tempNode.getExpression().getRight();
            if (rightNode.getKind() == SyntaxKind.Identifier) {
                let tempans = this.getRootNode(rightNode);
                let newSliceds = this.getBlockNameVar(tempans, rightNode.getText(), filePath);
                newSliceds.forEach(item => {
                    res.add(item);
                });
            }
            rightNode.forEachDescendant((node: any) => {
                if (node.getKind() == SyntaxKind.Identifier) {
                    let tempans = this.getRootNode(rightNode);
                    let newSliceds = this.getBlockNameVar(tempans, rightNode.getText(), filePath);
                    newSliceds.forEach(item => {
                        res.add(item);
                    });
                }
            });
        }
        else if (node.getKind() === SyntaxKind.BinaryExpression && node.getOperatorToken().getKind() === SyntaxKind.EqualsToken && node?.getRight().getText() == targetName) {
            let leftNode = node.getLeft();
            let newtarget = "";
            if (leftNode.getKind() === SyntaxKind.Identifier) {
                newtarget = leftNode.getText();
            }
            else if (leftNode.getKind() === SyntaxKind.PropertyAccessExpression) {
                newtarget = leftNode.getExpression().getText();
                let totalTarget = leftNode.getText();
                let nearFExpression = node.getFirstAncestorByKind(SyntaxKind.FunctionExpression);
                if (nearFExpression) {
                    let data = nearFExpression.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).filter((item: any) => item.getText() == totalTarget);
                    for (const d of data) {
                        res.add(d.getParent().getText());
                    }
                }
            }
            else if (leftNode.getKind() === SyntaxKind.ElementAccessExpression) {
                newtarget = leftNode.getExpression().getText();
            }
            if (newtarget != "") {
                let varDefined = this.GetDeclarationNode(newtarget, this.getRootNode(tempNode));
                if (varDefined != null) {
                    res.add(varDefined.getText());
                    res.add(tempNode.getText());
                }
            }
        }
        else if (node.getKind() === SyntaxKind.BinaryExpression && node.getOperatorToken().getKind() === SyntaxKind.EqualsToken) {
            let leftN = node?.getLeft();
            if (leftN && leftN.getKind() === SyntaxKind.ElementAccessExpression) {
                const expr = leftN.getExpression();
                const containerText = expr.getText();
                if (containerText == targetName) {
                    let rightNode = tempNode.getExpression().getRight();
                    if (rightNode.getKind() == SyntaxKind.Identifier) {
                        let tempans = this.getRootNode(rightNode);
                        let newSliceds = this.getBlockNameVar(tempans, rightNode.getText(), filePath);
                        newSliceds.forEach(item => {
                            res.add(item);
                        });
                    }
                    rightNode.forEachDescendant((node: any) => {
                        if (node.getKind() == SyntaxKind.Identifier) {
                            let tempans = this.getRootNode(rightNode);
                            let newSliceds = this.getBlockNameVar(tempans, rightNode.getText(), filePath);
                            newSliceds.forEach(item => {
                                res.add(item);
                            });
                        }
                    });
                }
            }
            else {
                res.add(tempNode.getText());
            }
        }
        else if (node.getKind() === SyntaxKind.BinaryExpression && node.getOperatorToken().getKind() === SyntaxKind.CommaToken) {
            const assigns: BinaryExpression[] = [];
            function collect(expr: Node) {
                if (Node.isBinaryExpression(expr)) {
                    const op = expr.getOperatorToken().getKind();
                    if (op === SyntaxKind.CommaToken) {
                        collect(expr.getLeft());
                        collect(expr.getRight());
                    }
                    else if (op === SyntaxKind.EqualsToken) {
                        assigns.push(expr);
                    }
                }
            }
            collect(node);
            assigns.forEach((assignExpr) => {
                let ans = this.trackBinaryExpression(assignExpr, targetName, filePath, tempNode);
                ans.forEach(item => res.add(item));
            });
        }
        else {
            res.add(tempNode.getText());
        }
        return res;
    }
    public trackIdentifier2(expression: any, targetName: string, filePath: string) {
        let res = new Set();
        if (!expression)
            return res;
        var tempNode = expression.getParent();
        if (!tempNode)
            return res;
        let startKindType = tempNode.getKind();
        if (!IDENTIFIER_KINDS.includes(startKindType)) {
            return res;
        }
        if (startKindType === SyntaxKind.PropertyAccessExpression) {
            if (tempNode.getName() == targetName) {
                return res;
            }
            else if (ARRAY_OPERATIONS.includes(tempNode.getName())) {
                let nesrestCall = tempNode.getFirstAncestorByKind(SyntaxKind.CallExpression);
                let tempans = this.trackFparam(nesrestCall, filePath);
                tempans.forEach(item => res.add(item));
                const tempNodeParent = tempNode.getParent();
                if (tempNode.getName() == 'filter' && tempNodeParent && tempNodeParent.getKind() === SyntaxKind.CallExpression) {
                    let args = tempNodeParent.getArguments();
                    for (const arg of args) {
                        if (arg.getKind() === SyntaxKind.ArrowFunction) {
                            let targetN = arg.getParameters()[0].getName();
                            let tempAns = this.getBlockNameVar(arg, targetN, filePath);
                            tempAns.forEach(item => res.add(item));
                        }
                    }
                }
            }
            const tempNodeParent = tempNode.getParent();
            if (tempNodeParent) {
                res.add(tempNodeParent.getText());
            }
        }
        let isObject = false;
        while (tempNode) {
            let tempKind = tempNode.getKind();
            if (tempKind == SyntaxKind.ExpressionStatement) {
                let expr = tempNode.getExpression();
                let tempAns = this.trackBinaryExpression(expr, targetName, filePath, tempNode);
                tempAns.forEach(item => {
                    res.add(item);
                });
                break;
            }
            else if (tempKind === SyntaxKind.VariableDeclaration) {
                res.add(tempNode.getText());
                let varAns = this.trackVarDec(tempNode, isObject, targetName);
                varAns.forEach(item => res.add(item));
                let tempVarDecNode = tempNode as VariableDeclaration;
                let tempVarDecInitializer = tempVarDecNode.getInitializer();
                if (tempNode.getName() != targetName && tempVarDecInitializer) {
                    let vTempKind = tempVarDecInitializer.getKind();
                    if (vTempKind === SyntaxKind.Identifier) {
                        let blockSliced = this.getBlockNameVar(this.getRootNode(expression), tempNode.getName(), filePath);
                        blockSliced.forEach((item: any) => {
                            if (!res.has(item)) {
                                res.add(item);
                            }
                            else {
                                res.delete(item);
                                res.add(item);
                            }
                        });
                    }
                    else if (vTempKind === SyntaxKind.PropertyAccessExpression) {
                        let tempPAE = tempVarDecInitializer as PropertyAccessExpression;
                        if (tempPAE.getExpression().getText() == targetName) {
                            let blockSliced = this.getBlockNameVar(this.getRootNode(expression), tempNode.getName(), filePath);
                            blockSliced.forEach((item: any) => {
                                if (!res.has(item)) {
                                    res.add(item);
                                }
                                else {
                                    res.delete(item);
                                    res.add(item);
                                }
                            });
                        }
                    }
                    else {
                    }
                }
                break;
            }
            else if (tempKind === SyntaxKind.ReturnStatement) {
                let returnText = tempNode.getText();
                if (returnText.length > limitBlockLength) {
                    let identifys = tempNode.getDescendantsOfKind(SyntaxKind.Identifier);
                    identifys.forEach((item: any) => {
                        if (item.getText() == targetName) {
                            let tempData = item.getFirstAncestorByKind(SyntaxKind.BinaryExpression);
                            let tempData2 = item.getFirstAncestorByKind(SyntaxKind.PropertyAssignment);
                            if (tempData2) {
                                res.add(tempData2.getText());
                            }
                            else if (tempData && tempData.getText().length < limitBlockLength) {
                                res.add(tempData.getText());
                            }
                            else {
                                const itemParent = item.getParent();
                                if (itemParent) {
                                    res.add(itemParent.getText());
                                }
                            }
                        }
                    });
                    break;
                }
                res.add(tempNode.getText());
                break;
            }
            else if (tempKind == SyntaxKind.ObjectLiteralExpression) {
                isObject = true;
            }
            else if (tempKind === SyntaxKind.Block) {
                const exprParent = expression.getParent();
                if (exprParent) {
                    res.add(exprParent.getText());
                }
                break;
            }
            else if (tempKind === SyntaxKind.TemplateExpression) {
                const exprParent = expression.getParent();
                if (exprParent) {
                    res.add(exprParent.getText());
                }
                break;
            }
            tempNode = tempNode.getParent();
            if (!tempNode) {
                break;
            }
        }
        return res;
    }
    public findFunctionDefined(funcNode: any) {
        let funcName = funcNode.getName();
        let res = new Set<string>();
        funcNode.forEachDescendant((node: any) => {
            if (node.getKind() == SyntaxKind.CallExpression) {
                let callExpressionName = node.getExpression().getText();
                if (callExpressionName.split(".")[-1] != funcName) {
                    let tempd = this.getKnowledgeDefined(node);
                    tempd.forEach((item: any) => res.add(item));
                }
            }
        });
        return res;
    }
    public trackCallExpression2(expression: any, filePath: string, isFunc: boolean = false, isParam: boolean = false) {
        let isCallExpre = expression.getKind() === SyntaxKind.CallExpression;
        let res = new Set();
        if (!expression)
            return res;
        var tempNode = isCallExpre ? expression : expression.getParent();
        if (!tempNode)
            return res;
        let rootNode = this.getRootNode(tempNode);
        const tempExpr = tempNode.getExpression ? tempNode.getExpression() : null;
        if (!tempExpr)
            return res;
        let fDeined = this.getNearestFunction(rootNode, tempExpr.getText());
        if (fDeined.size > 0) {
            console.log(fDeined);
            fDeined.forEach(item => res.add(item));
        }
        else if (!isFunc && !isParam && tempNode.getExpression().getText() != slicingFuncName) {
            let data0 = this.projectDataLoader.findProjectDefined(tempNode);
            for (const d of data0) {
                res.add(d);
            }
            if (res.size == 0) {
                console.log(`Definition not found:${tempNode.getText()}`);
            }
        }
        while (tempNode) {
            let tempKind = tempNode.getKind();
            if (tempKind === SyntaxKind.CallExpression) {
                const expr = tempNode.getExpression ? tempNode.getExpression() : null;
                if (!expr) {
                    tempNode = tempNode.getParent();
                    if (!tempNode) {
                        break;
                    }
                    continue;
                }
                let callFunctionName = expr.getText();
                if (callFunctionName.includes(".")) {
                    let varName = callFunctionName.split(".")[0];
                    const tempNodeParent = tempNode.getParent();
                    if (!tempNodeParent) {
                        break;
                    }
                    let varDec = this.GetDeclarationNode(varName, tempNodeParent);
                    if (varDec != null) {
                        res.add(varDec.getText());
                    }
                }
            }
            if (tempKind === SyntaxKind.VariableDeclaration) {
                if (isFunc) {
                    const exprToTrack = isCallExpre ? expression : expression.getParent();
                    if (!exprToTrack) {
                        return res;
                    }
                    let tempSet = this.trackFparam(exprToTrack, filePath);
                    tempSet.forEach(item => res.add(item));
                }
                res.add(tempNode.getText());
                let newTargetVar = tempNode.getName();
                let rootNode = this.getRootNode(tempNode);
                let tempSet = this.getBlockNameVar(rootNode, newTargetVar, filePath);
                tempSet.forEach(item => res.add(item));
                return res;
            }
            else if (tempKind == SyntaxKind.Block) {
                break;
            }
            else if (false) {
            }
            tempNode = tempNode.getParent();
            if (!tempNode) {
                break;
            }
        }
        if (isFunc) {
            const exprToTrack = isCallExpre ? expression : expression.getParent();
            if (!exprToTrack) {
                return res;
            }
            let tempSet = this.trackFparam(exprToTrack, filePath, isParam);
            tempSet.forEach(item => res.add(item));
        }
        const exprForCall = isCallExpre ? expression : expression.getParent();
        if (!exprForCall || exprForCall.getKind() !== SyntaxKind.CallExpression) {
            return res;
        }
        const exprForCallExpr = isCallExpre ? (expression.getExpression ? expression.getExpression() : null) : (exprForCall.getExpression ? exprForCall.getExpression() : null);
        if (!exprForCallExpr) {
            return res;
        }
        let callFuncName = exprForCallExpr.getText();
        if (callFuncName.includes(".") && callFuncName.split(".").length == 2) {
            let splitName = callFuncName.split(".");
            if (ARRAY_OPERATIONS.includes(splitName[1])) {
                let rootNode = this.getRootNode(expression);
                let tempAns = this.GetDeclarationNode(splitName[0], rootNode);
                if (tempAns != null) {
                    res.add(tempAns.getText());
                }
            }
        }
        const exprToAdd = isCallExpre ? expression : expression.getParent();
        if (exprToAdd) {
            res.add(exprToAdd.getText());
        }
        return res;
    }
    public getFunctionDefine(text: string, allFileMethods: any) {
        let methodName = "";
        let index = text.indexOf("(");
        methodName = text.slice(0, index);
        for (let i = 0; i < allFileMethods.length; i++) {
            let temp = allFileMethods[i].split("|||");
            if (temp[1] == methodName.split(".").slice(-1)[0]) {
                return temp[0];
            }
        }
    }
    private isAncestorOf(possibleAncestor: Node, node: Node): boolean {
        let parent = node.getParent();
        while (parent) {
            if (parent === possibleAncestor)
                return true;
            parent = parent.getParent();
        }
        return false;
    }
    private isDescendantOf(possibleDescendant: Node, node: Node): boolean {
        return this.isAncestorOf(node, possibleDescendant);
    }
    private isNeedBlockSlicing(rootNode: any, name: string) {
        if (this.allReadyFound.has(name)) {
            for (let Vnod of this.allReadyFound.get(name)) {
                if (Vnod === rootNode) {
                    return false;
                }
                else if (this.isDescendantOf(rootNode, Vnod)) {
                    return false;
                }
                else if (this.isDescendantOf(Vnod, rootNode)) {
                    this.allReadyFound.get(name).push(rootNode);
                    return true;
                }
            }
        }
        this.allReadyFound.set(name, [rootNode]);
        return true;
    }
    private addNeedFindType(node: any) {
        let typeNode = node.getTypeNode();
        if (typeNode) {
            let typeText = typeNode.getText();
            if (typeText != "mask") {
                this.needFoundType.add(typeText);
            }
        }
    }
    public getBlockNameVar(root: any, varName: string, filePath: string, isparam: boolean = false, paramFunctionName: string = "", alreadyGetDeclar: boolean = false) {
        let res = new Set();
        const rootStart = root.getStart ? root.getStart() : 0;
        const rootEnd = root.getEnd ? root.getEnd() : 0;
        const recursionKey = `${varName}:${root.getKind()}:${rootStart}:${rootEnd}:${paramFunctionName}`;
        const currentCallPath = `${varName}@${rootStart}@${rootEnd}`;
        const callStackIndex = this.callStack.indexOf(currentCallPath);
        if (callStackIndex >= 0) {
            const cyclePath = this.callStack.slice(callStackIndex).concat([currentCallPath]).join(' -> ');
            console.warn(`message,message: ${varName} at ${filePath}`);
            console.warn(`message: ${cyclePath}`);
            console.warn(`message: ${this.callStack.length}`);
            return res;
        }
        const currentDepth = this.recursionDepth.get(recursionKey) || 0;
        if (currentDepth >= this.MAX_RECURSION_DEPTH) {
            console.warn(`message ${this.MAX_RECURSION_DEPTH},message: ${varName} at ${filePath}`);
            return res;
        }
        if (!this.isNeedBlockSlicing(root, varName)) {
            return res;
        }
        this.callStack.push(currentCallPath);
        this.processingStack.add(recursionKey);
        this.recursionDepth.set(recursionKey, currentDepth + 1);
        let isGetVarDeclar = alreadyGetDeclar;
        let VariableDeclarations = root.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
        let LabeledStatements = root.getDescendantsOfKind(SyntaxKind.LabeledStatement);
        let PropertyDeclarations = root.getDescendantsOfKind(SyntaxKind.PropertyDeclaration);
        let Identifiers = root.getDescendantsOfKind(SyntaxKind.Identifier);
        PropertyDeclarations.forEach((currentNode: any) => {
            if (currentNode.getKind() === SyntaxKind.PropertyDeclaration && !isGetVarDeclar && currentNode.getName() == varName) {
                res.add(currentNode.getText());
                isGetVarDeclar = true;
            }
        });
        VariableDeclarations.forEach((currentNode: any) => {
            if ((currentNode.getKind() === SyntaxKind.VariableDeclaration) && currentNode.getName() === varName) {
                let declareRes = this.SlicingDeclareNode(varName, currentNode, filePath, false);
                declareRes.forEach(item => res.add(item));
                this.addNeedFindType(currentNode);
                res.add(currentNode.getText());
                isGetVarDeclar = true;
            }
        });
        LabeledStatements.forEach((currentNode: any) => {
            if (currentNode.getKind() === SyntaxKind.LabeledStatement && currentNode.getLabel().getText() == varName) {
                res.add(currentNode.getText());
                isGetVarDeclar = true;
            }
        });
        Identifiers.forEach((currentNode: any) => {
            const currentNodeParent = currentNode.getParent();
            if (currentNode.getKind() === SyntaxKind.Identifier &&
                currentNode.getText() === varName &&
                currentNodeParent && currentNodeParent.getKind() === SyntaxKind.CallExpression && this.isArg(currentNode)) {
                let expr = currentNodeParent.getExpression();
                if (paramFunctionName == "" || expr.getText() != paramFunctionName) {
                    let tempSet = this.trackCallExpression2(currentNode, filePath, false, isparam);
                    tempSet.forEach(item => res.add(item));
                }
            }
            else if (currentNode.getKind() === SyntaxKind.Identifier &&
                currentNode.getText() === varName) {
                let tempSet = this.trackIdentifier2(currentNode, varName, filePath);
                tempSet.forEach(item => res.add(item));
            }
        });
        if (!isGetVarDeclar) {
            const rootParent = root.getParent();
            if (root.getKind() != SyntaxKind.SourceFile && rootParent && (rootParent.getKind() === SyntaxKind.FunctionDeclaration || rootParent.getKind() === SyntaxKind.MethodDeclaration) && !isparam) {
                const args = rootParent.getParameters();
                args.forEach((arg: any) => {
                    if (arg.getName() === varName) {
                        isGetVarDeclar = true;
                        this.addNeedFindType(arg);
                        res.add(arg.getText());
                    }
                });
            }
            if (!isGetVarDeclar) {
                let decNode = this.GetDeclarationNode(varName, root);
                if (decNode != null) {
                    res.add(decNode.getText());
                }
            }
        }
        const popped = this.callStack.pop();
        if (popped !== currentCallPath) {
            console.warn(`message,Message:  ${currentCallPath}, message ${popped}`);
            this.callStack = [];
        }
        this.processingStack.delete(recursionKey);
        const newDepth = (this.recursionDepth.get(recursionKey) || 0) - 1;
        if (newDepth <= 0) {
            this.recursionDepth.delete(recursionKey);
        }
        else {
            this.recursionDepth.set(recursionKey, newDepth);
        }
        return res;
    }
    public trackVarDec(node: any, isObject: boolean, targetName: string) {
        let ans = new Set();
        if (isObject) {
            let targetAttritubeName = "";
            if (node.getChildCount() > 0) {
                let children = node.getChildren();
                let tempNode: any[] = [];
                while (children.length > 0) {
                    for (const c of children) {
                        if (c.getKind() === SyntaxKind.PropertyAssignment) {
                            let cs = c.getChildren();
                            for (const cc of cs) {
                                if (cc.getKind() === SyntaxKind.Identifier) {
                                    if (cc.getText() == targetName) {
                                        targetAttritubeName = c.getName();
                                    }
                                }
                            }
                        }
                        if (c.getKind() === SyntaxKind.Identifier) {
                            continue;
                        }
                        if (c.getChildCount() > 0) {
                            tempNode = [...tempNode, ...c.getChildren()];
                        }
                    }
                    children = tempNode;
                    tempNode = [];
                }
            }
            if (targetAttritubeName != "") {
                if (this.isLocalVariable(node)) {
                    let res = this.getNodeByKind(this.getRootNode(node), SyntaxKind.PropertyAccessExpression);
                    for (const n of res) {
                        if (n.getText() != node.getName() + "." + targetAttritubeName)
                            continue;
                        let tempN = n;
                        while (tempN.getParent()) {
                            let kind = tempN.getKind();
                            if (BLOCK_KINDS.includes(kind)) {
                                break;
                            }
                            else if (kind === SyntaxKind.ExpressionStatement || kind === SyntaxKind.VariableDeclaration) {
                                ans.add(tempN.getText());
                                break;
                            }
                            tempN = tempN.getParent();
                        }
                    }
                }
                else {
                    let rootNode = node.getParent();
                    while (rootNode.getParent()) {
                        rootNode = rootNode.getParent();
                    }
                    let res = this.getNodeByKind(rootNode, SyntaxKind.PropertyAccessExpression);
                    for (const n of res) {
                        if (n.getText() != node.getName() + "." + targetAttritubeName)
                            continue;
                        let tempN = n;
                        while (tempN.getParent()) {
                            let kind = tempN.getKind();
                            if (BLOCK_KINDS.includes(kind)) {
                                break;
                            }
                            else if (kind === SyntaxKind.ExpressionStatement || kind === SyntaxKind.VariableDeclaration) {
                                ans.add(tempN.getText());
                                break;
                            }
                            tempN = tempN.getParent();
                        }
                    }
                }
            }
        }
        return ans;
    }
    public getNodeByKind(root: any, kind: SyntaxKind): any[] {
        let children = root.getChildren();
        let tempNode: any[] = [];
        var res: any[] = [];
        if (root.getChildCount() == 0)
            return res;
        while (children.length > 0) {
            for (const c of children) {
                if (c.getKind() == kind) {
                    res.push(c);
                }
                if (c.getChildCount() > 0) {
                    tempNode = [...tempNode, ...c.getChildren()];
                }
            }
            children = tempNode;
            tempNode = [];
        }
        return res;
    }
    public trackFparam(expression: any, filePath: string, isParam: boolean = false) {
        let res = new Set();
        console.log(`expr parent:${expression.getParent().getText()}`);
        const args = expression.getArguments();
        for (const arg of args) {
            let argKind = arg.getKind();
            if (argKind === SyntaxKind.Identifier) {
                let rootNode = this.getRootNode(expression);
                let tempSet = this.getBlockNameVar(rootNode, arg.getText(), filePath, isParam);
                tempSet.forEach(item => res.add(item));
            }
            else if (argKind === SyntaxKind.ElementAccessExpression) {
                let targetName = arg.getExpression().getText();
                let isClass = false;
                if (targetName.includes(".")) {
                    let tempL = targetName.split(".");
                    targetName = tempL[tempL.length - 1];
                    isClass = true;
                }
                let rootNode = this.getRootNode(expression, isClass);
                let tempSet = this.getBlockNameVar(rootNode, targetName, filePath);
                tempSet.forEach(item => res.add(item));
            }
            else if (argKind === SyntaxKind.PropertyAccessExpression) {
                let targetName = arg.getExpression().getText();
                if (targetName == "this") {
                    targetName = arg.getName();
                }
                let rootNode = this.getRootNode(expression);
                let tempSet = this.getBlockNameVar(rootNode, targetName, filePath);
                tempSet.forEach(item => res.add(item));
            }
            else if (argKind === SyntaxKind.CallExpression) {
                let definedData = this.projectDataLoader.findProjectDefined(arg);
                definedData.forEach(item => res.add(item));
            }
            else if (argKind === SyntaxKind.AwaitExpression) {
                let callExpr = arg.getExpression();
                if (callExpr.isKind(SyntaxKind.CallExpression)) {
                    let definedData = this.projectDataLoader.findProjectDefined(callExpr);
                    definedData.forEach(item => res.add(item));
                }
            }
        }
        let exprParent = expression.getParent();
        let expressionText = exprParent && exprParent.getKind() === SyntaxKind.VariableDeclaration ? exprParent.getText() : (expression ? expression.getText() : '');
        if (res.has(expressionText)) {
            res.delete(expressionText);
            res.add(expressionText);
        }
        return res;
    }
    public isNameEquip(name: string, node: any) {
        if (node.getKind() === SyntaxKind.VariableDeclaration || node.getKind() === SyntaxKind.FunctionDeclaration ||
            node.getKind() === SyntaxKind.MethodDeclaration) {
            if (node.getName() == name) {
                return true;
            }
        }
        else if (node.getKind() === SyntaxKind.ArrowFunction) {
        }
        else if (node.getKind() === SyntaxKind.CallExpression) {
            if (node.getExpression().getText() == name) {
                return true;
            }
        }
        else if (node.getKind() === SyntaxKind.LabeledStatement) {
            if (node.getLabel().getText() == name) {
                return true;
            }
        }
        return false;
    }
    public trackVarDeclaration(node: any, filePath: string) {
        let rootNode = this.getRootNode(node);
        if (rootNode.getText().length > limitBlockLength) {
            let ans = this.GetDeclarationNode(node.getText(), rootNode);
            let returnSet = new Set();
            if (ans != null) {
                returnSet.add(ans.getText());
            }
            return returnSet;
        }
        let varName = node.getText();
        let ans = this.getBlockNameVar(rootNode, varName, filePath);
        return ans;
    }
    public SpecialLogic(node: any) {
        void node;
    }
    public GetDeclarationNode(targetName: string, rootNode: any, needTrackRoot: boolean = true) {
        let tempNode = rootNode;
        while (tempNode) {
            let varLists = tempNode.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
            for (const item of varLists) {
                const itemType = item.getType ? item.getType() : null;
                if (this.isNameEquip(targetName, item) && itemType && itemType.getText() != "mask") {
                    this.SpecialLogic(item);
                    this.addNeedFindType(item);
                    return item;
                }
            }
            let Propertys = tempNode.getDescendantsOfKind(SyntaxKind.PropertyDeclaration);
            for (const p of Propertys) {
                if (p.getName() == targetName) {
                    this.addNeedFindType(p);
                    return p;
                }
            }
            let params = tempNode.getDescendantsOfKind(SyntaxKind.Parameter);
            for (const p of params) {
                const param = p as ParameterDeclaration;
                const paramType = param.getType ? param.getType() : null;
                if (param.getName() === targetName && paramType && !paramType.getText().includes(mask)) {
                    this.addNeedFindType(param);
                    return param;
                }
            }
            if (!needTrackRoot) {
                break;
            }
            tempNode = tempNode.getParent();
        }
        return null;
    }
    public getNearestFunction(root: any, targetName: string) {
        let ans: Set<string> = new Set();
        let tempNode = root;
        while (tempNode) {
            let functionDecNode = tempNode.getDescendantsOfKind(SyntaxKind.FunctionDeclaration).filter((item: any) => item.getName() == targetName);
            if (functionDecNode.length > 0) {
                functionDecNode.forEach((item: any) => {
                    const returnType = item.getReturnType ? fixType(item.getReturnType().getText()) : undefined;
                    const functionName = item.getName ? item.getName() : undefined;
                    const parameters = item.getParameters ? item.getParameters() : [];
                    let params = parameters.map((item: any) => {
                        let pType = fixType(item.getType().getText());
                        let pName = item.getName();
                        if (pType == "any") {
                            return `${pName}`;
                        }
                        return `${pName}:${pType}`;
                    });
                    let signature = `function ${functionName}(${params.join(',')})`;
                    if (returnType == 'any' || returnType == 'undefined') {
                        signature = signature;
                    }
                    else {
                        signature = signature + `: ${returnType}`;
                    }
                    ans.add(signature);
                });
                return ans;
            }
            tempNode = tempNode.getParent();
        }
        return ans;
    }
    public SlicingDeclareNode(targetName: string, node: any, filePath: string, canTrackIdentify: boolean = true) {
        let ans = new Set();
        const varDecl = node as VariableDeclaration;
        const initializer = varDecl.getInitializer();
        let alreadyFind: Set<string> = new Set();
        if (initializer) {
            let initKind = initializer.getKind();
            if (FUNCTION_KINDS.includes(initKind) || initKind === SyntaxKind.ArrowFunction) {
            }
            else if (initKind === SyntaxKind.CallExpression) {
                let initCallData = this.trackCallExpression2(initializer, filePath);
                initCallData.forEach(item => ans.add(item));
                let tempd = this.getKnowledgeDefined(initializer);
                tempd.forEach(item => ans.add(item));
            }
            initializer.forEachDescendant((n: any) => {
                if (n.getKind() === SyntaxKind.Identifier &&
                    n.getText() != targetName &&
                    canTrackIdentify && !alreadyFind.has(n.getText())) {
                    let vAns = this.trackVarDeclaration(n, filePath);
                    alreadyFind.add(n.getText());
                    vAns.forEach(item => ans.add(item));
                }
                else if (n.getKind() === SyntaxKind.CallExpression && !alreadyFind.has(n.getText())) {
                    let tempd = this.getKnowledgeDefined(n);
                    alreadyFind.add(n.getText());
                    tempd.forEach(item => ans.add(item));
                }
            });
        }
        return ans;
    }
    public getKnowledgeDefined(callExpreNode: any) {
        let data0 = this.projectDataLoader.findProjectDefined(callExpreNode);
        let ans = new Set();
        for (const d of data0) {
            ans.add(d);
        }
        if (data0.size == 0) {
            let data = this.projectDataLoader.findFunction(callExpreNode);
            data.forEach(item => {
                ans.add(item);
            });
        }
        return ans;
    }
    public isArg(identify: any): boolean {
        const callExpr = identify.getFirstAncestorByKind(SyntaxKind.CallExpression);
        if (!callExpr)
            return false;
        if (callExpr.getExpression() === identify) {
            return false;
        }
        const args = callExpr.getArguments();
        if (args.some((arg: any) => arg === identify)) {
            return true;
        }
        return false;
    }
}
