import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { FichaPacket } from "./transfer";
import type { Profile } from "./types";
import {
  alvoInicialDoRetorno,
  ConfirmacaoNecessaria,
  contatoDoPersonal,
  criadoresDeConteudo,
  destinoPadrao,
  ehContatoDePersonal,
  ehPerfilDeTesteOuExemplo,
  ErroDeIdentidadeDoLink,
  fichaLinkMatch,
  LinkDeOutraPessoa,
  MATCH_BLOQUEIA_ATUALIZAR,
  MATCH_PEDE_CONFIRMACAO,
  ObjetoDeOutroPerfil,
  ordenarPorUso,
  perfisDeEntrada,
  retornoPedeConfirmacao,
  RetornoPedeConfirmacao,
  rotuloDoPerfil,
  SemPerfilParaAtualizar,
  perfilDoLinkNoAparelho,
  linhaDoPerfil,
  rotuloContinuarComo,
  telaDoLink,
  telaDoLinkDeOutroPerfil,
  textoConfirmarOutroAluno,
  textoPerfilDoLink,
  textoUltimoUso,
  textoOutroPersonal,
  textoTrocarDePersonal,
  textoVerComo,
  TEXTO_RETORNO_SEM_ALUNO,
  ultimoUso,
  type FichaLinkMatch,
} from "./link-identity";

// R3-1 (spec de 26/11 + adendo do estudo 2): identidade nos links e perfis de entrada. Dados fictícios.

const base = { plan: "free" as const, onboarded: true, createdAt: "2026-11-01T10:00:00Z" };
const coach = (id: string, extra: Partial<Profile> = {}): Profile => ({ id, name: "Rafael Nunes", role: "coach", ...base, plan: "coach", ...extra });
const athlete = (id: string, extra: Partial<Profile> = {}): Profile => ({ id, name: "Ana Souza", role: "athlete", ...base, ...extra });
const rc = (id: string, studentRef = "sA", name = "Rafael Nunes") => ({ id, name, studentRef });
const packet = (coachId = "c1", ref = "sA", nome = "Ana Souza"): Pick<FichaPacket, "coach" | "student"> => ({ coach: { id: coachId, name: "Rafael Nunes" }, student: { ref, name: nome } });

describe("fichaLinkMatch", () => {
  it("sem perfil, perfil de personal ou registro de aluno do personal (Ver como) → novo", () => {
    expect(fichaLinkMatch(packet(), null)).toBe("novo");
    expect(fichaLinkMatch(packet(), coach("c1"))).toBe("novo");
    // O registro do aluno no aparelho do personal nunca é atualizado por link, nem com o mesmo id do link.
    expect(fichaLinkMatch(packet("c1", "sA"), athlete("sA", { managedBy: "c1" }))).toBe("novo");
  });

  it("mesmo personal e mesmo studentRef → mesmo", () => {
    expect(fichaLinkMatch(packet("c1", "sA"), athlete("a-local", { remoteCoach: rc("c1", "sA") }))).toBe("mesmo");
  });

  it("mesmo personal, perfil sem studentRef (vínculo antigo) → legado", () => {
    expect(fichaLinkMatch(packet("c1", "sA"), athlete("a-local", { remoteCoach: rc("c1", "") }))).toBe("legado");
  });

  it("aluno sem personal → solo (primeiro vínculo)", () => {
    expect(fichaLinkMatch(packet(), athlete("a-local"))).toBe("solo");
  });

  it("mesmo personal, outro studentRef → outro_aluno; outro personal → outro_personal (mesmo com o mesmo studentRef)", () => {
    expect(fichaLinkMatch(packet("c1", "sB"), athlete("a-local", { remoteCoach: rc("c1", "sA") }))).toBe("outro_aluno");
    expect(fichaLinkMatch(packet("c9", "sA"), athlete("a-local", { remoteCoach: rc("c1", "sA") }))).toBe("outro_personal");
  });

  it("nunca lê o nome: mesmo ref com nome diferente = mesmo; ref diferente com nome igual = outro_aluno", () => {
    const a = athlete("a-local", { name: "Ana Souza", remoteCoach: rc("c1", "s1") });
    expect(fichaLinkMatch(packet("c1", "s1", "Beatriz Lima"), a)).toBe("mesmo");
    expect(fichaLinkMatch(packet("c1", "s2", "Ana Souza"), a)).toBe("outro_aluno");
  });

  it("destino padrão: novo → new, mesmo → update; os estados que pedem escolha não têm padrão", () => {
    expect(destinoPadrao("novo")).toBe("new");
    expect(destinoPadrao("mesmo")).toBe("update");
    for (const m of MATCH_PEDE_CONFIRMACAO) expect(destinoPadrao(m)).toBeNull();
    expect([...MATCH_BLOQUEIA_ATUALIZAR].sort()).toEqual(["outro_aluno", "outro_personal"]);
  });
});

