import { describe, expect, it } from "vitest";
import { alunoBase, anamneseBase, HOJE, personalBase, RESPONDIDO_EM } from "@/lib/domain/anamnese-fixtures";
import { applyAnamnese, conflicts, diffLimitacoes } from "@/lib/domain/anamnese-ficha";
import type { Anamnese, Diferenca, Liberacao } from "@/lib/domain/anamnese-types";
import { buildPedido, buildRespostas, PROBLEMA_TEXTO, type RespostasPacket } from "@/lib/domain/questionario-link";
import { buildFichaPacket, buildTreinosPacket } from "@/lib/domain/transfer";
import type { Profile } from "@/lib/domain/types";
import {
  acharAluno,
  CONFERIR_TEXTO,
  destinoColado,
  escolhasIniciais,
  estadoRecepcao,
  guardaReceber,
  juntoAntesDoLink,
  LINK_RUIM,
  motivoDaGuarda,
  motivoDoProblema,
  nomeDiferente,
  normalizarNome,
  pontosParaVer,
  RECEBER_TEXTO,
} from "./questionario-receber";

const AGORA = "2026-11-23T10:00:00-03:00";
const coach = personalBase();
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function pacote(i: { ref?: string; nome?: string; id?: string; answeredAt?: string; an?: Partial<Anamnese>; a?: Parameters<typeof anamneseBase>[0] } = {}): RespostasPacket {
  const student = alunoBase({ id: i.ref ?? "aluno-1", name: i.nome ?? "Ana Souza" });
  const pedido = buildPedido({ coach, student, modulos: [], id: i.id ?? "pedido-1", agora: AGORA });
  const anamnese = anamneseBase({ nome: i.nome ?? "Ana Souza", ...i.a }, { id: i.id ?? "pedido-1", answeredAt: i.answeredAt ?? RESPONDIDO_EM, ...i.an });
  return buildRespostas({ pedido, anamnese, agora: AGORA });
}

const juliana = alunoBase({ id: "a-jp", name: "Juliana Prado" });
const carla = alunoBase({ id: "a-c", name: "Carla Mendes" });
const ana = alunoBase({ id: "aluno-1", name: "Ana Souza" });

describe("acharAluno (D-31)", () => {
  it("pelo studentRef, sem confirmação", () => {
    expect(acharAluno([juliana, ana, carla], pacote())).toEqual({ aluno: ana, achou: "ref", confirmar: false });
  });

  it("pelo ref mesmo com o nome escrito de outro jeito", () => {
    const r = acharAluno([juliana, ana], pacote({ nome: "Ana Paula" }));
    expect(r.aluno).toBe(ana);
    expect(r.achou).toBe("ref");
  });

  it("sem ref: pelo nome completo normalizado e único, sempre com confirmação", () => {
    const r = acharAluno([juliana, carla], pacote({ ref: "outro-aparelho", nome: "  JULIANA   prado " }));
    expect(r).toEqual({ aluno: juliana, achou: "nome", confirmar: true });
    const acento = acharAluno([alunoBase({ id: "j", name: "Júlia Souza" })], pacote({ ref: "x", nome: "julia souza" }));
    expect(acento.achou).toBe("nome");
  });

  it("'Juliana Costa' sem ref não casa com 'Juliana Prado' (o primeiro nome nunca basta)", () => {
    expect(acharAluno([juliana, carla], pacote({ ref: "x", nome: "Juliana Costa" }))).toEqual({ aluno: null, achou: null, confirmar: false });
    expect(acharAluno([juliana], pacote({ ref: "x", nome: "Juliana" })).aluno).toBeNull();
  });

  it("null com nome repetido ou sem aluno com esse nome", () => {
    const outraJuliana = alunoBase({ id: "a-jp2", name: "juliana prado" });
    expect(acharAluno([juliana, outraJuliana], pacote({ ref: "x", nome: "Juliana Prado" })).aluno).toBeNull();
    expect(acharAluno([carla], pacote({ ref: "x", nome: "Juliana Prado" })).aluno).toBeNull();
    expect(acharAluno([], pacote()).aluno).toBeNull();
  });
});

