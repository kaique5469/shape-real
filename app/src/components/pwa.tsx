"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { CircleAlert, CircleCheck, Download, Share, WifiOff, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { reportError, track } from "@/lib/analytics";
import { useApp } from "@/lib/app-context";
import {
  AQUECER_DEPOIS_DA_NAVEGACAO_MS,
  AQUECER_SEM_NAVEGACAO_MS,
  MARCA_DO_AQUECIMENTO,
  OCIOSO_LIMITE_MS,
  bloqueioDoAquecimento,
  pedidoGuardarEsta,
  precisaDosPerfis,
  proximoPasso,
  type ConexaoDoAparelho,
  type EventoAquecimento,
  type FaseAquecimento,
} from "@/lib/aquecimento";
import { promptShowsAgain } from "@/lib/domain/export";
import { perfisDoAparelho } from "@/lib/questionario-base";

/**
 * A cópia de segurança (validação dos links, montagem do arquivo) só é carregada quando o card do iPhone
 * aparece: este arquivo entra no pacote de todas as telas por causa do PwaRegister.
 */
const loadBackup = () => import("@/lib/transfer-client");

/** Evento do Chrome/Android que permite oferecer a instalação com um botão nosso. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let installEvent: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

const WARM_KEY = "sr:sw-warm";
const DISMISS_KEY = "sr:install-dismissed";
const IOS_INSTALLED_KEY = "sr:installed-seen";

/** O app está aberto pela tela de início (instalado), e não no navegador. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone ou iPad (o iPad com iPadOS se apresenta como Mac com tela de toque). */
export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Safari (ou outro navegador) do iPhone, fora do app instalado. Ali os dados são outros: o app da tela de
 * início não enxerga o que está no Safari, e o WhatsApp sempre abre os links no Safari.
 */
export function isIosBrowser(): boolean {
  return isIosDevice() && !isStandaloneDisplay();
}

type Pagina = { pathname: string; hash: string };

/**
 * Situação do aparelho no momento do gatilho: a rede, a página e os perfis podem ter mudado desde o load. A página do
 * load entra também: a regra do questionário sem perfil não pode cair só porque o aluno navegou (ex.: "Saiba mais").
 */
function situacaoAgora(paginaDoLoad: Pagina, aquecimentoCompleto: boolean | null) {
  const { pathname, hash } = window.location;
  let ultimo = 0;
  try {
    ultimo = Number(localStorage.getItem(WARM_KEY) ?? 0);
  } catch {}
  let perfis: ReturnType<typeof perfisDoAparelho> | null = null;
  if (precisaDosPerfis(pathname, paginaDoLoad.pathname)) {
    try {
      perfis = perfisDoAparelho(localStorage);
    } catch {}
  }
  const conexao = (navigator as Navigator & { connection?: ConexaoDoAparelho }).connection ?? null;
  return { agora: Date.now(), ultimoAquecimento: ultimo, aquecimentoCompleto, online: navigator.onLine, conexao, pagina: { pathname, hash }, paginaDoLoad, perfis };
}

/** A marca do último aquecimento completo está no cache do SW? null = não deu para ler (sem Cache API, bloqueada). */
async function aquecimentoCompleto(): Promise<boolean | null> {
  try {
    if (typeof caches === "undefined") return null;
    return Boolean(await caches.match(MARCA_DO_AQUECIMENTO));
  } catch {
    return null;
  }
}

/** Chama `fn` quando o navegador ficar ocioso (no máximo 3 s de espera) e mais 3 s. Devolve o cancelamento. */
function depoisDeOcioso(fn: () => void): () => void {
  let timer: number | undefined;
  let ocioso: number | undefined;
  const depois = () => {
    timer = window.setTimeout(fn, AQUECER_DEPOIS_DA_NAVEGACAO_MS);
  };
  if (typeof window.requestIdleCallback === "function") ocioso = window.requestIdleCallback(depois, { timeout: OCIOSO_LIMITE_MS });
  else timer = window.setTimeout(depois, 0); // Safari: sem requestIdleCallback
  return () => {
    if (ocioso !== undefined) window.cancelIdleCallback?.(ocioso);
    window.clearTimeout(timer);
  };
}

/**
 * Registra o service worker no load, como antes, e:
 * - RM-04: se este carregamento não passou pelo service worker (primeira visita, ou recarga forçada), pede a ele que
 *   guarde esta tela e os arquivos que ela já baixou ("guardar-esta"), em qualquer rota. Custa o HTML (~4 KB); os
 *   arquivos saem do cache HTTP;
 * - RM-01: pede o aquecimento ("warm") no primeiro gatilho de `proximoPasso` (primeira navegação interna terminada +
 *   ocioso + 3 s; 20 s depois do load sem navegação; página oculta), se `bloqueioDoAquecimento` deixar no momento do
 *   gatilho, com a página do load e a marca do último aquecimento completo. No load, o aquecimento disputava a banda com
 *   o toque seguinte.
 * Devolve a limpeza. `aoNavegar` é chamado pelo PwaRegister quando o pathname muda.
 */