describe("perfisDeEntrada (aceites do adendo)", () => {
  const ids = (ps: Profile[]) => perfisDeEntrada(ps).map((p) => p.id);

  it("aparelho do personal [c1, sA managedBy c1] → [c1]", () => {
    expect(ids([coach("c1"), athlete("sA", { managedBy: "c1" })])).toEqual(["c1"]);
  });

  it("celular do aluno [aluno com remoteCoach c1, contato c1] → [aluno]", () => {
    expect(ids([athlete("a-local", { remoteCoach: rc("c1") }), coach("c1")])).toEqual(["a-local"]);
  });

  it("aparelho dividido [personal c1 com sA managedBy c1, aluno próprio com remoteCoach c1] → [c1, aluno próprio]", () => {
    expect(ids([coach("c1"), athlete("sA", { managedBy: "c1" }), athlete("eu", { remoteCoach: rc("c1") })])).toEqual(["c1", "eu"]);
  });

  it("personal novo sem alunos → [c1]", () => {
    expect(ids([coach("c1")])).toEqual(["c1"]);
  });

  it("perfil de teste, de demonstração e aluno de exemplo ficam fora", () => {
    const ps = [coach("teste-personal"), athlete("teste-solo"), athlete("teste-ex-1", { sample: true, managedBy: "teste-personal" }), coach("demo-personal"), athlete("demo-atleta"), athlete("x", { sample: true }), athlete("real")];
    expect(ids(ps)).toEqual(["real"]);
  });

  it("nenhum perfil → lista vazia; um só → ele", () => {
    expect(ids([])).toEqual([]);
    expect(ids([athlete("so")])).toEqual(["so"]);
  });

  it("teste negativo: 'Continuar como' nunca é oferecido ao contato do personal nem a aluno do personal", () => {
    const celularDoAluno = [athlete("a-local", { remoteCoach: rc("c1") }), coach("c1")];
    const aparelhoDoPersonal = [coach("c1"), athlete("sA", { managedBy: "c1" }), athlete("sB", { managedBy: "c1" })];
    for (const ps of [celularDoAluno, aparelhoDoPersonal]) {
      for (const p of perfisDeEntrada(ps)) {
        expect(ehContatoDePersonal(p, ps)).toBe(false);
        expect(p.role === "athlete" && Boolean(p.managedBy)).toBe(false);
      }
    }
  });

  it("ids literais iguais aos do modo teste e da demonstração", async () => {
    const demo = await import("@/lib/data/demo");
    const { SOLO_TESTER_ID } = await import("./ficha-context");
    for (const id of [demo.TESTER_COACH_ID, demo.DEMO_COACH_ID, demo.DEMO_ATHLETE_ID, SOLO_TESTER_ID]) expect(ehPerfilDeTesteOuExemplo({ id })).toBe(true);
    expect(ehPerfilDeTesteOuExemplo({ id: "3f2a-uuid" })).toBe(false);
  });
});

