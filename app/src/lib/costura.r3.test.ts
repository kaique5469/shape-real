import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExerciseLog, Profile, Program, Session, SetLog } from "@/lib/domain/types";

/**
 * Rodada 3, costura: as pontas entre as trilhas.
 *  - R3-4 item 2: "· 1 parcial" em "Sua semana" (Hoje) e na linha do aluno (/alunos, `partialWeek` do resumo);
 *  - R3-6 B: `sameSession` ignora o `volumeKg` (cache), no /receber e no plano de restauração;
 *  - R3-1 + R3-9 item 5: Conta no modo local (autorização "Fica neste celular…" e o "Sair" que explica a volta);
 *  - R3-17: o aviso do link no SendDietPanel e no SendFichaLink; R3-7: a dor na prévia do /receber.
 * As páginas são renderizadas de verdade; só a carga dos dados e o que depende do navegador são trocados.
 */

const estado = vi.hoisted(() => ({
  data: null as unknown,
  user: null as unknown,
  mode: "local" as "local" | "supabase",
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined, replace: () => undefined }) }));
vi.mock("@/lib/app-context", () => ({
  localRepo: { wipe: async () => undefined },
  useApp: () => ({
    user: estado.user,
    repo: { mode: estado.mode, capabilities: { invites: false }, getCoach: async () => null },
    mode: estado.mode,
    isDemo: false,
    isTester: false,
    plan: "free",
    returnTo: null,
    updateProfile: async () => undefined,
    signOut: async () => undefined,
  }),
}));
vi.mock("@/lib/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hooks")>()),
  useLoad: () => ({ data: estado.data, loading: false, error: null, reload: () => undefined, setData: () => undefined }),
}));
vi.mock("@/components/send-to-coach", () => ({
  usePendingWorkouts: () => ({ toSend: [], prepared: [], declareSent: () => true, dismiss: () => true }),
  SendToCoach: () => null,
}));
vi.mock("@/components/pwa", () => ({ InstallCard: () => null }));
vi.mock("@/components/backup-reminder", () => ({ BackupReminder: () => null, backupDoneText: () => "" }));
vi.mock("@/components/backup-restore", () => ({ RestoreBackupButton: () => null }));
vi.mock("@/components/colar-link", () => ({ ColarLink: () => null }));
vi.mock("@/components/tester", () => ({ FeedbackDialog: () => null }));
vi.mock("@/lib/transfer-client", () => ({ makeBackup: async () => null }));
vi.mock("@/lib/ai/client", () => ({ useAI: () => ({ enabled: false }) }));
vi.mock("@/lib/analytics", () => ({ track: () => undefined, reportError: () => undefined }));
vi.mock("@/lib/flags", () => ({ estadoChave: () => "desligado", questionarioLigado: () => false }));

const { default: HojePage } = await import("@/app/(painel)/hoje/page");
const { default: ContaPage } = await import("@/app/(painel)/conta/page");
const { parciaisNaSemana, textoParciais } = await import("@/lib/domain/session-time");
const { summarizeStudent } = await import("@/lib/data/repository");
const { sameSession } = await import("@/lib/domain/delivery");

const local = (day: number, hour = 10, month = 10) => new Date(2026, month, day, hour).toISOString();
/** Sexta-feira, 27/11/2026, 10h no fuso do aparelho (a semana começa na segunda, 23/11). */
const NOW = new Date(2026, 10, 27, 10);

const feita = (loadKg: number, reps: number): SetLog => ({ loadKg, reps, done: true });
const log = (exerciseId: string, sets: SetLog[], extra: Partial<ExerciseLog> = {}): ExerciseLog => ({ uid: exerciseId, exerciseId, name: exerciseId, sets, ...extra });
function sessao(id: string, startedAt: string, extra: Partial<Session> = {}): Session {
  return { id, userId: "a1", programId: "p1", dayKey: "A", startedAt, finishedAt: startedAt, exercises: [log("supino_reto_barra", [feita(40, 10)])], volumeKg: 0, prs: [], ...extra };
}

