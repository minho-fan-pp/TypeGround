import { Project } from 'ts-morph';
import { TSTypeObject } from './TSTypeObject';
import { TSTypeCMPer } from './TSTypeCMPer';

function parseArgs(): { prediction: string; label: string } {
  const args = process.argv.slice(2);
  let prediction = '';
  let label = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prediction' && i + 1 < args.length) {
      prediction = args[i + 1];
      i++;
    } else if (args[i] === '--label' && i + 1 < args.length) {
      label = args[i + 1];
      i++;
    }
  }

  if (!prediction || !label) {
    console.error('Usage: npx tsx run.ts --prediction <T1> --label <T2>');
    console.error('Example: npx tsx run.ts --prediction "Function" --label "() => void"');
    process.exit(1);
  }

  return { prediction, label };
}

function main() {
  const { prediction, label } = parseArgs();

  const project = new Project();
  const cmPer = new TSTypeCMPer(project);

  const pre = new TSTypeObject(prediction, project);
  const labelObj = new TSTypeObject(label, project);

  console.log("prediction:");
  console.log(`${pre.getTypeObject()?.typeStr} -> ${pre.getTypeObject()?.processedTypeStr}`);
  console.log(`userDefs: ${pre.getTypeObject()?.userDefs}`);
  console.log(`category: ${pre.getTypeObject()?.category}`);
  console.log("\n");

  console.log("label:");
  console.log(`${labelObj.getTypeObject()?.typeStr} -> ${labelObj.getTypeObject()?.processedTypeStr}`);
  console.log(`userDefs: ${labelObj.getTypeObject()?.userDefs}`);
  console.log(`category: ${labelObj.getTypeObject()?.category}`);
  console.log("\n");

  console.log(`EM:${cmPer.isExactMatch(pre, labelObj)}`);
  console.log(`BM:${cmPer.isBaseMatch(pre, labelObj)}`);
}

main();
