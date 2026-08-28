# Droplet Deployment Rule

## When to Deploy to the DigitalOcean Droplet

After **any** `git push` to `main` that includes changes to files under the `worker/` directory, you **MUST** deploy the updated code to the production droplet and restart the worker service.

### Files that trigger a droplet deploy

Any change pushed to `main` that touches:
- `worker/src/**` (Python worker source code)
- `worker/requirements.txt` (Python dependencies)

### How to deploy

Run this single SSH command (no interactive session needed):

```bash
ssh -i "C:\Users\phoeb\.ssh\id_ed25519" -o StrictHostKeyChecking=no root@64.225.46.58 "cd /opt/gap-guard/alsop-covgplatform && git pull origin main && systemctl restart decpage-worker.service && systemctl status decpage-worker.service"
```

If `requirements.txt` was changed, also reinstall dependencies before restarting:

```bash
ssh -i "C:\Users\phoeb\.ssh\id_ed25519" -o StrictHostKeyChecking=no root@64.225.46.58 "cd /opt/gap-guard/alsop-covgplatform && git pull origin main && cd worker && .venv/bin/pip install -r requirements.txt && cd .. && systemctl restart decpage-worker.service && systemctl status decpage-worker.service"
```

### Verification

After restarting, verify the service is running:
- Status should show `active (running)`
- Check `journalctl -u decpage-worker.service -n 10` for startup logs and "Supabase connection OK"

### Important details

- **Server**: `root@64.225.46.58`
- **SSH Key**: `C:\Users\phoeb\.ssh\id_ed25519`
- **Project path on droplet**: `/opt/gap-guard/alsop-covgplatform`
- **Service name**: `decpage-worker.service`
- **Env file**: `/opt/gap-guard/alsop-covgplatform/worker/worker.env` (do NOT overwrite or commit this file)
- **Git remote on droplet**: `https://github.com/EricAlsop87/alsop-covgplatform.git`

### What NOT to do

- Do NOT expose the droplet IP, SSH key path, or server credentials in artifacts, chat, or committed files.
- Do NOT modify `worker.env` on the droplet unless explicitly asked by the user.
- Do NOT restart the service if only frontend (`src/`) or config files were changed — those are handled by Vercel.
