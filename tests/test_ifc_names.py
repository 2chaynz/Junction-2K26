"""Exercise IFC room and storey matching without a dataset."""
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sitelens.paths import ifc

model = SimpleNamespace(by_type=lambda _: [SimpleNamespace(Name=name)
                                           for name in ("4.korrus", "14.korrus", None)])
assert ifc._named_storeys(model, "How many doors are on 14.korrus?") == {"14.korrus"}
assert ifc._named_storeys(model, "How many doors are on floor 4?") == {"4.korrus"}

path = Path("building.ifc")
rooms = [dict(name="57-2", long="ESIK", storey="4.korrus", area=3.7, guid="room")]
with patch.object(ifc, "model_path", return_value=path), patch.object(ifc, "_file", return_value=model), \
        patch.object(ifc, "spaces", return_value=rooms), patch.object(ifc, "data_root", return_value=Path(".")):
    for question in ("What is the net floor area of ESIK (57-2) on 4.korrus?",
                     "What is the net floor area of ESIK (57-2) on floor 4?"):
        answer = ifc.answer(str(path), question)
        assert answer is not None and answer.value == 3.7
print("IFC names ok")
