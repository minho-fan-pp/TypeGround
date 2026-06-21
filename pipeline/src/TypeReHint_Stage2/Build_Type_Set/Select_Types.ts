import { join } from "path";
import * as path from "path";
import { Logger, LogLevel } from "../utils/logMethods";
import { TSTypeObject } from './TSTypeObject';
import * as fs from 'fs';
import { Worker } from 'worker_threads';
import * as os from 'os';
const logger = new Logger({
    level: LogLevel.DEBUG,
    format: "{time} [{level}] > {message}",
});
function runWorker(preStr: string, labelStr: string): Promise<{
    pre?: string;
    label?: string;
    match: boolean;
}> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(path.resolve(__dirname, '../../../dist/src/TypeReHint_Stage2/Build_Type_Set/TSTypeWorker.js'), {
            workerData: { preStr, labelStr }
        });
        worker.on('message', (msg) => resolve(msg));
        worker.on('error', reject);
        worker.on('exit', (code) => {
            if (code !== 0)
                reject(new Error(`Worker stopped with exit code ${code}`));
        });
    });
}
async function run_unmatchedset(pre_type: string, k: number, inputfp: string, outDir: string) {
    const num_core = 16;
    const pre = new TSTypeObject(pre_type);
    const jsonPath = path.resolve(inputfp);
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const labelsRaw: string[] = JSON.parse(raw);
    const labels: string[] = labelsRaw.map((s) => s.replace(/import\([^)]*\)\./g, ''));
    const concurrency = Math.max(1, Math.min(os.cpus()?.length || 1, num_core));
    const queue: Array<Promise<void>> = [];
    let unmatchedCount = 0;
    const unmatchedLabels: string[] = [];
    let shouldStop = false;
    let hasSaved = false;
    let idx = 0;
    const next = async () => {
        if (idx >= labels.length || shouldStop)
            return;
        const current = idx++;
        const lbl = labels[current] as string;
        const p = runWorker(pre.getTypeObject()?.typeStr || '', lbl)
            .then((res) => {
            if (!res.match) {
                unmatchedLabels.push(res.label || lbl);
                unmatchedCount++;
                if (unmatchedCount >= k && !shouldStop) {
                    shouldStop = true;
                    if (!hasSaved) {
                        hasSaved = true;
                        const outputPath = path.join(outDir, `unmatched_${k}.json`);
                        if (!fs.existsSync(outDir)) {
                            fs.mkdirSync(outDir, { recursive: true });
                        }
                        fs.writeFileSync(outputPath, JSON.stringify(unmatchedLabels, null, 2), 'utf8');
                        logger.info(`message: ${outputPath}`);
                    }
                }
            }
        })
            .catch((err) => {
            logger.error('Worker error for label:', lbl, err);
        })
            .finally(() => {
            if (!shouldStop) {
                return next();
            }
            return Promise.resolve();
        });
        return p;
    };
    for (let i = 0; i < concurrency; i++) {
        const p = next();
        if (p)
            queue.push(p);
    }
    await Promise.all(queue);
    if (unmatchedCount > 0 && unmatchedCount < k && !hasSaved) {
        const outputPath = path.join(outDir, `unmatched_${k}.json`);
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        fs.writeFileSync(outputPath, JSON.stringify(unmatchedLabels, null, 2), 'utf8');
        logger.info(`Processing complete,message ${unmatchedCount} message,message: ${outputPath}`);
    }
}
export async function Select_Types(pre_type: string, k: number) {
    const inputfp = join(path.dirname(__filename), "./output/type_set.json");
    const outDir = join(path.dirname(__filename), "./output");
    run_unmatchedset(pre_type, k, inputfp, outDir);
}
