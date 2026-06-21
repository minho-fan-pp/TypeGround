import subprocess
import argparse
import os
import shutil
from typing import Any
from tqdm import tqdm
import random
import time

current_path = os.path.abspath(os.path.dirname(__file__))

def compile_check(project):

    cmd = f'cd {current_path}/src/compile_check && python compile_check_dataset_modules.py --project "{project}"'

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True, text=True, bufsize=1, universal_newlines=True
    )

    all_output = []

    while True:
        output = process.stdout.readline()
        if output == '' and process.poll() is not None:
            break
        if output:
            all_output.append(output.rstrip())
            print(output.rstrip())

    while True:
        error = process.stderr.readline()
        if error == '' and process.poll() is not None:
            break
        if error:
            all_output.append(f"ERROR: {error.rstrip()}")
            print(f"ERROR: {error.rstrip()}")

    process.wait()

    if process.returncode != 0:
        print(f"compile_check command failed,return code:{process.returncode}")
        return False

    last_lines = all_output[-3:] if len(all_output) >= 3 else all_output
    last_output = '\n'.join(last_lines)

    if "success" in last_output.lower():
        print("Compile check passed")
        return True
    elif "failed" in last_output.lower():
        print("Compile check failed")
        return False
    else:
        print("Compile check result is unclear; treating as failed")
        return False

def TypeReHint_Stage1(project):
    cmd = f'cd {current_path}/src/TypeReHint_Stage1 && npx tsx ./index.ts "{project}"'

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True, text=True, bufsize=1, universal_newlines=True
    )

    while True:
        output = process.stdout.readline()
        if output == '' and process.poll() is not None:
            break
        if output:
            print(output.rstrip())

    while True:
        error = process.stderr.readline()
        if error == '' and process.poll() is not None:
            break
        if error:
            print(f"ERROR: {error.rstrip()}")

    process.wait()

    if process.returncode != 0:
        print(f"TypeReHint_Stage1 command failed,return code:{process.returncode}")
        return False

    return True

def TypeReHint_Stage2(project,result_dir):
    cmd_1 = f'cd {current_path}/src/TypeReHint_Stage2 && npx tsx ./index.ts --Package_Maker "{project}"'

    cmd_2 = f'cd {current_path}/src/TypeReHint_Stage2 && npx tsx ./index.ts {project} {result_dir}'

    process = subprocess.Popen(
        cmd_1,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True, text=True, bufsize=1, universal_newlines=True
    )

    while True:
        output = process.stdout.readline()
        if output == '' and process.poll() is not None:
            break
        if output:
            print(output.rstrip())

    while True:
        error = process.stderr.readline()
        if error == '' and process.poll() is not None:
            break
        if error:
            print(f"ERROR: {error.rstrip()}")

    process.wait()

    if process.returncode != 0:
        print(f"TypeReHint_Stage2 command failed,return code:{process.returncode}")
        return False

    process = subprocess.Popen(
        cmd_2,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True, text=True, bufsize=1, universal_newlines=True
    )

    while True:
        output = process.stdout.readline()
        if output == '' and process.poll() is not None:
            break
        if output:
            print(output.rstrip())

    while True:
        error = process.stderr.readline()
        if error == '' and process.poll() is not None:
            break
        if error:
            print(f"ERROR: {error.rstrip()}")

    process.wait()

    if process.returncode != 0:
        print(f"TypeReHint_Stage2 command failed,return code:{process.returncode}")
        return False

    return True

def process_projects(project, result_dir):

    if not os.path.exists(result_dir):
        print(f"Result directory {result_dir} does not exist; creating it...")
        os.makedirs(result_dir)

    result_dir_parent = os.path.dirname(result_dir)
    temp_dir = os.path.join(result_dir_parent, 'temp')
    if not os.path.exists(temp_dir):
        print(f"Temp directory {temp_dir} does not exist; creating it...")
        os.makedirs(temp_dir)

    project_name = os.path.basename(project)
    result_project_dir = os.path.join(result_dir, project_name)
    print(f"result_project_dir:{result_project_dir}")
    if os.path.exists(result_project_dir):
        print(f"Project {project_name} already exists in the result directory; skipping.")
        return

    temp_project_dir = os.path.join(temp_dir, project_name)

    try:
        if not os.path.exists(temp_project_dir):
            print(f"Copying project to temp directory:{temp_project_dir}")
            shutil.copytree(project, temp_project_dir)
        else:
            print(f"Temp directory {temp_project_dir} already exists; skipping.")
            return
        print(f"Compiling project:{temp_project_dir}")
        if not compile_check(temp_project_dir):
            print(f"Project {temp_project_dir} compile check failed; stopping.")
            shutil.rmtree(temp_project_dir)
            return
        print(f"Processing project stage 1:{temp_project_dir}")
        if not TypeReHint_Stage1(temp_project_dir):
            print(f"Project {temp_project_dir} stage 1 failed")
            shutil.rmtree(temp_project_dir)
            return

        print(f"Processing project stage 2:{temp_project_dir}")
        if not TypeReHint_Stage2(temp_project_dir,result_dir):
            print(f"Project {temp_project_dir} stage 2 failed")
            shutil.rmtree(temp_project_dir)
            return "TypeReHint_Stage2 Error"

        shutil.move(temp_project_dir, result_dir)

        print(f"Project processing complete; output written to result directory:{result_dir}")
    except Exception as e:
        print(f"Failed to process project:{temp_project_dir},error:{e}")
        shutil.rmtree(temp_project_dir)

def process_projects_in_dir(projects_dir, result_dir):
    if not os.path.isdir(projects_dir):
        print(f"The specified path does not exist or is not a directory:{projects_dir}")
        return
    entries = [os.path.join(projects_dir, name) for name in os.listdir(projects_dir)]
    random.seed(99)
    projects = [p for p in entries if os.path.isdir(p)]
    random.shuffle(projects)

    if not projects:
        print(f"Directory {projects_dir} contains no project directories")
        return
    for proj in tqdm (projects, desc=f"Batch processing {len(projects)} projects", unit="proj"):
        try:
            ret = process_projects(proj, result_dir)
            if ret == "TypeReHint_Stage2 Error":
                print(f"Project {proj} stage 2 failed")
                return "TypeReHint_Stage2 Error"
        except Exception as e:
            print(f"Failed while processing directory {proj} with exception:{e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Process TypeScript projects')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--project', help='Project path to process')
    group.add_argument('--projects-dir', help='Directory containing projects')
    parser.add_argument('--result-dir', required=True, help='Result directory path')

    args = parser.parse_args()

    if args.project:
        print(f"Start processing project: {args.project}")
    else:
        print(f"Start processing directory: {args.projects_dir}")
    print(f"Result directory: {args.result_dir}")
    if args.project:
        process_projects(args.project, args.result_dir)
    else:
        process_projects_in_dir(args.projects_dir, args.result_dir)
    print("Processing complete!")
