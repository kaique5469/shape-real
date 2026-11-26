import { describe, expect, it } from "vitest";
import { HEALTH_KEYS } from "@/lib/domain/anamnese";
import { HOJE, anoParaIdade, ctxBase, respostasBase } from "@/lib/domain/anamnese-fixtures";
import type { AnamneseAnswers, SecaoId } from "@/lib/domain/anamnese-types";
import type { PedidoPacket } from "@/lib/domain/questionario-link";
import type { Rascunho } from "./questionario-client";
import {
  ctxDoJunto,
  ctxDoPedido,
  ctxEfetivo,
  deveAquecer,
  eventosLigados,
  guardaDoJunto,
  guardaDoLink,
  limparEventoPosthog,
  montarAnamnese,
  novoRascunho,
  pedidoVelho,
  perfisDoAparelho,
  persistenciaPosthog,
  preMarcacaoJunto,
  proximaParte,
  rascunhoParaGravar,
  rascunhoVencido,
  sanearRespostas,
  saudeAutorizada,
  secaoDoRascunho,
} from "./questionario-flow";

/**
 * Regras do questionário no celular (track D): montagem da Anamnese (autorização, responsável, termo, incompleto),
 * rascunho sem saúde no junto sem autorização, medição do aluno do link, aquecimento do service worker, partes e guardas.
 */
const AGORA = "2026-11-23T15:00:00.000Z";
const PEDIDO: PedidoPacket = {
  v: 1,
  kind: "pedido_anamnese",
  id: "pedido-42",
  sentAt: "2026-11-22T12:00:00.000Z",
  catalogV: 1,
  coach: { id: "personal-1", name: "Carlos Lima", phone: "11999990000", cref: "012345-G/SP" },
  student: { ref: "aluno-1", name: "Ana Souza" },
  modulos: [],
};

function rasc(a: AnamneseAnswers, over: Partial<Rascunho> = {}): Rascunho {
  return { a, parte: 5, at: AGORA, iniciadoEm: AGORA, declaro: true, ...over };
}
const semChaveDeSaude = (a: AnamneseAnswers) => HEALTH_KEYS.filter((k) => k in a);

describe("montarAnamnese: pelo link", () => {
  it("com autorização: consent 'aluno_questionario', textId 'c1', parqText 'sp-16724-2018', id = pedido.id", () => {
    const an = montarAnamnese({ rascunho: rasc(respostasBase(), { consent: true }), modo: "link", id: PEDIDO.id, ctx: ctxBase(), agora: AGORA });
    expect(an.id).toBe("pedido-42");
    expect(an.v).toBe(1);
    expect(an.by).toBe("aluno");
    expect(an.via).toBe("link");
    expect(an.answeredAt).toBe(AGORA);
    expect(an.parqText).toBe("sp-16724-2018");
    expect(an.consent).toEqual({ at: AGORA, source: "aluno_questionario", textId: "c1" });
    expect(an.declaredAt).toBe(AGORA);
    expect(an.healthOmitted).toBeUndefined();
    expect(an.incompleto).toBeUndefined();
    expect(an.a.parq).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(an.a.peso).toBe(62);
  });

  it("sem autorização: healthOmitted, nenhuma HEALTH_KEY, semDor vira saude, barreira sem dor, motivo sem medica e dor", () => {
    const a = respostasBase({ objetivo: "semDor", barreira: ["dor", "tempo"], motivo: ["medica", "dor", "saude"], dor: 1, dorOnde: [{ r: "joelho", l: "d" }], dorNota: 6, dorQuando: ["movimento"], dorDesde: "mais3m", tratamento: "fisio", parq: [0, 1, 0, 0, 1, 0, 0] });
    const ctx = ctxBase({ modulos: ["objetivo"] });
    const an = montarAnamnese({ rascunho: rasc(a, { consent: false, termo: true, modulos: ["objetivo"] }), modo: "link", id: PEDIDO.id, ctx, agora: AGORA });
    expect(an.healthOmitted).toBe(true);
    expect(semChaveDeSaude(an.a)).toEqual([]);
    expect(an.a.objetivo).toBe("saude");
    expect(an.a.barreira).toEqual(["tempo"]);
    expect(an.a.motivo).toEqual(["saude"]);
    expect(an.consent).toBeUndefined();
    expect(an.termo).toBeUndefined();
    // O pacote inteiro, como vai no link: nenhuma chave de saúde em lugar nenhum.
    const json = JSON.stringify(an);
    for (const k of HEALTH_KEYS) expect(json).not.toContain(`"${k}":`);
    expect(an.a.nome).toBe("Ana Souza");
    expect(an.a.dias).toBe(3);
  });

  it("pelo link, a saúde é respondida mesmo antes da autorização (semSaude nunca vale no link)", () => {
    const ctx = ctxEfetivo(ctxBase({ semSaude: true }), {}, "link");
    expect(ctx.semSaude).toBeUndefined();
  });
});

