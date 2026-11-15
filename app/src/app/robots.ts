import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://app.shapereal.com.br";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/privacidade", "/termos"], disallow: ["/hoje", "/treinos", "/sessao", "/historico", "/evolucao", "/dieta", "/alunos", "/conta", "/onboarding", "/api/"] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
