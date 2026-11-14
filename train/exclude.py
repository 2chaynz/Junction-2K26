"""Every drawing id in the Stoa dataset, to exclude from training on outside data.

  python -m train.exclude > train/exclude_cubicasa.txt

Public CubiCasa5K folders are numbered like the `colorful-NNNNN` / `high_quality-NNNNN` file names here,
so a training script must drop any CubiCasa5K sample whose number is in this list.
"""
import json
import re

from sitelens import data_root

if __name__ == "__main__":
    ids = set()
    for p in (data_root() / "data" / "cubicasa5k").glob("*"):
        m = re.search(r"(\d+)$", p.stem)
        if m:
            ids.add(m.group(1))
    with open(data_root() / "questions.jsonl", encoding="utf8") as f:
        for line in f:
            m = re.search(r"cubicasa5k/[^/]*?(\d+)\.\w+$", json.loads(line)["path"])
            if m:
                ids.add(m.group(1))
    print("\n".join(sorted(ids, key=int)))