describe("montarAnamnese: junto", () => {
  it("source 'personal', by 'personal', id novo (o que quem chama passou)", () => {
    const an = montarAnamnese({ rascunho: rasc(respostasBase(), { autorizouJunto: true }), modo: "junto", id: "uid-novo", ctx: ctxBase({ modo: "junto" }), agora: AGORA });
    expect(an.id).toBe("uid-novo");
    expect(an.by).toBe("personal");
    expect(an.via).toBe("junto");
    expect(an.consent).toEqual({ at: AGORA, source: "personal", textId: "c1" });
    expect(an.healthOmitted).toBeUndefined();
  });

  it("sem a autorização da boas-vindas: healthOmitted e o rascunho gravado não tem nenhuma HEALTH_KEY nem o termo", () => {
    const a = respostasBase({ parq: [1, 0, 0, 0, 0, 0, 0], sintomas: ["peito"] });
    const r = rasc(a, { autorizouJunto: false, termo: true, consent: true });
    const ctx = ctxDoJunto({ hoje: HOJE, personal: "Carlos Lima", aluno: "Ana Souza" });
    const gravado = rascunhoParaGravar({ rascunho: r, ctx, modo: "junto", agora: AGORA });
    expect(semChaveDeSaude(gravado.a)).toEqual([]);
    expect(gravado.termo).toBeUndefined();
    expect(gravado.at).toBe(AGORA);
    expect(gravado.a.objetivo).toBe("massa");
    const an = montarAnamnese({ rascunho: r, modo: "junto", id: "uid-1", ctx, agora: AGORA });
    expect(an.healthOmitted).toBe(true);
    expect(semChaveDeSaude(an.a)).toEqual([]);
    expect(an.consent).toBeUndefined();
  });

  it("junto com autorização: o rascunho guarda a saúde", () => {
    const r = rasc(respostasBase({ parq: [1, 0, 0, 0, 0, 0, 0] }), { autorizouJunto: true });
    const gravado = rascunhoParaGravar({ rascunho: r, ctx: ctxBase({ modo: "junto" }), modo: "junto", agora: AGORA });
    expect(gravado.a.parq).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(gravado.a.peso).toBe(62);
  });

  it("incompleto só com salvarIncompleto (e nunca pelo link)", () => {
    const a = respostasBase({ objetivo: undefined, sintomas: undefined });
    const r = rasc(a, { autorizouJunto: true });
    const ctx = ctxBase({ modo: "junto" });
    expect(montarAnamnese({ rascunho: r, modo: "junto", id: "u", ctx, agora: AGORA }).incompleto).toBeUndefined();
    expect(montarAnamnese({ rascunho: r, modo: "junto", id: "u", ctx, agora: AGORA, salvarIncompleto: true }).incompleto).toEqual<SecaoId[]>(["saude", "treino"]);
    expect(montarAnamnese({ rascunho: { ...r, consent: true }, modo: "link", id: "u", ctx: ctxBase(), agora: AGORA, salvarIncompleto: true }).incompleto).toBeUndefined();
    // Completo: nada a marcar.
    expect(montarAnamnese({ rascunho: rasc(respostasBase(), { autorizouJunto: true }), modo: "junto", id: "u", ctx, agora: AGORA, salvarIncompleto: true }).incompleto).toBeUndefined();
  });

  it("incompleto não conta as partes de saúde deixadas de fora sem autorização (nem por ausência)", () => {
    const a = respostasBase({ objetivo: undefined });
    const an = montarAnamnese({ rascunho: rasc(a, { autorizouJunto: false }), modo: "junto", id: "u", ctx: ctxBase({ modo: "junto" }), agora: AGORA, salvarIncompleto: true });
    expect(an.incompleto).toEqual<SecaoId[]>(["treino"]);
  });
});

