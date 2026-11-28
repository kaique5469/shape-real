import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

/**
 * Build identificável (rodada 3, R3-2). SHA curto do commit que a Vercel publica (7 caracteres hexadecimais) ou "local"
 * (build na máquina, variável ausente ou fora do formato). A hora vai para process.env na primeira leitura deste arquivo:
 * as leituras seguintes no mesmo build (servidor e navegador) herdam o mesmo valor. Só isso entra no pacote: nada de
 * segredo (src/lib/versao.ts confere o formato de novo antes de mostrar).
 */
const shaDoCommit = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").trim().toLowerCase().slice(0, 7);
const BUILD_SHA = /^[0-9a-f]{7}$/.test(shaDoCommit) ? shaDoCommit : "local";
process.env.NEXT_PUBLIC_BUILD_AT ||= new Date().toISOString();
const BUILD_AT = process.env.NEXT_PUBLIC_BUILD_AT;

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_BUILD_SHA: BUILD_SHA, NEXT_PUBLIC_BUILD_AT: BUILD_AT },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // O service worker nunca fica em cache do navegador: cada visita confere se há versão nova.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  // Proxy do PostHog (região US) no próprio domínio: bloqueadores de anúncio não derrubam eventos e erros.
  // /static e /array vão para o host de assets; o resto, para o host de ingestão. A ordem importa.
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/array/:path*", destination: "https://us-assets.i.posthog.com/array/:path*" },
      { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
    ];
  },
  // As rotas do PostHog terminam em barra (/e/, /flags/): sem isso cada envio ganharia um redirecionamento.
  skipTrailingSlashRedirect: true,
};

export default config;
