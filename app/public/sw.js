/*
 * Shape Real — service worker.
 * Objetivo: abrir e usar o app sem sinal (academia, elevador, garagem).
 * - Telas (HTML): rede primeiro, com cópia guardada para quando não houver rede.
 * - Arquivos do build (/_next/static, com hash no nome), ícones e fontes: cache primeiro.
 * - /api e /ingest nunca passam por aqui: IA e medição de uso só existem com rede.
 * Ao mudar a lógica deste arquivo, troque VERSION para descartar os caches antigos.
 */
const VERSION = "v4";
const PAGES = `sr-pages-${VERSION}`;
const ASSETS = `sr-assets-${VERSION}`;
// /abrir e /receber: o link do WhatsApp precisa abrir mesmo sem sinal (os dados vêm no próprio link).
// /questionario: o preenchimento junto (?aluno=) vai do "Adicionar aluno" ao resumo em modo avião, e o aluno do link
// continua o rascunho sem sinal. v4: a troca de versão descarta os caches antigos (cópia velha de /receber sem o ramo
// do questionário).
// /entrar, /onboarding e /treinos/novo ("Montar do zero"): quem abriu a página inicial uma vez cria o perfil e a ficha em
// modo avião. A busca (?modo=criar, ?perfil=personal) é lida no aparelho; a cópia guardada é a do caminho.
const CORE = ["/hoje", "/sessao", "/treinos", "/treinos/novo", "/historico", "/evolucao", "/dieta", "/conta", "/alunos", "/abrir", "/receber", "/questionario", "/entrar", "/onboarding"];
const MAX_ASSETS = 320;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // Atualização de versão: guarda as telas principais nos caches novos antes de o "activate" apagar os
  // antigos, para não abrir um buraco sem tela offline. Na primeira instalação quem faz isso é o app.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => (keys.some((k) => k.startsWith("sr-pages-") && k !== PAGES) ? warm() : undefined))
      .catch(() => {}),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("sr-") && key !== PAGES && key !== ASSETS) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ASSETS; i++) await cache.delete(keys[i]);
}

async function asset(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

const OFFLINE_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem internet · Shape Real</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f1f2ee;color:#12151a;font:16px/1.5 system-ui,sans-serif}main{max-width:28rem;padding:2rem 1.25rem}h1{font-size:1.5rem;line-height:1.15;margin:0 0 .75rem;font-weight:800}p{margin:0 0 1.25rem;color:#535b67}a{display:inline-flex;align-items:center;height:2.75rem;padding:0 1.1rem;border-radius:6px;background:#12151a;color:#f1f2ee;font-weight:600;text-decoration:none}</style></head>
<body><main><h1>Esta tela ainda não foi aberta neste aparelho</h1><p>Você está sem internet e só as telas que já foram abertas ficam guardadas. Seus treinos continuam salvos.</p><a href="/hoje">Ir para Hoje</a></main></body></html>`;

const offline = () => new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });

async function page(request) {
  const cache = await caches.open(PAGES);
  const path = new URL(request.url).pathname;
  const cached = await cache.match(path);
  const network = fetch(request).then((res) => {
    if (res.ok && res.type === "basic" && !res.redirected) cache.put(path, res.clone());
    return res;
  });
  if (!cached) return network.catch(offline);
  // Com cópia guardada, a rede tem 2,5 s para responder: sinal fraco de academia não deixa a tela em branco.
  // A resposta atrasada ainda atualiza a cópia para a próxima abertura.
  network.catch(() => {});
  const late = new Promise((resolve) => setTimeout(() => resolve(null), 2500));
  try {
    return (await Promise.race([network, late])) || cached;
  } catch {
    return cached;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ingest/")) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(?:svg|png|woff2?)$/.test(url.pathname)) {
    event.respondWith(asset(request));
    return;
  }
  if (request.mode === "navigate") event.respondWith(page(request));
});

/** Guarda as telas principais e os arquivos que elas pedem, para funcionarem sem rede mesmo antes da primeira visita. */
async function warm() {
  const pages = await caches.open(PAGES);
  const assets = await caches.open(ASSETS);
  for (const path of CORE) {
    try {
      const res = await fetch(path, { credentials: "same-origin" });
      if (!res.ok || res.redirected) continue;
      const html = await res.clone().text();
      await pages.put(path, res);
      const urls = new Set(html.match(/\/_next\/static\/[^"'\\\s)<>]+/g) || []);
      await Promise.all(
        [...urls].map(async (u) => {
          if (await assets.match(u)) return;
          try {
            const r = await fetch(u);
            if (r.ok) await assets.put(u, r);
          } catch {}
        }),
      );
    } catch {}
  }
  await trim(assets);
}

self.addEventListener("message", (event) => {
  if (event.data === "warm") event.waitUntil(warm());
});
