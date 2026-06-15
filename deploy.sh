#!/bin/bash
SERVER="root@188.166.246.68"
REMOTE_DIR="/root/toolLms"
SSH_KEY="/c/Users/ducvu/.ssh/id_rsa"

echo "=== Deploying to $SERVER ==="

# Upload files
echo "[1/3] Uploading files..."
/c/Windows/System32/OpenSSH/scp.exe -i "$SSH_KEY" -o StrictHostKeyChecking=no app.py "$SERVER:$REMOTE_DIR/app.py"
/c/Windows/System32/OpenSSH/scp.exe -i "$SSH_KEY" -o StrictHostKeyChecking=no lms_api.py "$SERVER:$REMOTE_DIR/lms_api.py"
/c/Windows/System32/OpenSSH/scp.exe -i "$SSH_KEY" -o StrictHostKeyChecking=no -r templates "$SERVER:$REMOTE_DIR/"
echo "  Done."

# Restart app
echo "[2/3] Restarting app..."
/c/Windows/System32/OpenSSH/ssh.exe -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SERVER" bash -s <<'EOF'
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
/c/Windows/System32/OpenSSH/ssh.exe -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SERVER" "curl -sI http://127.0.0.1:5000/ | grep -E 'HTTP|Cache'"

echo "=== Deploy complete ==="
