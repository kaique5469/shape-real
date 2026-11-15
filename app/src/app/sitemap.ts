import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://app.shapereal.com.br";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/entrar`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/privacidade`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE}/termos`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
