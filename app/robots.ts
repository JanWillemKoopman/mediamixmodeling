import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site/siteUrl";

// De publieke pagina mag geïndexeerd worden; de applicatie erachter niet.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/projects", "/dashboard", "/login", "/sander"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
