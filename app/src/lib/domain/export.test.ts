import { describe, expect, it } from "vitest";
import { alunoBase, anamneseBase, HOJE } from "./anamnese-fixtures";
import type { Anamnese, Liberacao } from "./anamnese-types";
import { mesclarRestauracao } from "./export";
import { readAnamnese } from "./questionario-link";
import { travaEPorta } from "./triagem";
import type { Profile } from "./types";

const VELHA = "2026-10-01T10:00:00-03:00";
const NOVA = "2026-11-20T10:00:00-03:00";

const lib = (id: string, registradoEm: string, extra: Partial<Liberacao> = {}): Liberacao => ({ id, por: "medico", data: registradoEm.slice(0, 10), alertas: ["A-PARQ7"], registradoEm, ...extra });
/** Rodada em que o médico pediu para não treinar por enquanto (vermelho, trava). */
const pausa = (id: string, answeredAt: string) => anamneseBase({ parq: [0, 0, 0, 0, 0, 0, 1], orientacao: "pausa" }, { id, answeredAt });
const travas = (p: Profile) => {
  const an = readAnamnese(p);
  return an && typeof an === "object" ? travaEPorta(an, { hoje: HOJE, liberacoes: p.liberacoes ?? [] }).trava.map((a) => a.id) : [];
};

