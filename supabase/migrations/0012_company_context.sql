-- Vrij-tekst bedrijfscontext, direct na het uploaden in te vullen (bovenaan stap 2). Eén
-- groot beschrijvend blok — wie is het bedrijf, welke markt, doelen, bijzonderheden — dat
-- de AI vanaf de eerste stap meeneemt in elk voorstel (voorbereiden, config, fit). Vult de
-- bestaande getypeerde `notes`/`industry` aan; die blijven voor gerichte losse feiten.
alter table mmm.project_context add column if not exists description text;
