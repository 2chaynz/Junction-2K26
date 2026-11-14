#!/usr/bin/env bash
# Deploy the demo to a fresh Ubuntu 24.04 VM (backend + built web in one process, systemd, port 8000).
#
#   bash scripts/deploy-remote.sh root@1.2.3.4 [--ssh-key ~/.ssh/key] [--port 8000]
#
# Needs locally: node/npm (web build), tar, ssh/scp, the unzipped dataset preview (STOA_DATA or
# ../junction-data/preview/junction-dataset-preview), detector weights (models/detector.pt), and
# GEMINI_API_KEY in the environment or in ../junction-data/.env (sent over ssh stdin, never on a command line).
# Safe to re-run: it updates code, keeps data/venv, restarts the service.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

HOST="${1:?usage: deploy-remote.sh user@host [--ssh-key file] [--port N]}"; shift || true
KEY_OPT=""; PORT=8000
while [ $# -gt 0 ]; do case "$1" in --ssh-key) KEY_OPT="-i $2"; shift 2;; --port) PORT="$2"; shift 2;; *) echo "unknown $1"; exit 2;; esac; done
SSH="ssh $KEY_OPT -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=15"

DATA="${STOA_DATA:-../junction-data/preview/junction-dataset-preview}"
[ -f "$DATA/questions.jsonl" ] || { echo "FIX  dataset not found at $DATA (set STOA_DATA)"; exit 1; }
[ -f models/detector.pt ] || { echo "FIX  models/detector.pt missing (gh release download detector-v2 -D models)"; exit 1; }
if [ -z "${GEMINI_API_KEY:-}" ] && [ -f ../junction-data/.env ]; then GEMINI_API_KEY="$(grep '^GEMINI_API_KEY=' ../junction-data/.env | cut -d= -f2-)"; fi

echo "==> building web"
(cd web && npm ci --silent && npm run build >/dev/null)

echo "==> uploading code (small)"
tar -cf - --exclude=__pycache__ sitelens eval requirements.txt web/dist models/detector.pt | $SSH "$HOST" 'mkdir -p /opt/sitelens && tar -xf - -C /opt/sitelens'

echo "==> uploading dataset preview (skipped if already there)"
if ! $SSH "$HOST" 'test -f /opt/sitelens-data/questions.jsonl'; then
  tar -cf - -C "$DATA" . | $SSH "$HOST" 'mkdir -p /opt/sitelens-data && tar -xf - -C /opt/sitelens-data'
fi

echo "==> secrets (stdin)"
BASE_ENV='STOA_DATA=/opt/sitelens-data\nSITELENS_MODELS=/opt/sitelens/models\nSITELENS_RATE=30\n'
if [ -n "${GEMINI_API_KEY:-}" ]; then
  printf "GEMINI_API_KEY=%s\n${BASE_ENV}" "$GEMINI_API_KEY" | $SSH "$HOST" 'umask 077; cat > /etc/sitelens.env'
else
  echo "note: no GEMINI_API_KEY here; keeping the key already on the VM (typed free-form questions need one)"
  printf "${BASE_ENV}" | $SSH "$HOST" 'umask 077; k=$(grep "^GEMINI_API_KEY=" /etc/sitelens.env 2>/dev/null || true); { [ -n "$k" ] && echo "$k"; cat; } > /etc/sitelens.env.new && mv /etc/sitelens.env.new /etc/sitelens.env'
fi

echo "==> installing on the VM (first run takes a few minutes)"
$SSH "$HOST" PORT="$PORT" bash -s <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
command -v python3 >/dev/null && python3 -m venv --help >/dev/null 2>&1 || { apt-get -qq update; apt-get -qq install -y python3-venv python3-pip >/dev/null; }
cd /opt/sitelens
[ -d venv ] || python3 -m venv venv
. venv/bin/activate
pip install -q -U pip
python -c "import torch" 2>/dev/null || pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -q -r requirements.txt
cat > /etc/systemd/system/sitelens.service <<UNIT
[Unit]
Description=SiteLens demo
After=network.target
[Service]
WorkingDirectory=/opt/sitelens
EnvironmentFile=/etc/sitelens.env
ExecStart=/opt/sitelens/venv/bin/python -m uvicorn sitelens.server:app --host 0.0.0.0 --port ${PORT}
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload; systemctl enable --now sitelens >/dev/null 2>&1; systemctl restart sitelens
for i in $(seq 1 40); do curl -sf -o /dev/null "http://127.0.0.1:${PORT}/api/drawings" && echo "service up" && exit 0; sleep 3; done
journalctl -u sitelens -n 30 --no-pager; exit 1
REMOTE
echo "==> done: http://${HOST#*@}:${PORT}/"
