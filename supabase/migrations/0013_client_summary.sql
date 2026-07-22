-- Presentatieklare klantsamenvatting per run: door Claude geschreven, in klanttaal,
-- gegenereerd op verzoek van de bouwer (zie /api/client-summary). JSONB met dezelfde
-- vorm als RunAnalysis-light: { text, model, generated_at }.
alter table mmm.model_runs add column if not exists client_summary jsonb;
