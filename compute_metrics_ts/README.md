# compute_metrics_ts

Compute **Exact Match (EM)** and **Base Match (BM)** metrics for TypeScript type prediction evaluation.

Two types are compared via the TypeScript compiler's own assignability check (`ts-morph`).

## Quick Start

```bash
cd compute_metrics_ts
pnpm install
npx tsc                          # compile src → dist
```

## Usage

### Single type comparison

```bash
npx tsx src/run.ts --prediction "Function" --label "() => void"
```

### Batch EM/BM (single-threaded)

```bash
npx tsx src/compute_em_bm.ts \
  --predictionFp <predictions.json> \
  --labelFp <labels.json> \
  --output <results.json> \
  --k 3
```

### Batch EM/BM (parallel)

```bash
npx tsx src/compute_em_bm_parallel.ts \
  --predictionFp <predictions.json> \
  --labelFp <labels.json> \
  --output <results.json> \
  --k 3 \
  --num_workers 64
```

Input files support both `.json` and `.jsonl` formats.

## How It Works

| Metric | Rule |
|--------|------|
| **EM** | Source type is assignable to target type AND vice versa (`isTypesEquivalent`). User-defined types must have identical sets. |
| **BM** | Source is assignable to target OR vice versa (`isSingleAssignto`). Also checks generic category similarity (`isGenSimilar`). |

The top-`k` predictions are evaluated: EM=true implies BM=true; as soon as any prediction yields EM, the loop exits early.

## Input Format

### Predictions (`--predictionFp`)
```json
[
  {
    "id": "file.ts#varName#loc_cat#42",
    "predictions": [["string", 0.9], ["number", 0.1]]
  }
]
```

### Labels (`--labelFp`)
```json
[
  {
    "file": "file.ts",
    "name": "varName",
    "loc_cat": "return",
    "line": 42,
    "type": "string",
    "type_cat": "StringKeyword"
  }
]
```

## Output

```json
[
  {
    "id": "file.ts#varName#loc_cat#42",
    "type_cat": "StringKeyword",
    "loc_cat": "return",
    "EM": true,
    "BM": true
  }
]
```