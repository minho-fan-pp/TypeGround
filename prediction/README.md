# Prediction

LLM-based type prediction and metrics computation — the final two steps of the TypeGround pipeline: predict types for masked positions, then evaluate against ground truth.

## Files

| File | Purpose |
|------|---------|
| `prediction.py` | Multi-threaded LLM type prediction — calls an OpenAI-compatible API on each masked code slice, aggregates multiple samples per position |
| `type_cat.py` | Classifies fine-grained type category strings into 3 major groups: `BuiltIn`, `Constructed`, `UserDefined` |
| `compute_metrics.py` | Aggregates per-token EM/BM results into accuracy@k, MRR, and per-category breakdown, outputs a single CSV |

## Usage

### 1. Run predictions

```bash
python prediction.py \
  --input /path/to/sliced_data.jsonl.gz \
  --model my-model \
  --iteration 20 \
  --output results/prediction.jsonl \
  --threads 32 \
  --api-key sk-xxx \
  --base-url http://localhost:8001/v1
```

| Flag | Default | Description |
|------|---------|-------------|
| `--input` | *(required)* | Input `.jsonl.gz` file (sliced code data from pipeline) |
| `--model` | *(required)* | Model name for the API |
| `--output` | *(required)* | Output file — `.json` or `.jsonl` (format auto-detected) |
| `--iteration` | `20` | Number of LLM calls per masked position (majority-voted) |
| `--threads` | `4` | Number of parallel worker threads |
| `--api-key` | `0` | API key |
| `--base-url` | `http://localhost:8001/v1` | OpenAI-compatible API base URL |

### 2. Compute EM/BM metrics (TypeScript side)

Intermediate step — run after prediction, before CSV aggregation:

```bash
npx tsx compute_metrics_ts/src/compute_em_bm_parallel.ts \
  --predictionFp results/prediction.jsonl \
  --labelFp data/types.json \
  --output results/em_bm_tok_3_result.json \
  --k 3 --num_workers 64
```

Produces `em_bm_tok_{k}_result.json` — one file per k value.

### 3. Aggregate metrics to CSV

```bash
python compute_metrics.py \
  -d results/ \
  -o results/metrics.csv \
  --kmax 5
```

| Flag | Default | Description |
|------|---------|-------------|
| `-d` / `--dir` | `.` | Directory containing `em_bm_tok_{1..k}_result.json` files |
| `-o` / `--out` | `<dir>/metrics.csv` | Output CSV path |
| `--kmax` | `5` | Maximum k for top-k accuracy and MRR computation range |

## Output Format

### Prediction output

```json
{"id": "file.ts#varName#var#42", "predictions": [["string", 0.85], ["number", 0.10], ["null", 0.05]]}
```

Each item contains the stable `id` and a list of `[type_string, frequency]` pairs ranked by majority vote across `--iteration` samples.

### EM/BM per-token result

```json
{"id": "file.ts#varName#var#42", "type_cat": "BuiltIn", "loc_cat": "var", "EM": true, "BM": true}
```

### Metrics CSV

| Column | Description |
|--------|-------------|
| `table` | `overall_acc` or `overall_mrr` |
| `k` | k value, or `MRR@5` for the MRR row |
| `em` / `bm` | Overall EM / BM accuracy (%) or MRR |
| `BuiltIn_em`, `Constructed_em`, `UserDefined_em` | Per-category EM accuracy |
| `ret_em`, `var_em`, `arg_em` | Per-location (return / variable / argument) EM accuracy |
| `BuiltIn_bm`, `Constructed_bm`, `UserDefined_bm` | Per-category BM accuracy |
| `ret_bm`, `var_em`, `arg_bm` | Per-location BM accuracy |

## Type Category Mapping

`type_cat.py` maps hundreds of fine-grained TypeScript type categories into 3 groups:

| Major Category | Includes |
|----------------|----------|
| **BuiltIn** | Keyword types (`string`, `number`, ...), built-in objects (`Date`, `RegExp`, ...), DOM/Web APIs (`HTMLElement`, `Event`, ...), array/buffer types |
| **Constructed** | Composite types (`UnionType`, `IntersectionType`, `TupleType`, ...), function/constructor types, utility types (`Pick`, `Omit`, `ReturnType`, ...) |
| **UserDefined** | Project-declared types: interfaces, type aliases, classes, enums — matched via `userDefined` marker from `ts-morph` |
