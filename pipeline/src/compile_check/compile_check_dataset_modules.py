
\
\
\
\

import os
import sys
import subprocess
import json
import signal
from datetime import datetime

def show_progress_dots(duration, interval=1):

    import time
    start_time = time.time()
    while time.time() - start_time < duration:
        print(".", end="", flush=True)
        time.sleep(interval)
    print()

def run_command(command, cwd=None, capture_output=True, shell=True, print_output=True, timeout=300, realtime_output=False):

    try:
        if realtime_output:

            print(f"      Start executing: {command}")
            print(f"      Timeout setting: {timeout} seconds")
            process = subprocess.Popen(
                command,
                cwd=cwd,
                shell=shell,
                stdout=None,
                stderr=None,
                text=True,
                preexec_fn=os.setsid if os.name != 'nt' else None
            )

            try:
                process.wait(timeout=timeout)
                return process.returncode, "", ""
            except subprocess.TimeoutExpired:

                if os.name != 'nt':
                    os.killpg(os.getpgid(process.pid), signal.SIGTERM)
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                else:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()

                if print_output:
                    print(f"      Command execution timeout ({timeout} seconds): {command}")
                return -2, "", f"Command execution timeout ({timeout} seconds)"
        else:

            if print_output:
                print(f"      Start executing: {command}")
                print(f"      Timeout setting: {timeout} seconds")

            process = subprocess.Popen(
                command,
                cwd=cwd,
                shell=shell,
                stdout=subprocess.PIPE if capture_output else None,
                stderr=subprocess.PIPE if capture_output else None,
                text=True,
                preexec_fn=os.setsid if os.name != 'nt' else None
            )

            try:

                import threading
                import time

                def progress_dots():
                    while process.poll() is None:
                        print(".", end="", flush=True)
                        time.sleep(2)

                progress_thread = threading.Thread(target=progress_dots, daemon=True)
                progress_thread.start()

                stdout, stderr = process.communicate(timeout=timeout)

                print()
                return process.returncode, stdout, stderr
            except subprocess.TimeoutExpired:

                print()

                if os.name != 'nt':
                    os.killpg(os.getpgid(process.pid), signal.SIGTERM)
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                else:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()

                if print_output:
                    print(f"      Command execution timeout ({timeout} seconds): {command}")
                return -2, "", f"Command execution timeout ({timeout} seconds)"

    except Exception as e:
        if print_output:
            print(f"Command execution failed")
        return -1, "", str(e)

def detect_package_manager(project_path):

    if os.path.exists(os.path.join(project_path, "yarn.lock")):
        return "yarn"
    else:

        return "pnpm"

def check_package_manager_available(package_manager, timeout=30):

    try:
        if package_manager == "pnpm":
            result = subprocess.run(["pnpm", "--version"], capture_output=True, text=True, timeout=timeout)
            return result.returncode == 0
        elif package_manager == "yarn":
            result = subprocess.run(["yarn", "--version"], capture_output=True, text=True, timeout=timeout)
            return result.returncode == 0
        elif package_manager == "npm":
            result = subprocess.run(["npm", "--version"], capture_output=True, text=True, timeout=timeout)
            return result.returncode == 0
        return False
    except subprocess.TimeoutExpired:
        print(f"Check package manager {package_manager} timeout ({timeout} seconds)")
        return False
    except:
        return False

def get_available_package_manager(timeout=30):

    package_managers = ["pnpm", "yarn"]
    for pm in package_managers:
        if check_package_manager_available(pm, timeout):
            return pm
    return None

