import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image, ImageDraw

from eval.msd_rooms import sample, score
from sitelens.room_geometry import rooms


class RoomGeometryTest(unittest.TestCase):
    def test_door_gap_and_duplicate_labels(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "plan.png"
            image = Image.new("L", (500, 300), 255)
            draw = ImageDraw.Draw(image)
            draw.rectangle((50, 50, 450, 250), outline=0, width=4)
            draw.line((250, 50, 250, 149), fill=0, width=4)
            draw.line((250, 152, 250, 250), fill=0, width=4)
            image.save(path)
            words = [("BEDROOM", 0.9, (100, 100, 160, 120)),
                     ("BEDROOM", 0.8, (100, 100, 160, 120)),
                     ("KITCHEN", 0.9, (310, 100, 370, 120)),
                     ("BATH", 0.9, (10, 10, 30, 30))]
            with patch("sitelens.ocr.words", return_value=words):
                self.assertCountEqual([r.kind for r in rooms(path)], ["bedroom", "kitchen"])

    def test_sample_keeps_one_floor_per_building(self):
        keys = [("1", "1", "1"), ("1", "1", "2"), ("1", "2", "3")]
        picked = sample(dict.fromkeys(keys), 40, 65)
        self.assertEqual(len(picked), 2)
        self.assertEqual(picked, sample(dict.fromkeys(reversed(keys)), 40, 65))

    def test_duplicate_boxes_cannot_match_one_room_twice(self):
        from shapely.geometry import box

        row = score([(0, 0, 10, 10)] * 2, [("Bedroom", ""), ("Bedroom", "")],
                    [box(0, 0, 10, 10), box(12, 0, 22, 10)])
        self.assertEqual((row["error"], row["localized"], row["alignable"]), (0, 1, 2))


    def test_localization_maximizes_matches_before_iou(self):
        from shapely.geometry import box

        row = score([(0, 0, 20, 10), (10, 0, 15, 10)],
                    [("Bedroom", ""), ("Bedroom", "")],
                    [box(0, 0, 10, 10), box(10, 0, 20, 10)])
        self.assertEqual(row["localized"], 2)


if __name__ == "__main__":
    unittest.main()
