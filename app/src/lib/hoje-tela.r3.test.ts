import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExerciseLog, Profile, Program, Session, SetLog } from "@/lib/domain/types";

/**
 * Rodada 3, tela do Hoje (track H, etapa 2): R3-8 (treino de hoje registrado, parcial, convite de retomar e aviso de
 * volta) e R3-3 (banner forte só para "para enviar"; linha discreta para os copiados com Já enviei, Copiar de novo e
 * Dispensar). A página é renderizada de verdade no servidor; só a carga dos dados, o hook da pendência (trilha L, com
 * testes próprios) e o que depende do navegador são trocados.
 */

type Pendencia = { toSend: Session[]; prepared: { session: Session; via: "copy" | "whatsapp"; at: string }[] };
const estado = vi.hoisted(() => ({
  data: null as unknown,
  pendencia: { toSend: [], prepared: [] } as unknown as Pendencia,
  user: null as unknown,
  params: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => estado.params }));
vi.mock("@/lib/app-context", () => ({ useApp: () => ({ user: estado.user, repo: { mode: "local" }, mode: "local", returnTo: null }) }));
vi.mock("@/lib/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hooks")>()),
  useLoad: () => ({ data: estado.data, loading: false, error: null, reload: () => undefined, setData: () => undefined }),
}));
vi.mock("@/components/send-to-coach", async () => {
  const { createElement: h } = await import("react");
  return {
    usePendingWorkouts: () => ({ ...estado.pendencia, declareSent: () => true, dismiss: () => true }),
    // O envio de verdade (diálogo, link, toque) é da trilha L: aqui só o botão com o rótulo e quantos treinos leva.
    SendToCoach: ({ sessions, label }: { sessions: Session[]; label?: string }) =>
      sessions.length ? h("button", { type: "button", "data-envio": sessions.map((s) => s.id).join(",") }, label ?? `Enviar ${sessions.length}`) : null,
  };
});
vi.mock("@/components/pwa", () => ({ InstallCard: () => null }));
vi.mock("@/components/backup-reminder", () => ({ BackupReminder: () => null }));
vi.mock("@/components/colar-link", () => ({ ColarLink: () => null }));
vi.mock("@/lib/ai/client", () => ({ useAI: () => ({ enabled: false }) }));
vi.mock("@/lib/analytics", () => ({ track: () => undefined, reportError: () => undefined }));

const { default: HojePage } = await import("@/app/(painel)/hoje/page");
const { TEXTO_RETOMAR } = await import("@/lib/hooks");

const local = (day: number, hour = 10, month = 10) => new Date(2026, month, day, hour).toISOString();
/** Sexta-feira, 27/11/2026, 10h no fuso do aparelho. */
const NOW = new Date(2026, 10, 27, 10);

const feita = (loadKg: number, reps: number): SetLog => ({ loadKg, reps, done: true });
const log = (exerciseId: string, sets: SetLog[]): ExerciseLog => ({ uid: exerciseId, exerciseId, name: exerciseId, sets });
function sessao(id: string, startedAt: string, extra: Partial<Session> = {}): Session {
  return { id, userId: "a1", programId: "p1", dayKey: "A", startedAt, finishedAt: startedAt, exercises: [log("supino_reto_barra", [feita(40, 10)])], volumeKg: 0, prs: [], ...extra };
}

const program: Program = {
  id: "p1",
  ownerId: "a1",
  createdBy: "c1",
  name: "ABC",
  system: "abc" as Program["system"],
  goal: "hipertrofia" as Program["goal"],
  level: "iniciante" as Program["level"],
  daysPerWeek: 3,
  days: ["A", "B", "C"].map((key) => ({
    key,
    title: `Dia ${key}`,
    focus: [],
    exercises: [{ uid: `${key}1`, exerciseId: "supino_reto_barra", sets: 4, repsMin: 8, repsMax: 12, restSec: 90 }],
  })) as unknown as Program["days"],
  active: true,
  source: "personal",
  createdAt: local(1),
  updatedAt: local(1),
};

const aluno = {
  id: "a1",
  role: "athlete",
  name: "Rafael Souza",
  createdAt: local(1),
  onboarded: true,
  remoteCoach: { id: "c1", name: "Camila Duarte", studentRef: "s1" },
} as unknown as Profile;

function tela(sessions: Session[], opts: { program?: Program | null; pendencia?: Pendencia } = {}): string {
  estado.data = { program: opts.program === undefined ? program : opts.program, sessions, coach: { id: "c1", name: "Camila Duarte" }, coachProfile: null, diet: null };
  estado.pendencia = opts.pendencia ?? { toSend: [], prepared: [] };
  return renderToStaticMarkup(createElement(HojePage));
}
const texto = (h: string) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
/** Conteúdo de uma `<section>` pelo atributo (aria-label ou data-*). */
function secao(h: string, attr: string): string | null {
  const m = h.match(new RegExp(`<section[^>]*${attr}[^>]*>([\\s\\S]*?)</section>`));
  return m ? m[1]! : null;
}
/** Nome visível de cada botão e link da página. */
const controles = (h: string) => [...h.matchAll(/<(button|a)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => texto(m[2]!));

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  estado.user = aluno;
  estado.params = new URLSearchParams();
});

