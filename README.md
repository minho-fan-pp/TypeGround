# TypeGround: Fine-Grained Benchmarking for TypeScript Type Inference

> **Dataset**: [TypeGround](https://huggingface.co/datasets/fumx66/TypeGround)

> **Weight**: [TypeGround](https://huggingface.co/fumx66/TypeGround_weight)

## Abstract

TypeScript is widely used in web applications and mini-programs, yet real-world projects still contain many variables, function parameters, and return values whose annotations are missing or inferred as coarse-grained types (e.g., `any`). Automatic type inference requires benchmarks with reliable training and evaluation signals. Existing TypeScript datasets (e.g., ManyTypes4TypeScript), however, still contain compiler-uncheckable type expressions, coarse annotations, insufficient context, and evaluation protocols that deviate from compiler semantics, which threatens the reliability of both the training labels and the evaluation signals derived from them.

To mitigate the above limitation, we present TypeGround, an automatically constructed TypeScript type inference benchmark. The core idea of TypeGround is to leverage the type-checking capability of the TypeScript Compiler (TSC), together with the generative capability of large language models, to produce compiler-friendly type annotations while avoiding coarse-grained types. TypeGround covers 2,735 projects, 99,209 source files, and 1,428,997 type annotations. Experiments show that training on TypeGround improves overall EM-based MRR@5 by 23.55 percentage points on average over ManyTypes4TypeScript. The user study further confirms the reliability of TypeGround's automatic labelling process.

## Project Structure

```
pipeline/              # Core pipeline (dedup, compile check, extract, stage1, stage2)
prediction/            # LLM type prediction + metrics CSV aggregation (Python)
compute_metrics_ts/    # EM/BM computation using TSC assignability (TypeScript)
result/                # Evaluation results across 7 models
```

See `pipeline/README`, `prediction/README`, and `compute_metrics_ts/README` for module-level details.

## Quick Start

```bash
conda activate type4ts
export NODE_OPTIONS="--max-old-space-size=65536"

# Install
cd pipeline && pnpm install && npx tsc && cd ..
cd compute_metrics_ts && pnpm install && npx tsc && cd ..

# 1. Run pipeline
python pipeline/run.py --project <path> --result-dir <output>

# 2. Predict types with LLM
python prediction/prediction.py \
  --input <sliced_data.jsonl.gz> --model <name> \
  --output <pred.jsonl> --threads 32

# 3. Compute EM/BM
npx tsx compute_metrics_ts/src/compute_em_bm_parallel.ts \
  --predictionFp <pred.jsonl> --labelFp <types.json> \
  --output <result.json> --k 3 --num_workers 64

# 4. Aggregate to CSV
python prediction/compute_metrics.py -d <results_dir> -o metrics.csv --kmax 5
```
