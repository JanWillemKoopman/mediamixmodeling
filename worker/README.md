# mmm-worker

De asynchrone **Modal-worker** die de bevroren `mmm-core`-fit draait *buiten* de
request-flow. Een Bayesiaanse fit kan minuten duren; die hoort niet in een Vercel-functie
of een Claude-tool-call. De wizard schrijft een job (`status='queued'`) in Supabase, de
worker pikt 'm op, fit zonder tijdsdruk, en schrijft het resultaat terug.

## Architectuur van de keten

```
wizard --insert job(queued)--> Supabase.jobs
   |                                |
   |  POST /enqueue(job_id)         |  (poll_queue vangt gemiste calls elke minuut)
   v                                v
Modal.run_fit --download sources--> Storage(mmm-raw-data)
   |  mmm-core: ingestie -> fit
   |--summary JSON--------------> Supabase.model_runs   (klein, snel voor dashboard)
   |--InferenceData .nc---------> Storage(mmm-artifacts) (zwaar, ruwe posterior)
   `--status=succeeded----------> Supabase.jobs          (Realtime -> wizard hoort 't)
```

## Ontwerp: testbaar zonder cloud

`run_job()` (in `runner.py`) hangt alleen af van twee kleine poorten (`JobStore`,
`Storage`) uit `ports.py`, en de fit is injecteerbaar. Zo is de hele orkestratie —
statusovergangen, de raw/artifact-splitsing, foutafhandeling — getest met in-memory
fakes, zónder Supabase, Modal of een echte PyMC-fit.

```bash
cd worker
uv pip install -e ../packages/mmm-core -e ".[dev]"   # los, i.v.m. path-dependency
uv run pytest                                         # 9 tests, geen cloud nodig
```

- `ports.py` — de interfaces waar de orkestratie op leunt.
- `jobspec.py` — parse van de job-`config` JSON naar mmm-core-objecten (het contract
  tussen wizard en worker).
- `tables.py` — geüploade CSV/XLSX-bytes → DataFrame.
- `runner.py` — `run_job()`: download → align (mmm-core ingestie) → fit → persist.
  Faalt netjes (job op `failed` + reden) i.p.v. te crashen bij datakwaliteitsfouten.
- `supabase_backends.py` — concrete Supabase-adapters (service_role, omzeilt RLS).
- `modal_app.py` — de Modal-app (`run_fit`, `enqueue`, `poll_queue`).

## Deployen

Zie **[`DEPLOY.md`](./DEPLOY.md)** voor de stap-voor-stap-instructies. Twee manieren:

- **Zonder laptop, via GitHub** (aanbevolen): het tabblad *Actions* → workflow
  *"Deploy MMM worker (Modal)"* → *Run workflow*. Vereist eenmalig twee GitHub-secrets
  (`MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`) uit modal.com > Settings > API Tokens.
- **Vanaf je laptop**: `python -m modal deploy mmm_worker/modal_app.py`.

Secrets komen uit een Modal Secret `mmm-supabase` (al aangemaakt, hoeft niet opnieuw) —
**nooit in git of chat**:

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...        # geheim (Supabase > Project Settings > API)
MMM_RAW_BUCKET=mmm-raw-data
MMM_ARTIFACTS_BUCKET=mmm-artifacts
```

```bash
# alleen nodig als de secret ooit opnieuw gezet moet worden:
modal secret create mmm-supabase SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
    MMM_RAW_BUCKET=mmm-raw-data MMM_ARTIFACTS_BUCKET=mmm-artifacts
```