describe("Hoje com treino já registrado hoje (R3-8)", () => {
  /** Treino B de hoje: 1 série feita de 24 planejadas. */
  const hojeB = sessao("hoje", local(27, 7), { dayKey: "B", plannedSets: 24 });
  const ontemA = sessao("ontem", local(26), { dayKey: "A" });

  it('"Treino B registrado hoje · 1 de 24 séries" e "Próximo: Treino C" como secundário', () => {
    const h = tela([hojeB, ontemA]);
    const card = secao(h, 'data-hoje="registrado"');
    expect(card).not.toBeNull();
    expect(texto(card!)).toContain("Treino B registrado hoje · 1 de 24 séries");
    expect(texto(card!)).toContain("Próximo: Treino C");
  });

  it('nenhum "Continuar" no card e nenhum "Começar treino" dominante: o próximo fica recolhido, como ação secundária', () => {
    const h = tela([hojeB, ontemA]);
    const card = secao(h, 'data-hoje="registrado"')!;
    expect(texto(card)).not.toMatch(/Continuar/);
    // O card do próximo treino (com o botão grande) não aparece; o início do C fica dentro de "Ver o próximo treino".
    expect(h).not.toContain('aria-labelledby="proximo"');
    expect(card).toMatch(/<details[\s\S]*Ver o próximo treino[\s\S]*Começar o treino C agora[\s\S]*<\/details>/);
    expect(card).not.toContain("h-14");
  });

  it("sem plannedSets: o mesmo card, sem número", () => {
    const h = tela([sessao("hoje", local(27, 7), { dayKey: "B" }), ontemA]);
    const card = texto(secao(h, 'data-hoje="registrado"')!);
    expect(card).toContain("Treino B registrado hoje");
    expect(card).not.toMatch(/\d+ de \d+/);
  });

  it("treino livre hoje sem ficha ativa: o card aparece e o estado sem ficha continua", () => {
    const h = tela([sessao("livre", local(27, 8), { dayKey: undefined, programId: null })], { program: null });
    const card = texto(secao(h, 'data-hoje="registrado"')!);
    expect(card).toContain("Treino livre registrado hoje");
    expect(card).not.toContain("Próximo:");
    expect(texto(h)).toContain("Nenhuma ficha de Camila neste celular ainda");
  });
});

describe("Hoje sem treino hoje (fica como era)", () => {
  it("o card do próximo treino com o botão grande, sem o card de hoje", () => {
    const h = tela([sessao("ontem", local(26), { dayKey: "A" })]);
    expect(h).not.toContain('data-hoje="registrado"');
    expect(texto(h)).toContain("Próximo treino");
    expect(controles(h)).toContain("Começar treino B");
    expect(texto(h)).not.toContain("registrado hoje");
  });

  it('último treino parcial (ontem, 1 de 24): "Treino A ficou parcial (1 de 24). Próximo: Treino B."', () => {
    const h = tela([sessao("ontem", local(26), { dayKey: "A", plannedSets: 24 })]);
    expect(texto(h)).toContain("Treino A ficou parcial (1 de 24). Próximo: Treino B.");
    // "Escolher dia" continua lá para repetir o A.
    expect(h).toContain('aria-label="Escolher dia"');
  });
});

describe("Descanso e volta (R3-8)", () => {
  it("8 dias sem registro: o convite de retomar, dispensável, junto do Começar treino", () => {
    const h = tela([sessao("velho", local(19), { dayKey: "A" })]);
    expect(texto(h)).toContain(TEXTO_RETOMAR);
    expect(h).toMatch(/<button[^>]*aria-label="Dispensar o convite para retomar"[^>]*>\s*Dispensar\s*<\/button>/);
    expect(texto(h)).not.toContain("cargas sugeridas vêm mais leves");
    // Sem culpa: nada de "sumiu", "abandonou", "falhou".
    expect(texto(h)).not.toMatch(/sumiu|abandon|falhou|preguiç/i);
  });

  it("14 dias ou mais: o aviso de volta de sempre, sem o convite", () => {
    const h = tela([sessao("velho", local(13), { dayKey: "A" })]);
    expect(texto(h)).toContain("Faz 14 dias desde o último treino. Hoje as cargas sugeridas vêm mais leves.");
    expect(texto(h)).not.toContain(TEXTO_RETOMAR);
  });

  it("sem ficha ativa: o convite vai para o card da semana", () => {
    const h = tela([sessao("velho", local(18), { dayKey: undefined, programId: null })], { program: null });
    expect(texto(secao(h, 'aria-label="Sua semana"')!)).toContain(TEXTO_RETOMAR);
  });

  it("6 dias: nenhum aviso de pausa", () => {
    const h = tela([sessao("recente", local(21), { dayKey: "A" })]);
    expect(texto(h)).not.toContain(TEXTO_RETOMAR);
    expect(texto(h)).not.toContain("desde o último treino");
  });
});

