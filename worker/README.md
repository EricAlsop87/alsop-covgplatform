# Dec Page Ingestion Worker

Python background worker that processes uploaded declaration page PDFs through the full ingestion pipeline.

**Pipeline:** Upload → `ingestion_jobs` queue → Worker claims → Download PDF → Extract text (pdfplumber + OCR fallback) → Parse fields (LLM + regex fallback) → Upsert lifecycle entities → Evaluate flags → Enrich property data → Done

## Quick Start

```bash
cd worker

# 1. Create virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS/Linux
# source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set environment variables
cp .env.example .env
# Edit .env with your real Supabase URL, SERVICE ROLE KEY, and OpenAI key

# 4. Run the worker
python -m src.main
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (**never commit!**) |
| `OPENAI_API_KEY` | No | OpenAI API key for LLM extraction (falls back to regex) |
| `GOOGLE_MAPS_API_KEY` | No | Google Maps key for satellite imagery & geocoding |
| `WORKER_NAME` | No | Worker identity for `locked_by` (default: `worker-unknown`) |
| `POLL_INTERVAL` | No | Seconds between polls (default: `5`) |
| `MAX_ATTEMPTS` | No | Max retries before permanent failure (default: `5`) |
| `STALE_MINUTES` | No | Minutes before stuck jobs are requeued (default: `10`) |

## Job Lifecycle

```
queued → processing → done
                   ↘ failed (after max_attempts retries)
```

- **Claim**: Atomic two-step (SELECT + guarded UPDATE) prevents double-claim
- **Retry**: On failure, requeued with exponential backoff (up to `max_attempts`)
- **Stale Recovery**: Jobs stuck in `processing` > `STALE_MINUTES` are automatically requeued (respects max_attempts)
- **Idempotent**: `dec_pages` upsert by `submission_id` — safe to reprocess
- **Safety Net**: `force_release_job()` in finally block prevents jobs from being stuck, but skips if job already completed successfully

## Processing Pipeline

1. **Download PDF** from Supabase Storage
2. **Extract Text** via pdfplumber (digital PDFs) with Tesseract OCR fallback (scanned docs)
3. **Parse Fields** via GPT-4o-mini structured extraction with regex fallback
4. **Detect Document Type** (California FAIR Plan detection)
5. **Upsert `dec_pages`** with raw text, extracted JSON, and parse status
6. **Process Lifecycle** (FAIR Plan only): Create/update Client → Policy → PolicyTerm
7. **Evaluate Flags**: Run 20+ rule-based checks for coverage gaps, missing data, renewals, etc.
8. **Enrich Property**: Fetch satellite imagery, geocode address, query wildfire risk data
9. **Complete Job**: Mark job done, submission as parsed

## Project Structure

```
worker/
├── .env.example          # Env var template (never commit real keys!)
├── requirements.txt      # Python dependencies
├── README.md             # This file
└── src/
    ├── __init__.py
    ├── main.py               # Poll loop + process_job orchestrator
    ├── supabase_client.py    # Service role client singleton
    ├── jobs.py               # Job queue: claim, complete, fail, retry, stale recovery
    ├── extract/
    │   ├── __init__.py
    │   ├── pdf_text.py       # pdfplumber + Tesseract OCR text extraction
    │   ├── llm_extract.py    # GPT-4o-mini structured field extraction
    │   └── fair_plan.py      # California FAIR Plan regex parser (fallback)
    └── db/
        ├── __init__.py
        ├── dec_pages.py      # Upsert dec_pages row
        ├── lifecycle.py      # Client/Policy/PolicyTerm upserts
        ├── flags.py          # Flag CRUD operations
        ├── flag_evaluator.py # Rule-based flag engine (20+ rules)
        └── enrichment.py     # Property enrichment (satellite, fire risk, geocoding)
```

## Deployment

For production, run as a systemd service on a DigitalOcean droplet:

```ini
# /etc/systemd/system/cfp-worker.service
[Unit]
Description=CFP Ingestion Worker
After=network.target

[Service]
User=worker
WorkingDirectory=/opt/cfp-platform/worker
ExecStart=/opt/cfp-platform/worker/.venv/bin/python -m src.main
Restart=always
RestartSec=10
EnvironmentFile=/opt/cfp-platform/worker/.env

[Install]
WantedBy=multi-user.target
```

## Monitoring

The worker outputs structured logs for each processing step with timing information:

```
INFO  >>> job_id=abc submission_id=xyz attempts=1/5 step=start
INFO  job_id=abc step=fetch_submission elapsed=0.12s
INFO  job_id=abc step=download_pdf elapsed=0.85s bytes=524288
INFO  job_id=abc step=extract_text elapsed=1.23s chars=4500
INFO  job_id=abc step=upsert_dec_page dec_page_id=def elapsed=0.09s
INFO  <<< job_id=abc submission_id=xyz step=finished status=done elapsed=5.23s
```

Failed jobs log detailed error context including the failing step, traceback, and elapsed time.
