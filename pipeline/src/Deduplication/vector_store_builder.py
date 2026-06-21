import argparse
import os
import sys
import json
import torch
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
import re

def check_gpu_available():
    if torch.cuda.is_available():
        print("Using GPU for computation")
        return "cuda:1"
    else:
        raise RuntimeError("No GPU available. Please run on a machine with CUDA support.")

def load_file_paths(json_path):
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            files = json.load(f)
        return files
    except Exception as e:
        print(f"Failed to read input files JSON: {e}")
        sys.exit(1)

def remove_ts_comments(code):

    code = re.sub(r'/\*[\s\S]*?\*/', '', code)

    code = re.sub(r'//.*', '', code)
    return code

def read_files(file_paths):
    contents = []
    successful_paths = []
    for fp in file_paths:
        try:
            with open(fp, 'r', encoding='utf-8') as f:

                file_content = f.read()
                file_content_no_comments = remove_ts_comments(file_content)
                contents.append(file_content_no_comments)
                successful_paths.append(fp)
        except Exception as e:
            print(f"Error reading file {fp}: {e}")
            continue
    print(f"Successfully loaded {len(contents)} files")
    return contents, successful_paths

def get_model(device):
    model = SentenceTransformer('BAAI/bge-m3')
    model.max_seq_length = 2048
    model.to(device)
    return model

def compute_embeddings(model, texts, device, batch_size=128):
    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        convert_to_numpy=True,
        show_progress_bar=True,
        device=device
    )
    print(f"Generated embeddings with shape: {embeddings.shape}")
    return embeddings

def build_faiss_index(embeddings):
    dimension = embeddings.shape[1]
    use_gpu_faiss = torch.cuda.is_available() and hasattr(faiss, "StandardGpuResources")

    if use_gpu_faiss:
        print("Using FAISS GPU index")
        res = faiss.StandardGpuResources()
        cpu_index = faiss.IndexFlatL2(dimension)
        gpu_index = faiss.index_cpu_to_gpu(res, 0, cpu_index)
        gpu_index.add(embeddings.astype(np.float32))
        index = faiss.index_gpu_to_cpu(gpu_index)
    else:
        print("Using FAISS CPU index")
        index = faiss.IndexFlatL2(dimension)
        index.add(embeddings.astype(np.float32))
    return index

def save_faiss_index(index, path):
    faiss.write_index(index, path)
    print(f"Index file: {path}")

def save_index2path(file_paths, json_path):
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({str(i): file_paths[i] for i in range(len(file_paths))}, f, ensure_ascii=False, indent=2)
    print(f"File-Index mapping: {json_path}")

def build_vector_store(input_files_path, outdir):
    device = check_gpu_available()
    file_paths = load_file_paths(input_files_path)
    contents, actual_paths = read_files(file_paths)
    if not os.path.exists(outdir):
        os.makedirs(outdir)
    model = get_model(device)
    embeddings = compute_embeddings(model, contents, device=device)
    index = build_faiss_index(embeddings)
    embeddings_index_path = os.path.join(outdir, "file_embeddings.index")
    index2path_path = os.path.join(outdir, "file_index2path.json")
    save_faiss_index(index, embeddings_index_path)
    save_index2path(actual_paths, index2path_path)
    print("FAISS index saved successfully!")

def main():
    parser = argparse.ArgumentParser(description="Build FAISS vector store for source files, with GPU acceleration.")
    parser.add_argument('--input_files', required=True, help="Path to JSON file containing list of source file paths.")
    parser.add_argument('--outdir', required=True, help="Directory to store output index and mapping.")
    args = parser.parse_args()
    build_vector_store(args.input_files, args.outdir)

if __name__ == '__main__':
    main()
