@echo off
echo === Fixing key permissions ===
icacls C:\Users\ducvu\.ssh\oracle_key /inheritance:r /grant:r "ducvu:(R)" /remove:g "BUILTIN\Users" /remove:g "NT AUTHORITY\Authenticated Users" /remove:g "Everyone"
echo.
echo === SSH into oracle1 ===
C:\Windows\System32\OpenSSH\ssh.exe -o ConnectTimeout=15 oracle1 "echo '=== CONNECTED ==='; echo '=== TMUX ==='; tmux ls 2>&1; echo '=== SERVICE STATUS ==='; sudo systemctl status lms 2>&1 | head -80; echo '=== JOURNAL LOG ==='; sudo journalctl -u lms -n 60 --no-pager 2>&1; echo '=== PYTHON PROCESSES ==='; ps aux | grep python | grep -v grep; echo '=== PORT 5000 ==='; ss -tlnp | grep 5000"
echo.
echo === DONE ===
