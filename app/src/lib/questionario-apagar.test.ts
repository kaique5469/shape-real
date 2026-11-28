import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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

// O diálogo de "Apagar respostas" renderizado de verdade (rodada 3, R3-9 item 4); só o contexto do app e a medição são trocados.
vi.mock("@/lib/app-context", () => ({ useApp: () => ({ repo: { saveProfile: async (p: unknown) => p } }) }));
vi.mock("@/lib/analytics", () => ({ track: () => undefined, reportError: () => undefined }));

const qc = await import("./questionario-client");

describe("frase curta das cópias de segurança (R3-9 item 4)", () => {
  const FRASE = "Cópias de segurança feitas antes continuam com esses dados. Apague os arquivos se não precisar deles.";
  const fonte = (rel: string) => readFileSync(path.resolve(__dirname, "..", rel), "utf8");

  it("aparece no diálogo de Apagar respostas, depois do que sai do aparelho", async () => {
    const { ApagarRespostasDialog } = await import("@/components/anamnese/apagar-respostas-dialog");
    const aluno = { id: "aluno-1", name: "Ana Lima", role: "athlete", createdAt: "2026-11-01T12:00:00.000Z", onboarded: true, plan: "free" };
    const html = renderToStaticMarkup(createElement(ApagarRespostasDialog, { open: true, onClose: () => undefined, student: aluno as never, onSaved: () => undefined }));
    const texto = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(texto).toContain(`Não dá para desfazer. ${FRASE}`);
  });

  it("a revogação (TEXTO_REVOGAR no Editar dados) e o Remover aluno usam a mesma frase", async () => {
    const { TEXTO_COPIAS_ANTIGAS, TEXTO_REVOGAR } = await import("@/lib/domain/anamnese-perfil");
    expect(TEXTO_COPIAS_ANTIGAS).toBe(FRASE);
    expect(TEXTO_REVOGAR.endsWith(FRASE)).toBe(true);
    expect(fonte("components/student-form.tsx")).toMatch(/\{TEXTO_REVOGAR\}/);
    // "Remover {nome}?" (aluno do painel, modo local): a frase entra só no ramo de remover, nunca no "Desvincular".
    const aluno = fonte("app/(painel)/alunos/[id]/page.tsx");
    expect(aluno).toMatch(/Não dá para desfazer\. \$\{TEXTO_COPIAS_ANTIGAS\}/);
  });

  it("negativo: o diálogo de restaurar não tem a frase (depois do R3-13, restaurar aqui não traz a saúde de volta)", () => {
    const restaurar = fonte("components/backup-restore.tsx");
    expect(restaurar).not.toContain("TEXTO_COPIAS_ANTIGAS");
    expect(restaurar).not.toMatch(/feitas antes continuam/);
  });
});

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
