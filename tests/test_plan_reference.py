import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import pymupdf

from sitelens.router import answer


class PlanReferenceTest(unittest.TestCase):
    def setUp(self):
        folder = TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.addCleanup(patch.stopall)
        patch("sitelens.paths.plan_reference.data_root", return_value=self.root).start()

    def plan(self):
        with pymupdf.open() as doc:
            page = doc.new_page()
            page.insert_text((47, 104), "24")
            page.insert_text((47, 204), "25")
            for y in (100, 200):
                page.draw_line((72, y), (300, y))
                page.insert_text((133, y + 4), "F7")
            page.insert_text((120, 260), "5 / S2.09")
            page.insert_text((120, 280), "5 / S2.08")
            doc.save(self.root / "plan.pdf")

    def schedule(self, filename):
        with pymupdf.open() as doc:
            page = doc.new_page()
            page.insert_text((90, 85), "CONCRETE FOOTING SCHEDULE")
            for x in (80, 155, 240):
                page.draw_line((x, 100), (x, 160))
            for y in (100, 120, 140, 160):
                page.draw_line((80, y), (240, y))
            for y, row in zip((114, 134, 154), (("Type", "Depth"), ("F7", "600 mm"), ("F70", "900 mm"))):
                for x, cell in zip((90, 165), row):
                    page.insert_text((x, y), cell)
            doc.save(self.root / filename)

    def test_grid_selects_correct_tag_and_exact_row(self):
        self.plan()
        self.schedule("schedule.pdf")
        result = answer("plan.pdf", "Which schedule row matches footing F7 along horizontal grid line 24?")
        self.assertIn("600 mm", result.value)
        self.assertNotIn("900 mm", result.value)
        self.assertEqual([e.file for e in result.evidence], ["plan.pdf", "plan.pdf", "schedule.pdf"])
        self.assertLess(result.evidence[0].bbox[1], 110)

    def test_duplicate_targets_are_not_confirmed(self):
        self.plan()
        self.schedule("schedule-a.pdf")
        self.schedule("schedule-b.pdf")
        result = answer("plan.pdf", "Which schedule row matches footing F7 along grid line 24?")
        self.assertIn("2 matching targets", result.value)
        self.assertEqual(result.confidence, 0)

    def test_exact_sheet_and_detail_pair(self):
        self.plan()
        for name in ("S2.08", "S2.09"):
            with pymupdf.open() as doc:
                page = doc.new_page()
                page.insert_text((90, 100), "Detail 5: Footing section")
                page.insert_text((90, 140), "Detail 50: Slab section")
                doc.save(self.root / f"{name}.pdf")
        result = answer("plan.pdf", "Where is detail 5 on sheet S2.09?")
        self.assertEqual(result.value, "Detail 5 on sheet S2.09")
        self.assertEqual([e.file for e in result.evidence], ["plan.pdf", "S2.09.pdf"])


if __name__ == "__main__":
    unittest.main()
