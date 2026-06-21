import { TSTypeObject } from './TSTypeObject';
import * as fs from 'fs';
import * as path from 'path';
import { Worker } from 'worker_threads';
import * as os from 'os';

function runWorker(preStr: string, labelStr: string): Promise<{
    pre?: string;
    label?: string;
    match: boolean;
}>{
    return new Promise((resolve, reject) => {
        const worker = new Worker(path.resolve(__dirname, '../dist/TSTypeWorker.js'), {
            workerData: { preStr, labelStr }
        });
        worker.on('message', (msg) => resolve(msg));
        worker.on('error', reject);
        worker.on('exit', (code) => {
            if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
        });
    });
}

async function demo(){
    const num_core = 16;
    const pre = new TSTypeObject('Array<number>');

    const jsonPath = path.resolve(__dirname, '../data/type_set.json');
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const labelsRaw: string[] = JSON.parse(raw)
    const labels: string[] = labelsRaw.map((s) => s.replace(/import\([^)]*\)\./g, ''))

    const concurrency = Math.max(1, Math.min(os.cpus()?.length || 1, num_core));
    const queue: Array<Promise<void>> = [];

    let idx = 0;
    const next = async () => {
        if (idx >= labels.length) return;
        const current = idx++;
        const lbl = labels[current];
        const p = runWorker(pre.getTypeObject()?.typeStr || '', lbl)
            .then((res) => {
                console.log('[pre]', res.pre, 'vs', '[label]', res.label, '=>', res.match);
            })
            .catch((err) => {
                console.error('Worker error for label:', lbl, err);
            })
            .finally(() => {
                return next();
            });
        return p;
    };

    for (let i = 0; i < concurrency; i++){
        const p = next();
        if (p) queue.push(p);
    }

    await Promise.all(queue);
}


demo()
