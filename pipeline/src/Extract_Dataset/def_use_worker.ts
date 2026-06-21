import { parentPort } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';
import { Init_Def_Use, Def_Use } from '../TypeReHint_Stage2/Def_Use/index';
interface RepoTask {
    repoName: string;
    repoPath: string;
    defUsePath: string;
}
interface WorkerResult {
    success: boolean;
    repoName?: string;
    error?: string;
}
function hasDefUseArtifacts(defUseDir: string): boolean {
    const required = ['ProjectFunctions.json', 'ProjectClasses.json', 'useFunction.json'];
    return required.every(file => fs.existsSync(path.join(defUseDir, file)));
}
if (parentPort) {
    parentPort.on('message', (task: RepoTask) => {
        const { repoName, repoPath, defUsePath } = task;
        try {
            if (!fs.existsSync(repoPath)) {
                parentPort?.postMessage({
                    success: false,
                    repoName,
                    error: `messageDirectorymessage: ${repoPath}`,
                } as WorkerResult);
                return;
            }
            if (hasDefUseArtifacts(defUsePath)) {
                parentPort?.postMessage({
                    success: true,
                    repoName,
                } as WorkerResult);
                return;
            }
            Init_Def_Use(defUsePath);
            Def_Use(repoPath, defUsePath);
            parentPort?.postMessage({
                success: true,
                repoName,
            } as WorkerResult);
        }
        catch (error: any) {
            parentPort?.postMessage({
                success: false,
                repoName,
                error: error?.message || String(error),
            } as WorkerResult);
        }
    });
}
