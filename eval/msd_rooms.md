# Raster room counts on Modified Swiss Dwellings

- Download the metadata file `mds_V2_5.372k.csv` from [Kaggle](https://www.kaggle.com/datasets/caspervanengelenburg/modified-swiss-dwellings/data). The single-file ZIP also works. Keep it outside the repo.
- Set `STOA_DATA` to the Stoa dataset root and `SITELENS_MODELS` to the folder with `detector.pt`.
- Run `python -m eval.msd_rooms <metadata.csv-or-zip> --output eval/results/msd.jsonl`.
- Both methods read the same rasterized Stoa PDF. MSD masks and reference geometry are used only for scoring. Join by site, building and floor, then sample one floor per building.
- Space counts indoor MSD areas including corridors and stairs. Bathroom combines detector bathroom and WC boxes because MSD does not distinguish those types. The detector Space baseline follows the AECV room-box rule with outdoor boxes excluded.
- Localization uses one-to-one box-to-polygon IoU >= 0.5. Only rooms with unique MSD and DXF area matches and a fitted DXF-to-PDF transform contribute to the localization denominator. All MSD rooms in scope contribute to count scoring.
- This measures overlap with Stoa. Any tuning needs a separate development set and any routing change needs held-out validation.

## Stoa preview overlap run

MSD metadata matched 29 of 65 Stoa Swiss floors, all from distinct buildings.

| Count | Detector exact | Geometry + OCR exact | Detector mean error | Geometry + OCR mean error | Detector localized | Geometry + OCR localized |
|---|---:|---:|---:|---:|---:|---:|
| Indoor spaces | 0/29 | 0/29 | 18.31 | 20.17 | 261/804 | 422/804 |
| Bedrooms | 2/29 | 5/29 | 5.07 | 7.41 | 88/248 | 32/248 |
| Kitchens | 4/29 | 17/29 | 2.76 | 1.03 | 13/101 | 26/101 |
| Bathrooms and WCs | 13/29 | 5/29 | 0.93 | 3.86 | 136/162 | 11/162 |

Geometry improved kitchen counts and localized more indoor spaces. Total count error and bathroom results do not support changing the default. Held-out Stoa and AECV validation remains pending.
