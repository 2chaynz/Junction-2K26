#!/bin/bash
.venv/Scripts/python sweep.py "$1" b1 b2 b3 b4 | grep -E "TOTAL"
