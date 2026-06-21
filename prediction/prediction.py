from openai import OpenAI
import os
import gzip
import json
from collections import Counter
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
from tqdm import tqdm
from typing import Literal, List, Dict, Any

# Global config shared across all threads
_global_config = {
    'api_key': '0',
    'base_url': 'http://localhost:8001/v1',
    'model': None,
    'iteration': 10,
    'instruction_template': '''
    You are a TypeScript type inference expert. Please perform type inference for the <mask> part based on the code slice below, and output the result strictly in the required format.

    Example:
        Code slice: let a:<mask> = "hello";
        Response: <mask>string

        Code slice: let a:<mask> = [1, 2, 3];
        Response: <mask>number[]
    '''
}

_thread_local = threading.local()


def read_jsonl_gz(filename):
    data = []
    with gzip.open(filename, 'rt', encoding='utf-8') as f:
        for line in f:
            data.append(json.loads(line))
    return data


def process_single_item(args):
    item, idx, total_items = args

    if not hasattr(_thread_local, "client"):
        _thread_local.client = OpenAI(
            api_key=_global_config['api_key'],
            base_url=_global_config['base_url']
        )
    client = _thread_local.client
    model = _global_config['model']
    iteration = _global_config['iteration']
    instruction_template = _global_config['instruction_template']

    responses = []
    for i in range(iteration):
        context = f"{instruction_template}\nCode slice: {item['sliced_code']}"
        try:
            messages = [{"role": "user", "content": context}]
            result = client.chat.completions.create(
                messages=messages,
                model=model,
                temperature=0.5,
                top_p=0.9,
                max_tokens=128
            )
            resp_str = result.choices[0].message.content.strip()
            resp_str = resp_str.replace('\n', '')
        except Exception as e:
            print(f"[thread {threading.get_ident()}] API error: {e}")
            return None

        match = re.search(r'<mask>\s*([^\n\r]+)', resp_str)
        if match:
            extracted_type = match.group(1).strip()
        else:
            extracted_type = resp_str
        responses.append(extracted_type)

    response_counter = Counter(responses)
    predictions = []
    for pred_type, count in response_counter.most_common():
        frequency = count / iteration
        predictions.append([pred_type, frequency])

    return {
        'id': item.get('id', ''),
        'predictions': predictions
    }


def save_results_thread_safe(results, output_fp, lock):
    with lock:
        try:
            with open(output_fp, 'w', encoding='utf-8') as f:
                json.dump(results, f, ensure_ascii=False, indent=4)
        except Exception as e:
            print(f"Error writing file: {e}")


def append_results_jsonl_thread_safe(buffer: List[Dict[str, Any]], output_fp: str, lock: threading.Lock):
    if not buffer:
        return
    with lock:
        try:
            with open(output_fp, 'a', encoding='utf-8') as f:
                for item in buffer:
                    f.write(json.dumps(item, ensure_ascii=False) + '\n')
        except Exception as e:
            print(f"Error writing file: {e}")


def prediction(testdata_fp, model, iteration=10, output_fp=None, num_threads=4,
               output_format: Literal['json', 'jsonl', None] = None):
    _global_config['model'] = model
    _global_config['iteration'] = iteration

    if output_fp is not None:
        output_dir = os.path.dirname(output_fp)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir)

    if output_format is None:
        if output_fp and output_fp.endswith('.jsonl'):
            output_format = 'jsonl'
        else:
            output_format = 'json'

    existing_ids = set()
    existing_results = []
    if output_fp is not None and os.path.exists(output_fp):
        try:
            if output_format == 'jsonl':
                with open(output_fp, 'r', encoding='utf-8') as f:
                    for line in f:
                        if not line.strip():
                            continue
                        obj = json.loads(line)
                        existing_results.append(obj)
                        if 'id' in obj:
                            existing_ids.add(obj['id'])
            else:
                with open(output_fp, 'r', encoding='utf-8') as f:
                    existing_results = json.load(f)
                    existing_ids = {item.get('id', '') for item in existing_results if 'id' in item}
            print(f"Loaded {len(existing_ids)} existing predictions")
        except (json.JSONDecodeError, FileNotFoundError) as e:
            print(f"Error reading existing file: {e}, creating new file")
            existing_results = []
            existing_ids = set()

    data = read_jsonl_gz(testdata_fp)

    items_to_process = []
    for idx, item in enumerate(data):
        item_id = item.get('id', '')
        if item_id not in existing_ids:
            items_to_process.append((item, idx, len(data)))
        else:
            print(f"[{idx+1}/{len(data)}] Skipping already predicted id: {item_id}")

    if not items_to_process:
        print("All items have already been processed!")
        return existing_results

    print(f"Processing {len(items_to_process)} items with {num_threads} threads")

    results = existing_results.copy()
    results_lock = threading.Lock()
    results_list = results
    pending_buffer: List[Dict[str, Any]] = []

    start_time = time.time()
    skipped_due_error = 0
    last_save_time = start_time
    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        future_to_item = {executor.submit(process_single_item, item): item for item in items_to_process}

        with tqdm(total=len(items_to_process), desc="Progress", unit="items") as pbar:
            completed_count = 0
            for future in as_completed(future_to_item):
                try:
                    result = future.result()
                    if result is None:
                        skipped_due_error += 1
                    else:
                        with results_lock:
                            results_list.append(result)
                            if output_format == 'jsonl':
                                pending_buffer.append(result)
                    completed_count += 1
                    pbar.update(1)

                    if output_fp and (completed_count % 100 == 0 or time.time() - last_save_time > 120):
                        if output_format == 'jsonl':
                            with results_lock:
                                buffer_to_flush = list(pending_buffer)
                                pending_buffer.clear()
                            append_results_jsonl_thread_safe(buffer_to_flush, output_fp, results_lock)
                        else:
                            with results_lock:
                                save_results = list(results_list)
                            save_results_thread_safe(save_results, output_fp, results_lock)
                        pbar.set_postfix({"saved": "checkpoint"})
                        last_save_time = time.time()
                except Exception as e:
                    print(f"Error processing task: {e}")

    final_results = results_list
    if output_fp is not None:
        if output_format == 'jsonl':
            with results_lock:
                buffer_to_flush = list(pending_buffer)
                pending_buffer.clear()
            append_results_jsonl_thread_safe(buffer_to_flush, output_fp, results_lock)
        else:
            save_results_thread_safe(final_results, output_fp, results_lock)

    skipped_count = len(data) - len(items_to_process)
    print(f"\nDone! Total: {len(data)} items, skipped (already done): {skipped_count}, "
          f"new: {len(final_results) - len(existing_results)}, errors: {skipped_due_error}")

    return final_results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='LLM type prediction on sliced code data.')
    parser.add_argument('--input', required=True, help='Path to .jsonl.gz test data')
    parser.add_argument('--model', required=True, help='Model name')
    parser.add_argument('--iteration', type=int, default=20, help='Number of LLM calls per item')
    parser.add_argument('--output', required=True, help='Output file path (.json or .jsonl)')
    parser.add_argument('--threads', type=int, default=4, help='Number of worker threads')
    parser.add_argument('--api-key', default='0', help='API key')
    parser.add_argument('--base-url', default='http://localhost:8001/v1', help='API base URL')
    args = parser.parse_args()

    _global_config['api_key'] = args.api_key
    _global_config['base_url'] = args.base_url

    prediction(
        testdata_fp=args.input,
        model=args.model,
        iteration=args.iteration,
        output_fp=args.output,
        num_threads=args.threads,
    )
