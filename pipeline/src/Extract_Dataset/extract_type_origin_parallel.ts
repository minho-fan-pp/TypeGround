import * as fs from 'fs';
import * as path from 'path';
import { Worker } from 'worker_threads';
import * as os from 'os';
function get_files(fp: string): string[] {
    const rawdata = fs.readFileSync(fp, 'utf-8');
    const files = JSON.parse(rawdata);
    return files;
}
interface WorkerResult {
    success: boolean;
    types?: Record<string, any>[];
    error?: string;
    file: string;
}
function extract_data_parallel(fp: string, types_json_fp: string, reposPathPrefix: string = '/mnt/fmh_data/type4ts/repos/', numWorkers?: number) {
    let files = get_files(fp)
        .map((file: string) => file.replace('/mnt/fmh_data/type4ts/result/', '/mnt/fmh_data/type4ts/repos/'));
    const totalFiles = files.length;
    const workerCount = numWorkers || Math.min(os.cpus().length, totalFiles);
    console.log(`message ${totalFiles} message,message ${workerCount} message worker processes`);
    const allTypes: Record<string, any>[] = [];
    let processedCount = 0;
    let fileIndex = 0;
    let completedWorkers = 0;
    return new Promise<void>((resolve, reject) => {
        const workers: Worker[] = [];
        const errors: string[] = [];
        for (let i = 0; i < workerCount; i++) {
            const workerPath = "/mnt/Manytypes4Ts/manytypes4-ts/pipeline/dist/Extract_Dataset/extract_type_origin_worker.js";
            const worker = new Worker(workerPath, {
                workerData: { reposPathPrefix: reposPathPrefix }
            });
            worker.on('message', (result: WorkerResult) => {
                if (result.success) {
                    if (result.types) {
                        allTypes.push(...result.types);
                    }
                }
                else {
                    errors.push(`message ${result.file}: ${result.error || 'errors'}`);
                }
                processedCount++;
                console.log(`message: ${processedCount}/${totalFiles} (${((processedCount / totalFiles) * 100).toFixed(2)}%)`);
                let hasMoreWork = false;
                while (fileIndex < totalFiles && !hasMoreWork) {
                    const nextFile = files[fileIndex++];
                    if (nextFile && fs.existsSync(nextFile)) {
                        worker.postMessage({ file: nextFile, reposPathPrefix: reposPathPrefix });
                        hasMoreWork = true;
                    }
                    else {
                        if (nextFile) {
                            console.warn(`File does not exist: ${nextFile}, message`);
                        }
                    }
                }
                if (!hasMoreWork) {
                    completedWorkers++;
                    worker.terminate();
                    if (completedWorkers === workerCount) {
                        const typesJsonDir = path.dirname(types_json_fp);
                        if (!fs.existsSync(typesJsonDir)) {
                            fs.mkdirSync(typesJsonDir, { recursive: true });
                        }
                        fs.writeFileSync(types_json_fp, JSON.stringify(allTypes, null, 2), 'utf8');
                        if (errors.length > 0) {
                            console.warn(`Processing complete,message ${errors.length} errors:`);
                            errors.slice(0, 10).forEach(err => console.warn(`  - ${err}`));
                            if (errors.length > 10) {
                                console.warn(`  ... message ${errors.length - 10} errors`);
                            }
                        }
                        console.log(`Processing complete!message ${processedCount} message,message ${allTypes.length} message`);
                        resolve();
                    }
                }
            });
            worker.on('error', (error) => {
                console.error(`Worker error:`, error);
                errors.push(`Worker error: ${error.message}`);
                completedWorkers++;
                if (completedWorkers === workerCount) {
                    reject(new Error(`errors: ${error.message}`));
                }
            });
            worker.on('exit', (code) => {
                if (code !== 0) {
                    console.error(`Worker message,message: ${code}`);
                }
            });
            workers.push(worker);
        }
        for (let i = 0; i < Math.min(workerCount, totalFiles); i++) {
            const worker = workers[i];
            if (!worker)
                continue;
            let assigned = false;
            while (fileIndex < totalFiles && !assigned) {
                const file = files[fileIndex++];
                if (file && fs.existsSync(file)) {
                    worker.postMessage({ file: file, reposPathPrefix: reposPathPrefix });
                    assigned = true;
                }
                else {
                    if (file) {
                        console.warn(`File does not exist: ${file}, message`);
                    }
                }
            }
            if (!assigned) {
                completedWorkers++;
                worker.terminate();
            }
        }
        if (completedWorkers === workerCount) {
            const typesJsonDir = path.dirname(types_json_fp);
            if (!fs.existsSync(typesJsonDir)) {
                fs.mkdirSync(typesJsonDir, { recursive: true });
            }
            fs.writeFileSync(types_json_fp, JSON.stringify(allTypes, null, 2), 'utf8');
            console.log(`Processing complete!message ${processedCount} message,message ${allTypes.length} message`);
            resolve();
        }
    });
}
async function main() {
    const args = process.argv.slice(2);
    let files_fp = '';
    let types_res_fp = '';
    let repos_path_prefix = '/mnt/fmh_data/type4ts/repos/';
    let num_workers: number | undefined = undefined;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--files_fp' && i + 1 < args.length) {
            files_fp = args[i + 1] ?? '';
            i++;
        }
        else if (args[i] === '--types_res_fp' && i + 1 < args.length) {
            types_res_fp = args[i + 1] ?? '';
            i++;
        }
        else if (args[i] === '--repos_path_prefix' && i + 1 < args.length) {
            repos_path_prefix = args[i + 1] ?? '/mnt/fmh_data/type4ts/repos/';
            i++;
        }
        else if (args[i] === '--num_workers' && i + 1 < args.length) {
            num_workers = parseInt(args[i + 1] ?? '0', 10);
            if (isNaN(num_workers) || num_workers <= 0) {
                console.error('--num_workers message');
                process.exit(1);
            }
            i++;
        }
    }
    if (!files_fp || !types_res_fp) {
        console.error('Usage: ts-node extract_type_origin_parallel.ts --files_fp <project_files.json> --types_res_fp <output_types.json> [--repos_path_prefix <path_prefix>] [--num_workers <number>]');
        process.exit(1);
    }
    try {
        await extract_data_parallel(files_fp, types_res_fp, repos_path_prefix, num_workers);
    }
    catch (error) {
        console.error("Processing failed:", error);
        process.exit(1);
    }
}
main().catch(error => {
    console.error("Unhandled error:", error);
    process.exit(1);
});
