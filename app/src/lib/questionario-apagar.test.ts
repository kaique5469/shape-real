import { describe, expect, it, vi } from "vitest";

/**
 * Revisão da rodada 2: "Apagar respostas" e a revogação (apagar-respostas-dialog.tsx e student-form.tsx) chamam
 * `esquecerQuestionarioDoAluno`, que tira também o rascunho do junto (com saúde e a autorização marcada) e grava
 * `qapagado` das rodadas. E `limparEndereco` não perde o estado do roteador na entrada do histórico.
 */
class MemStorage {
  m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
vi.stubGlobal("localStorage", new MemStorage());

const qc = await import("./questionario-client");

describe("esquecerQuestionarioDoAluno (Apagar respostas e revogação)", () => {
  it("o rascunho do junto sai e cada rodada ganha a marca de apagada", () => {
    const chave = qc.chaveRascunho({ studentId: "aluno-1" });
    qc.salvarRascunho(chave, { a: { nome: "Ana", parq: [1, 1, 1, 1, 1, 1, 1] }, parte: 3, at: "2026-11-26T10:00:00Z", iniciadoEm: "2026-11-26T09:00:00Z", autorizouJunto: true });
    expect(qc.lerRascunho(chave)?.autorizouJunto).toBe(true);
    qc.esquecerQuestionarioDoAluno("aluno-1", ["an-1", "an-0"], "2026-11-26T11:00:00Z");
    expect(qc.lerRascunho(chave)).toBeNull();
    expect(qc.apagadoEm("an-1")).toBe("2026-11-26T11:00:00Z");
    expect(qc.apagadoEm("an-0")).toBe("2026-11-26T11:00:00Z");
  });
});

describe("limparEndereco", () => {
  class FakeHistory {
    state: unknown = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: 1 } };
    chamadas: unknown[] = [];
    replaceState(data: unknown, _t: string, url: string) {
      this.chamadas.push([data, url]);
      this.state = data;
    }
  }

  it("antes do roteador (primeira carga): leva o estado atual junto", async () => {
    const h = new FakeHistory();
    vi.stubGlobal("History", FakeHistory);
    vi.stubGlobal("window", { history: h });
    const { limparEndereco } = await import("./share-link");
    limparEndereco("/questionario");
    expect(h.chamadas).toEqual([[{ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: 1 } }, "/questionario"]]);
  });

  it("com o replaceState do roteador instalado no objeto: vai por ele (que copia o estado e sincroniza o endereço)", async () => {
    const h = new FakeHistory();
    const doRoteador = vi.fn();
    (h as unknown as { replaceState: unknown }).replaceState = doRoteador;
    vi.stubGlobal("History", FakeHistory);
    vi.stubGlobal("window", { history: h });
    const { limparEndereco } = await import("./share-link");
    limparEndereco("/receber");
    expect(doRoteador).toHaveBeenCalledWith(null, "", "/receber");
  });
});
