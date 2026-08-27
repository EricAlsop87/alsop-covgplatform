---
description: Deploy latest code to the DigitalOcean droplet and restart the worker
---

// turbo-all

## Pre-flight
1. Ensure all changes are committed and pushed to `origin/main`:
```
git add -A && git commit -m "<descriptive message>" && git push origin main
```

## Deploy to Droplet
2. Pull the latest code on the droplet:
```
ssh -o ConnectTimeout=10 root@64.225.46.58 "cd /opt/gap-guard/alsop-covgplatform && git pull origin main 2>&1"
```

## Conditional: Worker restart (only if worker/ code changed)
Only run steps 3-5 if files under `worker/` were modified. Front-end-only changes do NOT require a worker restart.

3. Install any new Python dependencies in the worker venv:
```
ssh -o ConnectTimeout=10 root@64.225.46.58 "cd /opt/gap-guard/alsop-covgplatform/worker && .venv/bin/pip install -r requirements.txt 2>&1"
```

4. Restart the ingestion worker service:
```
ssh -o ConnectTimeout=10 root@64.225.46.58 "systemctl restart decpage-worker && sleep 2 && systemctl status decpage-worker 2>&1 | head -15"
```

5. Confirm the worker is running and healthy:
```
ssh -o ConnectTimeout=10 root@64.225.46.58 "journalctl -u decpage-worker --no-pager -n 10 2>&1"
```

## Droplet Details
- **IP**: 64.225.46.58
- **User**: root
- **Project path**: /opt/gap-guard/alsop-covgplatform
- **Worker venv**: /opt/gap-guard/alsop-covgplatform/worker/.venv
- **Worker service**: decpage-worker.service
- **RAM**: 961MB (tight — monitor for OOM issues)
- **OS**: Ubuntu 24.04.3 LTS
- **Hostname**: n8n-server
