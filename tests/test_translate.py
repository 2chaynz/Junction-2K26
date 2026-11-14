"""English display text. Needs no dataset or key.  python tests/test_translate.py"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.pop("GEMINI_API_KEY", None)

from sitelens.translate import dictionary as D, english_obj  # noqa: E402

# storeys
assert D("1.korrus") == "Floor 1"
assert D("Katus") == "Roof"
assert D("Erdgeschoss") == "Ground floor"
assert D("2.OG") == "Upper floor 2"
assert D("00 Begane grond") == "00 Ground floor"
assert D("1. Sal") == "Floor 1"
assert D("KG") == "Basement"

# English, units and codes stay
for s in ("Level 1", "Living Room", "kg", "Post", "The bad wall", "Pset_WallCommon", "W5240", "1:100"):
    assert D(s) == s, s

# words and compounds
assert D("Basiswand:Wall-Ext_215Bwk") == "Basic wall:Wall-Ext_215Bwk"
assert D("KORIDOR (119)") == "CORRIDOR (119)"
assert D("Geschossdecke") == "Floor slab"
assert D("Verf - wit") == "Paint - white"
assert D("Bad") == "Bathroom"

# objects: ids and paths kept, by_level keys match levels
t = {"path": "data/ifc_models/x_Zimmer.ifc", "rows": [{
    "type": "Basiswand", "levels": ["1.korrus"], "by_level": {"1.korrus": 3},
    "evidence": [{"file": "data/x_Zimmer.pdf", "label": "Tür 1", "kind": "ifc", "ifc_guid": "2Zimmer"}]}],
    "trace": ["found room 'Zimmer'"]}
out = english_obj(t)
row = out["rows"][0]
assert out["path"] == t["path"] and row["evidence"][0]["file"] == "data/x_Zimmer.pdf"
assert row["evidence"][0]["ifc_guid"] == "2Zimmer"
assert row["type"] == "Basic wall" and row["evidence"][0]["label"] == "Door 1"
assert row["levels"] == ["Floor 1"] and row["by_level"] == {"Floor 1": 3}
assert out["trace"] == ["found room 'Zimmer' (room)"]
print("translate ok")
