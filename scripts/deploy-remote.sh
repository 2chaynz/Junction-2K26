#!/usr/bin/env bash
# Deploy the demo to a fresh Ubuntu 24.04 VM (backend + built web in one process, systemd, port 8000).
#
#   bash scripts/deploy-remote.sh root@1.2.3.4 [--ssh-key ~/.ssh/key] [--port 8000] [--demo] [--funnel]
#
# User can be root or a sudo user (Oracle: ubuntu@). --demo: final demo set (SITELENS_DEMO=1; needs the full
# dataset in STOA_DATA). --funnel: bind 127.0.0.1 and publish over Tailscale Funnel (stable
# https://<vm>.<tailnet>.ts.net; the first run prints a login link to open).
#
# Needs locally: node/npm (web build), tar, ssh/scp, the unzipped dataset preview (STOA_DATA or
# ../junction-data/preview/junction-dataset-preview), detector weights (models/detector.pt), and
# GEMINI_API_KEY in the environment or in ../junction-data/.env (sent over ssh stdin, never on a command line).
# Safe to re-run: it updates code, keeps data/venv, restarts the service.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

HOST="${1:?usage: deploy-remote.sh user@host [--ssh-key file] [--port N] [--demo] [--funnel]}"; shift || true
KEY_OPT=""; PORT=8000; DEMO=0; FUNNEL=0
while [ $# -gt 0 ]; do case "$1" in --ssh-key) KEY_OPT="-i $2"; shift 2;; --port) PORT="$2"; shift 2;; --demo) DEMO=1; shift;; --funnel) FUNNEL=1; shift;; *) echo "unknown $1"; exit 2;; esac; done
SSH="ssh $KEY_OPT -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=15"

DATA="${STOA_DATA:-../junction-data/preview/junction-dataset-preview}"
[ -f "$DATA/questions.jsonl" ] || { echo "FIX  dataset not found at $DATA (set STOA_DATA)"; exit 1; }
[ -f models/detector.pt ] || { echo "FIX  models/detector.pt missing (gh release download detector-v2 -D models)"; exit 1; }
if [ -z "${GEMINI_API_KEY:-}" ] && [ -f ../junction-data/.env ]; then GEMINI_API_KEY="$(grep '^GEMINI_API_KEY=' ../junction-data/.env | cut -d= -f2-)"; fi

echo "==> building web"
(cd web && npm ci --silent && npm run build >/dev/null)

echo "==> uploading code (small)"
tar -cf - --exclude=__pycache__ sitelens eval requirements.txt web/dist models/detector.pt | $SSH "$HOST" 'sudo mkdir -p /opt/sitelens && sudo tar -xf - -C /opt/sitelens'

# Marker per dataset: a cut-off upload or a preview -> full switch re-uploads instead of serving half a dataset.
MARK=".uploaded-$(basename "$(cd "$DATA" && pwd)")-$(wc -l < "$DATA/questions.jsonl" | tr -d ' ')"
echo "==> uploading dataset $DATA (skipped if already there; the full set is ~12 GB)"
if ! $SSH "$HOST" "test -f /opt/sitelens-data/$MARK"; then
  tar -czf - -C "$DATA" . | $SSH "$HOST" "sudo rm -rf /opt/sitelens-data && sudo mkdir -p /opt/sitelens-data && sudo tar -xzf - -C /opt/sitelens-data && sudo touch /opt/sitelens-data/$MARK"
fi

echo "==> secrets (stdin)"
BASE_ENV='STOA_DATA=/opt/sitelens-data\nSITELENS_MODELS=/opt/sitelens/models\nSITELENS_RATE=30\n'
[ "$DEMO" = 1 ] && BASE_ENV="${BASE_ENV}SITELENS_DEMO=1\n"
# Lines this script owns are replaced; every other line on the VM (VERDA_INFERENCE_KEY, NVIDIA_API_KEY, …) is kept.
MANAGED='STOA_DATA|SITELENS_MODELS|SITELENS_RATE|SITELENS_DEMO'
[ -n "${GEMINI_API_KEY:-}" ] && MANAGED="$MANAGED|GEMINI_API_KEY" || echo "note: no GEMINI_API_KEY here; keeping the key already on the VM (typed free-form questions need one)"
{ [ -n "${GEMINI_API_KEY:-}" ] && printf 'GEMINI_API_KEY=%s\n' "$GEMINI_API_KEY"; printf "${BASE_ENV}"; } |
  $SSH "$HOST" "sudo bash -c 'umask 077; { grep -vE \"^($MANAGED)=\" /etc/sitelens.env 2>/dev/null; cat; } > /etc/sitelens.env.new && mv /etc/sitelens.env.new /etc/sitelens.env'"

echo "==> installing on the VM (first run takes a few minutes)"
BIND=0.0.0.0; [ "$FUNNEL" = 1 ] && BIND=127.0.0.1
$SSH "$HOST" sudo env PORT="$PORT" BIND="$BIND" FUNNEL="$FUNNEL" bash -s <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
# venv --help passes without ensurepip (Ubuntu cloud images), so check ensurepip itself.
python3 -c "import ensurepip" 2>/dev/null || { apt-get -qq update; apt-get -qq install -y python3-venv python3-pip >/dev/null; }
# OpenCV (ultralytics, rapidocr) needs libGL; minimal cloud images lack it.
dpkg -s libgl1 >/dev/null 2>&1 || { apt-get -qq update; apt-get -qq install -y libgl1 libglib2.0-0t64 >/dev/null; }
cd /opt/sitelens
[ -x venv/bin/pip ] || { rm -rf venv; python3 -m venv venv; }
. venv/bin/activate
pip install -q -U pip
python -c "import torch" 2>/dev/null || pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cpu || pip install -q torch torchvision
pip install -q -r requirements.txt
cat > /etc/systemd/system/sitelens.service <<UNIT
[Unit]
Description=Sindri demo
After=network.target
[Service]
WorkingDirectory=/opt/sitelens
EnvironmentFile=/etc/sitelens.env
ExecStart=/opt/sitelens/venv/bin/python -m uvicorn sitelens.server:app --host ${BIND} --port ${PORT}
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload; systemctl enable --now sitelens >/dev/null 2>&1; systemctl restart sitelens
up=0; for i in $(seq 1 40); do curl -sf -o /dev/null "http://127.0.0.1:${PORT}/api/drawings" && up=1 && echo "service up" && break; sleep 3; done
[ "$up" = 1 ] || { journalctl -u sitelens -n 30 --no-pager; exit 1; }
if [ "$FUNNEL" = 1 ]; then
  command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh
  # Not logged in yet: prints a login link and waits until someone opens it. Same for enabling Funnel.
  tailscale status >/dev/null 2>&1 || tailscale up
  tailscale funnel --bg "$PORT"
  echo "==> done: https://$(tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')/"
fi
REMOTE
[ "$FUNNEL" = 1 ] || echo "==> done: http://${HOST#*@}:${PORT}/"