describe("nomeDiferente", () => {
  it("ignora acento, caixa e espaços", () => {
    expect(nomeDiferente("Júlia", "julia")).toBe(false);
    expect(nomeDiferente("Júlia", "Julia Souza")).toBe(false);
    expect(nomeDiferente("JULIA  SOUZA", "júlia souza")).toBe(false);
    expect(nomeDiferente("Ana Souza", "Ana Paula Souza")).toBe(false);
  });

  it("detecta outra pessoa", () => {
    expect(nomeDiferente("Juliana", "Carla")).toBe(true);
    expect(nomeDiferente("Juliana Prado", "Juliana Costa")).toBe(true);
    expect(nomeDiferente("Ana Paula", "Ana Souza")).toBe(true);
  });

  it("nome vazio não acusa nada", () => {
    expect(nomeDiferente("Ana", "")).toBe(false);
    expect(nomeDiferente("  ", "Ana")).toBe(false);
  });

  it("normalizarNome", () => {
    expect(normalizarNome("  Júlia   SOUZA ")).toBe("julia souza");
    expect(normalizarNome(undefined)).toBe("");
  });
});

describe("estadoRecepcao (reabrir não grava duas vezes)", () => {
  const registrada = (an: Anamnese) => alunoBase({ anamnese: { ...an, receivedAt: "2026-11-21T09:00:00-03:00" } });

  it("sem aluno ou sem respostas → nova", () => {
    expect(estadoRecepcao(null, pacote())).toEqual({ tipo: "nova" });
    expect(estadoRecepcao(alunoBase(), pacote())).toEqual({ tipo: "nova" });
  });

  it("mesmo id e mesmo answeredAt → já registradas (com a data do registro)", () => {
    const p = pacote();
    expect(estadoRecepcao(registrada(p.anamnese as Anamnese), p)).toEqual({ tipo: "ja_registrado", em: "2026-11-21T09:00:00-03:00" });
  });

  it("mesmo instante escrito com outro fuso também é o mesmo", () => {
    const p = pacote({ answeredAt: "2026-11-20T13:00:00Z" });
    const atual = anamneseBase({}, { id: "pedido-1", answeredAt: "2026-11-20T10:00:00-03:00" });
    expect(estadoRecepcao(alunoBase({ anamnese: atual }), p).tipo).toBe("ja_registrado");
  });

  it("mesmo id e answeredAt mais novo → substituir as anteriores", () => {
    const atual = anamneseBase({}, { id: "pedido-1", answeredAt: RESPONDIDO_EM });
    expect(estadoRecepcao(alunoBase({ anamnese: atual }), pacote({ answeredAt: "2026-11-22T08:00:00-03:00" }))).toEqual({ tipo: "substituir", anterior: RESPONDIDO_EM });
  });

  it("id diferente e mais antigas que as atuais → mais_antigas", () => {
    const atual = anamneseBase({}, { id: "rodada-nova", answeredAt: "2026-11-22T08:00:00-03:00" });
    expect(estadoRecepcao(alunoBase({ anamnese: atual }), pacote())).toEqual({ tipo: "mais_antigas", atual: "2026-11-22T08:00:00-03:00" });
  });

  it("mesmo id e answeredAt mais antigo (versão anterior da mesma rodada) nunca troca a mais nova em silêncio", () => {
    const atual = anamneseBase({}, { id: "pedido-1", answeredAt: "2026-11-22T08:00:00-03:00" });
    expect(estadoRecepcao(alunoBase({ anamnese: atual }), pacote()).tipo).toBe("mais_antigas");
  });

  it("id diferente e mais novas → nova rodada", () => {
    const atual = anamneseBase({}, { id: "rodada-velha", answeredAt: "2026-10-01T08:00:00-03:00" });
    expect(estadoRecepcao(alunoBase({ anamnese: atual }), pacote())).toEqual({ tipo: "nova" });
  });

  it("respostas atuais ilegíveis (versão nova ou danificadas) não bloqueiam", () => {
    const v2 = { ...anamneseBase({}, { id: "pedido-1" }), v: 2 } as Anamnese;
    expect(estadoRecepcao(alunoBase({ anamnese: v2 }), pacote())).toEqual({ tipo: "nova" });
  });

  it("aceite: registrar e abrir de novo o mesmo link → já registradas (nada a gravar)", () => {
    const p = pacote({ a: { dor: 1, dorOnde: [{ r: "lombar" }], dorNota: 4, dorQuando: ["movimento"], dorDesde: "mais3m", dorAlerta: [] } });
    const an = clone(p.anamnese) as Anamnese;
    const aluno = alunoBase();
    const escolhas = escolhasIniciais(conflicts(aluno, an, HOJE), diffLimitacoes(aluno, an, HOJE));
    const depois = applyAnamnese(aluno, an, escolhas, AGORA);
    expect(estadoRecepcao(depois, clone(p)).tipo).toBe("ja_registrado");
  });
});

