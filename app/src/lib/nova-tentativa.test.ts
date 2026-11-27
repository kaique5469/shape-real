import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agendarNovaTentativa, ESPERAS_NOVA_TENTATIVA_MS } from "./nova-tentativa";

/**
 * Revisão de M-A: o import do SDK da medição (e o do módulo da nuvem) que falhava com a rede ligada nunca era tentado de
 * novo, porque o evento `online` só dispara na passagem de sem rede para com rede.
 */
function ambiente() {
  const janela = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  return { janela, doc };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("agendarNovaTentativa", () => {
  it("esperas de 15 s, 60 s e 5 min pela quantidade de falhas; depois, nenhuma por tempo", () => {
    expect(ESPERAS_NOVA_TENTATIVA_MS).toEqual([15_000, 60_000, 300_000]);
    for (const [falhas, espera] of [
      [0, 15_000],
      [1, 60_000],
      [2, 300_000],
    ] as const) {
      const { janela, doc } = ambiente();
      const tentar = vi.fn();
      agendarNovaTentativa(tentar, falhas, janela, doc);
      vi.advanceTimersByTime(espera - 1);
      expect(tentar).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(tentar).toHaveBeenCalledTimes(1);
    }
    const { janela, doc } = ambiente();
    const tentar = vi.fn();
    agendarNovaTentativa(tentar, 3, janela, doc);
    vi.advanceTimersByTime(24 * 3_600_000);
    expect(tentar).not.toHaveBeenCalled();
    janela.dispatchEvent(new Event("online"));
    expect(tentar).toHaveBeenCalledTimes(1);
  });

  it("o primeiro gatilho vale e desliga os outros: online, página visível ou tempo", () => {
    const { janela, doc } = ambiente();
    const tentar = vi.fn();
    agendarNovaTentativa(tentar, 0, janela, doc);
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(tentar).not.toHaveBeenCalled();
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(tentar).toHaveBeenCalledTimes(1);
    janela.dispatchEvent(new Event("online"));
    vi.advanceTimersByTime(60_000);
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(tentar).toHaveBeenCalledTimes(1);
  });

  it("cancelamento: nada dispara depois", () => {
    const { janela, doc } = ambiente();
    const tentar = vi.fn();
    const cancelar = agendarNovaTentativa(tentar, 0, janela, doc);
    cancelar();
    janela.dispatchEvent(new Event("online"));
    doc.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(600_000);
    expect(tentar).not.toHaveBeenCalled();
  });
});
