# Pipeline

TypeScript type inference pipeline — extracts, masks, predicts, and evaluates type annotations across TypeScript projects.

## Architecture

```
src/
├── compile_check/           # 1. Data Collection: compile verification (Python)
├── TypeReHint_Stage1/       # 2. Static Type Annotation: TSC type inference
├── Extract_Dataset/         # 3. Context Construction: snippet + slice
│   ├── slice_code*          # Slice code along type dependencies
│   ├── mask_data*           # Replace target types with <mask>
│   ├── extract_dataset*     # Build final dataset from annotated projects
│   └── extract_type_origin* # Trace type definition origins
├── TypeReHint_Stage2/       # 4. LLM-Assisted Type Inference with TSC backfill
│   ├── Build_Type_Set/      # Build type definition graph
│   ├── Def_Use/             # Definition-use chain analysis (topological order)
│   ├── LLMAgent/            # LLM candidate type generator
│   ├── Package_Maker/       # Package project for evaluation
│   └── TSlicer/             # Type-level slicing (context for LLM prompt)
└── Deduplication/           # 6. Code Deduplication (BGE-M3 + DBSCAN)
```

## Quick Start

```bash
cd pipeline
pnpm install
npx tsc
```

## Usage

### Single project

```bash
python run.py --project <path/to/project> --result-dir <output/dir>
```

### Batch processing

```bash
python run.py --projects-dir <path/to/projects> --result-dir <output/dir>
```

## Pipeline Stages

1. **Static Type Annotation** (`TypeReHint_Stage1`) — for each compilable project, extract variable declarations, function parameters, and return types; retain explicit developer annotations when present; for positions without explicit annotation, use TSC project-level type inference; `any`/`unknown` positions are retained for the LLM-assisted stage
2. **LLM-Assisted Type Inference** (`TypeReHint_Stage2`) — for positions still typed `any` after static annotation, construct prompts from the target's context and use an LLM to generate candidate types; backfill each candidate into the original project and run TSC: accept only if the project still type-checks; process positions in def-use topological order within each file to maintain cross-position consistency; reject coarse types (`object`, `Function`) from the known-type table to prevent propagation
3. **Context Construction** (`Extract_Dataset`) — for each target position, construct two context formats with the target type replaced by `<mask>`:
   - **snippet** — local contiguous code window centered on the target line (±25 lines), preserving lexical and syntactic neighborhood
   - **slice** — cross-file type-dependency-aware code slice collected along definition-use and call relationships, providing type evidence from imports, definitions, call sites, and usage points
4. **Deduplication** (`Deduplication`) — encode source files with BGE-M3 embeddings, cluster by cosine similarity (threshold ≥ 0.95) via DBSCAN, and retain one representative per cluster to prevent cross-split data leakage from code clones