describe("juntoAntesDoLink (spec §5.6)", () => {
  it("rodada atual feita junto, com outro id → pergunta qual vale", () => {
    const junto = anamneseBase({}, { id: "junto-1", via: "junto", by: "personal", answeredAt: "2026-11-21T08:00:00-03:00" });
    expect(juntoAntesDoLink(alunoBase({ anamnese: junto }), pacote())).toEqual({ data: "2026-11-21T08:00:00-03:00" });
  });

  it("não se aplica sem rodada, com rodada do link ou com o mesmo id", () => {
    expect(juntoAntesDoLink(alunoBase(), pacote())).toBeNull();
    expect(juntoAntesDoLink(alunoBase({ anamnese: anamneseBase({}, { id: "outra" }) }), pacote())).toBeNull();
    expect(juntoAntesDoLink(alunoBase({ anamnese: anamneseBase({}, { id: "pedido-1", via: "junto" }) }), pacote())).toBeNull();
    expect(juntoAntesDoLink(null, pacote())).toBeNull();
  });
});

describe("guardaReceber (spec §5.5, nesta ordem)", () => {
  const base = { modo: "local" as const, verComoAluno: false, user: coach as Pick<Profile, "role" | "remoteCoach">, temPerfil: true, coachId: coach.id };
  const alunoDoMesmo: Pick<Profile, "role" | "remoteCoach"> = { role: "athlete", remoteCoach: { id: coach.id, name: coach.name, studentRef: "aluno-1" } };

  it("personal neste aparelho → segue", () => {
    expect(guardaReceber(base)).toBeNull();
  });

  it("nuvem vem antes de tudo; depois 'Ver como aluno'", () => {
    expect(guardaReceber({ ...base, modo: "supabase", verComoAluno: true, user: alunoDoMesmo })).toBe("nuvem");
    expect(guardaReceber({ ...base, verComoAluno: true, user: alunoDoMesmo })).toBe("ver_como_aluno");
  });

  it("perfil de aluno do mesmo personal → as respostas já foram na mensagem dele", () => {
    expect(guardaReceber({ ...base, user: alunoDoMesmo })).toBe("respostas_no_aluno");
  });

  it("sem perfil nenhum → texto neutro; aluno de outro personal → não é personal", () => {
    expect(guardaReceber({ ...base, user: null, temPerfil: false })).toBe("sem_perfil");
    expect(guardaReceber({ ...base, user: { role: "athlete", remoteCoach: { id: "outro", name: "X", studentRef: "y" } } })).toBe("nao_personal");
    expect(guardaReceber({ ...base, user: { role: "athlete" } })).toBe("nao_personal");
  });

  it("motivo do beco sem saída", () => {
    expect(motivoDaGuarda("respostas_no_aluno")).toBe("respostas_no_aluno");
    expect(motivoDaGuarda("sem_perfil")).toBe("nao_personal");
    expect(motivoDaGuarda("nao_personal")).toBe("nao_personal");
    expect(motivoDaGuarda("nuvem")).toBeNull();
    expect(motivoDaGuarda("ver_como_aluno")).toBeNull();
    expect(motivoDoProblema("invalido")).toBe("invalido");
    expect(motivoDoProblema("versao_nova")).toBe("versao_nova");
    expect(motivoDoProblema("tipo_desconhecido")).toBe("versao_nova");
  });
});

