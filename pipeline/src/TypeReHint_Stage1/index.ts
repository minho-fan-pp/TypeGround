import { GetProjectFileTypeHints } from "./TypeReHint_Stage1";
async function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.log("Usage: ts-node index.ts [project_root_directory] [--no-compile-check]");
        console.log("Example: ts-node index.ts ./my-project");
        console.log("Example: ts-node index.ts ./my-project --no-compile-check");
        console.log("Note: project_root_directory is required");
        console.log("      --no-compile-check: Disable compile check after each file (default: enabled)");
        process.exit(1);
    }
    const projectPath = args[0]!;
    const enableCompileCheck = !args.includes('--no-compile-check');
    console.log(`Running TypeReHint_Stage1 for project: ${projectPath}`);
    console.log(`Compile check: ${enableCompileCheck ? 'ENABLED' : 'DISABLED'}`);
    try {
        await GetProjectFileTypeHints(projectPath, enableCompileCheck);
        console.log("Type hints generation completed successfully");
    }
    catch (error) {
        console.error("Error generating type hints:", error);
        process.exit(1);
    }
}
main().catch(error => {
    console.error("Unhandled error:", error);
    process.exit(1);
});
