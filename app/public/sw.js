/*
 * Shape Real — service worker.
 * Objetivo: abrir e usar o app sem sinal (academia, elevador, garagem).
 * - Telas (HTML): rede primeiro, com cópia guardada para quando não houver rede ou ela demorar mais que 400 ms.
 * - Navegação interna (pedido RSC do Next): com cópia da tela guardada, a rede tem 1,5 s para entregar a resposta
 *   inteira; depois o Next cai na navegação completa, que sai da cópia. Sem cópia, ou na mesma tela (só a busca muda),
 *   rede sem limite. O prefetch do Next não passa por aqui.
 * - Arquivos do build (/_next/static, com hash no nome), ícones e fontes: cache primeiro.
 * - /api e /ingest nunca passam por aqui: IA e medição de uso só existem com rede.
 * Ao mudar o FORMATO dos caches, troque VERSION para descartar os antigos. Mudança só de lógica não troca: cada troca
 * faz todos os aparelhos baixarem as 14 telas de novo (rodada M, RM-01).
 */
const VERSION = "v5";
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
/** Com cópia guardada, quanto a rede tem para entregar o HTML de uma tela antes de a cópia aparecer. */
const HTML_ESPERA_MS = 400;
/** Com cópia guardada, quanto a rede tem para responder a um pedido RSC antes de o Next cair na navegação completa. */
const RSC_ESPERA_MS = 1500;
/** Quantos arquivos o aquecimento baixa ao mesmo tempo (antes: todos os de uma tela de uma vez). */
const SIMULTANEOS = 3;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // Atualização de versão: guarda as telas principais nos caches novos antes de o "activate" apagar os
  // antigos, para não abrir um buraco sem tela offline. Na primeira instalação quem faz isso é o app.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => (keys.some((k) => k.startsWith("sr-pages-") && k !== PAGES) ? aquecer() : undefined))
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

/**
 * Mantém o cache de arquivos perto de MAX_ASSETS sem apagar o que alguma tela guardada usa. Antes apagava pela ordem de
 * inserção: arquivo que não muda entre deploys nunca é regravado (fica sempre entre os mais antigos), e o VERSION não
 * muda mais a cada deploy (RM-01), então o CSS e os chunks do /hoje guardado acabavam apagados e a tela abria sem sinal
 * e sem botões. Agora só sai, do mais antigo para o mais novo, o arquivo do build que nenhum HTML de sr-pages cita (nem
 * como fonte do CSS citado): chunks de deploys antigos, o polyfill noModule, import() que nenhuma tela guardada pede.
 * Ícones e arquivos fora de /_next/static ficam (o endereço não muda entre deploys). Se tudo estiver em uso, o cache
 * passa do teto: melhor que uma tela guardada quebrada.
 */
async function trim(cache) {
  const keys = await cache.keys();
  let sobra = keys.length - MAX_ASSETS;
  if (sobra <= 0) return;
  const emUso = await arquivosEmUso(cache, keys);
  for (const req of keys) {
    if (sobra <= 0) break;
    const caminho = new URL(req.url).pathname;
    if (!caminho.startsWith("/_next/static/") || emUso.has(caminho)) continue;
    await cache.delete(req);
    sobra--;
  }
}