describe("destinoColado ('Colar aqui' com os tipos novos)", () => {
  const studentP: Profile = { id: "s1", name: "Marina Costa", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-01-02T00:00:00Z" };
  const pedido = buildPedido({ coach, student: studentP, modulos: [], id: "p1", agora: AGORA });

  it("pedido → /questionario; respostas → /receber; ficha → /abrir; treinos → /receber", () => {
    expect(destinoColado(clone(pedido), "1.x")).toEqual({ href: "/questionario#d=1.x&colar=1" });
    expect(destinoColado(clone(pacote()), "1.x")).toEqual({ href: "/receber#d=1.x&colar=1" });
    const ficha = buildFichaPacket({ coach, student: studentP, program: null, diet: null, customExercises: [], customFoods: [] });
    expect(destinoColado(clone(ficha), "1.x")).toEqual({ href: "/abrir#d=1.x&colar=1" });
    const treinos = buildTreinosPacket({ student: studentP, coachId: coach.id, studentRef: "s1", sessions: [] });
    expect(destinoColado(clone(treinos), "1.x")).toEqual({ href: "/receber#d=1.x&colar=1" });
  });

  it("tipo desconhecido ou versão nova pede para atualizar; cortado continua 'não é do Shape Real'", () => {
    expect(destinoColado({ kind: "xyz", v: 1 }, "1.x")).toEqual({ erro: PROBLEMA_TEXTO.tipo_desconhecido, problema: "tipo_desconhecido" });
    expect(destinoColado({ ...clone(pedido), catalogV: 2 }, "1.x")).toEqual({ erro: PROBLEMA_TEXTO.versao_nova, problema: "versao_nova" });
    const cortado = clone(pacote()) as unknown as Record<string, unknown>;
    delete cortado.anamnese;
    expect(destinoColado(cortado, "1.x")).toEqual({ erro: LINK_RUIM, problema: "invalido" });
    expect(destinoColado({ kind: "ficha" }, "1.x")).toEqual({ erro: LINK_RUIM, problema: "invalido" });
    expect(destinoColado(null, "1.x")).toEqual({ erro: LINK_RUIM, problema: "invalido" });
  });
});

describe("conferir e registrar", () => {
  it("escolhasIniciais: o padrão de cada linha e [Aplicar] quando as limitações mudam", () => {
    const difs: Diferenca[] = [
      { campo: "goal", rotulo: "Objetivo", cadastro: "Hipertrofia", resposta: "Saúde", padrao: "cadastro" },
      { campo: "sex", rotulo: "Sexo", cadastro: "Masculino", resposta: "Feminino", padrao: "resposta" },
    ];
    expect(escolhasIniciais(difs, { sai: [], entra: ["lombar"], texto: "lombar", doApp: ["lombar"], excede: false })).toEqual({ goal: "cadastro", sex: "resposta", limitacoes: "aplicar" });
    expect(escolhasIniciais([], { sai: [], entra: [], texto: "", doApp: [], excede: false })).toEqual({});
    expect(escolhasIniciais([])).toEqual({});
  });

  it("pontosParaVer: só vermelhos e laranja ainda não cobertos (contagem calculada no aparelho)", () => {
    const an = anamneseBase({ parq: [0, 1, 0, 0, 0, 0, 1] }) as Anamnese; // PAR-Q 2 → vermelho; PAR-Q 7 → laranja
    expect(pontosParaVer(an, [], HOJE)).toBeGreaterThanOrEqual(2);
    const lib: Liberacao = { id: "l1", por: "medico", data: "2026-11-22", alertas: ["A-PEITO", "A-SINTOMA", "A-PARQ7"], registradoEm: "2026-11-22T10:00:00-03:00" };
    expect(pontosParaVer(an, [lib], HOJE)).toBeLessThan(pontosParaVer(an, [], HOJE));
    expect(pontosParaVer(anamneseBase() as Anamnese, [], HOJE)).toBe(0);
  });

  it("pontosParaVer: liberação anterior às respostas não cobre", () => {
    const an = anamneseBase({ parq: [0, 0, 0, 0, 0, 0, 1] }) as Anamnese;
    const antiga: Liberacao = { id: "l0", por: "medico", data: "2026-01-10", alertas: ["A-PARQ7"], registradoEm: "2026-01-10T10:00:00-03:00" };
    expect(pontosParaVer(an, [antiga], HOJE)).toBe(pontosParaVer(an, [], HOJE));
  });
});

describe("RECEBER_TEXTO (literais de §5.5)", () => {
  it("cabeçalho, autorização e reenvio", () => {
    expect(RECEBER_TEXTO.titulo("Ana Souza")).toBe("Respostas de Ana");
    expect(RECEBER_TEXTO.respondidoEm("2026-11-20T10:05:00-03:00")).toMatch(/^Questionário respondido em \d\d\/\d\d às \d\d:\d\d\.$/);
    expect(RECEBER_TEXTO.autorizacao("Ana Souza", { consent: { at: "2026-11-20T12:00:00", source: "aluno_questionario", textId: "c1" } })).toBe("Autorização de saúde: dada por Ana em 20/11.");
    expect(RECEBER_TEXTO.autorizacao("Ana Souza", { healthOmitted: true })).toBe("Ana enviou sem dados de saúde.");
    expect(RECEBER_TEXTO.jaRegistrado("2026-11-21T12:00:00")).toBe("Estas respostas já foram registradas em 21/11.");
    expect(RECEBER_TEXTO.maisAntigas("Ana", "2026-11-22T12:00:00", "2026-11-20T12:00:00")).toBe("Você já tem respostas mais novas de Ana (22/11). Estas são de 20/11.");
    expect(RECEBER_TEXTO.substituir("Ana", "2026-11-20T10:05:00")).toBe("Ana mandou as respostas de novo, com mudanças. Substituir as de 20/11 10:05?");
  });

  it("confirmação, nome diferente, apagadas e guardas", () => {
    expect(RECEBER_TEXTO.confirmarNome("Juliana Prado")).toBe("Encontramos Juliana Prado pelo nome. É a mesma pessoa?");
    expect(RECEBER_TEXTO.nomeDiferente("Juliana Costa", "Juliana Prado")).toBe("O nome nas respostas (Juliana Costa) é diferente do cadastro (Juliana Prado). Confira antes de registrar.");
    expect(RECEBER_TEXTO.eCadastro("Juliana Prado")).toBe("É Juliana Prado: registrar");
    expect(RECEBER_TEXTO.cadastrarNome("Juliana Costa")).toBe("Cadastrar Juliana Costa como aluno novo");
    expect(RECEBER_TEXTO.cadastrar("Juliana Costa")).toBe("Cadastrar Juliana com estas respostas");
    expect(RECEBER_TEXTO.apagadas("2026-11-21T12:00:00", "Ana")).toBe("Estas respostas foram apagadas em 21/11. Registre de novo só se Ana pediu.");
    expect(RECEBER_TEXTO.respostasNoAluno("Carlos Lima")).toBe("Este link é para Carlos abrir. Suas respostas já foram na mensagem que você enviou.");
    expect(RECEBER_TEXTO.semPerfil("Carlos Lima", "Ana Souza")).toBe(
      "Se você é Carlos, abra no aparelho onde usa o Shape Real ou copie a mensagem e use Colar aqui no app. Se você é Ana, suas respostas já foram.",
    );
    expect(RECEBER_TEXTO.pontos(0)).toBeNull();
    expect(RECEBER_TEXTO.pontos(1)).toBe("1 ponto para ver antes de começar");
    expect(RECEBER_TEXTO.pontos(3)).toBe("3 pontos para ver antes de começar");
    expect(RECEBER_TEXTO.juntoAntes("2026-11-21T12:00:00")).toBe("Já existe um questionário de 21/11 (preenchido por você). Usar as respostas do link como as mais recentes?");
  });

  it("nenhum texto de recepção depende de resposta de saúde (só nomes e datas)", () => {
    const todos = Object.values(RECEBER_TEXTO)
      .map((v) => (typeof v === "function" ? (v as (...a: string[]) => unknown)("Ana Souza", "2026-11-20T12:00:00", "2026-11-20T12:00:00") : v))
      .filter((v): v is string => typeof v === "string")
      .join(" ")
      .toLowerCase();
    for (const proibido of ["dor", "pressão", "remédio", "gestante", "lombar", "coração"]) expect(todos).not.toMatch(new RegExp(`\\b${proibido}\\b`));
  });
});

describe("CONFERIR_TEXTO (spec §8.2)", () => {
  it("linha de diferença e linha de limitações", () => {
    expect(CONFERIR_TEXTO.linha({ cadastro: "Hipertrofia", resposta: "Saúde" }, "Ana Souza")).toBe("Você: Hipertrofia · Ana: Saúde");
    expect(CONFERIR_TEXTO.limitacoes({ sai: ["joelho direito"], entra: ["lombar"] })).toBe("Limitações · Sai: joelho direito · Entra: lombar");
    expect(CONFERIR_TEXTO.limitacoes({ sai: [], entra: ["lombar", "ombros"] })).toBe("Limitações · Entra: lombar, ombros");
    expect(CONFERIR_TEXTO.limitacoes({ sai: [], entra: [] })).toBeNull();
    expect(CONFERIR_TEXTO.excede).toBe("Limitações não atualizadas: passariam de 1.000 caracteres. Encurte o texto em Editar dados.");
  });
});
