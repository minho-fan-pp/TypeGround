import { DealProjectDefined } from "./DefinedOfProject";
import { DealProjectUsed } from "./UseOfProject";
import { Logger, LogLevel } from "../utils/logMethods";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { initializeProjectWithConfig } from "../utils/ProjectReader";
const logger = new Logger({
    level: LogLevel.DEBUG,
    format: "{time} [{level}] > {message}",
});
export function Init_Def_Use(outputPath: string) {
    const projectFunctionDefineds = join(outputPath, "ProjectFunctions.json");
    const projectClassDefineds = join(outputPath, "ProjectClasses.json");
    const useFunctionPath = join(outputPath, "useFunction.json");
    mkdirSync(outputPath, { recursive: true });
    writeFileSync(projectFunctionDefineds, JSON.stringify([], null, 2) + '\n', 'utf8');
    writeFileSync(projectClassDefineds, JSON.stringify([], null, 2) + '\n', 'utf8');
    writeFileSync(useFunctionPath, JSON.stringify([], null, 2) + '\n', 'utf8');
}
export function Def_Use(projectRoot: string, outputPath: string) {
    const projectFunctionDefineds = join(outputPath, "ProjectFunctions.json");
    const useFunctionPath = join(outputPath, "useFunction.json");
    logger.info(`Start extracting project type information`);
    const { project } = initializeProjectWithConfig(projectRoot);
    const allFiles = project.getSourceFiles().map(sf => sf.getFilePath());
    DealProjectDefined(allFiles, projectFunctionDefineds);
    DealProjectUsed(allFiles, projectFunctionDefineds, useFunctionPath);
}