describe("montarAnamnese: menor de 18", () => {
  const menor = respostasBase({ ano: anoParaIdade(16), responsavel: "  Maria Souza  ", gestacao: undefined });
  it("sem responsavelOk: healthOmitted (link e junto)", () => {
    const link = montarAnamnese({ rascunho: rasc(menor, { consent: true }), modo: "link", id: "p", ctx: ctxBase(), agora: AGORA });
    expect(link.healthOmitted).toBe(true);
    expect(semChaveDeSaude(link.a)).toEqual([]);
    const junto = montarAnamnese({ rascunho: rasc(menor, { autorizouJunto: true }), modo: "junto", id: "u", ctx: ctxBase({ modo: "junto" }), agora: AGORA });
    expect(junto.healthOmitted).toBe(true);
  });
  it("com responsavelOk: consent.responsavel preenchido com o nome respondido", () => {
    const an = montarAnamnese({ rascunho: rasc(menor, { consent: true, responsavelOk: true }), modo: "link", id: "p", ctx: ctxBase(), agora: AGORA });
    expect(an.healthOmitted).toBeUndefined();
    expect(an.consent).toEqual({ at: AGORA, source: "aluno_questionario", textId: "c1", responsavel: { nome: "Maria Souza", at: AGORA } });
    expect(an.a.responsavel).toBe("Maria Souza");
  });
  it("responsavelOk sem o nome do responsável não vale", () => {
    const an = montarAnamnese({ rascunho: rasc({ ...menor, responsavel: undefined }, { consent: true, responsavelOk: true }), modo: "link", id: "p", ctx: ctxBase(), agora: AGORA });
    expect(an.healthOmitted).toBe(true);
  });
  it("adulto: responsável não é pedido nem gravado", () => {
    const an = montarAnamnese({ rascunho: rasc(respostasBase({ responsavel: "Maria" }), { consent: true }), modo: "link", id: "p", ctx: ctxBase(), agora: AGORA });
    expect(an.consent?.responsavel).toBeUndefined();
    expect(an.a.responsavel).toBeUndefined();
  });
  it("saudeAutorizada segue a mesma regra que o envio (botão 'Enviar sem dados de saúde')", () => {
    expect(saudeAutorizada(rasc(menor, { consent: true }), "link", HOJE)).toBe(false);
    expect(saudeAutorizada(rasc(menor, { consent: true, responsavelOk: true }), "link", HOJE)).toBe(true);
    expect(saudeAutorizada(rasc(respostasBase(), { consent: false, autorizouJunto: true }), "link", HOJE)).toBe(false);
    expect(saudeAutorizada(rasc(respostasBase(), { consent: true, autorizouJunto: false }), "junto", HOJE)).toBe(false);
  });
});

describe("montarAnamnese: termo, pulados e perguntas próprias", () => {
  it("termo gravado com o nome respondido (não o do cadastro), só com algum 'Sim' no PAR-Q", () => {
    const a = respostasBase({ nome: " Ana Souza Lima ", parq: [0, 0, 0, 0, 1, 0, 0] });
    const an = montarAnamnese({ rascunho: rasc(a, { consent: true, termo: true }), modo: "link", id: "p", ctx: ctxBase({ aluno: "Ana Souza" }), agora: AGORA });
    expect(an.termo).toEqual({ at: AGORA, nome: "Ana Souza Lima" });
    const semSim = montarAnamnese({ rascunho: rasc(respostasBase(), { consent: true, termo: true }), modo: "link", id: "p", ctx: ctxBase(), agora: AGORA });
    expect(semSim.termo).toBeUndefined();
    const naoMarcou = montarAnamnese({ rascunho: rasc(a, { consent: true }), modo: "link", id: "p", ctx: ctxBase(), agora: AGORA });
    expect(naoMarcou.termo).toBeUndefined();
  });

  it("pulados e perguntas próprias vêm do rascunho; pulado fora dos módulos não entra", () => {
    const r = rasc(respostasBase(), { consent: true, modulos: ["rotina", "habitos"], pulados: ["habitos", "esporte"], extras: ["Qual horário você prefere?", "Já treinou com personal?"], respostasExtras: [" De manhã ", "  "] });
    const an = montarAnamnese({ rascunho: r, modo: "link", id: "p", ctx: ctxBase(), agora: AGORA });
    expect(an.modulos).toEqual(["rotina", "habitos"]);
    expect(an.pulados).toEqual(["habitos"]);
    expect(an.extras).toEqual([{ q: "Qual horário você prefere?", r: "De manhã" }, { q: "Já treinou com personal?" }]);
  });

  it("Entrega 1: o contexto do pedido não traz módulos nem perguntas próprias", () => {
    const pedido: PedidoPacket = { ...PEDIDO, modulos: ["rotina"], atendimento: "misto" };
    const ctx = ctxDoPedido(pedido, HOJE);
    expect(ctx).toEqual({ hoje: HOJE, modo: "link", modulos: [], personal: "Carlos Lima", aluno: "Ana Souza", extras: [], atendimento: "misto" });
    const an = montarAnamnese({ rascunho: rasc(respostasBase(), { consent: true }), modo: "link", id: PEDIDO.id, ctx, agora: AGORA });
    expect(an.modulos).toEqual([]);
    expect(an.extras).toBeUndefined();
    expect(an.pulados).toBeUndefined();
  });
});

