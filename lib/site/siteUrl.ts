/**
 * Absolute basis-URL van de publieke site, voor metadata, canonical, Open Graph en sitemap.
 * Zet NEXT_PUBLIC_SITE_URL zodra het definitieve domein bekend is; zonder die variabele valt
 * de site terug op de Vercel-URL van de deploy, en lokaal op localhost.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
