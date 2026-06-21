import os
import sys
import json
import csv

from type_cat import classify_type_cat


def _is_user_defined_type_cat(type_cat):
    return str(type_cat or '').lower() == 'userdefined'


def _major_cat_column_prefix(major_cat):
    mapping = {
        'BuiltIn': 'BuiltIn',
        'Constructed': 'Constructed',
        'UserDefined': 'UserDefined',
    }
    return mapping.get(major_cat, str(major_cat or 'Unknown'))


def _major_cat(type_cat):
    mc = classify_type_cat(type_cat)
    return mc if mc is not None else 'BuiltIn'


def _loc_cat_column_prefix(loc_cat):
    mapping = {
        'ret': 'ret',
        'var': 'var',
        'arg': 'arg',
    }
    return mapping.get(str(loc_cat or '').lower(), str(loc_cat or 'unknown'))


def _load_json(fp):
    with open(fp, 'r', encoding='utf-8') as f:
        return json.load(f)


def merge_by_id(dir_path, kmax):
    merged = {}
    loaded_ks = []

    for k in range(1, kmax + 1):
        fname = f"em_bm_tok_{k}_result.json"
        fp = os.path.join(dir_path, fname)
        if not os.path.exists(fp):
            print(f"File not found: {fp}")
            continue
        loaded_ks.append(k)

        data = _load_json(fp) or []
        for item in data:
            _id = item.get('id')
            if not _id:
                continue
            row = merged.get(_id)
            if row is None:
                row = {
                    "id": _id,
                    "type_cat": item.get('type_cat'),
                    "loc_cat": item.get('loc_cat'),
                }
                merged[_id] = row
            if not row.get('type_cat') and item.get('type_cat') is not None:
                row['type_cat'] = item.get('type_cat')
            if not row.get('loc_cat') and item.get('loc_cat') is not None:
                row['loc_cat'] = item.get('loc_cat')

            row[f"EM@{k}"] = bool(item.get('EM', False))
            row[f"BM@{k}"] = bool(item.get('BM', False))

    for row in merged.values():
        for k in range(1, kmax + 1):
            row.setdefault(f"EM@{k}", False)
            row.setdefault(f"BM@{k}", False)

    return list(merged.values()), loaded_ks


def compute_em_bm_acc(merged_rows, kmax):
    if not merged_rows:
        return []

    total = len(merged_rows)
    user_rows = [r for r in merged_rows if _is_user_defined_type_cat(r.get('type_cat'))]
    user_total = len(user_rows)

    cats = ['BuiltIn', 'Constructed', 'UserDefined']
    grouped = {c: [] for c in cats}
    for r in merged_rows:
        grouped.setdefault(_major_cat(r.get('type_cat')), []).append(r)

    locs = ['ret', 'var', 'arg']
    loc_grouped = {l: [] for l in locs}
    for r in merged_rows:
        loc = str(r.get('loc_cat') or '').lower()
        if loc in loc_grouped:
            loc_grouped[loc].append(r)

    out_rows = []
    for k in range(1, kmax + 1):
        em_cnt = sum(1 for r in merged_rows if r.get(f"EM@{k}", False))
        bm_cnt = sum(1 for r in merged_rows if r.get(f"BM@{k}", False))

        user_em_cnt = sum(1 for r in user_rows if r.get(f"EM@{k}", False))
        user_bm_cnt = sum(1 for r in user_rows if r.get(f"BM@{k}", False))

        em_acc = em_cnt / total if total else 0.0
        bm_acc = bm_cnt / total if total else 0.0
        user_em_acc = user_em_cnt / user_total if user_total else 0.0
        user_bm_acc = user_bm_cnt / user_total if user_total else 0.0

        row_out = {
            "k": k,
            "em_acc": round(em_acc * 100, 2),
            "bm_acc": round(bm_acc * 100, 2),
            "userDefined_em_acc": round(user_em_acc * 100, 2),
            "userDefined_bm_acc": round(user_bm_acc * 100, 2),
        }

        for c in cats:
            rows = grouped.get(c, [])
            n = len(rows)
            c_em_cnt = sum(1 for r in rows if r.get(f"EM@{k}", False))
            c_bm_cnt = sum(1 for r in rows if r.get(f"BM@{k}", False))
            prefix = _major_cat_column_prefix(c)
            row_out[f"{prefix}_em_acc"] = round((c_em_cnt / n * 100.0), 2) if n else 0.0
            row_out[f"{prefix}_bm_acc"] = round((c_bm_cnt / n * 100.0), 2) if n else 0.0

        for l in locs:
            rows = loc_grouped.get(l, [])
            n = len(rows)
            l_em_cnt = sum(1 for r in rows if r.get(f"EM@{k}", False))
            l_bm_cnt = sum(1 for r in rows if r.get(f"BM@{k}", False))
            prefix = _loc_cat_column_prefix(l)
            row_out[f"{prefix}_em"] = round((l_em_cnt / n * 100.0), 2) if n else 0.0
            row_out[f"{prefix}_bm"] = round((l_bm_cnt / n * 100.0), 2) if n else 0.0

        out_rows.append(row_out)

    return out_rows


