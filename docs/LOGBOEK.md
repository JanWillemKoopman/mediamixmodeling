# Het logboek

Bedoeld voor het moment dat je zelf door de app loopt en er iets niet klopt. Je hoeft dan
niet te weten wát er misging — je hoeft het alleen door te geven.

## Wat je doet als je ergens tegenaan loopt

1. Ga naar **Logboek** rechtsboven in de balk (of direct naar `/logboek`).
2. Klik op **Kopieer voor Claude**.
3. Plak dat in Claude Code, met één zin erbij: *wat probeerde je te doen, en wat verwachtte je?*

Die ene zin is het enige dat het logboek zelf niet weet. De rest — welke knop je aanklikte,
op welke stap je stond, wat de server antwoordde, welke fout er precies optrad en hoe lang
het duurde — staat er al in.

Je kunt ook gewoon vragen: *"kijk eens in het logboek wat er misging in mijn laatste
testsessie"*. Claude Code kan de tabel rechtstreeks uitlezen via de Supabase-koppeling en
hoeft dan niets van je te krijgen.

## Wat er wordt vastgelegd

| Soort regel | Wanneer |
|---|---|
| `pageview` | Je opent een scherm. Hiermee is je route door de app terug te lezen. |
| `flow.actie` | Je klikt een knop in het traject aan — mét welke stap en welke velden ingevuld waren. |
| `flow.vraag` | Je stelt de gids een vraag of vraagt om een voorstel. |
| `api.mislukt` / `api.geweigerd` | Een aanroep naar de server ging mis, ook als het scherm het netjes opving. |
| `api.traag` | Iets duurde langer dan vijf seconden. Traag is ook een bug. |
| `api.crash` | Een serverroute liep vast — mét de echte foutmelding en stacktrace. |
| `claude.mislukt` | De AI antwoordde niet. Hier staat wát de AI zei, niet de nette tekst die jij zag. |
| `render.crash` / `layout.crash` | Het scherm zelf ging stuk (het "Er ging onverwacht iets mis"-scherm). |
| `console.error` / `window.error` | Alles wat de browser of React zelf als fout meldt. |

Elke regel hangt aan een **testsessie** (één browsertabblad, label als `s-7f3a2c`) en staat op
één tijdlijn, of hij nu in je browser of op de server ontstond. Dat is het hele punt: je ziet
niet alleen de fout, maar ook de drie handelingen die eraan voorafgingen.

## Wat er níét in staat

- **Geen inhoud van je data.** Wel dat je een bestand uploadde en welke kolommen je koppelde,
  niet de rijen zelf.
- **Geen wachtwoorden of sleutels.** Er worden alleen foutmeldingen, statuscodes en actie-ids
  vastgelegd.
- **De worker (Modal) logt hier niet in.** Fouten in de berekening zelf staan in `jobs.error`
  en komen als foutmelding in het scherm terug — en die foutmelding belandt wél in het
  logboek.

## Voor Claude Code

De tabel is `mmm.app_events` in het Supabase-project `pzpoptfljgrskebnuggt`. Alleen een
builder mag hem lezen; iedereen mag erin schrijven (anders missen we juist de fouten op de
inlogpagina).

De laatste fouten van een sessie:

```sql
select at, source, level, event, message, path, detail
from mmm.app_events
where session_id = 's-7f3a2c'
order by at;
```

De laatste problemen over alle sessies:

```sql
select at, session_id, source, level, event, message, path
from mmm.app_events
where level <> 'info'
order by at desc
limit 50;
```

## Opruimen

Het logboek groeit met elke testronde. Ruim af en toe op:

```sql
delete from mmm.app_events where at < now() - interval '30 days';
```

## Waar het in de code zit

| Bestand | Wat |
|---|---|
| `supabase/migrations/0025_app_events.sql` | De tabel en wie erin mag |
| `lib/log/events.ts` | Wat een logregel is; afkappen en veilig maken |
| `lib/log/client.ts` | De browserkant: buffer, vangnetten, `loggedFetch` |
| `lib/log/server.ts` | De serverkant: wegschrijven, nooit gooien |
| `app/api/log/route.ts` | De brievenbus waar de browser zijn regels aflevert |
| `components/EventLogger.tsx` | Zet het aan voor de hele app (staat in `app/layout.tsx`) |
| `app/logboek/page.tsx` | Het scherm met de kopieerknop |

Een handeling die nog niet gelogd wordt, voeg je toe met één regel:

```ts
import { logAction } from "@/lib/log/client";
logAction("dataset.kolom_gewijzigd", { kolom, nieuweRol }, projectId);
```
