import { initializeProjectWithConfig } from "./ProjectReader";
import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import { Logger, LogLevel } from "./logMethods";
const logger = new Logger({
    level: LogLevel.DEBUG,
    format: "{time} [{level}] > {message}",
});
export function getFiles(projectPath: string, outDir: string) {
    const { project } = initializeProjectWithConfig(projectPath);
    const files = project.getSourceFiles();
    const filePaths = files.map(f => f.getFilePath());
    const res_dir = outDir;
    if (!fs.existsSync(res_dir)) {
        fs.mkdirSync(res_dir, { recursive: true });
    }
    const outputPath = path.join(res_dir, 'project_files.json');
    fs.writeFileSync(outputPath, JSON.stringify(filePaths, null, 2), 'utf-8');
    logger.info(`Source file paths saved to ${outputPath}`);
}
function collectFilesFromRepos(reposRoot: string, outDir: string) {
    if (!fs.existsSync(reposRoot) || !fs.statSync(reposRoot).isDirectory()) {
        logger.error(`--repos messageDirectory: ${reposRoot}`);
        process.exit(1);
    }
    const subDirs = fs.readdirSync(reposRoot, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => path.join(reposRoot, d.name));
    const allFilePaths: string[] = [];
    for (const projPath of subDirs) {
        try {
            const { project } = initializeProjectWithConfig(projPath);
            const files = project.getSourceFiles();
            for (const f of files) {
                allFilePaths.push(f.getFilePath());
            }
            logger.info(`Project: ${projPath}, message: ${files.length}`);
        }
        catch (err) {
            logger.error((err as Error).message);
            logger.error(`Project(message): ${projPath}`);
        }
    }
    const uniquePaths = Array.from(new Set(allFilePaths)).sort();
    const res_dir = outDir;
    if (!fs.existsSync(res_dir)) {
        fs.mkdirSync(res_dir, { recursive: true });
    }
    const outputPath = path.join(res_dir, 'project_files.json');
    fs.writeFileSync(outputPath, JSON.stringify(uniquePaths, null, 2), 'utf-8');
    logger.info(`message ${uniquePaths.length} message ${outputPath}`);
}
async function main() {
    const args = process.argv.slice(2);
    let projectPathArg: string | null = null;
    let reposPathArg: string | null = null;
    let outDirArg: string = './project_files';
    for (let i = 0; i < args.length; i++) {
        const arg = args[i]!;
        if (arg === '--projectPath' && i + 1 < args.length) {
            projectPathArg = args[i + 1]!;
            i++;
        }
        else if (arg === '--repos' && i + 1 < args.length) {
            reposPathArg = args[i + 1]!;
            i++;
        }
        else if (arg === '--outdir' && i + 1 < args.length) {
            outDirArg = args[i + 1]!;
            i++;
        }
        else if (!arg.startsWith('--') && projectPathArg === null && reposPathArg === null) {
            projectPathArg = arg;
        }
        else {
            logger.error(`message: ${arg}`);
            logger.info('Usage: ts-node getFiles.ts --projectPath <path_to_project> | --repos <repos_directory> [--outdir <output_directory>]');
            process.exit(1);
        }
    }
    if ((projectPathArg ? 1 : 0) + (reposPathArg ? 1 : 0) !== 1) {
        logger.error('message --projectPath message --repos message');
        logger.info('Usage: ts-node getFiles.ts --projectPath <path_to_project> | --repos <repos_directory> [--outdir <output_directory>]');
        process.exit(1);
    }
    if (projectPathArg) {
        getFiles(projectPathArg, outDirArg);
        return;
    }
    collectFilesFromRepos(reposPathArg!, outDirArg);
}
main().catch(error => {
    logger.error("Unhandled error:", error);
    process.exit(1);
});