describe("contato antigo depois de 'Trocar de personal' (criadoresDeConteudo)", () => {
  // O aluno trocou de c1 para c9: c1 não é mais remoteCoach de ninguém, mas a ficha antiga dele continua no perfil.
  const perfis = [athlete("a-local", { remoteCoach: rc("c9") }), coach("c1"), coach("c9", { name: "Camila Duarte" })];
  const conteudo = [
    { ownerId: "a-local", createdBy: "c1" },
    { ownerId: "a-local", createdBy: "c9" },
    { ownerId: "a-local", createdBy: "a-local" },
    { ownerId: "sA", createdBy: "c1" },
  ];

  it("criadores: só de fichas e dietas de alunos sem managedBy, fora o próprio aluno", () => {
    expect([...criadoresDeConteudo([...perfis, athlete("sA", { managedBy: "c1" })], conteudo)].sort()).toEqual(["c1", "c9"]);
    expect(criadoresDeConteudo(perfis, [])).toEqual(new Set());
  });

  it("com os criadores, o contato antigo fica fora de 'Perfis neste aparelho' e continua contato para o link", () => {
    const criadores = criadoresDeConteudo(perfis, conteudo);
    expect(perfisDeEntrada(perfis, criadores).map((p) => p.id)).toEqual(["a-local"]);
    expect(contatoDoPersonal("c1", perfis, criadores)).toBe("atualizar");
    // Só a regra dos perfis (sem os criadores) trataria c1 como "personal sem alunos".
    expect(perfisDeEntrada(perfis).map((p) => p.id)).toEqual(["a-local", "c1"]);
  });

  it("teste negativo: o personal de verdade (com aluno cadastrado) nunca vira contato, mesmo criador de ficha de um aluno próprio", () => {
    const aparelho = [coach("c1"), athlete("sA", { managedBy: "c1" }), athlete("eu", { remoteCoach: rc("c1") })];
    const criadores = criadoresDeConteudo(aparelho, [{ ownerId: "eu", createdBy: "c1" }]);
    expect(perfisDeEntrada(aparelho, criadores).map((p) => p.id)).toEqual(["c1", "eu"]);
    expect(contatoDoPersonal("c1", aparelho, criadores)).toBe("manter");
  });
});

describe("contatoDoPersonal (antes da primeira gravação)", () => {
  it("personal que não existe aqui → criar; contato → atualizar; perfil de entrada → manter", () => {
    expect(contatoDoPersonal("c1", [])).toBe("criar");
    expect(contatoDoPersonal("c1", [athlete("a-local", { remoteCoach: rc("c1") }), coach("c1")])).toBe("atualizar");
    expect(contatoDoPersonal("c1", [coach("c1"), athlete("sA", { managedBy: "c1" })])).toBe("manter");
    // Personal sem alunos é perfil de entrada: o link dele aberto no próprio aparelho não regrava nada.
    expect(contatoDoPersonal("c1", [coach("c1")])).toBe("manter");
    // Aparelho dividido: o personal tem aluno próprio e um aluno com remoteCoach dele; continua perfil de entrada.
    expect(contatoDoPersonal("c1", [coach("c1"), athlete("sA", { managedBy: "c1" }), athlete("eu", { remoteCoach: rc("c1") })])).toBe("manter");
  });

  it("perfil de teste com esse id e id de um perfil de aluno → manter (nunca vira contato)", () => {
    expect(contatoDoPersonal("teste-personal", [coach("teste-personal"), athlete("teste-ex-1", { managedBy: "teste-personal", sample: true })])).toBe("manter");
    expect(contatoDoPersonal("x", [athlete("x")])).toBe("manter");
  });
});

