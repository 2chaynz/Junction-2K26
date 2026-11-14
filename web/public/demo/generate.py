"""Generate the self-contained IFC revisions and measured evidence for the demo."""
from pathlib import Path
import json
import uuid

import ifcopenshell.api as api
from ifcopenshell.guid import compress
from ifcopenshell.util.element import get_psets
import numpy as np

OUT = Path(__file__).resolve().parent
WALLS = [
    ("East workshop enclosure", "added", 6, 3.2, 17, 9, 6.4, False),
    ("Workshop partition", "removed", 4, 3.2, 17, 6, 6.4, False),
]


def build(revision):
    f = api.run("project.create_file")
    entity = lambda kind, name: api.run("root.create_entity", f, ifc_class="Ifc" + kind, name=name)
    project = entity("Project", "Harbor Workshop")
    api.run("unit.assign_unit", f)
    model = api.run("context.add_context", f, context_type="Model")
    body = api.run("context.add_context", f, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=model)
    building = entity("Building", project.Name)
    api.run("aggregate.assign_object", f, products=[building], relating_object=project)

    styles = {}
    for name, rgb in {"stone": (.74, .77, .80), "glass": (.35, .55, .64), "deck": (.43, .49, .54)}.items():
        s = api.run("style.add_style", f, name=name)
        api.run("style.add_surface_style", f, style=s, attributes={"SurfaceColour": dict(zip(("Red", "Green", "Blue"), rgb))})
        styles[name] = s

    def block(kind, name, length, depth, height, x, y, z, turn=False, style="stone"):
        e = entity(kind, name)
        e.GlobalId = compress(uuid.uuid5(uuid.NAMESPACE_URL, "sitelens/harbor/" + name).hex)
        rep = api.run("geometry.add_wall_representation", f, context=body, length=length, height=height, thickness=depth)
        api.run("geometry.assign_representation", f, product=e, representation=rep)
        api.run("style.assign_representation_styles", f, shape_representation=rep, styles=[styles[style]])
        m = np.eye(4)
        if turn:
            m[:2, :2] = [[0, -1], [1, 0]]
        m[:3, 3] = [x, y, z]
        api.run("geometry.edit_object_placement", f, product=e, matrix=m)
        api.run("spatial.assign_container", f, products=[e], relating_structure=level)
        return e

    for i in range(3):
        level = entity("BuildingStorey", f"Level {i+1}")
        api.run("aggregate.assign_object", f, products=[level], relating_object=building)
        z = i * 3.2
        d = 9 if i == 2 else 13
        block("Slab", f"Deck {i}", 24, 13, .24, 0, 0, z-.24, style="deck")
        block("Wall", f"North {i}", 24, .26, 3.2, 0, 0, z)
        block("Wall", f"West {i}", d, .26, 3.2, .26, 0, z, True)
        for x in range(0, 24, 3):
            block("Column", f"Pier {i}/{x}", .34, .36, 3.2, x, d-.25, z)
            if i < 2:
                block("Window", f"Glazing {i}/{x}", 2.66, .16, 2.25, x+.34, d-.2, z+.48, style="glass")
        if i == 2:
            block("Slab", "Roof", 24, 9, .3, 0, 0, z+3.2, style="deck")
            for name, change, length, height, x, y, z, turn in WALLS:
                if revision == "overlay" or (change == "added") == (revision == "B"):
                    e = block("Wall", name, length, .22, height, x, y, z, turn)
                    q = api.run("pset.add_qto", f, product=e, name="Qto_WallBaseQuantities")
                    api.run("pset.edit_qto", f, qto=q, properties={"GrossSideArea": length * height})
    f.write(str(OUT / f"harbor-{revision}.ifc"))
    return f


a, b = build("A"), build("B")
build("overlay")
before = {e.GlobalId: e for e in a.by_type("IfcWall")}
after = {e.GlobalId: e for e in b.by_type("IfcWall")}
changes = [
    {"guid": guid, "name": e.Name, "change": change, "area": get_psets(e)["Qto_WallBaseQuantities"]["GrossSideArea"]}
    for change, source, other in [("added", after, before), ("removed", before, after)]
    for guid, e in source.items() if guid not in other
]
(OUT / "harbor-changes.json").write_text(json.dumps(changes, indent=2) + "\n", encoding="utf-8")