function iniciarServiceWorker(aoNavegar: { current: (() => void) | null }): () => void {
  const sw = navigator.serviceWorker;
  // Página deste carregamento (o PwaRegister monta uma vez por carregamento, no layout raiz).
  const paginaDoLoad: Pagina = { pathname: window.location.pathname, hash: window.location.hash };
  // Lido antes do registro: na primeira instalação, o `clients.claim()` passa a controlar a página logo depois.
  const passouPeloSw = Boolean(sw.controller);
  let vivo = true;
  let registro: ServiceWorkerRegistration | null = null;
  const naFila: Array<(reg: ServiceWorkerRegistration) => void> = [];
  const comRegistro = (fn: (reg: ServiceWorkerRegistration) => void) => (registro ? fn(registro) : void naFila.push(fn));

  let fase: FaseAquecimento = "esperando";
  let cancelarOcioso: (() => void) | null = null;
  let semNavegacao: number | undefined;

  const pedirAquecimento = () =>
    comRegistro((reg) => {
      void aquecimentoCompleto().then((completo) => {
        if (!vivo || bloqueioDoAquecimento(situacaoAgora(paginaDoLoad, completo))) return;
        reg.active?.postMessage("warm");
        try {
          localStorage.setItem(WARM_KEY, String(Date.now()));
        } catch {}
      });
    });

  const aoMudarVisibilidade = () => {
    if (document.visibilityState === "hidden") aplicar("pagina-oculta");
  };
  const desligarGatilhos = () => {
    cancelarOcioso?.();
    cancelarOcioso = null;
    window.clearTimeout(semNavegacao);
    document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    aoNavegar.current = null;
  };
  function aplicar(evento: EventoAquecimento) {
    const passo = proximoPasso(fase, evento);
    fase = passo.fase;
    if (passo.esperarOcioso) cancelarOcioso = depoisDeOcioso(() => aplicar("ocioso-depois-da-navegacao"));
    if (passo.gatilho) {
      desligarGatilhos();
      pedirAquecimento();
    }
  }
  aoNavegar.current = () => aplicar("navegacao-terminada");
  document.addEventListener("visibilitychange", aoMudarVisibilidade);

  const start = () => {
    if (fase !== "pedido") semNavegacao = window.setTimeout(() => aplicar("tempo-sem-navegacao"), AQUECER_SEM_NAVEGACAO_MS);
    sw.register("/sw.js")
      .then(() => sw.ready)
      .then((reg) => {
        if (!vivo) return;
        registro = reg;
        if (!passouPeloSw) {
          const recursos = performance.getEntriesByType("resource").map((e) => e.name);
          reg.active?.postMessage(pedidoGuardarEsta(window.location.pathname, recursos, window.location.origin));
        }
        for (const fn of naFila.splice(0)) fn(reg);
      })
      .catch(() => {
        /* sem service worker o app segue funcionando com rede */
      });
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });

  return () => {
    vivo = false;
    desligarGatilhos();
    window.removeEventListener("load", start);
  };
}

/**
 * Registra o service worker (só em produção) e guarda o evento de instalação. O aquecimento das telas principais e a
 * cópia da tela aberta ficam em `iniciarServiceWorker`.
 */
export function PwaRegister() {
  const pathname = usePathname();
  const pathnameInicial = useRef(pathname);
  const aoNavegar = useRef<(() => void) | null>(null);

  // Uma navegação interna terminou: o pathname mudou depois da montagem (o layout raiz não desmonta entre telas).
  useEffect(() => {
    if (pathname !== pathnameInicial.current) aoNavegar.current?.();
  }, [pathname]);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      installEvent = e as InstallEvent;
      notify();
    };
    const onInstalled = () => {
      installEvent = null;
      notify();
      track("app_installed", {});
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Quem já tem dados guardados neste aparelho pede ao navegador para não apagá-los por falta de uso
    // (o Safari limpa o armazenamento de sites parados por sete dias).
    try {
      if (localStorage.getItem("sr:session")) void navigator.storage?.persist?.().catch(() => {});
    } catch {}

    // iPhone não avisa a instalação (não há "appinstalled"): conta a primeira abertura pela tela de início.
    try {
      if (isIosDevice() && isStandaloneDisplay() && !localStorage.getItem(IOS_INSTALLED_KEY)) {
        localStorage.setItem(IOS_INSTALLED_KEY, "1");
        track("app_installed", { plataforma: "ios" });
      }
    } catch {}

    const pararServiceWorker = process.env.NODE_ENV === "production" && "serviceWorker" in navigator ? iniciarServiceWorker(aoNavegar) : null;
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      pararServiceWorker?.();
    };
  }, []);
  return null;
}

