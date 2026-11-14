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
                doc.new_page()
                page = doc.new_page()
                page.set_rotation(90)
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
            citation = door["dimension_evidence"][-1]
            self.assertEqual(citation["file"], schedule)
            self.assertEqual(citation["page"], 1)
            with pymupdf.open(folder / "Schedule.pdf") as doc:
                x0, y0, x1, y1 = citation["bbox"]
                tag = doc[1].search_for("101.A")[0] * doc[1].rotation_matrix
                self.assertTrue(pymupdf.Rect(x0, y0, x1, y1).contains(tag))
            self.assertIn("1.2 m plan span", window["size"])
            self.assertIn("4 m over 100.00 PDF points", window["dimension_evidence"][-1]["label"])
            self.assertEqual(unknown["size"], "")
            self.assertIn("Dimensions could not be inferred.", unknown["reason"])

    def test_schedule_does_not_replace_same_or_later_page_counts(self):
        for layout in ("schedule only", "same page", "later page", "later schedule", "rotated", "unrelated placement", "numeric label"):
            with self.subTest(layout=layout), tempfile.TemporaryDirectory() as d:
                path = "Mixed.pdf"
                with pymupdf.open() as doc:
                    page = doc.new_page()
                    if layout == "later schedule":
                        page.insert_text((100, 380), "LEVEL 01")
                        page.insert_text((110, 405), "101.A")
                        page = doc.new_page()
                    page.insert_text((100, 80), "DOOR SCHEDULE")
                    for y, row in [(110, ("MARK", "TYPE", "WIDTH", "HEIGHT", "MATL")),
                                   (130, (("900" if layout == "numeric label" else "101.A"), "A1", "900mm", "2100mm", "WOOD")),
                                   (144, ("102.A", "A1", "900mm", "2100mm", "WOOD")),
                                   (158, ("103.A", "B2", "1200mm", "2200mm", "STEEL"))]:
                        for x, label in zip((100, 165, 230, 305, 390), row):
                            page.insert_text((x, y), label, fontsize=8)
                    if layout == "rotated":
                        page.set_rotation(270)
                    if layout == "later page":
                        page = doc.new_page()
                    if layout in ("same page", "numeric label", "unrelated placement"):
                        page.insert_text((100, 380), "FIRST STOREY" if layout == "same page" else "LEVEL 01")
                    if layout in ("same page", "later page", "numeric label"):
                        page.insert_text((110, 405), "900" if layout == "numeric label" else "101.A")
                    if layout in ("schedule only", "rotated"):
                        for x, label in [(100, "0"), (150, "2"), (200, "4"), (220, "m")]:
                            page.insert_text((x - 2, 300), label, fontsize=8)
                        page.draw_rect(pymupdf.Rect(100, 303, 200, 307))
                    doc.save(Path(d) / path)

                def detected(path, page):
                    boxes = []
                    if page.number == int(layout == "later schedule"):
                        boxes.append([100, 122, 150, 132])
                    if layout in ("schedule only", "rotated"):
                        boxes.append([330, 122, 370, 155])
                    if (layout in ("same page", "later schedule", "unrelated placement", "numeric label") and page.number == 0) or (
                        layout == "later page" and page.number == 1
                    ):
                        boxes.append([102, 390, 145, 414])
                    return [("Sinks" if layout == "unrelated placement" else "Doors", Evidence(path, list(pymupdf.Rect(box) * page.rotation_matrix),
                                               page=page.number), "Detected symbol", None) for box in boxes]

                with patch.dict(os.environ, {"STOA_DATA": d, "SITELENS_STORE": d}), \
                     patch.object(takeoff_2d, "_detected", side_effect=detected) as detector:
                    result = takeoff.takeoff(path)
                if layout in ("schedule only", "rotated"):
                    detector.assert_not_called()
                    self.assertEqual(result["source"], "schedule")
                    self.assertEqual(sum(r["count"] for r in result["rows"]), 3)
                    self.assertIn("MATL: WOOD", result["rows"][0]["specifications"])
                    self.assertEqual(result["rows"][0]["dimension_evidence"], result["rows"][0]["evidence"])
                    self.assertIn("MATL: WOOD", takeoff.to_csv(result))
                elif layout == "unrelated placement":
                    self.assertEqual(result["source"], "drawing")
                    self.assertEqual({r["category"] for r in result["rows"]}, {"Sinks", "Doors (schedule)"})
                    self.assertEqual(sum(r["count"] for r in result["rows"] if r["category"] != "Sinks"), 3)
                elif layout == "numeric label":
                    row, = result["rows"]
                    self.assertEqual(row["size"], "")
                    self.assertEqual(row["type"], "Unspecified")
                else:
                    self.assertEqual(result["source"], "drawing")
                    row, = result["rows"]
                    self.assertEqual(row["count"], 1)
                    self.assertEqual(row["type"], "A1")
                    self.assertIn("900mm", row["size"])
                    self.assertEqual(row["evidence"][0]["page"], int(layout == "later page"))
                    self.assertEqual(row["dimension_evidence"][-1]["page"], int(layout == "later schedule"))

    def test_two_endpoint_dimension_line_does_not_calibrate_window_span(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ, {"STOA_DATA": d, "SITELENS_STORE": d}):
            path = "Plan.pdf"
            with pymupdf.open() as doc:
                page = doc.new_page()
                for x, label in [(100, "0"), (200, "4"), (220, "m")]:
                    page.insert_text((x - 2, 300), label, fontsize=8)
                page.draw_line((100, 303), (200, 303))
                doc.save(Path(d) / path)
            window = ("Windows", Evidence(path, [300, 100, 330, 104]), "Detected symbol", None)
            with patch.object(takeoff_2d, "_detected", return_value=[window]):
                result = takeoff.takeoff(path)
            row, = result["rows"]
            self.assertEqual(row["count"], 1)
            self.assertEqual(row["size"], "")
            self.assertIn("Dimensions could not be inferred.", row["reason"])

    def test_elevation_does_not_count_and_nts_blocks_scale(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ, {"STOA_DATA": d, "SITELENS_STORE": d}):
            path = "Views.pdf"
            with pymupdf.open() as doc:
                plan = doc.new_page()
                plan.insert_text((50, 50), "GROUND FLOOR PLAN")
                plan.insert_text((50, 70), "Scale 1:100")
                plan.insert_text((50, 90), "Inset: N.T.S.")
                plan.insert_text((50, 110), "SEE DETAILS")
                mixed = doc.new_page()
                mixed.insert_text((50, 50), "FIRST FLOOR PLAN")
                mixed.insert_text((400, 50), "EAST ELEVATION")
                mixed.draw_rect(pymupdf.Rect(395, 36, 520, 66))
                elevation = doc.new_page()
                elevation.insert_text((50, 50), "NORTH ELEVATION 1:100")
                doc.save(Path(d) / path)

            def detected(path, page):
                return [("Windows", Evidence(path, [200, 100, 230, 104], page=page.number),
                         "Detected symbol", None)]

            with patch.object(takeoff_2d, "_detected", side_effect=detected) as detector:
                result = takeoff.takeoff(path)
            detector.assert_called_once()
            row, = result["rows"]
            self.assertEqual(row["count"], 1)
            self.assertEqual(row["size"], "")
            self.assertTrue(any("not-to-scale" in line for line in row["reason"]))
            self.assertTrue(any("Skipped symbol counts on 2" in line for line in result["notes"]))

    def test_bordered_views_do_not_hide_plan_or_count_their_icons(self):
        for heading in ("DOOR LEGEND", "STAIR DETAIL", "NORTH ELEVATION 1:100"):
            with tempfile.TemporaryDirectory() as d, patch.dict(os.environ, {"STOA_DATA": d, "SITELENS_STORE": d}):
                path = "Plan.pdf"
                with pymupdf.open() as doc:
                    page = doc.new_page()
                    page.insert_text((50, 50), "GROUND FLOOR PLAN")
                    page.insert_text((410, 60), heading)
                    page.draw_rect(pymupdf.Rect(400, 40, 550, 220))
                    doc.save(Path(d) / path)
                doors = [("Doors", Evidence(path, box), "Detected symbol", None)
                         for box in ([90, 100, 110, 110], [410, 100, 430, 110])]
                with patch.object(takeoff_2d, "_detected", return_value=doors):
                    result = takeoff.takeoff(path)
                row, = result["rows"]
                self.assertEqual(row["count"], 1)
                self.assertEqual(row["evidence"][0]["bbox"], [90, 100, 110, 110])

    def test_raster_not_to_scale_label_blocks_window_estimate(self):
        from sitelens.measure import Scale

        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ, {"STOA_DATA": d, "SITELENS_STORE": d}):
            path = "Scan.png"
            (Path(d) / path).touch()
            window = ("Windows", Evidence(path, [200, 100, 230, 104]), "Detected symbol", None)
            with patch.object(takeoff_2d, "_detected", return_value=[window]), \
                 patch.object(takeoff_2d.measure, "_ocr", return_value=[("NOT TO SCALE", .99, [10, 10, 60, 22])]), \
                 patch.object(takeoff_2d.measure, "bar", return_value=[Scale("bar", .04, "bar", "", .8, [])]):
                result = takeoff.takeoff(path)
            row, = result["rows"]
            self.assertEqual(row["count"], 1)
            self.assertEqual(row["size"], "")
            self.assertTrue(any("not-to-scale" in line for line in row["reason"]))

    def test_shared_plan_tag_stays_ambiguous(self):
        doors = [("Doors", Evidence("plan.pdf", box)) for box in ([0, 0, 20, 10], [18, 0, 38, 10])]
        words = [("D1", [18, 2, 20, 4]), ("D2", [0, 2, 2, 4])]
        specs = {("Doors", tag, True): [tag] for tag in ("D1", "D2")}
        self.assertEqual(takeoff_2d._associate(doors, words, specs), {})

    def test_conflicting_mark_and_type_leave_size_unknown(self):
        door = Evidence("plan.pdf", [0, 0, 20, 10])
        citation = Evidence("schedule.pdf", [0, 0, 40, 10])
        specs = {
            ("Doors", "D1", True): [("A", "900 mm", (), citation)],
            ("Doors", "D1", False): [("D1", "1200 mm", (), citation)],
        }
        row, = takeoff_2d._rows([("Doors", door, "Detected symbol", None)],
                                [("D1", [0, 2, 4, 6])], specs, (None, "No scale", []))
        self.assertEqual(row["count"], 1)
        self.assertEqual(row["size"], "")
        self.assertTrue(any("disagree" in line for line in row["reason"]))

    def test_two_plan_views_do_not_share_one_scale(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ, {"STOA_DATA": d, "SITELENS_STORE": d}):
            path = "Plans.pdf"
            with pymupdf.open() as doc:
                page = doc.new_page()
                page.insert_text((50, 50), "GROUND FLOOR PLAN")
                page.insert_text((350, 50), "FIRST FLOOR PLAN")
                page.insert_text((50, 70), "Scale 1:100")
                doc.save(Path(d) / path)
            windows = [("Windows", Evidence(path, box), "Detected symbol", None)
                       for box in ([50, 100, 80, 104], [350, 100, 380, 104])]
            with patch.object(takeoff_2d, "_detected", return_value=windows):
                result = takeoff.takeoff(path)
            row, = result["rows"]
            self.assertEqual(row["count"], 2)
            self.assertEqual(row["size"], "")
            self.assertTrue(any("multiple views" in line for line in row["reason"]))

    def test_scan_view_boundaries(self):
        import numpy as np

        image = np.full((600, 600), 255, dtype=np.uint8)
        image[30:180, 400:575] = 0
        image[33:177, 403:572] = 255
        plan = ("GROUND FLOOR PLAN", [25, 25, 125, 35])
        legend = ("DOOR LEGEND", [420, 50, 510, 60])
        regions, excluded, issue = takeoff_2d._scan_metadata([plan, legend], lambda: image)
        self.assertFalse(excluded)
        self.assertTrue(takeoff_2d._outside_schedule([90, 100, 120, 105], regions))
        self.assertFalse(takeoff_2d._outside_schedule([420, 100, 450, 105], regions))
        self.assertIn("multiple views", issue)
        _, excluded, _ = takeoff_2d._scan_metadata([legend], lambda: image)
        self.assertTrue(excluded)

    def test_selectable_sheet_number_does_not_bypass_scan_ocr(self):
        import io

        from PIL import Image

        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ, {"STOA_DATA": d, "SITELENS_STORE": d}):
            path = "Hybrid.pdf"
            image = io.BytesIO()
            Image.new("L", (200, 200), 255).save(image, "PNG")
            with pymupdf.open() as doc:
                page = doc.new_page()
                page.insert_image(pymupdf.Rect(20, 20, 500, 500), stream=image.getvalue())
                page.insert_text((30, 530), "A-201")
                doc.save(Path(d) / path)
            with patch("sitelens.ocr._engine") as engine, patch.object(takeoff_2d, "_detected") as detect:
                engine.return_value.return_value = (
                    [([[0, 0], [100, 0], [100, 12], [0, 12]], "NORTH ELEVATION", .99)], None
                )
                result = takeoff.takeoff(path)
            detect.assert_not_called()
            self.assertEqual(result["rows"], [])

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
