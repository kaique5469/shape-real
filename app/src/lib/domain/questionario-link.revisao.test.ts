import { describe, expect, it } from "vitest";
import { alunoBase, anamneseBase, anoParaIdade, personalBase } from "./anamnese-fixtures";
import type { Anamnese } from "./anamnese-types";
import { buildPedido, buildRespostas, comPedido, parseRespostas, pedidoParaEnviar } from "./questionario-link";

// Revisão da rodada 2: a recepção exige o responsável na saúde de um menor; e o reenvio/lembrete refaz o pacote do
// pedido com o personal de agora (mesmo id).

const AGORA = "2026-11-23T10:00:00-03:00";
const coach = personalBase();
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe("parseRespostas: menor de 18 com saúde", () => {
  const pedido = buildPedido({ coach, student: alunoBase(), modulos: [], id: "pedido-1", agora: AGORA });
  const pacote = (consent: Anamnese["consent"]) =>
    clone(buildRespostas({ pedido, anamnese: anamneseBase({ ano: anoParaIdade(15, new Date(AGORA)), responsavel: "Marta Teles" }, { id: "pedido-1", answeredAt: AGORA, consent }), agora: AGORA }));

  it("sem a autorização do responsável: recusado (pacote mexido à mão)", () => {
    expect(parseRespostas(pacote({ at: AGORA, source: "aluno_questionario", textId: "c1" }))).toBeNull();
  });
  it("com o responsável: aceito", () => {
    expect(parseRespostas(pacote({ at: AGORA, source: "aluno_questionario", textId: "c1", responsavel: { nome: "Marta Teles", at: AGORA } }))).not.toBeNull();
  });
  it("adulto sem responsável e menor sem saúde: aceitos como antes", () => {
    expect(parseRespostas(clone(buildRespostas({ pedido, anamnese: anamneseBase({}, { id: "pedido-1", answeredAt: AGORA }), agora: AGORA })))).not.toBeNull();
    const semSaude = clone(buildRespostas({ pedido, anamnese: { ...anamneseBase({}, { id: "pedido-1", answeredAt: AGORA }), healthOmitted: true, consent: undefined, a: { nome: "Ana Souza", ano: anoParaIdade(15, new Date(AGORA)), objetivo: "saude" } }, agora: AGORA }));
    expect(parseRespostas(semSaude)).not.toBeNull();
  });
});

describe("pedidoParaEnviar (reenvio e 'Lembrar')", () => {
  it("pedido pendente e WhatsApp do personal trocado: mesmo id, telefone novo e sentAt de agora", () => {
    const primeiro = buildPedido({ coach: { ...coach, phone: "11988887777" }, student: alunoBase(), modulos: [], id: "pedido-1", agora: "2026-09-01T10:00:00-03:00" });
    const aluno = comPedido(alunoBase(), primeiro, "1.pacote-antigo", "2026-09-01T10:00:00-03:00");
    const { pedido, reenvio } = pedidoParaEnviar({ coach: { ...coach, phone: "21977776666" }, student: aluno, pendente: true, agora: AGORA });
    expect(reenvio).toBe(true);
    expect(pedido.id).toBe("pedido-1");
    expect(pedido.coach.phone).toBe("21977776666");
    expect(pedido.sentAt).toBe(AGORA);
  });
  it("sem pedido pendente: id novo", () => {
    const { pedido, reenvio } = pedidoParaEnviar({ coach, student: alunoBase(), pendente: false, agora: AGORA });
    expect(reenvio).toBe(false);
    expect(pedido.id).not.toBe("pedido-1");
  });
});
