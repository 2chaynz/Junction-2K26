"""Schedule rules without Gemini: type tables with a count column. Needs no dataset.  python tests/test_schedule.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sitelens.paths.schedule import Table, _rules  # noqa: E402

P = "data/opening_design/x/A700.pdf"
BOX = [0.0, 0.0, 10.0, 10.0]


def table(title, header, rows):
    return Table(title=title, header=header, cols=[float(i) for i in range(len(header))],
                 rows=rows, boxes=[BOX] * len(rows))


TYPES = table("DOOR SCHEDULE - TYPE", ["Count", "Type Mark", "Type"],
              [["71", "U01", "UNIT DOOR"], ["10", "U1-LH", "FLUSH"], ["52", "U41", "ACOUSTIC"]])
NUMBERS = table("DOOR SCHEDULE - NUMBER", ["Mark", "Type"],
                [[f"10{i}.A", "B1"] for i in range(30)])
WINDOWS = table("WINDOW SCHEDULE", ["Type Mark", "Type", "Count"],
                [["QQ", "1-WIDE", "16"], ["RR", "1-WIDE LOWER", "84"]])


def test_sum_count_column():
    a = _rules(P, "How many unit entry doors (type U01) are scheduled?", [NUMBERS, TYPES])
    assert a.value == 71 and len(a.evidence) == 1, a
    a = _rules(P, "How many windows of type RR are scheduled?", [WINDOWS])
    assert a.value == 84, a


def test_total_sums_counts():
    a = _rules(P, "How many windows are listed in the window schedule in total?", [WINDOWS])
    assert a.value == 100, a


def test_types_count_rows():
    a = _rules(P, "How many door types are listed in the schedule?", [TYPES])
    assert a.value == 3, a


def test_thousands_and_unreadable():
    t = table("DOOR SCHEDULE - TYPE", ["Count", "Type Mark"],
              [["71", "U01"], ["1,000", "U02"], ["10", "U03"], ["?", "U04"], ["5", "U05"]])
    assert _rules(P, "How many doors of type U02 are scheduled?", [t]).value == 1000
    assert _rules(P, "How many doors of type U04 are scheduled?", [t]) is None


def test_no_match_is_no_answer():
    assert _rules(P, "How many gates (type U22) are scheduled?", [NUMBERS, TYPES]) is None


def test_plain_row_count():
    a = _rules(P, "How many doors of type B1 are scheduled?", [NUMBERS])
    assert a.value == 30, a


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
    print("schedule ok")
