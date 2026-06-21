import * as fs from 'fs';
import * as path from 'path';
import { Project } from 'ts-morph';
import { TSTypeObject } from './TSTypeObject';
import { TSTypeCMPer } from './TSTypeCMPer';

function showSimpleProgress(current: number, total: number) {
  process.stdout.write(`\rProcessing: ${current}/${total}`);
  if (current === total) process.stdout.write('\n');
}

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

function computeEmBm(preLabelTuple: Array<[PredictionItem, [string, string, string]]>, k: number = 5): ResultItem[] {
  const project = new Project();
  const cmPer = new TSTypeCMPer(project);

  const result: ResultItem[] = [];

  console.log(`Starting EM/BM computation (k=${k}), total ${preLabelTuple.length} items`);

  const total = preLabelTuple.length;

  for (let i = 0; i < total; i++) {
    const [pred, ref] = preLabelTuple[i];
    const id = pred.id;
    const type_cat = ref[1];
    const loc_cat = ref[2];

    const resultItem: ResultItem = {
      id,
      type_cat,
      loc_cat,
      EM: false,
      BM: false
    };

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

    result.push(resultItem);

    showSimpleProgress(i + 1, total);
  }

  return result;
}

function main(options: { predictionFp: string; labelFp: string; outputFp: string; k: number }) {
  const args = process.argv.slice(2);
  let predictionFp = options.predictionFp;
  let labelFp = options.labelFp;
  let outputFp = options.outputFp;
  let k = options.k;

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
    }
  }

  if (!predictionFp || !labelFp || !outputFp || typeof k !== 'number' || isNaN(k)) {
    console.error('Error: --predictionFp, --labelFp, --output, --k are all required');
    process.exit(1);
  }

  if (fs.existsSync(outputFp)) {
    console.log(`Output file already exists, skipping: ${outputFp}`);
    process.exit(0);
  }

  console.log(`Reading prediction file: ${predictionFp}`);
  const predsData: PredictionItem[] = JSON.parse(fs.readFileSync(predictionFp, 'utf-8'));

  console.log(`Reading label file: ${labelFp}`);
  const labelData: LabelItem[] = JSON.parse(fs.readFileSync(labelFp, 'utf-8'));

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

  const res = computeEmBm(preLabelTuple.slice(0, 100), k);

  const outputDir = path.dirname(outputFp);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Writing results to: ${outputFp}`);
  fs.writeFileSync(outputFp, JSON.stringify(res, null, 2), 'utf-8');

  console.log('Done!');
}

if (require.main === module) {
  let predictionFp: string | undefined = undefined;
  let labelFp: string | undefined = undefined;
  let outputFp: string | undefined = undefined;
  let k: number | undefined = undefined;
  const args = process.argv.slice(2);
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
    }
  }
  if (!predictionFp || !labelFp || !outputFp || typeof k !== 'number' || isNaN(k)) {
    console.error('Error: --predictionFp, --labelFp, --output, --k are all required');
    process.exit(1);
  }
  main({
    predictionFp,
    labelFp,
    outputFp,
    k
  });
}

export { computeEmBm, computeMetrics };
