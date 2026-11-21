"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, WifiOff, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { track } from "@/lib/analytics";

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

/**
 * Registra o service worker (só em produção) e guarda o evento de instalação.
 * Uma vez a cada seis horas pede ao service worker que guarde as telas principais,
 * para o app abrir sem sinal mesmo em telas ainda não visitadas.
 */
export function PwaRegister() {
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

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      const start = () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then(() => navigator.serviceWorker.ready)
          .then((reg) => {
            let last = 0;
            try {
              last = Number(localStorage.getItem(WARM_KEY) ?? 0);
            } catch {}
            if (Date.now() - last < 6 * 3_600_000 || !navigator.onLine) return;
            reg.active?.postMessage("warm");
            try {
              localStorage.setItem(WARM_KEY, String(Date.now()));
            } catch {}
          })
          .catch(() => {
            /* sem service worker o app segue funcionando com rede */
          });
      };
      if (document.readyState === "complete") start();
      else window.addEventListener("load", start, { once: true });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
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
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    setPlatform(standalone ? "installed" : event ? "prompt" : ios ? "ios" : "other");
  }, [event]);
  return platform;
}

/**
 * Convite para instalar o app na tela inicial.
 * `banner`: aparece em Hoje e Alunos quando o aparelho permite instalar, e some de vez ao ser dispensado.
 * `panel`: fica em Conta, com o passo a passo de cada aparelho.
 */
export function InstallCard({ variant, where }: { variant: "banner" | "panel"; where: string }) {
  const platform = usePlatform();
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!platform || platform === "installed") return variant === "panel" && platform === "installed" ? <p className="text-[0.9375rem] text-steel">O app já está instalado neste aparelho.</p> : null;
  if (variant === "banner" && (dismissed || platform === "other")) return null;

  async function install() {
    if (!installEvent) return;
    setBusy(true);
    track("app_install_prompted", { where });
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

  const steps =
    platform === "ios" ? (
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        No Safari, toque em <Share className="inline size-4" aria-label="Compartilhar" /> <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.
      </p>
    ) : platform === "other" ? (
      <p className="text-sm">
        No menu do navegador, escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
      </p>
    ) : null;

  return (
    <section
      aria-label="Instalar o app"
      className={cx(variant === "banner" ? "no-print relative rounded-[var(--radius-ficha)] border border-rule-strong bg-paper p-4 pr-12" : "space-y-3")}
    >
      <div className={cx(variant === "banner" && "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between")}>
        <div className="min-w-0">
          <h2 className="text-[0.9375rem] font-bold">Instale o Shape Real no celular</h2>
          <p className="mt-0.5 max-w-[60ch] text-sm text-steel">Abre direto da tela inicial, em tela cheia, e continua funcionando na academia mesmo sem sinal.</p>
          {steps ? <div className="mt-2">{steps}</div> : null}
        </div>
        {platform === "prompt" ? (
          <Button onClick={install} loading={busy} icon={<Download className="size-4" />} className={cx("shrink-0", variant === "panel" && "mt-3")}>
            Instalar app
          </Button>
        ) : null}
      </div>
      {variant === "banner" ? (
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {}
          }}
          aria-label="Dispensar o convite para instalar"
          className="absolute right-0 top-0 grid size-11 place-items-center text-steel hover:text-iron"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </section>
  );
}
