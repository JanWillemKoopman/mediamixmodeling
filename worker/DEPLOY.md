# De MMM-worker deployen

De worker draait op **Modal**. Deployen betekent: de nieuwste `mmm-core` + worker-code
naar Modal sturen, zodat nieuwe fits met de laatste modelinstellingen draaien. Je hebt
twee manieren — kies er één.

> **Wanneer moet je deployen?** Na elke wijziging in `packages/mmm-core/` of
> `worker/` die je in echte fits wilt gebruiken. (De Vercel-app deployt vanzelf; de
> Modal-worker niet — die draait de vorige versie tot je opnieuw deployt.)

Eénmalig al geregeld en hoeft **niet** opnieuw: de Modal Secret `mmm-supabase`
(Supabase-URL/keys + bucketnamen). Beide manieren hieronder gebruiken die bestaande
secret; je hoeft 'm niet opnieuw te maken.

---

## Manier A — Zonder laptop, via GitHub (aanbevolen)

Volledig vanuit je browser. Éénmalig instellen, daarna is deployen één klik.

### Stap 1 — Maak een Modal-token (éénmalig)
1. Ga naar **modal.com** en log in.
2. **Settings → API Tokens → New token**.
3. Je krijgt twee waarden: een **Token ID** (begint met `ak-…`) en een **Token Secret**
   (begint met `as-…`). Kopieer ze allebei; de secret zie je maar één keer.

### Stap 2 — Zet ze als GitHub-secrets (éénmalig)
1. Ga naar de repo op GitHub → **Settings → Secrets and variables → Actions**.
2. **New repository secret**, naam `MODAL_TOKEN_ID`, waarde = de Token ID → opslaan.
3. Nog een keer, naam `MODAL_TOKEN_SECRET`, waarde = de Token Secret → opslaan.

### Stap 3 — Deploy (elke keer dat je wilt updaten)
1. Ga naar het tabblad **Actions** in de repo.
2. Kies links de workflow **"Deploy MMM worker (Modal)"**.
3. Klik rechts **Run workflow** → **Run workflow**.
4. Wacht tot het groene vinkje verschijnt (~1–3 min). Klaar — de nieuwe versie draait.

Deze workflow start **alleen** als jij op de knop drukt, nooit vanzelf. Hij staat in
`.github/workflows/deploy-modal-worker.yml`.

---

## Manier B — Vanaf je laptop (Windows PowerShell)

Nodig: Python + de Modal-CLI. Eén keer inloggen, daarna deployen wanneer je wilt.

```powershell
# 1. Haal de laatste code op
cd C:\Users\jkoopman\Desktop\news
git checkout main
git pull origin main

# 2. (eenmalig) Installeer + log in bij Modal
python -m pip install --upgrade modal
python -m modal token new          # opent je browser om in te loggen

# 3. Deploy
cd mmm\worker
python -m modal deploy mmm_worker\modal_app.py
```

De regel `... deployed! ...` met een URL onderaan betekent dat het gelukt is.

---

## Controleren dat het werkte (beide manieren)

- Op **modal.com → Apps → `mmm-worker`** zie je de nieuwe deploy-tijd en de functies
  `run_fit`, `enqueue`, `poll_queue`.
- De eerstvolgende fit die je vanuit de wizard start, draait op de nieuwe code.

### Draaien er nog "outdated" containers? (alleen relevant vanaf de laptop)
Modal laat containers die al warm draaiden hun huidige werk afmaken op de oude code;
nieuw werk gebruikt meteen de nieuwe versie. Wil je zeker weten dat de oude weg zijn:

```powershell
python -m modal container list
python -m modal container stop <container-id> -y   # per outdated container
```

Stop **niet** de hele app ("Stop App") — dan leg je ook `poll_queue`/`enqueue` stil.