describe("sanearRespostas", () => {
  it("respostas válidas passam iguais", () => {
    const a = respostasBase({ dor: 1, dorOnde: [{ r: "joelho", l: "d" }, { r: "outro", t: "calcanhar" }], dorNota: 4, condicoes: "pessoal", remedios: 1, remediosPara: ["pressao"] });
    expect(sanearRespostas(a)).toEqual(a);
  });
  it("código fora da lista, número fora da faixa, texto acima do teto e chave desconhecida somem", () => {
    const sujo = { ...respostasBase(), objetivo: "voar", dias: 9, peso: 999, nome: "x".repeat(500), sintomas: ["peito", "inventado"], hacker: "<script>", parq: [1, 7, 0, 0, 0, 0, 0] };
    const a = sanearRespostas(sujo);
    expect(a.objetivo).toBeUndefined();
    expect(a.dias).toBeUndefined();
    expect(a.peso).toBeUndefined();
    expect(a.nome).toHaveLength(120);
    expect(a.sintomas).toEqual(["peito"]);
    expect("hacker" in a).toBe(false);
    expect(a.parq?.[0]).toBe(1);
    expect(a.parq?.[1]).toBeUndefined();
  });
  it("não lança com lixo", () => {
    expect(sanearRespostas(null)).toEqual({});
    expect(sanearRespostas([1, 2])).toEqual({});
    expect(sanearRespostas("oi")).toEqual({});
  });
});

describe("rascunho: novo e pré-marcação do junto", () => {
  it("novoRascunho começa na parte 0 com o nome do pedido", () => {
    expect(novoRascunho({ agora: AGORA, nome: "  Ana Souza " })).toEqual({ a: { nome: "Ana Souza" }, parte: 0, at: AGORA, iniciadoEm: AGORA });
    expect(novoRascunho({ agora: AGORA }).a).toEqual({});
  });
  it("preMarcacaoJunto só preenche o que está vazio; equipamentos só fora da academia", () => {
    const p = { objetivo: "gordura" as const, dias: 4, minutos: 45, onde: "casa" as const, equipamentos: ["halteres" as const] };
    expect(preMarcacaoJunto({ nome: "Ana" }, p, false)).toEqual({ nome: "Ana", objetivo: "gordura", dias: 4, minutos: 45, onde: "casa", equipamentos: ["halteres"] });
    expect(preMarcacaoJunto({ dias: 2 }, { ...p, onde: "academia" }, false)).toEqual({ dias: 2, objetivo: "gordura", minutos: 45, onde: "academia" });
  });
  it("sem a autorização de saúde, 'Treinar sem dor' pré-marcado vira 'Saúde e qualidade de vida'", () => {
    expect(preMarcacaoJunto({}, { objetivo: "semDor", onde: "academia" }, true).objetivo).toBe("saude");
    expect(preMarcacaoJunto({}, { objetivo: "semDor", onde: "academia" }, false).objetivo).toBe("semDor");
  });
});

describe("rascunhoVencido", () => {
  const agora = new Date("2026-11-26T12:00:00Z");
  const antes = (dias: number) => new Date(agora.getTime() - dias * 86_400_000).toISOString();
  it("30 dias sem edição", () => {
    expect(rascunhoVencido({ at: antes(31) }, agora)).toBe(true);
    expect(rascunhoVencido({ at: antes(29) }, agora)).toBe(false);
  });
  it("7 dias depois do toque em Enviar", () => {
    expect(rascunhoVencido({ at: antes(1), enviarTocadoEm: antes(8) }, agora)).toBe(true);
    expect(rascunhoVencido({ at: antes(1), enviarTocadoEm: antes(6) }, agora)).toBe(false);
  });
  it("data de edição ilegível conta como vencido; toque ilegível é ignorado", () => {
    expect(rascunhoVencido({ at: "ontem" }, agora)).toBe(true);
    expect(rascunhoVencido({ at: antes(1), enviarTocadoEm: "depois" }, agora)).toBe(false);
  });
});

