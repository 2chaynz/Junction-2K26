#!/usr/bin/env bash
# Runs ON the GPU box. Expects ~/yolo.tar (made by train/cubicasa_to_yolo.py + tar) in $HOME.
#   scp ../junction-data/yolo.tar train/remote_train.sh ubuntu@<ip>:~ && ssh ubuntu@<ip> 'bash remote_train.sh'
set -euo pipefail
cd ~
[ -d yolo ] || tar -xf yolo.tar
sed -i "s#^path: .*#path: $HOME/yolo#" yolo/data.yaml
python3 -m venv venv && . venv/bin/activate
pip install -q -U pip ultralytics
nvidia-smi --query-gpu=name,memory.total --format=csv
# Plans are big with tiny symbols: train at 1280 px. ~4.6k train images.
nohup yolo detect train data=yolo/data.yaml model=yolo11m.pt imgsz=1280 epochs=80 batch=16 \
  patience=20 cos_lr=True degrees=0 fliplr=0.5 flipud=0.5 mosaic=1.0 close_mosaic=10 \
  project=runs name=cubicasa_y11m exist_ok=True workers=16 > train.log 2>&1 &
echo "training started; tail -f ~/train.log"