describe("/receber: nunca escolhe pelo nome", () => {
  const alunos = [{ profile: { id: "s1", name: "Ana Souza" } }, { profile: { id: "s2", name: "Ana Souza" } }];

  it("homônimos: dois 'Ana Souza' e pacote com studentRef s9 → nada pré-escolhido", () => {
    expect(alvoInicialDoRetorno({ studentRef: "s9" }, alunos)).toBeNull();
  });

  it("studentRef no painel → ele; painel vazio → nada", () => {
    expect(alvoInicialDoRetorno({ studentRef: "s2" }, alunos)).toBe("s2");
    expect(alvoInicialDoRetorno({ studentRef: "s2" }, [])).toBeNull();
  });

  it("retornoPedeConfirmacao: aluno escolhido à mão e link de outro personal", () => {
    expect(retornoPedeConfirmacao({ studentRef: "s1", coachId: "c1" }, "s1", "c1")).toEqual({ outroAluno: false, outroPersonal: false });
    expect(retornoPedeConfirmacao({ studentRef: "s9", coachId: "c1" }, "s1", "c1")).toEqual({ outroAluno: true, outroPersonal: false });
    expect(retornoPedeConfirmacao({ studentRef: "s1", coachId: "c9" }, "s1", "c1")).toEqual({ outroAluno: false, outroPersonal: true });
    // Sem personal neste aparelho (ou pacote sem coachId), não há o que comparar.
    expect(retornoPedeConfirmacao({ studentRef: "s1", coachId: "c9" }, "s1", undefined).outroPersonal).toBe(false);
    expect(retornoPedeConfirmacao({ studentRef: "s1", coachId: "" }, "s1", "c1").outroPersonal).toBe(false);
  });

  it("textos da escolha manual", () => {
    expect(TEXTO_RETORNO_SEM_ALUNO).toBe("Este retorno não bate com nenhum aluno deste painel.");
    expect(textoConfirmarOutroAluno("Beatriz Lima", "Ana Souza")).toBe("Registrar os treinos de Beatriz em Ana Souza?");
    expect(textoOutroPersonal("Beatriz Lima")).toMatch(/outro personal/);
  });
});

describe("telaDoLink (/abrir)", () => {
  const perfil = { name: "Ana Souza", remoteCoach: rc("c1") };
  const ctx = { perfil, aluno: "Beatriz Lima", personal: "Camila Duarte" };
  const acoes = (m: FichaLinkMatch) => telaDoLink(m, ctx)?.acoes.map((a) => a.acao) ?? null;

  it("novo e mesmo seguem como antes (sem tela de escolha)", () => {
    expect(telaDoLink("novo", ctx)).toBeNull();
    expect(telaDoLink("mesmo", ctx)).toBeNull();
  });

  it("legado e solo: mostra o perfil ativo e o destinatário; 'Sou eu, atualizar meu perfil' e 'Criar outro perfil'", () => {
    for (const m of ["legado", "solo"] as const) {
      const t = telaDoLink(m, ctx)!;
      expect(t.linhas[0]).toBe("Este celular está com o perfil de Ana. Este link é para Beatriz, de Camila Duarte.");
      expect(t.acoes.map((a) => a.rotulo)).toEqual(["Sou eu, atualizar meu perfil", "Criar outro perfil", "Voltar"]);
    }
  });

  it("outro_aluno: só perfil separado ou voltar; outro_personal: também 'Trocar de personal neste perfil'", () => {
    expect(acoes("outro_aluno")).toEqual(["criar", "voltar"]);
    expect(telaDoLink("outro_aluno", ctx)!.acoes[0]!.rotulo).toBe("Criar perfil separado para Beatriz");
    expect(acoes("outro_personal")).toEqual(["criar", "trocar", "voltar"]);
    expect(telaDoLink("outro_personal", ctx)!.linhas[0]).toContain("acompanhado por Rafael Nunes");
  });

  it("todo estado que pede escolha tem 'voltar' e nenhum oferece atualizar em silêncio o perfil de outra pessoa", () => {
    for (const m of MATCH_PEDE_CONFIRMACAO) expect(acoes(m)).toContain("voltar");
    for (const m of MATCH_BLOQUEIA_ATUALIZAR) expect(acoes(m)).not.toContain("atualizar");
  });

  it("textos de apoio", () => {
    expect(textoTrocarDePersonal("Camila Duarte")).toBe("Seus treinos e recordes continuam neste perfil. A ficha e a dieta passam a ser as de Camila Duarte.");
    expect(textoVerComo("Marina Costa")).toBe("Você está vendo como Marina. Volte ao painel para abrir links.");
  });
});