const program = {
  id: "p1",
  ownerId: "a1",
  createdBy: "c1",
  name: "ABC",
  system: "abc",
  goal: "hipertrofia",
  level: "iniciante",
  daysPerWeek: 3,
  days: ["A", "B", "C"].map((key) => ({ key, title: `Dia ${key}`, focus: [], exercises: [{ uid: `${key}1`, exerciseId: "supino_reto_barra", sets: 4, repsMin: 8, repsMax: 12, restSec: 90 }] })),
  active: true,
  source: "personal",
  createdAt: local(1),
  updatedAt: local(1),
} as unknown as Program;

const aluno = { id: "a1", role: "athlete", name: "Rafael Souza", createdAt: local(1), onboarded: true } as unknown as Profile;

const texto = (h: string) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
const fonte = (rel: string) => readFileSync(path.resolve(__dirname, "..", rel), "utf8");

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  estado.user = aluno;
  estado.mode = "local";
});

describe("parciais da semana (R3-4 item 2)", () => {
  // 1 de 24 séries = parcial; 23 de 24 não é (só o "{feitas} de {planejadas}" aparece); sem plannedSets nunca.
  const parcial = sessao("s1", local(24), { plannedSets: 24 });
  const quase = sessao("s2", local(25), { plannedSets: 24, exercises: [log("supino_reto_barra", Array.from({ length: 23 }, () => feita(40, 10)))] });
  const antiga = sessao("s3", local(26));
  const semanaPassada = sessao("s4", local(20), { plannedSets: 24 });

  it("conta só as parciais da semana corrente (segunda a domingo), com plannedSets", () => {
    expect(parciaisNaSemana([parcial, quase, antiga, semanaPassada], NOW)).toBe(1);
    expect(parciaisNaSemana([], NOW)).toBe(0);
    expect(parciaisNaSemana([sessao("x", "data ruim", { plannedSets: 24 })], NOW)).toBe(0);
  });

  it("texto: nada com 0, '1 parcial', '2 parciais'", () => {
    expect(textoParciais(0)).toBeNull();
    expect(textoParciais(1)).toBe("1 parcial");
    expect(textoParciais(2)).toBe("2 parciais");
  });

  it("resumo do aluno (/alunos) traz partialWeek pela mesma regra; a linha mostra '· 1 parcial' só com 1 ou mais", () => {
    const r = summarizeStudent(aluno, local(1), [parcial, quase, antiga], [program], [], NOW);
    expect(r.sessionsWeek).toBe(3);
    expect(r.partialWeek).toBe(1);
    expect(summarizeStudent(aluno, local(1), [antiga], [program], [], NOW).partialWeek).toBe(0);
    const linha = fonte("app/(painel)/alunos/page.tsx");
    expect(linha).toMatch(/textoParciais\(s\.partialWeek\)/);
  });

  it("Hoje, 'Sua semana': '2 de 3' e '1 parcial'; sem plannedSets, nenhum rótulo", () => {
    estado.data = { program, sessions: [parcial, quase], coach: null, coachProfile: null, diet: null };
    const com = texto(renderToStaticMarkup(createElement(HojePage)));
    expect(com).toContain("Treinos na semana 2 de 3 1 parcial");
    estado.data = { program, sessions: [antiga, sessao("s5", local(25))], coach: null, coachProfile: null, diet: null };
    const sem = texto(renderToStaticMarkup(createElement(HojePage)));
    expect(sem).toContain("Treinos na semana 2 de 3");
    expect(sem).not.toMatch(/parcia/);
  });
});