describe("partes", () => {
  const secoes: SecaoId[] = ["voce", "parq", "saude", "dor", "treino", "enviar"];
  it("proximaParte nos limites", () => {
    expect(proximaParte(secoes, 0, -1)).toBe(0);
    expect(proximaParte(secoes, 0, 1)).toBe(1);
    expect(proximaParte(secoes, 5, 1)).toBe(5);
    expect(proximaParte(secoes, 3, -1)).toBe(2);
    expect(proximaParte(secoes, 99, -1)).toBe(4);
    expect(proximaParte(secoes, -3, 1)).toBe(1);
    expect(proximaParte(secoes, Number.NaN, 1)).toBe(1);
    expect(proximaParte([], 2, 1)).toBe(0);
  });
  it("secaoDoRascunho: a parte do rascunho na lista que vale para ele", () => {
    const ctx = ctxBase({ modo: "junto" });
    expect(secaoDoRascunho(rasc(respostasBase(), { parte: 4, autorizouJunto: true }), ctx, "junto")).toBe("treino");
    expect(secaoDoRascunho(rasc(respostasBase(), { parte: 1, autorizouJunto: false }), ctx, "junto")).toBe("treino");
    expect(secaoDoRascunho(rasc(respostasBase(), { parte: 40, autorizouJunto: false }), ctx, "junto")).toBe("enviar");
  });
});

