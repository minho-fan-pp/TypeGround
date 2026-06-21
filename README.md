# TypeGround

A compiler-verified, fine-grained benchmark for TypeScript type inference. Covers **2,735 projects, 99,209 source files, and 1,428,997 type annotations** — providing reliable training and evaluation signals for generative and LLM-based type prediction methods.

**Dataset**: [TypeGround](https://huggingface.co/datasets/fumx66/TypeGround)

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
