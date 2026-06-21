import { Logger, LogLevel } from "./utils/logMethods";
import { Def_Use, Init_Def_Use } from "./Def_Use";
import { GetProjectFileTypeHints } from "./TypeReHint_Stage2";
import { Package_Maker } from './Package_Maker/Package_Maker';
const logger = new Logger({
    level: LogLevel.DEBUG,
    format: "{time} [{level}] > {message}",
});
async function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        logger.info("Usage: tsx index.ts [--Def_Use] [-Init_Def_Use] [--Package_Maker] [project_root_directory] [output_path]");
        logger.info("Example: tsx index.ts --Def_Use ./my-project ./output");
        logger.info("Example: tsx index.ts -Init_Def_Use ./output");
        logger.info("Example: tsx index.ts --Package_Maker ./packages-directory");
        logger.info("Example: tsx index.ts ./my-project ./output");
        logger.info("Note: Default (no flag) requires: project_root_directory output_path");
        logger.info("      --Def_Use: Enable Def_Use functionality (requires: project_root_directory output_dir)");
        logger.info("      -Init_Def_Use: Enable Init_Def_Use functionality (requires: output_dir)");
        logger.info("      --Package_Maker: Enable Package_Maker functionality (requires: packages_directory)");
        process.exit(1);
    }
    let projectPath: string | undefined;
    let outputPath: string | undefined;
    let packagesDirectory: string | undefined;
    let enableDefuse = false;
    let enableInitDefuse = false;
    let enablePackageMaker = false;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i]!;
        if (arg === '--Def_Use') {
            enableDefuse = true;
            if (i + 2 >= args.length) {
                logger.error("Error: --Def_Use requires exactly two parameters: [project_root_directory] [output_path]");
                process.exit(1);
            }
            projectPath = args[i + 1]!;
            outputPath = args[i + 2]!;
            i += 2;
        }
        else if (arg === '-Init_Def_Use') {
            enableInitDefuse = true;
            if (i + 1 >= args.length) {
                logger.error("Error: -Init_Def_Use requires exactly one parameter: [output_path]");
                process.exit(1);
            }
            outputPath = args[i + 1]!;
            i += 1;
        }
        else if (arg === '--Package_Maker') {
            enablePackageMaker = true;
            if (i + 1 >= args.length) {
                logger.error("Error: --Package_Maker requires exactly one parameter: [packages_directory]");
                process.exit(1);
            }
            packagesDirectory = args[i + 1]!;
            i += 1;
        }
        else if (!projectPath) {
            projectPath = arg;
        }
        else if (!outputPath) {
            outputPath = arg;
        }
    }
    if (!projectPath && !enableInitDefuse && !enablePackageMaker) {
        logger.error("Error: project_root_directory is required (except when using -Init_Def_Use or --Package_Maker)");
        process.exit(1);
    }
    if (enableDefuse && (!projectPath || !outputPath)) {
        logger.error("Error: --Def_Use requires exactly two parameters: [project_root_directory] [output_path]");
        process.exit(1);
    }
    if (enableInitDefuse && !outputPath) {
        logger.error("Error: -Init_Def_Use requires exactly one parameter: [output_path]");
        process.exit(1);
    }
    if (enablePackageMaker && !packagesDirectory) {
        logger.error("Error: --Package_Maker requires exactly one parameter: [packages_directory]");
        process.exit(1);
    }
    if (!enableDefuse && !enableInitDefuse && !enablePackageMaker) {
        if (projectPath && !outputPath) {
            logger.error("Error: output_path is required when running without flags (project_root_directory output_path)");
            process.exit(1);
        }
    }
    if (enableDefuse) {
        logger.info(`Running TypeReHint_Stage2 for project: ${projectPath}`);
        if (outputPath) {
            logger.info(`Output path: ${outputPath}`);
        }
        logger.info(`Def_Use: ENABLED`);
    }
    if (enableInitDefuse) {
        if (outputPath) {
            logger.info(`Output path: ${outputPath}`);
        }
        logger.info(`Init_Def_Use: ENABLED`);
    }
    if (enablePackageMaker) {
        if (packagesDirectory) {
            logger.info(`Packages directory: ${packagesDirectory}`);
        }
        logger.info(`Package_Maker: ENABLED`);
    }
    if (projectPath) {
        if (outputPath) {
            logger.info(`Output path: ${outputPath}`);
        }
    }
    try {
        if (enableDefuse && projectPath && outputPath) {
            logger.info("Executing Def_Use functionality...");
            await Def_Use(projectPath, outputPath);
            logger.info("Def_Use completed successfully");
            return;
        }
        if (enableInitDefuse && outputPath) {
            logger.info("Executing Init_Def_Use functionality...");
            await Init_Def_Use(outputPath);
            logger.info("Init_Def_Use completed successfully");
            return;
        }
        if (enablePackageMaker && packagesDirectory) {
            logger.info("Executing Package_Maker functionality...");
            await Package_Maker(packagesDirectory);
            logger.info("Package_Maker completed successfully");
            return;
        }
        if (projectPath && outputPath) {
            await GetProjectFileTypeHints(projectPath, outputPath);
            return;
        }
    }
    catch (error) {
        console.error("Error generating type hints:", error);
        process.exit(1);
    }
}
main().catch(error => {
    console.error("Unhandled error:", error);
    process.exit(1);
});