describe("medição do aluno do link (PostHog)", () => {
  it("persistenciaPosthog: memory só em /questionario sem perfil de personal", () => {
    expect(persistenciaPosthog({ pathname: "/questionario", hash: "#d=1.abc", temPerfilPersonal: false })).toBe("memory");
    expect(persistenciaPosthog({ pathname: "/questionario", hash: "", temPerfilPersonal: true })).toBe("localStorage");
    expect(persistenciaPosthog({ pathname: "/abrir", hash: "#d=1.abc", temPerfilPersonal: false })).toBe("localStorage");
    expect(persistenciaPosthog({ pathname: "/hoje", hash: "", temPerfilPersonal: false })).toBe("localStorage");
    // O aluno que recarrega para continuar chega sem #d= (a página limpou a barra): continua em memória.
    expect(persistenciaPosthog({ pathname: "/questionario/", hash: "", temPerfilPersonal: false })).toBe("memory");
    // O personal que abriu o próprio link (ou de outro personal) mantém o distinct_id.
    expect(persistenciaPosthog({ pathname: "/questionario", hash: "#d=1.abc", temPerfilPersonal: true })).toBe("localStorage");
  });

  const aluno = { pathname: "/questionario", hash: "#d=1.abc", temPerfilPersonal: false };
  const pageview: { event: string; properties: Record<string, unknown> } = { event: "$pageview", properties: { $current_url: "https://x/questionario", $ip: "200.1.2.3", plano: "free" } };

  it("limparEventoPosthog tira o IP em /questionario#d= sem perfil, sem alterar o evento recebido", () => {
    const out = limparEventoPosthog(pageview, aluno);
    expect(out.properties.$ip).toBeNull();
    expect(out.properties.$geoip_disable).toBe(true);
    expect(out.properties.plano).toBe("free");
    expect(pageview.properties.$ip).toBe("200.1.2.3");
  });

  it("usa a persistência da abertura: o aluno que vai para outra tela continua sem IP", () => {
    const out = limparEventoPosthog(pageview, { pathname: "/privacidade", hash: "", temPerfilPersonal: false, persistencia: "memory" });
    expect(out.properties.$ip).toBeNull();
  });

  const excecao = () => ({
    event: "$exception",
    properties: {
      $exception_list: [
        { type: "Error", value: "rascunho_invalido", mechanism: { handled: true }, stacktrace: { type: "raw", frames: [{ filename: "https://x/questionario#d=1.segredo", lineno: 3 }] } },
        { type: "SyntaxError", value: 'Unexpected token in JSON at position 12: {"nome":"Ana Souza"', stacktrace: { frames: [] } },
        { type: "TypeError: Ana Souza", value: "x is not a function" },
      ],
      $exception_message: "Unexpected token: Ana Souza",
      $exception_type: "SyntaxError",
      $exception_values: ["rascunho_invalido", "Ana Souza tem dor no peito"],
      $exception_steps: [{ $message: "digitou Ana" }],
      where: "questionario:rascunho",
      handled: true,
    },
  });

  it("limparEventoPosthog: exceção em /questionario e /receber fica só com o tipo e o código", () => {
    for (const pathname of ["/questionario", "/receber"]) {
      const out = limparEventoPosthog(excecao(), { pathname, hash: "", temPerfilPersonal: true });
      const lista = out.properties.$exception_list as Record<string, unknown>[];
      expect(lista[0]).toMatchObject({ type: "Error", value: "rascunho_invalido", mechanism: { handled: true } });
      expect((lista[0]?.stacktrace as { frames: { filename: string }[] }).frames[0]?.filename).toBe("https://x/questionario");
      expect(lista[1]).toEqual({ type: "SyntaxError", stacktrace: { frames: [] } });
      expect(lista[2]).toEqual({ type: "Error" });
      expect(out.properties.$exception_message).toBeUndefined();
      expect(out.properties.$exception_type).toBe("SyntaxError");
      expect(out.properties.$exception_values).toEqual(["rascunho_invalido"]);
      expect(out.properties.$exception_steps).toBeUndefined();
      expect(out.properties.where).toBe("questionario:rascunho");
      expect(JSON.stringify(out)).not.toContain("Ana");
      expect(JSON.stringify(out)).not.toContain("segredo");
    }
  });

  it("não mexe em outras rotas nem em eventos comuns do personal", () => {
    const ev = excecao();
    expect(limparEventoPosthog(ev, { pathname: "/alunos", hash: "", temPerfilPersonal: true })).toBe(ev);
    expect(limparEventoPosthog(pageview, { pathname: "/questionario", hash: "", temPerfilPersonal: true })).toBe(pageview);
    expect(limparEventoPosthog(pageview, { pathname: "/hoje", hash: "", temPerfilPersonal: false })).toBe(pageview);
  });

  it("deveAquecer: falso em /questionario#d= sem perfil; verdadeiro com perfil e nas outras telas", () => {
    expect(deveAquecer({ ...aluno, temPerfil: false })).toBe(false);
    expect(deveAquecer({ pathname: "/questionario", hash: "", temPerfilPersonal: false, temPerfil: false })).toBe(false);
    expect(deveAquecer({ pathname: "/questionario", hash: "", temPerfilPersonal: true, temPerfil: true })).toBe(true);
    expect(deveAquecer({ pathname: "/abrir", hash: "#d=1.abc", temPerfilPersonal: false, temPerfil: false })).toBe(true);
    expect(deveAquecer({ pathname: "/hoje", hash: "", temPerfilPersonal: false, temPerfil: false })).toBe(true);
  });

  it("perfisDoAparelho: personal pela sessão, pelo 'Ver como aluno' ou pela conta na nuvem; aluno só tem perfil", () => {
    const ls = (m: Record<string, string>) => ({ getItem: (k: string) => m[k] ?? null });
    const perfis = JSON.stringify([
      { id: "c1", role: "coach" },
      { id: "s1", role: "athlete" },
    ]);
    expect(perfisDoAparelho(ls({ "sr:v1:profiles": perfis, "sr:session": "c1" }))).toEqual({ temPerfil: true, temPerfilPersonal: true });
    expect(perfisDoAparelho(ls({ "sr:v1:profiles": perfis, "sr:session": "s1", "sr:return": "c1" }))).toEqual({ temPerfil: true, temPerfilPersonal: true });
    expect(perfisDoAparelho(ls({ "sr:v1:profiles": perfis, "sr:session": "s1" }))).toEqual({ temPerfil: true, temPerfilPersonal: false });
    expect(perfisDoAparelho(ls({ "sr:cloud:me": JSON.stringify({ id: "c9", role: "coach" }) }))).toEqual({ temPerfil: true, temPerfilPersonal: true });
    expect(perfisDoAparelho(ls({}))).toEqual({ temPerfil: false, temPerfilPersonal: false });
    expect(perfisDoAparelho(ls({ "sr:v1:profiles": "{quebrado", "sr:session": "c1" }))).toEqual({ temPerfil: false, temPerfilPersonal: false });
    expect(perfisDoAparelho(null)).toEqual({ temPerfil: false, temPerfilPersonal: false });
    const bloqueado = { getItem: () => { throw new Error("SecurityError"); } };
    expect(perfisDoAparelho(bloqueado)).toEqual({ temPerfil: false, temPerfilPersonal: false });
  });
});

