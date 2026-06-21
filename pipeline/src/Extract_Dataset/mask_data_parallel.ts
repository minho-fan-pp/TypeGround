import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Worker } from 'worker_threads';
import { createWriteStream } from 'fs';
import { createGzip } from 'zlib';
interface DataMeta {
    file: string;
    name: string;
    loc: string;
    loc_cat: 'var' | 'ret' | 'arg';
    type?: string;
}
interface MaskedData {
    id: string;
    maskedText: string;
    type: string;
}
interface WorkerResult {
    success: boolean;
    maskedData?: MaskedData | null;
    error?: string;
    metaId?: string;
}
function load_data_metas(data_metas_path: string): DataMeta[] {
    const raw = fs.readFileSync(data_metas_path, 'utf8');
    return JSON.parse(raw);
}
function ensure_output_dir(output_path: string) {
    const dir = path.dirname(output_path);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
function write_masked_results(output_path: string, results: MaskedData[]) {
    ensure_output_dir(output_path);
    fs.writeFileSync(output_path, JSON.stringify(results, null, 2), 'utf8');
}
function write_masked_results_jsonl(result: MaskedData, writeStream: NodeJS.WritableStream) {
    writeStream.write(JSON.stringify(result) + '\n', 'utf8');
}
function mask_data_parallel(base_repo_dir: string, data_metas_path: string, output_path: string, mask_str: string, num_workers?: number, segment_len: number = 10) {
    const rawDataMetas = load_data_metas(data_metas_path);
    const logInfo = (...args: any[]) => {
        console.log(...args);
    };
    const logWarn = (..._args: any[]) => {
    };
    const dataMetas = rawDataMetas.filter(meta => {
        const typeVal = meta.type;
        if (typeof typeVal !== 'string') {
            return true;
        }
        return typeVal.trim().toLowerCase() !== 'any';
    }).slice(0, 1000);
    const skippedCount = rawDataMetas.length - dataMetas.length;
    if (skippedCount > 0) {
        logInfo(`message ${skippedCount} message any message`);
    }
    if (dataMetas.length === 0) {
        logInfo('message,message');
        const lowerPath = output_path.toLowerCase();
        const useJsonl = lowerPath.endsWith('.jsonl') || lowerPath.endsWith('.jsonl.gz');
        const useCompression = lowerPath.endsWith('.gz');
        if (useJsonl) {
            ensure_output_dir(output_path);
            if (useCompression) {
                return new Promise<void>((resolve, reject) => {
                    const fileStream = createWriteStream(output_path);
                    const gzipStream = createGzip();
                    gzipStream.pipe(fileStream);
                    fileStream.on('finish', () => resolve());
                    fileStream.on('error', (err) => reject(err));
                    gzipStream.on('error', (err) => reject(err));
                    gzipStream.end();
                });
            }
            else {
                fs.writeFileSync(output_path, '', 'utf8');
                return Promise.resolve();
            }
        }
        else {
            write_masked_results(output_path, []);
            return Promise.resolve();
        }
    }
    const workerCount = Math.min(num_workers || os.cpus().length, dataMetas.length);
    const errors: string[] = [];
    const errorLogPath = `${output_path}.error.log`;
    let errorLogStream: fs.WriteStream | null = null;
    const logError = (message: string) => {
        errors.push(message);
        if (!errorLogStream) {
            ensure_output_dir(errorLogPath);
            errorLogStream = createWriteStream(errorLogPath, { flags: 'w' });
            errorLogStream.on('error', (err: Error) => {
                console.error(`errormessage: ${err.message}`);
            });
        }
        errorLogStream.write(`[${new Date().toISOString()}] ${message}\n`, 'utf8');
    };
    let processedCount = 0;
    let assignedIndex = 0;
    let completedWorkers = 0;
    let resultCount = 0;
    const lowerPath = output_path.toLowerCase();
    const useJsonl = lowerPath.endsWith('.jsonl') || lowerPath.endsWith('.jsonl.gz');
    const useCompression = lowerPath.endsWith('.gz');
    const maskedResults: MaskedData[] = [];
    let writeStream: NodeJS.WritableStream | null = null;
    let gzipStream: NodeJS.ReadWriteStream | null = null;
    let fileStream: fs.WriteStream | null = null;
    if (useJsonl) {
        ensure_output_dir(output_path);
        fileStream = createWriteStream(output_path);
        if (useCompression) {
            gzipStream = createGzip();
            gzipStream.pipe(fileStream);
            writeStream = gzipStream;
        }
        else {
            writeStream = fileStream;
        }
        fileStream.on('error', (err: Error) => {
            console.error(`errors: ${err.message}`);
        });
        if (gzipStream) {
            gzipStream.on('error', (err: Error) => {
                console.error(`errors: ${err.message}`);
            });
        }
    }
    const formatDesc = useCompression
        ? 'JSONL + GZIP (message)'
        : useJsonl
            ? 'JSONL (message)'
            : 'JSON (message)';
    logInfo(`message ${dataMetas.length} message,message ${workerCount} message worker processes`);
    logInfo(`message: ${formatDesc}`);
    return new Promise<void>((resolve, reject) => {
        const workers: Worker[] = [];
        const workerPath = "/mnt/Manytypes4Ts/manytypes4-ts/pipeline/dist/Extract_Dataset/mask_data_worker.js";
        function assignWork(worker: Worker): boolean {
            if (assignedIndex >= dataMetas.length) {
                return false;
            }
            const meta = dataMetas[assignedIndex++];
            worker.postMessage({ dataMeta: meta });
            return true;
        }
        function finalize() {
            if (useJsonl && writeStream && fileStream) {
                fileStream.once('finish', () => {
                    finishOutput();
                });
                fileStream.once('error', (err: Error) => {
                    reject(new Error(`errors: ${err.message}`));
                });
                writeStream.end();
            }
            else {
                write_masked_results(output_path, maskedResults);
                finishOutput();
            }
            function finishOutput() {
                const done = () => {
                    if (errors.length > 0) {
                        logWarn(`Processing complete,message ${errors.length} errors,first 10 items:`);
                        errors.slice(0, 10).forEach(err => logWarn(`  - ${err}`));
                        if (errors.length > 10) {
                            logWarn(`  ... message ${errors.length - 10} errors`);
                        }
                        if (errorLogStream) {
                            logWarn(`errormessage: ${errorLogPath}`);
                        }
                    }
                    logInfo(`Processing complete!message ${processedCount} message,message ${resultCount} message`);
                    if (useCompression) {
                        logInfo(`message: ${output_path}`);
                    }
                    resolve();
                };
                if (errorLogStream) {
                    errorLogStream.end(() => done());
                }
                else {
                    done();
                }
            }
        }
        for (let i = 0; i < workerCount; i++) {
            const worker = new Worker(workerPath, {
                workerData: { baseRepoDir: base_repo_dir, maskStr: mask_str, segmentLen: segment_len }
            });
            worker.on('message', (result: WorkerResult) => {
                processedCount++;
                if (result.success) {
                    if (result.maskedData) {
                        if (useJsonl && writeStream) {
                            write_masked_results_jsonl(result.maskedData, writeStream);
                            resultCount++;
                        }
                        else {
                            maskedResults.push(result.maskedData);
                            resultCount++;
                        }
                    }
                    else {
                        logError(`message ${result.metaId ?? ''}: message,message`);
                    }
                }
                else if (result.error) {
                    logError(`message ${result.metaId ?? ''}: ${result.error}`);
                }
                logInfo(`message: ${processedCount}/${dataMetas.length} (${((processedCount / dataMetas.length) * 100).toFixed(2)}%)`);
                const hasWork = assignWork(worker);
                if (!hasWork) {
                    completedWorkers++;
                    worker.terminate();
                    if (completedWorkers === workerCount) {
                        finalize();
                    }
                }
            });
            worker.on('error', (error) => {
                logError(`Worker error: ${error.message}`);
                completedWorkers++;
                worker.terminate();
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
        for (const worker of workers) {
            const assigned = assignWork(worker);
            if (!assigned) {
                completedWorkers++;
                worker.terminate();
            }
        }
        if (completedWorkers === workerCount) {
            finalize();
        }
    });
}
function parseArgs() {
    const args = process.argv.slice(2);
    const opts: Record<string, string> = {
        mask_str: "<mask>",
        segment_len: "10",
    };
    for (let i = 0; i < args.length; i++) {
        if (args[i] && args[i]?.startsWith('--')) {
            const key = args[i]?.replace(/^--/, '');
            if (i + 1 < args.length && args[i + 1] && !args[i + 1]?.startsWith('--')) {
                opts[key ?? ""] = args[i + 1] ?? "";
                i++;
            }
            else {
                opts[key ?? ""] = "true";
            }
        }
    }
    return opts;
}
async function main() {
    const opts = parseArgs();
    if (!opts.base_repo_dir || !opts.data_metas_path || !opts.output_path) {
        console.error("Usage: npx tsx mask_data_parallel.ts --base_repo_dir BASE_REPO_DIR --data_metas_path DATA_METAS_PATH --output_path OUTPUT_PATH [--mask_str '<mask>'] [--num_workers 4] [--segment_len N]");
        console.error("message:");
        console.error("  - .jsonl      -> JSONL message(message,message)");
        console.error("  - .jsonl.gz   -> JSONL + GZIP message(message,message)");
        console.error("  - .json       -> JSON message(message,message)");
        process.exit(1);
    }
    const numWorkers = opts.num_workers ? parseInt(opts.num_workers, 10) : undefined;
    if (numWorkers !== undefined && (isNaN(numWorkers) || numWorkers <= 0)) {
        console.error("--num_workers message");
        process.exit(1);
    }
    let segment_len_num = 10;
    if (opts.segment_len && !isNaN(Number(opts.segment_len))) {
        segment_len_num = Number(opts.segment_len);
    }
    try {
        await mask_data_parallel(opts.base_repo_dir, opts.data_metas_path, opts.output_path, opts.mask_str || "<mask>", numWorkers, segment_len_num);
    }
    catch (error) {
        console.error("Processing failed:", error);
        process.exit(1);
    }
}
if (require.main === module) {
    main().catch(error => {
        console.error("Unhandled error:", error);
        process.exit(1);
    });
}
