import argparse
import os
import json
from collections import defaultdict, Counter

import numpy as np
import faiss

def find_similar_pairs_efficient(
    index_path,
    similarity_threshold=0.95,
    batch_size=1000,
):
\
\
\
\
\
\
\
\
\
\

    print(f"messageFaissmessage: {index_path}")
    if not os.path.isfile(index_path):
        raise FileNotFoundError(f"FAISS index not found: {index_path}")
    index = faiss.read_index(index_path)
    ntotal = index.ntotal

    print(f"message {ntotal} message")

    k = min(ntotal, 100)
    similar_pairs = []

    try:

        all_vecs = index.reconstruct_n(0, ntotal)
    except Exception:

        d = index.d
        all_vecs = np.zeros((ntotal, d), dtype=np.float32)
        for idx in range(ntotal):
            all_vecs[idx] = index.reconstruct(idx)

    faiss.normalize_L2(all_vecs)

    norm_index = faiss.IndexFlatL2(all_vecs.shape[1])
    norm_index.add(all_vecs)

    for i in range(0, ntotal, batch_size):
        end_idx = min(i + batch_size, ntotal)
        batch_size_actual = end_idx - i

        print(f"message {i // batch_size + 1}/{(ntotal + batch_size - 1) // batch_size}")

        query_vectors = all_vecs[i:end_idx]

        distances, indices = norm_index.search(query_vectors, k)

        for batch_idx in range(batch_size_actual):
            original_idx = i + batch_idx
            for neighbor_idx, distance in zip(indices[batch_idx], distances[batch_idx]):
                if neighbor_idx > original_idx:
                    similarity = 1 - 0.5 * distance
                    if similarity >= similarity_threshold:
                        similar_pairs.append((original_idx, neighbor_idx, similarity))

    return similar_pairs

def _load_normalized_vectors(index_path):
    if not os.path.isfile(index_path):
        raise FileNotFoundError(f"FAISS index not found: {index_path}")
    index = faiss.read_index(index_path)
    ntotal = index.ntotal
    try:
        all_vecs = index.reconstruct_n(0, ntotal)
    except Exception:
        d = index.d
        all_vecs = np.zeros((ntotal, d), dtype=np.float32)
        for idx in range(ntotal):
            all_vecs[idx] = index.reconstruct(idx)
    faiss.normalize_L2(all_vecs)
    return all_vecs

def build_clusters(results, index_path=None, threshold=0.95):
\
\
\
\
\
\
\
\
\
\

    if index_path is None:
        raise ValueError("DBSCAN message index_path message")

    all_vecs = _load_normalized_vectors(index_path)
    ntotal = all_vecs.shape[0]
    active_nodes = list(range(ntotal))
    X = all_vecs

    eps = max(1.0 - float(threshold), 0.0)
    try:
        from sklearn.cluster import DBSCAN
    except Exception as e:
        raise ImportError("message scikit-learn message DBSCAN message:pip install scikit-learn") from e
    model = DBSCAN(eps=eps, min_samples=1, metric="cosine")
    labels = model.fit_predict(X)
    label_to_nodes = defaultdict(list)
    for node, lab in zip(active_nodes, labels):
        if lab == -1:

            label_to_nodes[f"noise_{node}"].append(int(node))
        else:
            label_to_nodes[int(lab)].append(int(node))
    clusters = [sorted(v) for v in label_to_nodes.values()]

    return clusters

def save_clusters(clusters, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(clusters, f, ensure_ascii=False, indent=2)
    return len(clusters)

def main():
    parser = argparse.ArgumentParser(
        description="Find efficient similar vector pairs (cosine >= threshold) using Faiss with batching."
    )
    parser.add_argument("--index", required=True, help="Path to FAISS index file, e.g., file_embeddings.index")
    parser.add_argument("--threshold", type=float, default=0.95, help="Cosine similarity threshold (default: 0.95)")
    parser.add_argument("--batch-size", type=int, default=1000, help="Batch size (default: 1000)")
    parser.add_argument(
        "--out",
        default="",
        help="Output JSON file.message <index_dir>/similarity_sets_<threshold>.json",
    )
    args = parser.parse_args()

    index_path = args.index
    threshold = float(args.threshold)
    batch_size = int(args.batch_size)

    if not args.out:
        index_dir = os.path.dirname(os.path.abspath(index_path))
        out_name = f"similarity_sets_dbscan_{threshold:.2f}.json"
        out_path = os.path.join(index_dir, out_name)
    else:
        out_path = args.out

    sim_pairs = find_similar_pairs_efficient(
        index_path=index_path,
        similarity_threshold=threshold,
        batch_size=batch_size,
    )
    clusters = build_clusters(
        results=sim_pairs,
        index_path=index_path,
        threshold=threshold,
    )
    num_sets = save_clusters(clusters, out_path)

    original_count = sum(len(c) for c in clusters) if clusters else 0
    ratio = (num_sets / original_count) if original_count > 0 else 0.0

    print(f"message {num_sets} message (DBSCAN, cosine >= {threshold}).")
    print(f"message:message/message = {num_sets}/{original_count} = {ratio:.6f}")
    print(f"message: {out_path}")

if __name__ == "__main__":
    main()

