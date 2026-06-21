import { parentPort, workerData } from 'worker_threads';
import { Project } from 'ts-morph';
import { TSTypeObject } from './TSTypeObject';
import { TSTypeCMPer } from './TSTypeCMPer';

interface PredictionItem {
  id: string;
  predictions: Array<[string, number]>;
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

function computeMetrics(prediction: string, label: string, project: Project, cmPer: TSTypeCMPer): { EM: boolean; BM: boolean } {
  try {
    const pre = new TSTypeObject(prediction, project);
    const labelObj = new TSTypeObject(label, project);

    const EM = cmPer.isExactMatch(pre, labelObj);
    const BM = cmPer.isBaseMatch(pre, labelObj);

    return { EM, BM };
  } catch (error) {
    console.error(`Error computing metrics (prediction: ${prediction}, label: ${label}):`, error);
    return { EM: false, BM: false };
  }
}

function processItem(
  item: [PredictionItem, [string, string, string]],
  k: number
): { id: string; type_cat: string; loc_cat: string; EM: boolean; BM: boolean } {
  const [pred, ref] = item;
  const id = pred.id;
  const type_cat = ref[1];
  const loc_cat = ref[2];

  const resultItem = {
    id,
    type_cat,
    loc_cat,
    EM: false,
    BM: false
  };

  const project = new Project();
  const cmPer = new TSTypeCMPer(project);

  try {
    const predictions = pred.predictions.slice(0, k);
    for (const predItem of predictions) {
      const metrics = computeMetrics(predItem[0], ref[0], project, cmPer);

      if (metrics.EM) {
        resultItem.EM = true;
        resultItem.BM = true;
        break;
      }

      if (metrics.BM) {
        resultItem.BM = true;
      }
    }
  } catch (error: any) {
    console.error(`Error processing item (id: ${id}):`, error);
  } finally {
    project.getSourceFiles().forEach(sf => sf.forget());
  }

  return resultItem;
}

if (parentPort) {
  parentPort.on('message', (task: TaskData) => {
    const { item, k, index } = task;

    try {
      const result = processItem(item, k);

      parentPort?.postMessage({
        success: true,
        result: {
          ...result,
          index
        },
        index
      } as WorkerResult);
    } catch (error: any) {
      parentPort?.postMessage({
        success: false,
        error: error?.message || String(error),
        index
      } as WorkerResult);
    }
  });
}