def compute_mrr(merged_rows, kmax):
    if not merged_rows:
        return None

    user_rows = [r for r in merged_rows if _is_user_defined_type_cat(r.get('type_cat'))]

    cats = ['BuiltIn', 'Constructed', 'UserDefined']
    grouped = {c: [] for c in cats}
    for r in merged_rows:
        grouped.setdefault(_major_cat(r.get('type_cat')), []).append(r)

    locs = ['ret', 'var', 'arg']
    loc_grouped = {l: [] for l in locs}
    for r in merged_rows:
        loc = str(r.get('loc_cat') or '').lower()
        if loc in loc_grouped:
            loc_grouped[loc].append(r)

    def _rr(row, key_prefix):
        for k in range(1, kmax + 1):
            if row.get(f"{key_prefix}@{k}", False):
                return 1.0 / k
        return 0.0

    def _mrr(rows, key_prefix):
        if not rows:
            return 0.0
        return sum(_rr(r, key_prefix) for r in rows) / len(rows)

    out = {
        "k": "MRR@%d" % kmax,
        "em_mrr": round(_mrr(merged_rows, "EM") * 100, 2),
        "bm_mrr": round(_mrr(merged_rows, "BM") * 100, 2),
        "userDefined_em_mrr": round(_mrr(user_rows, "EM") * 100, 2),
        "userDefined_bm_mrr": round(_mrr(user_rows, "BM") * 100, 2),
    }

    for c in cats:
        prefix = _major_cat_column_prefix(c)
        rows = grouped.get(c, [])
        out[f"{prefix}_em_mrr"] = round(_mrr(rows, "EM") * 100, 2)
        out[f"{prefix}_bm_mrr"] = round(_mrr(rows, "BM") * 100, 2)

    for l in locs:
        prefix = _loc_cat_column_prefix(l)
        rows = loc_grouped.get(l, [])
        out[f"{prefix}_em"] = round(_mrr(rows, "EM") * 100, 2)
        out[f"{prefix}_bm"] = round(_mrr(rows, "BM") * 100, 2)

    return out


