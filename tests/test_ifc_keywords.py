"""IFC element keywords ignore quoted names; Dutch words; no curtain walls. Needs no dataset."""
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sitelens.paths import ifc  # noqa: E402

seen = []


def by_type(t, include_subtypes=True):
    if t == "IfcBuildingStorey":
        return [SimpleNamespace(Name="00 Begane grond")]
    seen.append(t)
    return []


model = SimpleNamespace(by_type=by_type)
path = Path("gym.ifc")
with patch.object(ifc, "_file", return_value=model), patch.object(ifc, "data_root", return_value=Path(".")):
    def types(q):
        seen.clear()
        assert ifc._aggregate(path, q) is not None, q
        return set(seen)

    # 'Hambakendreef' contains 'aken' (Estonian/Dutch window keyword)
    assert types("How many beams are there in the model 'Gymzaal Hambakendreef, Amersfoort'?") == \
        {"IfcBeam", "IfcBeamStandardCase"}
    assert types("Hoeveel kolommen staan er op de plattegrond van '00 Begane grond'?") == \
        {"IfcColumn", "IfcColumnStandardCase"}
    assert "IfcCurtainWall" not in types("How many walls are there in the model 'Gymzaal Hambakendreef'?")
print("IFC keywords ok")
