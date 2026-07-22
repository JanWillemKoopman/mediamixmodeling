-- Brutomarge op de KPI (fractie 0–1), per project. Nodig om van ROAS (omzet per euro)
-- naar ROI (wínst per euro) te komen in het dashboard: break-even ligt dan niet bij
-- ROAS 1,0 maar bij 1/marge. Ingevuld door de bouwer in het zakelijke-contextpaneel.
alter table mmm.projects
  add column if not exists kpi_margin numeric check (kpi_margin > 0 and kpi_margin <= 1);