def check_project(project_path, timeout_config=None, install_dependencies=True):

    if timeout_config is None:
        timeout_config = {
            'package_manager_check': 30,
            'dependency_install': 300,
            'build_check': 600,
            'type_check': 180
        }

    project_name = os.path.basename(project_path)
    print(f"\nStart checking project: {project_name}")

    result = {
        "project_name": project_name,
        "project_path": project_path,
        "status": "unknown",
        "package_manager": "unknown",
        "actual_package_manager": "unknown"
    }

    try:

        if not os.path.exists(project_path):
            result["status"] = "error"
            return result

        preferred_package_manager = detect_package_manager(project_path)
        result["package_manager"] = preferred_package_manager
        print(f"  Project preferred package manager: {preferred_package_manager}")

        print(f"  Checking package manager availability...")
        print(f"    [time]  Expected maximum time: {timeout_config['package_manager_check']} seconds")
        if not check_package_manager_available(preferred_package_manager, timeout_config['package_manager_check']):
            print(f"  Preferred package manager {preferred_package_manager} not available, trying other package managers...")
            available_pm = get_available_package_manager(timeout_config['package_manager_check'])
            if available_pm:
                print(f"  Using available package manager: {available_pm}")
                actual_package_manager = available_pm
            else:
                result["status"] = "error"
                return result
        else:
            actual_package_manager = preferred_package_manager

        result["actual_package_manager"] = actual_package_manager
        print(f"  Actually used package manager: {actual_package_manager}")

        original_dir = os.getcwd()
        os.chdir(project_path)

        if install_dependencies:
            print(f"  Installing dependencies...")
            print(f"    [time]  Expected maximum time: {timeout_config['dependency_install']} seconds")

            realtime_output = os.environ.get('COMPILE_CHECK_REALTIME_OUTPUT', 'false').lower() == 'true'

            if actual_package_manager == "pnpm":
                print(f"    Trying to use pnpm...")
                install_command = "pnpm install --ignore-scripts --force"
                print(f"      Execute command: {install_command}")
                print(f"      Timeout setting: {timeout_config['dependency_install']} seconds")
                if realtime_output:
                    print(f"      Real-time output mode enabled, please wait...")
                else:
                    print(f"      Please wait, maximum {timeout_config['dependency_install']} seconds...")
                    print(f"      Installation progress: ", end="", flush=True)
                status, stdout, stderr = run_command(install_command, print_output=False, timeout=timeout_config['dependency_install'], realtime_output=realtime_output)

                if status != 0 and status != -2:
                    print(f"    pnpm installation failed (status code: {status}), trying yarn...")
                    if check_package_manager_available("yarn", timeout_config['dependency_install']):
                        install_command = "yarn install"
                        print(f"      Execute command: {install_command}")
                        print(f"      Timeout setting: {timeout_config['dependency_install']} seconds")
                        if realtime_output:
                            print(f"      Real-time output mode enabled, please wait...")
                        else:
                            print(f"      Please wait, maximum {timeout_config['dependency_install']} seconds...")
                            print(f"      Installation progress: ", end="", flush=True)
                        status, stdout, stderr = run_command(install_command, print_output=False, timeout=timeout_config['dependency_install'], realtime_output=realtime_output)
                    else:
                        print(f"    yarn not available, dependency installation failed")
                        result["status"] = "dependency_error"
                        os.chdir(original_dir)
                        return result
            else:

                install_command = "yarn install"
                print(f"      Execute command: {install_command}")
                print(f"      Timeout setting: {timeout_config['dependency_install']} seconds")
                if realtime_output:
                    print(f"      Real-time output mode enabled, please wait...")
                else:
                    print(f"      Please wait, maximum {timeout_config['dependency_install']} seconds...")
                    print(f"      Installation progress: ", end="", flush=True)
                status, stdout, stderr = run_command(install_command, print_output=False, timeout=timeout_config['dependency_install'], realtime_output=realtime_output)

            if status == -2:
                print(f"    [timeout]  Dependency installation timeout ({timeout_config['dependency_install']} seconds)")
                result["status"] = "timeout"
                os.chdir(original_dir)
                return result
            elif status != 0:
                print(f"    FAILED  Dependency installation failed (status code: {status})")
                result["status"] = "dependency_error"
                os.chdir(original_dir)
                return result
            else:
                print(f"    OK  Dependency installation successful")
        else:
            print(f"  Skipping dependency installation (--no-install flag used)")

        print(f"  Performing TypeScript type checking...")
        print(f"    [time]  Expected maximum time: {timeout_config['type_check']} seconds")

        if actual_package_manager == "pnpm":
            tsc_command = "pnpm exec tsc --noEmit --incremental"
        elif actual_package_manager == "yarn":
            tsc_command = "yarn exec tsc --noEmit --incremental"
        else:
            tsc_command = "npx tsc --noEmit --incremental"

        print(f"    Executing type check: {tsc_command}")
        print(f"      Timeout setting: {timeout_config['type_check']} seconds")
        print(f"      Starting type check...")
        print(f"      Type check progress: ", end="", flush=True)
        status, stdout, stderr = run_command(tsc_command, print_output=False, timeout=timeout_config['type_check'])

        if status != 0 and status != -2:
            print(f"    Type checking failed, trying compilation...")
            print(f"      [time]  Expected maximum time: {timeout_config['build_check']} seconds")

            if actual_package_manager == "pnpm":
                build_command = "pnpm run build"
            elif actual_package_manager == "yarn":
                build_command = "yarn run build"
            else:
                build_command = "npm run build"

            print(f"    Executing compilation: {build_command}")
            print(f"      Timeout setting: {timeout_config['build_check']} seconds")
            print(f"      Starting compilation...")
            print(f"      Compilation progress: ", end="", flush=True)
            status, stdout, stderr = run_command(build_command, print_output=False, timeout=timeout_config['build_check'])

        if status == 0:
            result["status"] = "success"
            print(f"  OK  Type checking/compilation passed")
        elif status == -2:
            result["status"] = "timeout"
            print(f"  [timeout]  Type checking/compilation timeout")
        else:
            result["status"] = "failed"
            print(f"  FAILED  Type checking/compilation failed")

        os.chdir(original_dir)

    except Exception as e:
        result["status"] = "error"
        print(f"  FAILED  Error occurred during check")

        os.chdir(original_dir)

    return result

