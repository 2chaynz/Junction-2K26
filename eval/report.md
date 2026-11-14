# Scores (T10)

Sat 14 Nov 2026 · commit `bda132f` (main + detector v2 weights, `gh release download detector-v2`) · router, no VLM key (VLM path off) · CPU laptop.

## Headline
| Set | Qs | Accuracy | €/answer |
|---|---|---|---|
| Full dataset, dev split (all sources) | 25,295 (25,125 graded) | **89.3%** | 0.00001 |
| Full dataset, CubiCasa5K official test plans | 6,796 | **80.4%** | 0.00001 |
| Preview, dev split | 1,856 | 89.9% | 0.00001 |

- Same 6,796 Qs on 387 plans as easyiowa's "official test split" (78.7%). We're +1.7 pts.
- Our detector never saw any Stoa drawing (`train/exclude.py`). easyiowa trains on the Stoa train-split plans.
- Text questions (ifc_bench, opening_design text) are not auto-graded.

## Splits
- The Stoa dataset ships no split. `--split test` = cubicasa5k plans listed in public CubiCasa5K `test.txt` (`eval/cubicasa_test.txt`, 400 ids, 387 in Stoa). Other sources have no test split.
- `--split dev` = our hash split (`eval/split.py`), ~20% of drawings.

## Full dataset, dev split
| source | type | n | acc |
|---|---|---|---|
| cubicasa5k | count | 16,968 | 85.9% |
| swiss_dwellings | area | 2,422 | 96.8% |
| swiss_dwellings | count | 5,158 | 97.4% |
| ifc_models | area | 382 | 92.4% |
| ifc_models | count | 124 | 83.1% |
| ifc_models | length | 18 | 77.8% |
| ifc_models | volume | 36 | 86.1% |
| opening_design | count | 17 | 0% |

- IFC is lower than on the preview (100%): two dev models not in the preview. bsc-duplex 12/38, bsc-gymzaal-amersfoort 97/128, bsc-molio 392/394.
- opening_design: T11 (schedule tables) is not on this commit.

## CubiCasa per question
| question | test (6,796) | full dev (16,968) |
|---|---|---|
| floors | 98.7% | 97.3% |
| WC rooms | 92.3% | 94.5% |
| kitchens | 91.8% | 94.6% |
| toilets | 89.5% | 92.9% |
| bedrooms | 88.7% | 94.5% |
| bathrooms | 87.9% | 92.4% |
| showers/baths | 80.3% | 84.9% |
| sinks | 79.3% | 83.3% |
| saunas | 78.8% | 83.5% |
| balconies | 69.6% | 71.9% |
| doors | 65.5% | 75.5% |
| windows | 49.4% | 65.4% |

- Windows and doors are the gap, as for every team.
- The test plans are harder than dev (80.4% vs 85.9%), so compare test with test only.

## Reproduce
```
export STOA_DATA=<full dataset>   SITELENS_MODELS=models   # detector v2
python -m eval.score --split dev  --name full-dev     # ~26 min
python -m eval.score --split test --name full-test    # ~11 min
```