describe("telaDoLink: homônimos e o perfil do link que já está no celular (etapa 2)", () => {
  it("mesmo primeiro nome: o texto usa os nomes inteiros; nomes iguais dizem que é outro cadastro", () => {
    const t = telaDoLink("outro_aluno", { perfil: { name: "Ana Souza", remoteCoach: rc("c1") }, aluno: "Ana Lima", personal: "Camila Duarte" })!;
    expect(t.linhas[0]).toBe("Este celular está com o perfil de Ana Souza. Este link é para Ana Lima, de Camila Duarte.");
    expect(t.acoes[0]!.rotulo).toBe("Criar perfil separado para Ana Lima");
    const iguais = telaDoLink("outro_aluno", { perfil: { name: "Ana Souza", remoteCoach: rc("c1") }, aluno: "Ana  Souza", personal: "Camila Duarte" })!;
    expect(iguais.linhas).toContain("Mesmo nome, outro cadastro de Camila Duarte.");
    expect(telaDoLink("solo", { perfil: { name: "ana souza" }, aluno: "Ana Lima", personal: "Camila" })!.linhas[0]).toContain("perfil de ana souza");
  });

  it("perfilDoLinkNoAparelho: só pelos ids (coach.id e studentRef), um perfil de entrada de aluno; nunca pelo nome", () => {
    const beatriz = athlete("b1", { name: "Beatriz Lima", remoteCoach: rc("c9", "sB") });
    const rafael = athlete("r1", { name: "Rafael Alves", remoteCoach: rc("c1", "sR") });
    const contato = coach("c9", { name: "Camila Duarte" });
    expect(perfilDoLinkNoAparelho(packet("c9", "sB", "Outro Nome"), [rafael, beatriz, contato])?.id).toBe("b1");
    // Mesmo nome, outro ref: não é o perfil do link.
    expect(perfilDoLinkNoAparelho(packet("c9", "sX", "Beatriz Lima"), [rafael, beatriz, contato])).toBeNull();
    // Mesmo ref, outro personal: não é.
    expect(perfilDoLinkNoAparelho(packet("c1", "sB"), [rafael, beatriz])).toBeNull();
  });

  it("perfilDoLinkNoAparelho: aluno do personal (managedBy), perfil de teste, sem studentRef e dois iguais → null", () => {
    expect(perfilDoLinkNoAparelho(packet("c1", "sA"), [coach("c1"), athlete("sA", { managedBy: "c1", remoteCoach: rc("c1", "sA") })])).toBeNull();
    expect(perfilDoLinkNoAparelho(packet("c1", "sA"), [athlete("teste-solo", { remoteCoach: rc("c1", "sA") })])).toBeNull();
    expect(perfilDoLinkNoAparelho(packet("c1", "sA"), [athlete("a1", { remoteCoach: { id: "c1", name: "Rafael Nunes", studentRef: "" } })])).toBeNull();
    expect(perfilDoLinkNoAparelho(packet("c1", "sA"), [athlete("a1", { remoteCoach: rc("c1") }), athlete("a2", { remoteCoach: rc("c1") })])).toBeNull();
  });

  it("com o perfil do link no celular e outro aberto: atualizar esse perfil ou voltar (nunca criar outro igual)", () => {
    const t = telaDoLinkDeOutroPerfil({ perfil: { name: "Rafael Alves" }, dono: { name: "Beatriz Lima" }, personal: "Camila Duarte" });
    expect(t.titulo).toBe("Este link é do perfil de Beatriz");
    expect(t.linhas).toEqual(["Este celular está com o perfil de Rafael. O link é para Beatriz, de Camila Duarte, que já tem perfil neste celular.", "O perfil de Rafael fica como está."]);
    expect(t.acoes.map((a) => a.acao)).toEqual(["atualizar", "voltar"]);
    expect(t.acoes[0]!.rotulo).toBe("Atualizar o perfil de Beatriz");
    expect(textoPerfilDoLink({ name: " Beatriz  Lima " })).toBe("Este link é do perfil de Beatriz Lima, que já está neste celular.");
  });
});