describe("mesclarRestauracao (D-32)", () => {
  it("aluno novo neste aparelho: a cópia como veio", () => {
    const daCopia = alunoBase({ anamnese: anamneseBase() });
    expect(mesclarRestauracao(null, daCopia)).toBe(daCopia);
  });

  it("aparelho mais novo que a cópia: fica a rodada do aparelho, com a anterior, os tokens e as limitações dela; o resto vem da cópia", () => {
    const atual = alunoBase({
      phone: "11900000000",
      anamnese: anamneseBase({ dor: 1, dorOnde: [{ r: "lombar" }] }, { id: "r2", answeredAt: NOVA }),
      anamnesePrev: anamneseBase({}, { id: "r1", answeredAt: VELHA }),
      limitacoesDoQuestionario: ["lombar"],
      limitations: "lombar",
    });
    const daCopia = alunoBase({ phone: "11911111111", anamnese: anamneseBase({}, { id: "r1", answeredAt: VELHA }), limitations: "joelho direito", limitacoesDoQuestionario: ["joelho direito"] });
    const r = mesclarRestauracao(atual, daCopia);
    expect(r.anamnese).toBe(atual.anamnese);
    expect(r.anamnesePrev).toBe(atual.anamnesePrev);
    expect(r.limitacoesDoQuestionario).toEqual(["lombar"]);
    expect(r.limitations).toBe("lombar");
    expect(r.phone).toBe("11911111111");
  });

  it("cópia mais nova que o aparelho: fica a rodada da cópia (com a anterior e os tokens dela)", () => {
    const atual = alunoBase({ anamnese: anamneseBase({}, { id: "r1", answeredAt: VELHA }), limitacoesDoQuestionario: ["joelho direito"], limitations: "joelho direito" });
    const daCopia = alunoBase({ anamnese: anamneseBase({}, { id: "r2", answeredAt: NOVA }), anamnesePrev: anamneseBase({}, { id: "r1", answeredAt: VELHA }), limitacoesDoQuestionario: ["lombar"], limitations: "lombar" });
    const r = mesclarRestauracao(atual, daCopia);
    expect(r.anamnese).toBe(daCopia.anamnese);
    expect(r.anamnesePrev).toBe(daCopia.anamnesePrev);
    expect(r.limitacoesDoQuestionario).toEqual(["lombar"]);
    expect(r.limitations).toBe("lombar");
  });

  it("empate: a do aparelho (que pode ter 'Seguir mesmo assim' ou 'Conversei' registrados depois)", () => {
    const local: Anamnese = { ...anamneseBase({}, { id: "r1", answeredAt: NOVA }), overrides: [{ at: "2026-11-21T10:00:00-03:00", alertas: ["A-PARQ7"] }] };
    const r = mesclarRestauracao(alunoBase({ anamnese: local }), alunoBase({ anamnese: anamneseBase({}, { id: "r1", answeredAt: NOVA }) }));
    expect(r.anamnese).toBe(local);
  });

  it("cópia sem respostas não apaga as do aparelho; aparelho sem respostas recebe as da cópia", () => {
    const comRespostas = alunoBase({ anamnese: anamneseBase() });
    expect(mesclarRestauracao(comRespostas, alunoBase()).anamnese).toBe(comRespostas.anamnese);
    expect(mesclarRestauracao(alunoBase(), comRespostas).anamnese).toBe(comRespostas.anamnese);
  });

  it("mantém a trava de 'pediu para não treinar' da mais nova (nos dois sentidos)", () => {
    const comTrava = alunoBase({ anamnese: pausa("r2", NOVA) });
    const semTrava = alunoBase({ anamnese: anamneseBase({}, { id: "r1", answeredAt: VELHA }) });
    expect(travas(mesclarRestauracao(comTrava, semTrava))).toContain("A-PAUSA");
    expect(travas(mesclarRestauracao(semTrava, comTrava))).toContain("A-PAUSA");
    // A trava da rodada mais velha não volta por cima da mais nova.
    const velhaComTrava = alunoBase({ anamnese: pausa("r1", VELHA) });
    const novaSemTrava = alunoBase({ anamnese: anamneseBase({}, { id: "r2", answeredAt: NOVA }) });
    expect(travas(mesclarRestauracao(novaSemTrava, velhaComTrava))).not.toContain("A-PAUSA");
  });

  it("une as liberações por id (as dos dois lados ficam; com o mesmo id, a registrada por último)", () => {
    const atual = alunoBase({ liberacoes: [lib("l-novo", "2026-11-21T10:00:00-03:00"), lib("l-ambos", "2026-11-10T10:00:00-03:00", { restricoes: "editada depois" })] });
    const daCopia = alunoBase({ liberacoes: [lib("l-velho", "2026-09-01T10:00:00-03:00"), lib("l-ambos", "2026-11-01T10:00:00-03:00")] });
    const r = mesclarRestauracao(atual, daCopia);
    expect(r.liberacoes?.map((l) => l.id).sort()).toEqual(["l-ambos", "l-novo", "l-velho"]);
    expect(r.liberacoes?.find((l) => l.id === "l-ambos")?.restricoes).toBe("editada depois");
    expect(mesclarRestauracao(alunoBase(), alunoBase()).liberacoes).toBeUndefined();
    expect("liberacoes" in mesclarRestauracao(alunoBase(), alunoBase())).toBe(false);
  });

  it("liberação danificada na cópia é ignorada, sem derrubar as boas", () => {
    const daCopia = alunoBase({ liberacoes: [null, { semId: true }, lib("ok", NOVA)] as unknown as Liberacao[] });
    expect(mesclarRestauracao(alunoBase(), daCopia).liberacoes?.map((l) => l.id)).toEqual(["ok"]);
  });

  it("rodada do aparelho com saúde e cópia sem autorização: a autorização do aparelho fica", () => {
    const atual = alunoBase({ anamnese: anamneseBase({}, { answeredAt: NOVA }), consentHealthAt: NOVA, consentSource: "aluno_questionario" });
    const daCopia = alunoBase({ anamnese: anamneseBase({}, { id: "r0", answeredAt: VELHA }) });
    const r = mesclarRestauracao(atual, daCopia);
    expect(r.consentHealthAt).toBe(NOVA);
    expect(r.consentSource).toBe("aluno_questionario");
    // Com a cópia mais nova, vale o que veio nela (o resto, como hoje).
    const r2 = mesclarRestauracao(alunoBase({ anamnese: anamneseBase({}, { answeredAt: VELHA }), consentHealthAt: VELHA, consentSource: "personal" }), alunoBase({ anamnese: anamneseBase({}, { id: "r9", answeredAt: NOVA }) }));
    expect(r2.consentHealthAt).toBeUndefined();
  });

  it("rodada de versão mais nova na cópia fica guardada como veio (readAnamnese devolve 'versao_nova')", () => {
    const v2 = { ...anamneseBase({}, { id: "r9", answeredAt: NOVA }), v: 2, a: { nome: "Ana", perguntaNova: 3 } } as unknown as Anamnese;
    const r = mesclarRestauracao(alunoBase({ anamnese: anamneseBase({}, { answeredAt: VELHA }) }), alunoBase({ anamnese: v2 }));
    expect(r.anamnese).toBe(v2);
    expect(readAnamnese(r)).toBe("versao_nova");
  });

  it("data ilegível não vence uma data legível", () => {
    const ruim = alunoBase({ anamnese: { ...anamneseBase(), answeredAt: "ontem" } as Anamnese });
    const boa = alunoBase({ anamnese: anamneseBase({}, { id: "r2", answeredAt: VELHA }) });
    expect(mesclarRestauracao(ruim, boa).anamnese).toBe(boa.anamnese);
    expect(mesclarRestauracao(boa, ruim).anamnese).toBe(boa.anamnese);
  });
});