describe("sameSession ignora o volumeKg (R3-6 B: cache recalculado na chegada)", () => {
  const base = sessao("s1", local(24), { volumeKg: 400 });
  it("o mesmo treino com o cache de outra regra é o mesmo treino (nem 'atualizado' no /receber, nem 'diferente' ao restaurar)", () => {
    expect(sameSession(base, { ...base, volumeKg: 1600 })).toBe(true);
  });
  it("negativo: carga diferente continua diferente", () => {
    expect(sameSession(base, { ...base, exercises: [log("supino_reto_barra", [feita(42.5, 10)])] })).toBe(false);
  });
});

describe("Conta no modo local (R3-1, R3-9 item 5)", () => {
  it("autorização: 'Fica neste celular; só vai para o personal o que você enviar.' (nunca 'Só eu e o personal… temos acesso')", () => {
    const h = texto(renderToStaticMarkup(createElement(ContaPage)));
    expect(h).toContain("Fica neste celular; só vai para o personal o que você enviar.");
    expect(h).not.toContain("temos acesso");
  });

  it("'Sair' explica a volta pelo nome, ligado ao botão (aria-describedby)", () => {
    const h = renderToStaticMarkup(createElement(ContaPage));
    const id = h.match(/aria-describedby="([^"]+)"[^>]*>(?:(?!<\/button>)[\s\S])*Sair/)?.[1];
    expect(id).toBeTruthy();
    expect(texto(h.match(new RegExp(`<p id="${id}"[^>]*>([\\s\\S]*?)</p>`))?.[1] ?? "")).toBe("Seus dados continuam neste aparelho; para voltar, toque no seu nome na entrada.");
    // Depois de sair no modo local, a entrada (com "Perfis neste aparelho"); na nuvem, a página inicial.
    expect(fonte("app/(painel)/conta/page.tsx")).toMatch(/router\.push\(mode === "local" \? "\/entrar" : "\/"\)/);
  });

  it("na nuvem, o texto de antes e nenhuma explicação no Sair", () => {
    estado.mode = "supabase";
    const h = texto(renderToStaticMarkup(createElement(ContaPage)));
    expect(h).toContain("Só eu e o personal que eu aceitar temos acesso.");
    expect(h).not.toContain("Fica neste celular");
    expect(h).not.toContain("toque no seu nome na entrada");
  });
});

describe("pontas de tela lidas no fonte (componentes que dependem do navegador)", () => {
  it("R3-17: o aviso do link aparece no SendDietPanel e no SendFichaLink, só com o envio liberado", () => {
    expect(fonte("components/views/diet-view.tsx")).toMatch(/\{!off && estado \? <p className="mt-2 text-sm text-steel">\{estado\.aviso\}<\/p> : null\}/);
    // Correção da revisão: o aviso também na barra compacta (caminho principal do envio depois de salvar).
    expect(fonte("components/program/save-summary.tsx")).toMatch(/\{ready && estado \? <p className=\{cx\("text-steel", compact \? "mt-1\.5 text-xs" : "mt-2 text-sm"\)\}>\{estado\.aviso\}<\/p> : null\}/);
  });

  it("R3-3: a cópia que falha no SendDietPanel diz o que fazer (o mesmo texto do CopyButton), sem registrar o toque", () => {
    // Correção da revisão: o painel usa o próprio CopyButton (o toque só é registrado em `onCopied`, depois da cópia).
    const f = fonte("components/views/diet-view.tsx");
    expect(f).toMatch(/import \{ CopyButton \} from "@\/components\/copy-button"/);
    expect(f).toMatch(/<CopyButton text=\{estado\?\.texto \?\? ""\} disabled=\{off\} onCopied=\{\(\) => sent\("copy"\)\} \/>/);
  });

  it("R3-7: a prévia do /receber mostra 'Dor marcada: {exercícios}' em cada treino com dor", () => {
    const f = fonte("app/receber/page.tsx");
    expect(f).toMatch(/data-dor/);
    expect(f).toMatch(/Dor marcada:\{" "\}/);
    expect(f).toMatch(/filter\(\(e\) => e\.pain === true\)/);
  });
});
