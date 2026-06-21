import { parentPort, workerData } from 'worker_threads';
import { TSTypeObject } from './TSTypeObject';
import { TSTypeCMPer } from './TSTypeCMPer';
import { Project } from 'ts-morph';
const { preStr, labelStr } = workerData as {
    preStr: string;
    labelStr: string;
};
const sharedProject = new Project();
const cmp = new TSTypeCMPer(sharedProject);
const pre = new TSTypeObject(preStr, sharedProject);
const label = new TSTypeObject(labelStr, sharedProject);
const match = cmp.isExactMatch(pre, label);
parentPort?.postMessage({
    pre: pre.getTypeObject()?.typeStr,
    label: label.getTypeObject()?.typeStr,
    match,
});