describe("guardas da página", () => {
  const coach = { id: "personal-1", role: "coach" as const };
  const outroCoach = { id: "personal-2", role: "coach" as const };
  const aluna = { id: "s1", role: "athlete" as const };

  it("link, na ordem: problema do pacote, personal dono, outro personal (segue), 'Ver como aluno', aluno", () => {
    expect(guardaDoLink({ problema: "versao_nova", pedido: PEDIDO, usuario: coach, vendoComoAluno: false })).toEqual({ tipo: "beco", tela: "versao_nova", motivo: "versao_nova" });
    expect(guardaDoLink({ problema: "tipo_desconhecido", pedido: null, usuario: null, vendoComoAluno: false })).toMatchObject({ tela: "versao_nova", motivo: "versao_nova" });
    expect(guardaDoLink({ problema: "invalido", pedido: null, usuario: null, vendoComoAluno: false })).toMatchObject({ tela: "invalido", motivo: "invalido" });
    expect(guardaDoLink({ problema: null, pedido: null, usuario: null, vendoComoAluno: false })).toMatchObject({ tela: "invalido", motivo: "invalido" });
    expect(guardaDoLink({ problema: null, pedido: PEDIDO, usuario: coach, vendoComoAluno: false })).toEqual({ tipo: "beco", tela: "dono", motivo: "questionario_personal" });
    expect(guardaDoLink({ problema: null, pedido: PEDIDO, usuario: outroCoach, vendoComoAluno: false })).toEqual({ tipo: "segue", pedido: PEDIDO, aparelho: "outro" });
    expect(guardaDoLink({ problema: null, pedido: PEDIDO, usuario: aluna, vendoComoAluno: true })).toEqual({ tipo: "beco", tela: "ver_como_aluno", motivo: "questionario_personal" });
    expect(guardaDoLink({ problema: null, pedido: PEDIDO, usuario: aluna, vendoComoAluno: false })).toEqual({ tipo: "segue", pedido: PEDIDO, aparelho: "aluno" });
    expect(guardaDoLink({ problema: null, pedido: PEDIDO, usuario: null, vendoComoAluno: false })).toEqual({ tipo: "segue", pedido: PEDIDO, aparelho: "aluno" });
  });

  it("junto: 'Ver como aluno' antes; depois perfil de personal dono do aluno", () => {
    expect(guardaDoJunto({ usuario: coach, vendoComoAluno: false, aluno: { managedBy: "personal-1" } })).toBe("ok");
    expect(guardaDoJunto({ usuario: aluna, vendoComoAluno: true, aluno: null })).toBe("ver_como_aluno");
    expect(guardaDoJunto({ usuario: outroCoach, vendoComoAluno: false, aluno: { managedBy: "personal-1" } })).toBe("nao_esta");
    expect(guardaDoJunto({ usuario: coach, vendoComoAluno: false, aluno: null })).toBe("nao_esta");
    expect(guardaDoJunto({ usuario: null, vendoComoAluno: false, aluno: { managedBy: "personal-1" } })).toBe("nao_esta");
    expect(guardaDoJunto({ usuario: aluna, vendoComoAluno: false, aluno: { managedBy: "personal-1" } })).toBe("nao_esta");
  });

  it("aluno de exemplo ou da demonstração: nenhum evento", () => {
    expect(eventosLigados({ id: "s1" })).toBe(true);
    expect(eventosLigados({ id: "s1", sample: true })).toBe(false);
    expect(eventosLigados({ id: "demo-aluno-1" })).toBe(false);
  });

  it("pedido com mais de 60 dias", () => {
    const agora = new Date("2026-11-26T12:00:00Z");
    expect(pedidoVelho("2026-09-26T11:00:00Z", agora)).toBe(true);
    expect(pedidoVelho("2026-09-28T12:00:00Z", agora)).toBe(false);
    expect(pedidoVelho("data ruim", agora)).toBe(false);
  });
});
