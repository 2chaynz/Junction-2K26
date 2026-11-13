#!/bin/bash
# usage: grid.sh name json1 json2 ...   (runs each config on seeds a1..a4 in parallel, 2 at a time max)
name=$1; shift
i=0
for p in "$@"; do
  .venv/Scripts/python sweep.py "$p" a1 a2 a3 a4 > out_${name}_$i.txt 2>&1 &
  i=$((i+1))
done
wait
for j in $(seq 0 $((i-1))); do cat out_${name}_$j.txt; done