/** Caminhos dos arquivos que as telas guardadas usam: os citados no HTML de cada uma e as fontes dos CSS citados. */
async function arquivosEmUso(assets, keys) {
  const usados = new Set();
  const pages = await caches.open(PAGES);
  for (const req of await pages.keys()) {
    const res = await pages.match(req);
    if (!res) continue;
    for (const u of arquivosDoHtml(await res.text())) {
      const a = daOrigem(u);
      if (a) usados.add(a.pathname);
    }
  }
  for (const req of keys) {
    const caminho = new URL(req.url).pathname;
    if (!caminho.endsWith(".css") || !usados.has(caminho)) continue;
    const css = await assets.match(req);
    if (css) for (const fonte of fontesDoCss(await css.text(), req.url)) usados.add(fonte.pathname);
  }
  return usados;
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

/**
 * Tela (navegação completa). Devolve { resposta, fim }: `fim` mantém o service worker vivo até a resposta da rede,
 * mesmo atrasada, atualizar a cópia para a próxima abertura.
 */
function page(request) {
  const path = new URL(request.url).pathname;
  const pages = caches.open(PAGES);
  const network = fetch(request);
  // Este then é registrado antes de qualquer outro na mesma promessa: o clone acontece antes de a página ler o corpo.
  const fim = network
    .then((res) => {
      if (!res.ok || res.type !== "basic" || res.redirected) return;
      const copia = res.clone();
      return pages.then((cache) => cache.put(path, copia));
    })
    .catch(() => {});
  const resposta = (async () => {
    // Cache com problema (armazenamento cheio ou bloqueado): segue só com a rede.
    const cached = await pages.then((cache) => cache.match(path)).catch(() => undefined);
    if (!cached) return network.catch(offline);
    // Com cópia guardada, a rede tem 400 ms para entregar o HTML inteiro: sinal fraco de academia não deixa a tela em
    // branco esperando. Conta até o fim do corpo, não só até o cabeçalho: com perda depois do primeiro pacote, o
    // cabeçalho chega e o corpo fica preso, e a cópia nunca era usada.
    const inteira = network.then(async (res) => {
      await res.clone().arrayBuffer();
      return res;
    });
    inteira.catch(() => {});
    const late = new Promise((resolve) => setTimeout(() => resolve(null), HTML_ESPERA_MS));
    try {
      return (await Promise.race([inteira, late])) || cached;
    } catch {
      return cached;
    }
  })();
  return { resposta, fim };
}

/** Pedido RSC do roteador do Next (navegação interna e prefetch). Next 16.4.6: cabeçalho `RSC: 1` e busca `_rsc`. */
function ehRsc(request, url) {
  return request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
}

/**
 * Prefetch do roteador (Next 16.4.6: cabeçalho `Next-Router-Prefetch`, valores 1 a 3). Segue direto para a rede, como
 * antes da rodada M: com o limite de 1,5 s, o prefetch das telas guardadas nunca terminava com sinal fraco (toda
 * navegação custava 1,5 s + recarga, mesmo depois de minutos na tela), e cada prefetch abortado liberava a vez para os
 * das telas sem cópia, que disputavam a banda com o toque (aluno nunca aberto: de 5,6 para 13,6 s, MEDIDO). A navegação
 * cria o próprio pedido RSC mesmo com o prefetch pendente, e esse pedido tem o limite.
 */
function ehPrefetch(request) {
  return request.headers.has("Next-Router-Prefetch");
}

/**
 * A página que fez o pedido já está nesse caminho (só a busca muda: `router.replace` da sessão, `?aba=`)? Uma troca de
 * busca não pode virar recarga: na sessão, a recarga perguntava de novo pelo treino em andamento, em laço.
 */
async function mesmaTela(clientId, pathname) {
  if (!clientId || !self.clients || typeof self.clients.get !== "function") return false;
  try {
    const cliente = await self.clients.get(clientId);
    return Boolean(cliente && cliente.url) && new URL(cliente.url).pathname === pathname;
  } catch {
    return false;
  }
}

/**
 * Com cópia da tela em sr-pages: a rede tem 1,5 s para entregar a resposta inteira (cabeçalho e corpo; com perda depois
 * do primeiro pacote, o corpo ficava preso depois do cabeçalho). Estourou: aborta e devolve erro de rede; o Next
 * (fetch-server-response.js, catch) cai na navegação completa, que `page()` serve da cópia. A resposta devolvida é a
 * original (com `url` e `redirected`, que o Next lê), já com o corpo inteiro (~10 KB). Sem cópia, ou na mesma tela:
 * rede sem limite, como antes (um aluno nunca aberto não abria em 60 s com o limite).
 */
async function rsc(request, url, clientId) {
  const cached = await caches.open(PAGES).then((cache) => cache.match(url.pathname)).catch(() => undefined);
  if (!cached || (await mesmaTela(clientId, url.pathname))) return fetch(request);
  const ctrl = new AbortController();
  const parar = () => ctrl.abort();
  const timer = setTimeout(parar, RSC_ESPERA_MS);
  // A página desistiu do pedido (outra navegação): desiste também da rede.
  if (request.signal && typeof request.signal.addEventListener === "function") request.signal.addEventListener("abort", parar, { once: true });
  try {
    const res = await fetch(request, { signal: ctrl.signal });
    await res.clone().arrayBuffer();
    return res;
  } catch {
    return Response.error();
  } finally {
    clearTimeout(timer);
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
  if (request.mode === "navigate") {
    const { resposta, fim } = page(request);
    event.respondWith(resposta);
    event.waitUntil(fim);
    return;
  }
  if (ehRsc(request, url) && !ehPrefetch(request)) event.respondWith(rsc(request, url, event.clientId));
});

/** Executa `fn` em cada item, no máximo SIMULTANEOS de cada vez. Erro num item não para os outros. */
async function emFila(itens, fn) {
  let i = 0;
  const trabalhador = async () => {
    while (i < itens.length) {
      const item = itens[i++];
      try {
        await fn(item);
      } catch {}
    }
  };
  await Promise.all(Array.from({ length: Math.min(SIMULTANEOS, itens.length) }, trabalhador));
}

/**
 * Arquivos do build citados no HTML de uma tela. Fica de fora o `<script nomodule>` (polyfill de navegador antigo,
 * 38,7 KB): navegador moderno nunca baixa nem executa. Ele só aparece nessa tag, mas sai pelo endereço.
 */
function arquivosDoHtml(html) {
  const urls = new Set(html.match(/\/_next\/static\/[^"'\\\s)<>]+/g) || []);
  for (const tag of html.match(/<script\b[^>]*\bnomodule\b[^>]*>/gi) || []) {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (src) urls.delete(src[1]);
  }
  return [...urls];
}

/**
 * Guarda um arquivo do build que ainda não está no cache. `comFontes`: de um CSS, guarda também as fontes citadas, mesmo
 * com o CSS já guardado: o "guardar-esta" e a própria página guardam o CSS sem as fontes, e só a que a tela usou vinha
 * junto (a latin-ext ficava de fora do aquecimento, MEDIDO na integração de M-A).
 */
async function guardarArquivo(u, assets, comFontes) {
  const css = comFontes && new URL(u, self.location.origin).pathname.endsWith(".css");
  const guardado = await assets.match(u);
  if (guardado) {
    if (css) await fontsDoCss(await guardado.text(), u, assets);
    return;
  }
  const r = await fetch(u, { priority: "low" });
  if (!r.ok || r.redirected) return;
  if (css) await fontsDoCss(await r.clone().text(), u, assets);
  await assets.put(u, r);
}

/**
 * HTML da primeira tela do CORE no fim do último aquecimento completo. Não dá para comparar com a cópia da própria tela:
 * /hoje é rede primeiro e vive sendo aberta, então a cópia já tem o deploy novo enquanto as outras 13 ficaram no antigo.
 * Fica em sr-pages com busca no endereço: `page()` procura só pelo caminho e nunca entrega esta entrada.
 */
const MARCA_DO_AQUECIMENTO = `${CORE[0]}?aquecimento`;

/**
 * Guarda as telas principais e os arquivos que elas pedem, para funcionarem sem rede mesmo antes da primeira visita.
 * Reaquecimento (as 14 telas guardadas e a marca do último aquecimento completo): baixa só a primeira e compara com a
 * marca. Igual = não houve deploy desde então, e para aí (~3 KB em vez de ~46 KB). Diferente: segue com todas.
 */
async function warm() {
  const pages = await caches.open(PAGES);
  const assets = await caches.open(ASSETS);
  const copias = await Promise.all(CORE.map((p) => pages.match(p)));
  const marca = await pages.match(MARCA_DO_AQUECIMENTO);
  const reaquecer = Boolean(marca) && copias.every(Boolean);
  let primeira = null;
  let todas = true;
  for (let i = 0; i < CORE.length; i++) {
    const conferir = reaquecer && i === 0;
    try {
      const res = await fetch(CORE[i], { credentials: "same-origin", priority: "low" });
      if (!res.ok || res.redirected) {
        if (conferir) return;
        todas = false;
        continue;
      }
      const html = await res.clone().text();
      if (conferir && html === (await marca.text())) return;
      if (i === 0) primeira = html;
      await pages.put(CORE[i], res);
      await emFila(arquivosDoHtml(html), (u) => guardarArquivo(u, assets, true));
    } catch {
      // Sem rede na conferência: tenta de novo no próximo pedido do app.
      if (conferir) return;
      todas = false;
    }
  }
  // A marca só vale para um aquecimento completo: se faltou alguma tela, o próximo pedido baixa todas de novo.
  if (todas && primeira !== null) await pages.put(MARCA_DO_AQUECIMENTO, new Response(primeira, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
  await trim(assets);
}

/**
 * Fontes citadas pelo CSS (url(...) do @font-face): não aparecem no HTML, então sem isto a primeira sessão sem rede
 * abria com a fonte reserva, mais larga, e cortava títulos a 360 px. Só latin e latin-ext (o app é pt-BR).
 */
async function fontsDoCss(css, cssUrl, assets) {
  for (const font of fontesDoCss(css, cssUrl)) {
    if (await assets.match(font.pathname)) continue;
    try {
      const r = await fetch(font.pathname, { priority: "low" });
      if (r.ok && !r.redirected) await assets.put(font.pathname, r);
    } catch {}
  }
}

/** Fontes .woff2 de mesma origem citadas num CSS, só latin e latin-ext. */
function fontesDoCss(css, cssUrl) {
  const fontes = [];
  for (const ref of css.match(/url\(\s*["']?[^"')]+\.woff2[^"')]*["']?\s*\)/g) || []) {
    const raw = ref.replace(/^url\(\s*["']?/, "").replace(/["']?\s*\)$/, "");
    let font;
    try {
      font = new URL(raw, new URL(cssUrl, self.location.origin));
    } catch {
      continue;
    }
    if (font.origin !== self.location.origin) continue;
    if (/vietnamese|cyrillic|greek|hebrew|math|symbols/.test(font.pathname)) continue;
    fontes.push(font);
  }
  return fontes;
}

/** Endereço de mesma origem, ou null. */
function daOrigem(s) {
  try {
    const u = new URL(s, self.location.origin);
    return u.origin === self.location.origin ? u : null;
  } catch {
    return null;
  }
}

/**
 * Mensagem { tipo: "guardar-esta", path, assets } do app (RM-04), validada. Qualquer outro formato: null (ignorada).
 * `path` precisa ser um caminho de tela ("/…", fora de /api, /ingest e /_next). Dos `assets`, ficam só os de mesma origem
 * em /_next/static ou terminados em .woff2.
 */
function pedidoGuardarEsta(d) {
  if (!d || typeof d !== "object" || d.tipo !== "guardar-esta" || typeof d.path !== "string" || !Array.isArray(d.assets)) return null;
  if (!d.path.startsWith("/") || d.path.startsWith("//")) return null;
  const tela = daOrigem(d.path);
  if (!tela || /^\/(?:api|ingest|_next)\//.test(tela.pathname)) return null;
  const urls = new Set();
  for (const a of d.assets.slice(0, MAX_ASSETS)) {
    if (typeof a !== "string") continue;
    const u = daOrigem(a);
    if (u && (u.pathname.startsWith("/_next/static/") || u.pathname.endsWith(".woff2"))) urls.add(u.pathname + u.search);
  }
  return { path: tela.pathname, assets: [...urls] };
}

/**
 * Guarda a tela aberta e os arquivos que ela já baixou. O primeiro carregamento não passa pelo service worker (ele é
 * registrado no load): sem isto, o aluno que só abriu o questionário ficava sem nada guardado. O HTML vem da rede
 * (~4 KB); os arquivos, do cache HTTP (immutable). Resposta com redirecionamento nunca é guardada.
 */
async function guardarEsta({ path, assets: urls }) {
  const pages = await caches.open(PAGES);
  const assets = await caches.open(ASSETS);
  try {
    const res = await fetch(path, { credentials: "same-origin", priority: "low" });
    const html = (res.headers.get("Content-Type") || "").includes("text/html");
    if (res.ok && res.type === "basic" && !res.redirected && html) await pages.put(path, res);
  } catch {}
  await emFila(urls, (u) => guardarArquivo(u, assets, false));
  await trim(assets);
}

/** Aquecimento em andamento. Um pedido que chega no meio (outra aba, outra página oculta) espera o mesmo. */
let aquecendo = null;
function aquecer() {
  if (!aquecendo) aquecendo = warm().finally(() => (aquecendo = null));
  return aquecendo;
}

self.addEventListener("message", (event) => {
  if (event.data === "warm") {
    event.waitUntil(aquecer());
    return;
  }
  const pedido = pedidoGuardarEsta(event.data);
  if (pedido) event.waitUntil(guardarEsta(pedido));
});