describe("lista de entrada: botão e último uso (etapa 2)", () => {
  it("'Continuar como' com o primeiro nome; nome inteiro quando outro perfil tem o mesmo primeiro nome", () => {
    const lista = [
      { id: "a", name: "Ana Souza" },
      { id: "b", name: "ana Lima" },
      { id: "c", name: "Rafael  Nunes" },
    ];
    expect(rotuloContinuarComo(lista[0]!, lista)).toBe("Continuar como Ana Souza");
    expect(rotuloContinuarComo(lista[1]!, lista)).toBe("Continuar como ana Lima");
    expect(rotuloContinuarComo(lista[2]!, lista)).toBe("Continuar como Rafael");
  });

  it("'Último uso em dd/mm' no fuso do aparelho; com o ano quando não é o de agora; ilegível → vazio", () => {
    const agora = new Date(2026, 10, 27, 12, 0);
    expect(textoUltimoUso(new Date(2026, 10, 25, 20, 0).toISOString(), agora)).toBe("Último uso em 25/11");
    expect(textoUltimoUso(new Date(2025, 0, 5, 9, 0).toISOString(), agora)).toBe("Último uso em 05/01/2025");
    expect(textoUltimoUso("ontem", agora)).toBe("");
  });
});

describe("lista de entrada: rótulo e último uso", () => {
  it("rótulo só pelo papel", () => {
    expect(rotuloDoPerfil({ role: "coach" })).toBe("Personal");
    expect(rotuloDoPerfil({ role: "athlete" })).toBe("Aluno");
  });

  it("último uso: a mais recente, entre fusos diferentes; ilegível fica de fora; nenhuma → null", () => {
    // 10:00 em São Paulo (13:00Z) é depois de 12:30Z.
    expect(ultimoUso(["2026-11-20T12:30:00Z", "2026-11-20T10:00:00-03:00", null, "ontem"])).toBe("2026-11-20T10:00:00-03:00");
    expect(ultimoUso([undefined, "", "x".repeat(50)])).toBeNull();
    expect(ultimoUso([])).toBeNull();
  });

  it("relógio mexido para o futuro vale como está (não inventa); ordenação: mais recente primeiro, sem data no fim", () => {
    const itens = [
      { id: "a", ultimoUso: null },
      { id: "b", ultimoUso: "2026-11-01T10:00:00Z" },
      { id: "c", ultimoUso: "2027-01-01T10:00:00Z" },
      { id: "d", ultimoUso: "2026-11-20T10:00:00Z" },
      { id: "e", ultimoUso: null },
    ];
    expect(ordenarPorUso(itens).map((x) => x.id)).toEqual(["c", "d", "b", "a", "e"]);
  });
});

describe("erros tipados", () => {
  it("todos são reconhecíveis pelo instanceof e dizem que nada foi alterado", () => {
    const erros = [new ConfirmacaoNecessaria("legado"), new SemPerfilParaAtualizar(), new LinkDeOutraPessoa("outro_aluno"), new LinkDeOutraPessoa("outro_personal"), new ObjetoDeOutroPerfil("mesmo")];
    for (const e of erros) {
      expect(e).toBeInstanceOf(ErroDeIdentidadeDoLink);
      expect(e.message).toMatch(/Nada foi alterado/);
    }
    expect(new LinkDeOutraPessoa("outro_personal").message).toMatch(/outro personal/);
    const r = new RetornoPedeConfirmacao(true, false);
    expect(r.message).toMatch(/Nada foi registrado/);
    expect([r.outroAluno, r.outroPersonal]).toEqual([true, false]);
  });
});

