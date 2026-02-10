#!/bin/bash
SERVER="root@188.166.246.68"
REMOTE_DIR="/root/toolLms"

echo "=== Deploying to $SERVER ==="

# Upload files
echo "[1/3] Uploading files..."
scp app.py "$SERVER:$REMOTE_DIR/app.py"
scp templates/index.html "$SERVER:$REMOTE_DIR/templates/index.html"
scp templates/homework.html "$SERVER:$REMOTE_DIR/templates/homework.html"
echo "  Done."

# Restart app
echo "[2/3] Restarting app..."
ssh "$SERVER" bash -s <<'EOF'
tmux send-keys -t lms C-c 2>/dev/null
sleep 1
tmux kill-session -t lms 2>/dev/null
sleep 1
cd /root/toolLms && tmux new-session -d -s lms './venv/bin/python app.py'
sleep 2
tmux capture-pane -t lms -p -S -5
EOF

# Verify
echo "[3/3] Verifying..."
ssh "$SERVER" "curl -sI http://127.0.0.1:5000/ | grep -E 'HTTP|Cache'"

echo "=== Deploy complete ==="