def main():

    os.environ['NODE_OPTIONS'] = '--max_old_space_size=4096'

    timeout_config = {
        'package_manager_check': 30,
        'dependency_install': 300,
        'build_check': 600,
        'type_check': 180
    }

    print("=== Compilation Check Timeout Configuration ===")
    print(f"Package manager check: {timeout_config['package_manager_check']} seconds")
    print(f"Dependency installation: {timeout_config['dependency_install']} seconds")
    print(f"Compilation check: {timeout_config['build_check']} seconds")
    print(f"Type check: {timeout_config['type_check']} seconds")
    print("=== Timeout Configuration End ===\n")

    args = sys.argv[1:]
    install_dependencies = True
    input_path = None
    output_dir = None
    is_single_project = None

    i = 0
    while i < len(args):
        if args[i] == '--no-install':
            install_dependencies = False
            args.pop(i)
        elif args[i] == '--project':
            if i + 1 < len(args):
                input_path = args[i + 1]
                is_single_project = True
                args.pop(i)
                args.pop(i)
            else:
                print("Error: --project requires a project path")
                sys.exit(1)
        elif args[i] == '--project_dir':
            if i + 1 < len(args):
                input_path = args[i + 1]
                is_single_project = False
                args.pop(i)
                args.pop(i)
            else:
                print("Error: --project_dir requires a directory path")
                sys.exit(1)
        else:
            i += 1

    if input_path is None:
        if len(args) < 1 or len(args) > 2:
            print("Usage:")
            print("  Single project: python compile_check_dataset_modules.py --project <project path> [--no-install] [output directory]")
            print("  Multiple projects: python compile_check_dataset_modules.py --project_dir <directory path> [--no-install] [output directory]")
            print("  Legacy mode (deprecated): python compile_check_dataset_modules.py [--no-install] <path> [output directory]")
            print("Options:")
            print("  --project <path>     Specify a single project to check")
            print("  --project_dir <path> Specify a directory containing multiple projects to check")
            print("  --no-install         Skip dependency installation")
            print("Timeout configuration:")
            print("  Modify values directly in the timeout_config dictionary in the main() function")
            print("  Package manager check: 30 seconds")
            print("  Dependency installation: 300 seconds")
            print("  Compilation check: 600 seconds")
            print("  Type check: 180 seconds")
            print("Example:")
            print("  python compile_check_dataset_modules.py --project /path/to/single/project")
            print("  python compile_check_dataset_modules.py --project /path/to/single/project --no-install")
            print("  python compile_check_dataset_modules.py --project_dir /path/to/projects/directory")
            print("  python compile_check_dataset_modules.py --project_dir /path/to/projects/directory /path/to/output")
            print("  python compile_check_dataset_modules.py --project_dir /path/to/projects/directory --no-install")
            print("Note:")
            print("  - Use --project for single project checks")
            print("  - Use --project_dir for multiple project checks")
            print("  - --no-install flag works for both single project and multiple project checks")
            print("  - When checking multiple projects, two JSON result files are generated:")
            print("    * successful_projects_*.json: Contains projects that passed compilation")
            print("    * failed_projects_*.json: Contains projects with errors")
            print("  - Output directory parameter is optional, defaults to project directory")
            sys.exit(1)

        input_path = args[0]
        output_dir = args[1] if len(args) == 2 else None

        if os.path.isfile(os.path.join(input_path, "package.json")) or os.path.isfile(os.path.join(input_path, "tsconfig.json")):
            is_single_project = True
        else:
            is_single_project = False
    else:

        if len(args) == 1:
            output_dir = args[0]
        elif len(args) > 1:
            print("Error: Too many arguments. Only one output directory can be specified.")
            sys.exit(1)

    if not os.path.exists(input_path):
        print(f"Path does not exist: {input_path}")
        sys.exit(1)

    if is_single_project:

        print(f"Checking single project: {input_path}")
        if not install_dependencies:
            print("  Note: Dependency installation is disabled (--no-install flag used)")
        project_dirs = [input_path]
    else:

        print(f"Checking directory containing multiple projects: {input_path}")
        if not install_dependencies:
            print("  Note: Dependency installation is disabled (--no-install flag used)")
        project_dirs = [os.path.join(input_path, item) for item in os.listdir(input_path)]

        if not project_dirs:
            print(f"No projects found in directory {input_path}")
            sys.exit(1)

        print(f"Found {len(project_dirs)} projects:")
        for project_dir in project_dirs:

            relative_path = os.path.relpath(project_dir, input_path)
            print(f"  - {relative_path}")

    results = []
    for i, project_dir in enumerate(project_dirs, 1):
        if is_single_project:
            print(f"\nChecking project: {os.path.basename(project_dir)}")
        else:
            relative_path = os.path.relpath(project_dir, input_path)
            print(f"\n[{i}/{len(project_dirs)}] Checking project: {relative_path}")

        current_install_deps = install_dependencies
        result = check_project(project_dir, timeout_config, current_install_deps)
        results.append(result)

    success_count = sum(1 for r in results if r["status"] == "success")
    failed_count = sum(1 for r in results if r["status"] == "failed")
    error_count = sum(1 for r in results if r["status"] == "error")
    dependency_error_count = sum(1 for r in results if r["status"] == "dependency_error")
    timeout_count = sum(1 for r in results if r["status"] == "timeout")

    final_result = []
    for result in results:
        result_item = {
            "project_path": result["project_path"],
            "project_name": result["project_name"],
            "passed": result["status"] == "success",
            "status": result["status"],
            "package_manager": result["package_manager"],
            "actual_package_manager": result["actual_package_manager"]
        }

        if result["status"] == "failed":
            result_item["failure_reason"] = "Compilation check failed"
        elif result["status"] == "dependency_error":
            result_item["failure_reason"] = "Dependency installation failed"
        elif result["status"] == "timeout":
            result_item["failure_reason"] = "Operation timeout"
        elif result["status"] == "error":
            result_item["failure_reason"] = "Error occurred during check"

        final_result.append(result_item)

    summary = {
        "total_projects": len(project_dirs),
        "success_count": success_count,
        "failed_count": failed_count,
        "error_count": error_count,
        "dependency_error_count": dependency_error_count,
        "timeout_count": timeout_count,
        "success_rate": f"{(success_count / len(project_dirs) * 100):.1f}%" if project_dirs else "0%"
    }

    final_result.insert(0, {"summary": summary})

    print(f"\n=== Check Complete ===")
    print(f"Total projects: {len(project_dirs)}")
    print(f"Success: {success_count}")
    print(f"Failed: {failed_count}")
    print(f"Error: {error_count}")
    print(f"Dependency error: {dependency_error_count}")
    print(f"Timeout: {timeout_count}")

    if not is_single_project:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

        successful_projects = []
        failed_projects = []

        for result in results:
            if result["status"] == "success":
                successful_projects.append({
                    "project_name": result["project_name"]
                })
            else:
                failed_projects.append({
                    "project_name": result["project_name"],
                    "project_path": result["project_path"],
                    "package_manager": result["package_manager"],
                    "actual_package_manager": result["actual_package_manager"]
                })

                if result["status"] == "failed":
                    failed_projects[-1]["failure_reason"] = "Compilation check failed"
                elif result["status"] == "dependency_error":
                    failed_projects[-1]["failure_reason"] = "Dependency installation failed"
                elif result["status"] == "timeout":
                    failed_projects[-1]["failure_reason"] = "Operation timeout"
                elif result["status"] == "error":
                    failed_projects[-1]["failure_reason"] = "Error occurred during check"

        if output_dir:

            if not os.path.exists(output_dir):
                try:
                    os.makedirs(output_dir, exist_ok=True)
                    print(f"Created output directory: {output_dir}")
                except Exception as e:
                    print(f"Failed to create output directory: {e}")
                    output_dir = None

        successful_filename = f"successful_projects_{timestamp}.json"
        if output_dir:
            successful_path = os.path.join(output_dir, successful_filename)
        else:
            successful_path = os.path.join('./res', successful_filename)

        try:
            with open(successful_path, 'w', encoding='utf-8') as f:
                json.dump(successful_projects, f, ensure_ascii=False, indent=2)
            print(f"Successful project results saved to: {successful_path}")
        except Exception as e:
            print(f"Failed to save successful project results file: {e}")

        failed_filename = f"failed_projects_{timestamp}.json"
        if output_dir:
            failed_path = os.path.join(output_dir, failed_filename)
        else:
            failed_path = os.path.join('./res', failed_filename)

        try:
            with open(failed_path, 'w', encoding='utf-8') as f:
                json.dump(failed_projects, f, ensure_ascii=False, indent=2)
            print(f"Failed project results saved to: {failed_path}")
        except Exception as e:
            print(f"Failed to save failed project results file: {e}")

        if not successful_projects and not failed_projects:
            print("\n=== Detailed Check Results ===")
            print(json.dumps(final_result, ensure_ascii=False, indent=2))
    else:

        print("\n=== Check Results ===")
        for result in results:
            if result["status"] == "success":
                print(f"success")
            else:
                print(f"failed")

if __name__ == "__main__":
    main()