/** Textos (literais de string) de um arquivo, sem os comentários. */
function textosDoArquivo(arquivo: string): string[] {
  const semComentarios = readFileSync(arquivo, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  return semComentarios.match(/"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? [];
}
const LINK_SEGURO = /\b(segur[oa]s?|protegid[oa]s?|criptografad[oa]s?)\b/i;

describe("pureza e redação", () => {
  const src = readFileSync(path.resolve(__dirname, "link-identity.ts"), "utf8");

  it("link-identity.ts só importa tipos e perfis-de-entrada.ts, que só importa tipos (spec-m §5)", () => {
    const imports = src.split("\n").filter((l) => /^import /.test(l));
    expect(imports.length).toBeGreaterThan(0);
    for (const l of imports) expect(l).toMatch(/^import type |^import \{[^}]*\} from "\.\/perfis-de-entrada";$/);
    const perfis = readFileSync(path.resolve(__dirname, "perfis-de-entrada.ts"), "utf8").split("\n").filter((l) => /^import /.test(l));
    expect(perfis.length).toBeGreaterThan(0);
    for (const l of perfis) expect(l).toMatch(/^import type /);
  });

  it("nenhum texto chama o link de seguro, protegido ou criptografado (nos arquivos do R3-1, R3-3 e R3-17)", () => {
    const arquivos = ["link-identity.ts", "link-aviso.ts", "delivery.ts", "export.ts", "../transfer-client.ts", "../../components/copy-button.tsx", "../../components/send-to-coach.tsx", "../../components/backup-restore.tsx"];
    for (const a of arquivos) {
      const textos = textosDoArquivo(path.resolve(__dirname, a));
      expect(textos.length, a).toBeGreaterThan(0);
      expect(textos.filter((t) => LINK_SEGURO.test(t)), a).toEqual([]);
    }
    // O próprio filtro pega a frase proibida.
    expect(LINK_SEGURO.test("O link é seguro")).toBe(true);
    expect(LINK_SEGURO.test("Faça uma cópia de segurança")).toBe(false);
  });

  it("as telas do R3-1, R3-3 e R3-17 também não (texto de JSX incluído, sem os comentários)", () => {
    const telas = ["../../app/abrir/page.tsx", "../../app/entrar/page.tsx", "../../app/receber/page.tsx", "../../components/transfer-share.tsx", "../use-ficha-link.ts", "../../app/(painel)/historico/page.tsx"];
    for (const t of telas) {
      const fonte = readFileSync(path.resolve(__dirname, t), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
      expect(fonte.match(new RegExp(LINK_SEGURO.source, "gi")) ?? [], t).toEqual([]);
    }
  });
});

describe("correção da revisão: dois perfis com o mesmo nome inteiro ficam distinguíveis", () => {
  const solo = { id: "s1", name: "Rafael Souza", role: "athlete" as const, createdAt: "2026-11-02T12:00:00Z" };
  const doPaulo = { id: "s2", name: "Rafael  Souza", role: "athlete" as const, createdAt: "2026-11-27T12:00:00Z", remoteCoach: { id: "c1", name: "Paulo Mendes", studentRef: "x" } };

  it("um solo e um com personal: linhas e botões diferentes, sem dado de saúde", () => {
    const lista = [solo, doPaulo];
    expect(linhaDoPerfil(solo, lista)).toBe("Aluno sem personal");
    expect(linhaDoPerfil(doPaulo, lista)).toBe("Aluno de Paulo Mendes");
    expect(rotuloContinuarComo(solo, lista)).toBe("Continuar como Rafael Souza (sem personal)");
    expect(rotuloContinuarComo(doPaulo, lista)).toBe("Continuar como Rafael Souza (de Paulo)");
  });

  it("mesmo nome e mesmo vínculo: entra a data de criação", () => {
    const outro = { ...doPaulo, id: "s3", createdAt: "2026-11-20T12:00:00Z" };
    const lista = [doPaulo, outro];
    const linhas = lista.map((p) => linhaDoPerfil(p, lista));
    const botoes = lista.map((p) => rotuloContinuarComo(p, lista));
    expect(new Set(linhas).size).toBe(2);
    expect(new Set(botoes).size).toBe(2);
    expect(linhas[1]).toMatch(/^Aluno de Paulo Mendes · criado em \d{2}\/11$/);
    expect(botoes[1]).toMatch(/^Continuar como Rafael Souza \(de Paulo, criado em \d{2}\/11\)$/);
  });

  it("teste negativo: nomes diferentes continuam como antes; personal é 'Personal'", () => {
    const coach = { id: "c1", name: "Paulo Mendes", role: "coach" as const };
    const lista = [solo, coach];
    expect(rotuloContinuarComo(solo, lista)).toBe("Continuar como Rafael");
    expect(linhaDoPerfil(coach, lista)).toBe("Personal");
    expect(linhaDoPerfil(solo, lista)).toBe("Aluno sem personal");
  });
});