function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/** Faixa discreta quando o aparelho fica sem rede: diz o que continua valendo. */
export function OfflineBar({ cloud }: { cloud: boolean }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="no-print flex items-center justify-center gap-2 bg-iron px-4 py-2 text-center text-sm font-semibold text-chalk">
      <WifiOff className="size-4 shrink-0" aria-hidden />
      <span>{cloud ? "Sem internet. O treino fica guardado no aparelho e é enviado quando a conexão voltar." : "Sem internet. O que você registrar continua salvo neste aparelho."}</span>
    </div>
  );
}

type Platform = "prompt" | "ios" | "other" | "installed";

function usePlatform(): Platform | null {
  const event = useSyncExternalStore(
    subscribe,
    () => installEvent,
    () => null,
  );
  const [platform, setPlatform] = useState<Platform | null>(null);
  useEffect(() => {
    setPlatform(isStandaloneDisplay() ? "installed" : event ? "prompt" : isIosDevice() ? "ios" : "other");
  }, [event]);
  return platform;
}

type Dismissal = { n: number; at: string | null };

/** Quantas vezes o convite foi dispensado e quando. O valor antigo "1" conta como uma dispensa feita agora. */
function readDismissal(): Dismissal | null {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return null;
    if (raw === "1") {
      const d = { n: 1, at: new Date().toISOString() };
      localStorage.setItem(DISMISS_KEY, JSON.stringify(d));
      return d;
    }
    const d = JSON.parse(raw) as Partial<Dismissal> | null;
    return typeof d?.n === "number" ? { n: d.n, at: typeof d.at === "string" ? d.at : null } : null;
  } catch {
    return null;
  }
}

type Trigger = "primeiro_treino" | "primeiro_aluno";

/**
 * Hora certa do convite: depois do 1º treino concluído (aluno ou quem treina sozinho) ou do 1º aluno real
 * cadastrado (personal; exemplos não contam). null enquanto não chegou a hora; undefined enquanto confere.
 */
