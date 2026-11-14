import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pymupdf

from sitelens import takeoff, takeoff_2d
from sitelens.answer import Evidence


class DrawingTakeoff(unittest.TestCase):
    def test_scale_and_project_schedule(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ, {"STOA_DATA": d, "SITELENS_STORE": d}):
            plan = "data/opening_design/P/Plan.pdf"
            schedule = "data/opening_design/P/Schedule.pdf"
            folder = (Path(d) / plan).parent
            folder.mkdir(parents=True)
            with pymupdf.open() as doc:
                page = doc.new_page()
                page.insert_text((110, 110), "101.A")
                for x, label in [(100, "0"), (150, "2"), (200, "4"), (220, "m")]:
                    page.insert_text((x - 2, 300), label, fontsize=8)
                page.draw_rect(pymupdf.Rect(100, 303, 200, 307))
                doc.save(folder / "Plan.pdf")
            with pymupdf.open() as doc:
                page = doc.new_page()
                page.insert_text((100, 80), "DOOR SCHEDULE")
                for y, row in [(110, ("MARK", "TYPE", "WIDTH", "HEIGHT", "MATL")),
                               (130, ("101.A", "A1", "900mm", "2100mm", "WOOD")),
                               (144, ("102.A", "A1", "900mm", "2100mm", "WOOD")),
                               (158, ("103.A", "B2", "1200mm", "2200mm", "STEEL"))]:
                    for x, label in zip((100, 165, 230, 305, 390), row):
                        page.insert_text((x, y), label, fontsize=8)
                doc.save(folder / "Schedule.pdf")
            objects = [
                ("Doors", Evidence(plan, [100, 90, 145, 115]), "Detected symbol", None),
                ("Windows", Evidence(plan, [300, 100, 330, 104]), "Detected symbol", None),
                ("Doors", Evidence(plan, [400, 100, 430, 104]), "Detected symbol", None),
            ]
            with patch.object(takeoff_2d, "_detected", return_value=objects):
                result = takeoff.takeoff(plan)
            self.assertEqual(result["source"], "drawing")
            self.assertEqual(sum(r["count"] for r in result["rows"]), 3)
            door, window, unknown = result["rows"]
            self.assertEqual(door["type"], "A1")
            self.assertIn("900mm", door["size"])
            self.assertEqual(door["specifications"], ["MATL: WOOD"])
            self.assertEqual(door["dimension_evidence"][-1]["file"], schedule)
            self.assertIn("1.2 m plan span", window["size"])
            self.assertIn("4 m over 100.00 PDF points", window["dimension_evidence"][-1]["label"])
            self.assertEqual(unknown["size"], "")
            self.assertIn("Dimensions could not be inferred.", unknown["reason"])

    def test_schedule_does_not_replace_same_or_later_page_counts(self):
        for layout in ("schedule only", "same page", "later page"):
            with self.subTest(layout=layout), tempfile.TemporaryDirectory() as d:
                path = "Mixed.pdf"
                with pymupdf.open() as doc:
                    page = doc.new_page()
                    page.insert_text((100, 80), "DOOR SCHEDULE")
                    for y, row in [(110, ("MARK", "TYPE", "WIDTH", "HEIGHT")),
                                   (130, ("101.A", "A1", "900mm", "2100mm")),
                                   (144, ("102.A", "A1", "900mm", "2100mm")),
                                   (158, ("103.A", "B2", "1200mm", "2200mm"))]:
                        for x, label in zip((100, 165, 230, 305), row):
                            page.insert_text((x, y), label, fontsize=8)
                    if layout == "later page":
                        page = doc.new_page()
                    if layout != "schedule only":
                        page.insert_text((110, 405), "101.A")
                    doc.save(Path(d) / path)

                def detected(path, page):
                    boxes = []
                    if page.number == 0:
                        boxes.append([100, 122, 150, 132])
                    if (layout == "same page" and page.number == 0) or (
                        layout == "later page" and page.number == 1
                    ):
                        boxes.append([102, 390, 145, 414])
                    return [("Doors", Evidence(path, box, page=page.number), "Detected symbol", None)
                            for box in boxes]

                with patch.dict(os.environ, {"STOA_DATA": d, "SITELENS_STORE": d}), \
                     patch.object(takeoff_2d, "_detected", side_effect=detected):
                    result = takeoff.takeoff(path)
                if layout == "schedule only":
                    self.assertEqual(result["source"], "schedule")
                    self.assertEqual(sum(r["count"] for r in result["rows"]), 3)
                else:
                    self.assertEqual(result["source"], "drawing")
                    row, = result["rows"]
                    self.assertEqual(row["count"], 1)
                    self.assertEqual(row["type"], "A1")
                    self.assertIn("900mm", row["size"])
                    self.assertEqual(row["evidence"][0]["page"], int(layout == "later page"))
                    self.assertEqual(row["dimension_evidence"][-1]["page"], 0)

    def test_disagreeing_scale_bars_do_not_produce_dimensions(self):
        from sitelens.measure import Scale

        bars = [Scale("1", .04, "bar", "", .8, []), Scale("2", .02, "bar", "", .8, [])]
        with patch.object(takeoff_2d.measure, "load", return_value={"calibrations": [], "active": {}}), \
             patch.object(takeoff_2d.measure, "notes", return_value=[]):
            value, reason, _ = takeoff_2d._scale("plan.pdf", 0, bars)
        self.assertIsNone(value)
        self.assertIn("disagree", reason)


if __name__ == "__main__":
    unittest.main()
