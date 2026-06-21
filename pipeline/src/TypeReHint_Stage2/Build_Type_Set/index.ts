import { Build_Type_Set } from "./Build_Type_Set";
import { Logger, LogLevel } from "../utils/logMethods";
import { Select_Types } from "./Select_Types";
const args = process.argv.slice(2);
const logger = new Logger({
    level: LogLevel.DEBUG,
    format: "{time} [{level}] > {message}",
});
function parseArgs(args: string[]) {
    let command = "";
    let projectRoot = "";
    let preType = "";
    let k = "";
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--build") {
            command = "build";
            if (i + 1 >= args.length) {
                logger.error("error: --build message [project]");
                return null;
            }
            projectRoot = args[i + 1] as string;
            i += 1;
        }
        else if (arg === "--select") {
            command = "select";
            if (i + 2 >= args.length) {
                logger.error("error: --select message [pre_type] message [k]");
                return null;
            }
            preType = args[i + 1] as string;
            k = args[i + 2] as string;
            i += 2;
        }
        else if (arg && arg.startsWith("-")) {
            logger.error(`error: message ${arg}`);
            return null;
        }
    }
    return { command, projectRoot, preType, k };
}
const parsedArgs = parseArgs(args);
if (!parsedArgs) {
    logger.error("Usage:");
    logger.error("  message: tsx index.ts --build [project]");
    logger.error("  message:     tsx index.ts --select [pre_type] [k]");
    logger.error("message:");
    logger.error("  --build          - message");
    logger.error("    [project]        - Project rootmessage");
    logger.error("  --select         - message");
    logger.error("    [pre_type]       - message");
    logger.error("    [k]              - message");
    process.exit(1);
}
const { command, projectRoot, preType, k } = parsedArgs;
if (command === "build") {
    if (!projectRoot) {
        logger.error("error: message");
        logger.error("Usage: tsx index.ts --build [project]");
        process.exit(1);
    }
    logger.info(`[Build_Type_Set] Start building type set...`);
    logger.info(`[Build_Type_Set] Project root: ${projectRoot}`);
    try {
        Build_Type_Set(projectRoot);
        logger.info(`[Build_Type_Set] Type set build complete!message: ./output/type_set.json`);
    }
    catch (error) {
        logger.error(`[Build_Type_Set] error: ${error}`);
        process.exit(1);
    }
}
else if (command === "select") {
    if (!preType || !k) {
        logger.error("error: message");
        logger.error("Usage: tsx index.ts --select [pre_type] [k]");
        process.exit(1);
    }
    logger.info(`[Select_Types] message...`);
    logger.info(`[Select_Types] message: ${preType}`);
    logger.info(`[Select_Types] message: ${k}`);
    try {
        const kNumber = Number(k);
        if (isNaN(kNumber)) {
            logger.error("error: k message");
            process.exit(1);
        }
        Select_Types(preType, kNumber);
        logger.info(`[Select_Types] Done!`);
    }
    catch (error) {
        logger.error(`[Select_Types] error: ${error}`);
        process.exit(1);
    }
}
else {
    logger.error("error: message --build message --select message");
    process.exit(1);
}
