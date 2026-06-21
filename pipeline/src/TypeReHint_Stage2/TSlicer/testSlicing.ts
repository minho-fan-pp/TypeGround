import { TSlicer } from "./SlicingClass";
import { Project, SyntaxKind } from "ts-morph";
import { CodeData, DataType } from "../utils/typeDefined";
import { logger } from "../utils/logMethods";
function test() {
    const path = "./test/example.ts";
    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(path);
    var isFoundTestNode = false;
    let codeSlicer = new TSlicer(path, "./testKnowledgebase");
    var countNo = 0;
    sourceFile.forEachDescendant(node => {
        if (node.getKind() === SyntaxKind.VariableDeclaration && node.getText() == `testIt: string = "just a test for slicing"`) {
            let data: CodeData = { node: node, type: "test", filePath: path, dataType: DataType.Var };
            data.node.setType("mask");
            let ans = codeSlicer.Slicing(data);
            logger.info("-----------------------------");
            logger.debug("\n" + ans.code.replace("mask", "<mask>"));
        }
    });
}
test();