describe("Pendência de envio no Hoje (R3-3)", () => {
  const s1 = sessao("s1", local(25), { dayKey: "A" });
  const s2 = sessao("s2", local(26), { dayKey: "B" });
  const s3 = sessao("s3", local(24), { dayKey: "C" });

  it("banner forte só para 'para enviar'", () => {
    const h = tela([s2, s1], { pendencia: { toSend: [s2, s1], prepared: [] } });
    const banner = texto(secao(h, 'aria-label="Treinos para enviar"')!);
    expect(banner).toContain("2 treinos ainda não enviados");
    expect(banner).toContain("Mande para Camila");
    expect(h).not.toContain('aria-label="Treinos copiados"');
  });

  it("copiados sem 'Já enviei': linha discreta com Já enviei, Enviar de novo e Dispensar (sem o banner forte)", () => {
    const h = tela([s2, s1], { pendencia: { toSend: [], prepared: [{ session: s1, via: "copy", at: local(25, 20) }] } });
    expect(h).not.toContain('aria-label="Treinos para enviar"');
    const linha = secao(h, 'aria-label="Treinos copiados"')!;
    expect(texto(linha)).toContain("Você copiou 1 treino. Já colou na conversa?");
    // Correção da revisão: "Enviar de novo" (o toque abre o diálogo de envio; a spec dizia "Copiar de novo").
    expect(controles(linha)).toEqual(["Já enviei", "Enviar de novo", "Dispensar"]);
    // "Enviar de novo" leva só os copiados.
    expect(linha).toContain('data-envio="s1"');
    expect(linha).toContain('aria-label="Dispensar o lembrete"');
    // Ícone com o texto (nunca só cor) e nada de "recebido" ou "enviado para".
    expect(linha).toContain('data-delivery="copia"');
    expect(texto(linha)).not.toMatch(/recebid|enviado para|chegou/i);
  });

  it("envio iniciado no WhatsApp não cobra no Hoje", () => {
    const h = tela([s2, s1], { pendencia: { toSend: [], prepared: [{ session: s1, via: "whatsapp", at: local(25, 20) }] } });
    expect(h).not.toContain('aria-label="Treinos copiados"');
    expect(h).not.toContain('aria-label="Treinos para enviar"');
  });

  it("os dois juntos: banner forte para o que nunca foi tocado e a linha para os copiados", () => {
    const h = tela([s2, s1, s3], {
      pendencia: { toSend: [s3], prepared: [{ session: s1, via: "copy", at: local(25, 20) }, { session: s2, via: "copy", at: local(26, 20) }] },
    });
    expect(texto(secao(h, 'aria-label="Treinos para enviar"')!)).toContain("1 treino ainda não enviado");
    const linha = secao(h, 'aria-label="Treinos copiados"')!;
    expect(texto(linha)).toContain("Você copiou 2 treinos. Já colou na conversa?");
    expect(linha).toContain('data-envio="s1,s2"');
  });

  it("a região de status fica sempre montada e vazia fora do fluxo até uma ação", () => {
    const h = tela([s1], { pendencia: { toSend: [], prepared: [{ session: s1, via: "copy", at: local(25, 20) }] } });
    expect(h).toMatch(/<div tabindex="-1" role="status" class="sr-only"><\/div>/);
  });
});

describe("correção da revisão: ficha atualizada com o treino de hoje já registrado (R3-8)", () => {
  const hojeB = sessao("hoje", local(27, 7), { dayKey: "B", plannedSets: 24 });
  const ficha = { ...program, name: "Ficha Marina — ciclo 2" };

  it("?ficha=1 + treino de hoje: o card mostra o nome da ficha e o aviso aponta para 'Ver o próximo treino'", () => {
    estado.params = new URLSearchParams("ficha=1");
    const h = tela([hojeB], { program: ficha });
    const card = texto(secao(h, 'data-hoje="registrado"')!);
    expect(card).toContain("Ficha Marina — ciclo 2");
    const t = texto(h);
    expect(t).toContain("O próximo treino já é desta ficha: veja em “Ver o próximo treino”.");
    // "Começar treino" fora do "Ver o próximo treino" não existe nesta tela.
    const semDetails = h.replace(/<details[\s\S]*?<\/details>/g, " ");
    expect(texto(semDetails)).not.toContain("Começar treino");
  });

  it("teste negativo: ?ficha=1 sem treino hoje continua com 'Toque em “Começar treino”' e o botão no card", () => {
    estado.params = new URLSearchParams("ficha=1");
    const h = tela([sessao("ontem", local(26), { dayKey: "A" })], { program: ficha });
    expect(texto(h)).toContain("Toque em “Começar treino” quando chegar na academia.");
    expect(controles(h).some((c) => /^Começar treino/.test(c))).toBe(true);
  });
});