function useInstallTrigger(enabled: boolean): Trigger | null | undefined {
  const { ready, user, repo, isDemo, returnTo } = useApp();
  const [trigger, setTrigger] = useState<Trigger | null | undefined>(undefined);
  const userId = user?.id;
  const role = user?.role;
  useEffect(() => {
    if (!enabled || !ready) return;
    if (!userId || isDemo || returnTo) return setTrigger(null);
    let alive = true;
    (async () => {
      if (role === "coach") {
        const list = await repo.listStudents(userId).catch(() => []);
        if (alive) setTrigger(list.some((s) => !s.profile.sample) ? "primeiro_aluno" : null);
      } else {
        const done = await repo.listSessions(userId, { limit: 1 }).catch(() => []);
        if (alive) setTrigger(done.length ? "primeiro_treino" : null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled, ready, userId, role, repo, isDemo, returnTo]);
  return trigger;
}

/**
 * Convite para instalar o app na tela inicial.
 * `banner`: Hoje e Alunos, só depois do 1º treino concluído ou do 1º aluno real; dispensado, volta uma
 * única vez 14 dias depois.
 * `panel`: fica em Conta, sempre, com o passo a passo de cada aparelho.
 * No iPhone, o app instalado não enxerga os dados do Safari: o card mostra os 3 passos (cópia, instalar,
 * restaurar a cópia dentro do app) em vez de prometer que os dados passam sozinhos.
 */
export function InstallCard({ variant, where }: { variant: "banner" | "panel"; where: string }) {
  const platform = usePlatform();
  const { user, repo, returnTo } = useApp();
  const trigger = useInstallTrigger(variant === "banner");
  const [dismissal, setDismissal] = useState<Dismissal | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [copy, setCopy] = useState<"idle" | "busy" | "done" | "error">("idle");
  const shown = useRef(false);
  useEffect(() => {
    setDismissal(readDismissal());
  }, []);

  const bannerVisible = variant === "banner" && (platform === "prompt" || platform === "ios") && dismissal !== undefined && promptShowsAgain(dismissal) && Boolean(trigger);

  useEffect(() => {
    if (platform === "ios" && (variant === "panel" || bannerVisible)) void loadBackup().catch(() => {});
  }, [platform, variant, bannerVisible]);

  useEffect(() => {
    if (!bannerVisible || shown.current) return;
    shown.current = true;
    track("app_install_prompted", { gatilho: trigger ?? null, where, plataforma: platform, acao: "card" });
  }, [bannerVisible, trigger, where, platform]);

  if (!platform || platform === "installed") return variant === "panel" && platform === "installed" ? <p className="text-[0.9375rem] text-steel">O app já está instalado neste aparelho.</p> : null;
  if (variant === "banner" && !bannerVisible) return null;

  async function install() {
    if (!installEvent) return;
    setBusy(true);
    track("app_install_prompted", { gatilho: trigger ?? null, where, plataforma: "prompt", acao: "instalar" });
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
    } catch {
      /* o navegador pode recusar um segundo pedido */
    } finally {
      installEvent = null;
      notify();
      setBusy(false);
    }
  }

  async function backupFirst() {
    if (!user) return;
    setCopy("busy");
    try {
      // Já carregado quando o card apareceu: o compartilhar do iPhone abre dentro do mesmo toque.
      const { makeBackup } = await loadBackup();
      const r = await makeBackup(repo, user, "instalar");
      setCopy(r ? "done" : "idle");
    } catch (e) {
      reportError(e, "instalar:copia");
      setCopy("error");
    }
  }

  function dismiss() {
    const next: Dismissal = { n: (dismissal?.n ?? 0) + 1, at: new Date().toISOString() };
    setDismissal(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {}
  }

  const ios = platform === "ios";
  const step = (n: number) => (
    <span className="plate-type grid size-7 shrink-0 place-items-center rounded bg-iron text-sm text-chalk" aria-hidden>
      {n}
    </span>
  );

  const body = ios ? (
    <>
      <h2 className="text-[0.9375rem] font-bold">Instale na tela de início</h2>
      <p className="mt-0.5 max-w-[60ch] text-sm text-steel">No iPhone, o Safari pode apagar dados de sites parados por 7 dias. Instalado, seus treinos ficam guardados e o app abre sem internet.</p>
      <p className="mt-2 max-w-[60ch] text-sm text-steel">O app instalado começa vazio: ele não enxerga o que está no Safari. Para levar o que já está aqui:</p>
      <ol className="mt-3 space-y-2.5 text-sm" aria-label="Passos para instalar sem perder os dados">
        <li className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          {step(1)}
          <span className="sr-only">1.</span>
          <span className="min-w-0 flex-1 font-semibold">Faça uma cópia</span>
          {copy === "done" ? (
            <span role="status" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-plate-green-ink">
              <CircleCheck className="size-4" aria-hidden /> Cópia feita
            </span>
          ) : user && !returnTo ? (
            <Button variant="secondary" onClick={backupFirst} loading={copy === "busy"} className="shrink-0">
              Fazer cópia
            </Button>
          ) : null}
          {copy === "error" ? (
            <span role="alert" className="flex basis-full items-start gap-1.5 text-danger">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0">Não foi possível fazer a cópia. Tente de novo.</span>
            </span>
          ) : null}
        </li>
        <li className="flex items-start gap-2.5">
          {step(2)}
          <span className="sr-only">2.</span>
          <span className="min-w-0 pt-1">
            <strong>Instale:</strong> no Safari, toque em <Share className="inline size-4 align-[-2px]" aria-label="Compartilhar" /> <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          {step(3)}
          <span className="sr-only">3.</span>
          <span className="min-w-0 pt-1">
            No app, toque em <strong>Restaurar cópia</strong> e escolha o arquivo.
          </span>
        </li>
      </ol>
    </>
  ) : (
    <>
      <h2 className="text-[0.9375rem] font-bold">Instale o Shape Real no celular</h2>
      <p className="mt-0.5 max-w-[60ch] text-sm text-steel">Abre direto da tela inicial, em tela cheia, e continua funcionando na academia mesmo sem sinal.</p>
      {platform === "other" ? (
        <p className="mt-2 text-sm">
          No menu do navegador, escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
        </p>
      ) : null}
    </>
  );

  return (
    <section
      aria-label="Instalar o app"
      className={cx(variant === "banner" ? "no-print relative rounded-[var(--radius-ficha)] border border-rule-strong bg-paper p-4 pr-12" : "space-y-3")}
    >
      <div className={cx(variant === "banner" && !ios && "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between")}>
        <div className="min-w-0">{body}</div>
        {platform === "prompt" ? (
          <Button onClick={install} loading={busy} icon={<Download className="size-4" />} className={cx("shrink-0", variant === "panel" && "mt-3")}>
            Instalar app
          </Button>
        ) : null}
      </div>
      {variant === "banner" ? (
        <button type="button" onClick={dismiss} aria-label="Dispensar o convite para instalar" className="absolute right-0 top-0 grid size-11 place-items-center text-steel hover:text-iron">
          <X className="size-4" />
        </button>
      ) : null}
    </section>
  );
}
