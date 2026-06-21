import re
import itertools
import random

BSIC_TYPE_SET = ['string','number','boolean','null','undefined','any','void','never','object','symbol','bigint','unknown']
TYPE_TRANSFORM = ['string','number','boolean','symbol','bigint']

def generate_type_combinations(type_str, bsic_type_set=BSIC_TYPE_SET, type_transform=TYPE_TRANSFORM, sample_size=10):
\
\
\

    type_pattern = r'\b(' + '|'.join(re.escape(t) for t in bsic_type_set) + r')\b'
    found_types = re.findall(type_pattern, type_str)

    if not found_types:
        return [type_str]
    else:
        replace_options = [type_transform for _ in found_types]
        total_combinations = 1
        for opts in replace_options:
            total_combinations *= len(opts)

        if total_combinations <= sample_size:
            combos = list(itertools.product(*replace_options))
        else:
            combos = set()
            while len(combos) < sample_size:
                combo = tuple(random.choice(type_transform) for _ in found_types)
                combos.add(combo)
            combos = list(combos)
        results = []
        for combo in combos:
            def repl_gen():
                it = iter(combo)
                def repl(m):
                    return next(it)
                return repl
            new_str = re.sub(type_pattern, repl_gen(), type_str, count=len(found_types))
            results.append(new_str)
        return results

if __name__ == "__main__":
    type_str = "string | number |boolean"
    results = generate_type_combinations(type_str)
    for result in results:
        print(result)
