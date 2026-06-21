import * as fs from 'fs';
import * as path from 'path';
import { Worker } from 'worker_threads';
import * as os from 'os';

interface PredictionItem {
  id: string;
  predictions: Array<[string, number]>;
}

interface LabelItem {
  file: string;
  name: string;
  loc_cat: string;
  line: number;
  type: string;
  type_cat: string;
}

interface ResultItem {
  id: string;
  type_cat: string;
  loc_cat: string;
  EM: boolean;
  BM: boolean;
}

interface TaskData {
  item: [PredictionItem, [string, string, string]];
  k: number;
  index: number;
}

interface WorkerResult {
  success: boolean;
  result?: {
    id: string;
    type_cat: string;
    loc_cat: string;
    EM: boolean;
    BM: boolean;
    index: number;
  };
  error?: string;
  index: number;
}

function readJsonOrJsonlFile<T>(filePath: string): T[] {
  if (filePath.endsWith('.jsonl')) {
    const lines = fs.readFileSync(filePath, 'utf-8')
      .split(/\r?\n/)
      .filter(line => line.trim().length > 0);
    return lines.map(line => JSON.parse(line));
  } else if (filePath.endsWith('.json')) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } else {
    throw new Error(`Unsupported file extension for input file: ${filePath}`);
  }
}

function computeEmBmParallel(
  preLabelTuple: Array<[PredictionItem, [string, string, string]]>,
  k: number = 5,
  numWorkers?: number
): Promise<ResultItem[]> {
  const totalItems = preLabelTuple.length;

  const workerCount = numWorkers || Math.min(os.cpus().length, totalItems);

  console.log(`Starting EM/BM computation (k=${k}), total ${totalItems} items, using ${workerCount} worker threads`);

  return new Promise<ResultItem[]>((resolve, reject) => {
    const results: ResultItem[] = new Array(totalItems);
    let processedCount = 0;
    let taskIndex = 0;
    let completedWorkers = 0;
    let isResolved = false;
    const workers: Worker[] = [];
    const errors: string[] = [];
    const terminatedWorkers = new Set<number>();

    const finish = () => {
      if (isResolved) return;
      isResolved = true;

      workers.forEach((worker, idx) => {
        if (!terminatedWorkers.has(idx)) {
          try {
            worker.terminate();
          } catch (e) {
          }
          terminatedWorkers.add(idx);
        }
      });

      for (let i = 0; i < totalItems; i++) {
        if (!results[i]) {
          const item = preLabelTuple[i];
          if (item) {
            results[i] = {
              id: item[0].id,
              type_cat: item[1][1],
              loc_cat: item[1][2],
              EM: false,
              BM: false
            };
          }
        }
      }

      const finalResults = results.filter(r => r !== undefined);
      if (errors.length > 0) {
        console.warn(`\nProcessing complete with ${errors.length} errors:`);
        errors.slice(0, 10).forEach(err => console.warn(`  - ${err}`));
        if (errors.length > 10) {
          console.warn(`  ... and ${errors.length - 10} more errors`);
        }
      }

      resolve(finalResults);
    };

    for (let i = 0; i < workerCount; i++) {
      const workerPath = path.resolve(__dirname, '../dist/compute_em_bm_worker.js');
      const worker = new Worker(workerPath);
      const workerIndex = i;

      worker.on('message', (result: WorkerResult) => {
        if (terminatedWorkers.has(workerIndex) || isResolved) {
          return;
        }

        if (result.success && result.result) {
          if (!results[result.index]) {
            results[result.index] = {
              id: result.result.id,
              type_cat: result.result.type_cat,
              loc_cat: result.result.loc_cat,
              EM: result.result.EM,
              BM: result.result.BM
            };
            processedCount++;
            process.stdout.write(`\rProgress: ${processedCount}/${totalItems} (${((processedCount / totalItems) * 100).toFixed(2)}%)`);
            if (processedCount === totalItems) {
              process.stdout.write('\n');
            }
          }
        } else {
          errors.push(`Index ${result.index}: ${result.error || 'unknown error'}`);
          if (!results[result.index]) {
            const item = preLabelTuple[result.index];
            if (item) {
              results[result.index] = {
                id: item[0].id,
                type_cat: item[1][1],
                loc_cat: item[1][2],
                EM: false,
                BM: false
              };
              processedCount++;
              process.stdout.write(`\rProgress: ${processedCount}/${totalItems} (${((processedCount / totalItems) * 100).toFixed(2)}%)`);
              if (processedCount === totalItems) {
                process.stdout.write('\n');
              }
            }
          }
        }

        if (taskIndex < totalItems && !terminatedWorkers.has(workerIndex) && !isResolved) {
          const nextTask: TaskData = {
            item: preLabelTuple[taskIndex],
            k,
            index: taskIndex
          };
          taskIndex++;
          try {
            worker.postMessage(nextTask);
          } catch (e) {
          }
        } else {
          if (!terminatedWorkers.has(workerIndex)) {
            terminatedWorkers.add(workerIndex);
            try {
              worker.terminate();
            } catch (e) {
              completedWorkers++;
              if (completedWorkers === workerCount && !isResolved) {
                finish();
              }
            }
          }
        }

        if (processedCount >= totalItems && !isResolved) {
          finish();
        }
      });

      worker.on('error', (error) => {
        if (isResolved) return;
        console.error(`Worker ${workerIndex} error:`, error);
        errors.push(`Worker ${workerIndex} error: ${error.message}`);

        if (!terminatedWorkers.has(workerIndex)) {
          terminatedWorkers.add(workerIndex);
          completedWorkers++;
        }

        if (completedWorkers === workerCount && !isResolved) {
          finish();
        }
      });

      worker.on('exit', (code) => {
        if (isResolved) return;

        if (code !== 0) {
          console.error(`Worker ${workerIndex} exited with code: ${code}`);
        }

        if (!terminatedWorkers.has(workerIndex)) {
          terminatedWorkers.add(workerIndex);
          completedWorkers++;
        }

        if (completedWorkers === workerCount && !isResolved) {
          finish();
        }
      });

      workers.push(worker);
    }

    for (let i = 0; i < Math.min(workerCount, totalItems); i++) {
      const worker = workers[i];
      if (!worker || isResolved) continue;

      if (taskIndex < totalItems) {
        const task: TaskData = {
          item: preLabelTuple[taskIndex],
          k,
          index: taskIndex
        };
        taskIndex++;
        try {
          worker.postMessage(task);
        } catch (e) {
        }
      } else {
        if (!terminatedWorkers.has(i)) {
          terminatedWorkers.add(i);
          completedWorkers++;
          try {
            worker.terminate();
          } catch (e) {
          }
        }
      }
    }

    if (completedWorkers === workerCount && !isResolved) {
      finish();
    }
  });
}