def compute_metrics_by_major_cat(merged_rows, kmax):
    if not merged_rows:
        return []

    total = len(merged_rows)
    cats = ['BuiltIn', 'Constructed', 'UserDefined']

    grouped = {c: [] for c in cats}
    for r in merged_rows:
        grouped.setdefault(_major_cat(r.get('type_cat')), []).append(r)

    def _rr(row, key_prefix):
        for k in range(1, kmax + 1):
            if row.get(f"{key_prefix}@{k}", False):
                return 1.0 / k
        return 0.0

    out = []
    for c in cats:
        rows = grouped.get(c, [])
        n = len(rows)
        share = (n / total * 100.0) if total else 0.0

        row_out = {
            "major_cat": c,
            "count": n,
            "share_%": round(share, 2),
            "em_mrr": 0.0,
            "bm_mrr": 0.0,
        }

        if n:
            row_out["em_mrr"] = round(sum(_rr(r, "EM") for r in rows) / n * 100, 2)
            row_out["bm_mrr"] = round(sum(_rr(r, "BM") for r in rows) / n * 100, 2)

        for k in range(1, kmax + 1):
            em_cnt = sum(1 for r in rows if r.get(f"EM@{k}", False))
            bm_cnt = sum(1 for r in rows if r.get(f"BM@{k}", False))
            row_out[f"em@{k}"] = round((em_cnt / n * 100.0), 2) if n else 0.0
            row_out[f"bm@{k}"] = round((bm_cnt / n * 100.0), 2) if n else 0.0

        out.append(row_out)

    return out


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(
        description='Compute EM/BM accuracy and MRR from em_bm_tok_k_result.json files in a directory.'
    )
    parser.add_argument('-d', '--dir', dest='dir', default='.',
                        help='Directory containing em_bm_tok_k_result.json files (default: current dir)')
    parser.add_argument('-o', '--out', dest='out', default=None,
                        help='Output CSV path (default: <dir>/metrics.csv)')
    parser.add_argument('--kmax', dest='kmax', type=int, default=5,
                        help='Maximum k for top-k stats and MRR range (default: 5)')
    args = parser.parse_args()

    dir_path = args.dir
    if not os.path.isdir(dir_path):
        print(f"Directory not found: {dir_path}")
        sys.exit(1)

    kmax = args.kmax if args.kmax and args.kmax > 0 else 5
    out_fp = args.out or os.path.join(dir_path, 'metrics.csv')

    merged_rows, loaded_ks = merge_by_id(dir_path, kmax)
    if not loaded_ks:
        print("No em_bm_tok_k_result.json files found.")
        sys.exit(1)

    print(f"Merged {len(merged_rows)} samples, covering k={loaded_ks} (stats range kmax={kmax})")

    acc_rows = compute_em_bm_acc(merged_rows, kmax)
    mrr_row = compute_mrr(merged_rows, kmax)


    def _major_cat_acc_columns():
        em_cols = []
        bm_cols = []
        cats = ['BuiltIn', 'Constructed', 'UserDefined']
        for c in cats:
            prefix = _major_cat_column_prefix(c)
            em_cols.append(f"{prefix}_em")
            bm_cols.append(f"{prefix}_bm")
        return em_cols + bm_cols


    def _loc_cat_columns():
        em_cols = []
        bm_cols = []
        locs = ['ret', 'var', 'arg']
        for l in locs:
            prefix = _loc_cat_column_prefix(l)
            em_cols.append(f"{prefix}_em")
            bm_cols.append(f"{prefix}_bm")
        return em_cols + bm_cols


    major_cat_acc_columns = _major_cat_acc_columns()
    major_cat_em_columns = [c for c in major_cat_acc_columns if c.endswith('_em')]
    major_cat_bm_columns = [c for c in major_cat_acc_columns if c.endswith('_bm')]
    loc_columns = _loc_cat_columns()
    loc_em_columns = [c for c in loc_columns if c.endswith('_em')]
    loc_bm_columns = [c for c in loc_columns if c.endswith('_bm')]
    merged_columns = ["table", "k", "em"] + major_cat_em_columns + loc_em_columns + ["bm"] + major_cat_bm_columns + loc_bm_columns


    def _write_merged(out_path):
        os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
        with open(out_path, 'w', encoding='utf-8', newline='') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=merged_columns, extrasaction='ignore')
            writer.writeheader()

            for r in acc_rows:
                row = {
                    "table": "overall_acc",
                    "k": r["k"],
                    "em": r["em_acc"],
                    "bm": r["bm_acc"],
                }

                for c in ['BuiltIn', 'Constructed', 'UserDefined']:
                    prefix = _major_cat_column_prefix(c)
                    row[f"{prefix}_em"] = r.get(f"{prefix}_em_acc", "")
                    row[f"{prefix}_bm"] = r.get(f"{prefix}_bm_acc", "")

                for l in ['ret', 'var', 'arg']:
                    prefix = _loc_cat_column_prefix(l)
                    row[f"{prefix}_em"] = r.get(f"{prefix}_em", "")
                    row[f"{prefix}_bm"] = r.get(f"{prefix}_bm", "")

                writer.writerow(row)

            if mrr_row:
                row = {
                    "table": "overall_mrr",
                    "k": mrr_row["k"],
                    "em": mrr_row["em_mrr"],
                    "bm": mrr_row["bm_mrr"],
                }

                for c in ['BuiltIn', 'Constructed', 'UserDefined']:
                    prefix = _major_cat_column_prefix(c)
                    row[f"{prefix}_em"] = mrr_row.get(f"{prefix}_em_mrr", "")
                    row[f"{prefix}_bm"] = mrr_row.get(f"{prefix}_bm_mrr", "")

                for l in ['ret', 'var', 'arg']:
                    prefix = _loc_cat_column_prefix(l)
                    row[f"{prefix}_em"] = mrr_row.get(f"{prefix}_em", "")
                    row[f"{prefix}_bm"] = mrr_row.get(f"{prefix}_bm", "")

                writer.writerow(row)


    _write_merged(out_fp)
    print(f"Metrics written to: {out_fp}")
