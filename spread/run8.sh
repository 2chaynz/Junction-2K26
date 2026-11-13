#!/bin/bash
# usage: run8.sh json  -> 8 seeds
.venv/Scripts/python sweep.py "$1" b1 b2 b3 b4 b5 b6 b7 b8 | grep -E "TOTAL"