async function main() {
  const args = process.argv.slice(2);
  let predictionFp: string | undefined = undefined;
  let labelFp: string | undefined = undefined;
  let outputFp: string | undefined = undefined;
  let k: number | undefined = undefined;
  let numWorkers: number | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--predictionFp') && i + 1 < args.length) {
      predictionFp = args[i + 1];
      i++;
    } else if ((args[i] === '--labelFp') && i + 1 < args.length) {
      labelFp = args[i + 1];
      i++;
    } else if (args[i] === '--output' && i + 1 < args.length) {
      outputFp = args[i + 1];
      i++;
    } else if (args[i] === '--k' && i + 1 < args.length) {
      k = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--num_workers' && i + 1 < args.length) {
      numWorkers = parseInt(args[i + 1], 10);
      if (isNaN(numWorkers) || numWorkers <= 0) {
        console.error('--num_workers must be a positive integer');
        process.exit(1);
      }
      i++;
    }
  }

  if (!predictionFp || !labelFp || !outputFp || typeof k !== 'number' || isNaN(k)) {
    console.error('Error: --predictionFp, --labelFp, --output, --k are all required');
    console.error('Usage: ts-node compute_em_bm_parallel.ts --predictionFp <prediction.json> --labelFp <label.json> --output <output.json> --k <number> [--num_workers <number>]');
    process.exit(1);
  }

  if (fs.existsSync(outputFp)) {
    console.log(`Output file already exists, skipping: ${outputFp}`);
    process.exit(0);
  }

  console.log(`Reading prediction file: ${predictionFp}`);
  const predsData: PredictionItem[] = readJsonOrJsonlFile<PredictionItem>(predictionFp);

  console.log(`Reading label file: ${labelFp}`);
  const labelData: LabelItem[] = readJsonOrJsonlFile<LabelItem>(labelFp);

  console.log('Building label map...');
  const labelMap: Record<string, [string, string, string]> = {};
  for (const label of labelData) {
    const id = `${label.file}#${label.name}#${label.loc_cat}#${label.line}`;
    labelMap[id] = [label.type, label.type_cat, label.loc_cat];
  }

  console.log('Matching predictions with labels...');
  const preLabelTuple: Array<[PredictionItem, [string, string, string]]> = [];
  let skipped = 0;

  for (const pred of predsData) {
    const id = pred.id;
    if (!(id in labelMap)) {
      skipped++;
      continue;
    }
    preLabelTuple.push([pred, labelMap[id]]);
  }

  if (skipped > 0) {
    console.log(`Skipped ${skipped} predictions with no matching label`);
  }

  console.log(`Matched ${preLabelTuple.length} items`);

  try {
    const res = await computeEmBmParallel(preLabelTuple, k, numWorkers);

    const outputDir = path.dirname(outputFp);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`Writing results to: ${outputFp}`);
    fs.writeFileSync(outputFp, JSON.stringify(res, null, 2), 'utf-8');

    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Processing failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { computeEmBmParallel };
