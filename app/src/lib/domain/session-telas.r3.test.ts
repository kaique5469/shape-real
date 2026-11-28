import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDraft, parseDraft, swapInDraft, type WorkoutDraft } from "@/lib/workout-draft";
import { ficaNoTreino, marcarDor, PAIN_MARKED_NOTE, painSummaryNote, resumoParaGuardar } from "./session-flow";
import { completudeLinha, iniciarTempo, MAX_MINUTOS_BRUTOS, PAUSA_LONGA_MS, registrarAtividade, segundosNaTela } from "./session-time";
import { completudeLinha as completudeLinhaDoLink, sessionToText } from "./transfer";
import type { ExerciseLog, Program, Session, SetLog } from "./types";

/**
 * Rodada 3, trilha S, etapa 2 (telas): o que as telas da sessão, do Histórico e da página do aluno leem. Dados fictícios.
 */
const T0 = "2026-11-25T18:00:00.000Z";
const ms = (min: number) => Date.parse(T0) + min * 60_000;
const feita = (loadKg: number | null, reps: number): SetLog => ({ loadKg, reps, done: true });
const vazia = (): SetLog => ({ loadKg: null, reps: null, done: false });
const ex = (uid: string, exerciseId: string, sets: SetLog[], extra: Partial<ExerciseLog> = {}): ExerciseLog => ({ uid, exerciseId, name: exerciseId, sets, ...extra });
const sessao = (exercises: ExerciseLog[], extra: Partial<Session> = {}): Session => ({ id: "s1", userId: "u", programId: "p1", dayKey: "B", startedAt: T0, finishedAt: new Date(ms(50)).toISOString(), exercises, volumeKg: 0, prs: [], ...extra });

const read = (rel: string) => readFileSync(path.join(__dirname, "..", "..", rel), "utf8");

describe("segundosNaTela: relógio do cabeçalho pelo tempo ativo (R3-4)", () => {
  it("treino em andamento: tempo ativo + o intervalo desde a última atividade", () => {
    const t = registrarAtividade(iniciarTempo(T0), ms(10)).tempo; // 10 min ativos
    expect(segundosNaTela(t, T0, ms(12))).toBe(12 * 60);
  });

  it("parado na tela além da pausa longa: o relógio volta ao tempo ativo gravado (não cresce para horas)", () => {
    const t = registrarAtividade(iniciarTempo(T0), ms(10)).tempo;
    // Correção da revisão: antes parava em +30 min, que `minutosAtivosAoFinalizar` nunca grava.
    expect(segundosNaTela(t, T0, ms(10) + 8 * 3_600_000)).toBe(10 * 60);
    expect(segundosNaTela(t, T0, ms(10) + PAUSA_LONGA_MS)).toBe((10 * 60_000 + PAUSA_LONGA_MS) / 1000);
  });

  it("aceite: 30 min ativos + 8 h parado e a volta (atividade) → o relógio volta a 30 min", () => {
    const t1 = registrarAtividade(iniciarTempo(T0), ms(30)).tempo;
    const volta = ms(30) + 8 * 3_600_000;
    const t2 = registrarAtividade(t1, volta).tempo;
    expect(segundosNaTela(t2, T0, volta)).toBe(30 * 60);
  });

  it("relógio do aparelho que volta no tempo: nunca negativo", () => {
    const t = registrarAtividade(iniciarTempo(T0), ms(10)).tempo;
    expect(segundosNaTela(t, T0, ms(-60))).toBe(10 * 60);
  });

  it("rascunho antigo sem relógio: a duração desde o início só até 180 min; acima, sem relógio (null)", () => {
    expect(segundosNaTela(undefined, T0, ms(42))).toBe(42 * 60);
    expect(segundosNaTela(undefined, T0, ms(MAX_MINUTOS_BRUTOS + 1))).toBeNull();
    expect(segundosNaTela(undefined, T0, ms(-5))).toBe(0);
    expect(segundosNaTela(undefined, "ilegível", ms(5))).toBeNull();
  });

  it("o cabeçalho da sessão usa a função (nunca agora − início)", () => {
    const src = read("app/(painel)/sessao/page.tsx");
    expect(src).toContain("segundosNaTela(tempo.current, draft.session.startedAt, now)");
    expect(src).not.toMatch(/now - new Date\(draft\.session\.startedAt\)/);
  });
});

describe("completudeLinha: o mesmo texto na tela e no link (R3-4 item 2)", () => {
  const ex6x4 = (feitas: number) => [ex("a", "supino_reto_barra", [...Array.from({ length: feitas }, () => feita(40, 10)), ...Array.from({ length: 4 - feitas }, vazia)])];

  it("aceite: plannedSets 24 com 1 feita → '1 de 24 séries (parcial)'; 23 de 24 → sem 'parcial'", () => {
    expect(completudeLinha(sessao(ex6x4(1), { plannedSets: 24 }))).toBe("1 de 24 séries (parcial)");
    const quase = sessao(Array.from({ length: 6 }, (_, i) => ex(`e${i}`, "supino_reto_barra", i === 0 ? [feita(40, 10), feita(40, 10), feita(40, 10), vazia()] : [feita(40, 10), feita(40, 10), feita(40, 10), feita(40, 10)])), { plannedSets: 24 });
    expect(completudeLinha(quase)).toBe("23 de 24 séries");
  });

  it("aceite: sessão sem plannedSets → nenhum número nem rótulo", () => {
    expect(completudeLinha(sessao(ex6x4(1)))).toBeNull();
  });

  it("transfer.ts reexporta a mesma função (o texto do link e o Histórico nunca divergem)", () => {
    expect(completudeLinhaDoLink).toBe(completudeLinha);
    const s = sessao(ex6x4(1), { plannedSets: 24 });
    expect(sessionToText(s)).toContain(`· ${completudeLinha(s)}`);
  });

  it("Histórico e página do aluno leem duracaoTexto e completudeLinha, nunca fim − início", () => {
    for (const rel of ["components/views/history-view.tsx", "app/(painel)/alunos/[id]/page.tsx"]) {
      const src = read(rel);
      expect(src, rel).toContain("duracaoTexto(duracaoDoTreino(");
      expect(src, rel).toContain("completudeLinha(");
      expect(src, rel).not.toMatch(/finishedAt\)\.getTime\(\) - new Date\(/);
    }
  });
});

describe("ficaNoTreino e resumoParaGuardar (R3-7 no resumo final)", () => {
  it("fica: com série feita ou com dor marcada; sai: sem série feita e sem dor", () => {
    expect(ficaNoTreino({ sets: [feita(40, 10)] })).toBe(true);
    expect(ficaNoTreino({ sets: [vazia()], pain: true })).toBe(true);
    expect(ficaNoTreino({ sets: [vazia()] })).toBe(false);
    expect(ficaNoTreino({ sets: [{ loadKg: 40, reps: 0, done: true }] })).toBe(false);
  });

  it("dor desmarcada no resumo num exercício que só estava ali pela dor: ele sai do que é gravado e enviado", () => {
    const s = sessao([ex("a", "supino_reto_barra", [feita(40, 10)]), ex("b", "remada_curvada", [vazia()], { pain: true })]);
    expect(resumoParaGuardar(s)).toBe(s);
    const desmarcada = marcarDor(s, "b", false);
    expect(resumoParaGuardar(desmarcada).exercises.map((e) => e.uid)).toEqual(["a"]);
    // marcar de novo traz de volta (a tela guarda o exercício)
    expect(resumoParaGuardar(marcarDor(desmarcada, "b", true)).exercises.map((e) => e.uid)).toEqual(["a", "b"]);
  });

  it("o resumo grava e envia pela função (persist e SendToCoach)", () => {
    const src = read("app/(painel)/sessao/page.tsx");
    expect(src).toContain("...resumoParaGuardar(latest.current.session)");
    expect(src).toContain("sessions={[{ ...resumoParaGuardar(cur), feeling, note: note || undefined }]}");
  });
});

describe("textos de dor da tela (R3-7, comportamento do adendo)", () => {
  const todos = [PAIN_MARKED_NOTE, painSummaryNote(["Supino reto com barra"], null), painSummaryNote(["Supino", "Remada"], null), painSummaryNote(["Supino"], "Rafael")];

  it("nenhum texto sugere carga: sem 'Manter', sem 'aument', sem número de carga", () => {
    for (const t of todos) {
      expect(t).not.toMatch(/manter/i);
      expect(t).not.toMatch(/aument/i);
      expect(t).not.toMatch(/\bkg\b/);
    }
  });

  it("sem culpa e sem orientação nova: diz o que muda (a próxima sugestão)", () => {
    for (const t of todos) {
      expect(t).not.toMatch(/deveria|culpa|cuidado|grave|médic/i);
      expect(t).toMatch(/sem sugestão de carga/);
    }
  });

  it("um exercício diz o nome; vários dizem quantos; com personal, avisa que vai na mensagem", () => {
    expect(painSummaryNote(["Supino reto com barra"], null)).toBe("Dor marcada em Supino reto com barra. Na próxima vez, ele começa sem sugestão de carga.");
    expect(painSummaryNote(["Supino", "Remada"], null)).toBe("Dor marcada em 2 exercícios. Na próxima vez, eles começam sem sugestão de carga.");
    expect(painSummaryNote(["Supino"], "Rafael")).toMatch(/A marca aparece na mensagem para Rafael\.$/);
  });

  it("placeholder da anotação sem dor (a dor tem botão próprio; o motor não lê o texto)", () => {
    const src = read("app/(painel)/sessao/page.tsx");
    expect(src).toContain('placeholder="Ex.: pegada mais aberta, banco na posição 4"');
    expect(src).not.toMatch(/placeholder="[^"]*dor[^"]*"/i);
  });

  it("'Senti dor' na sessão e no resumo é caixa de marcar com nome acessível e sem nenhum track()", () => {
    const src = read("app/(painel)/sessao/page.tsx");
    expect(src.match(/role="checkbox"/g)?.length ?? 0).toBeGreaterThanOrEqual(3); // série, "Senti dor" na sessão, chips do resumo
    expect(src).toContain("Senti dor em algum exercício");
    // Nenhuma chamada de track() perto de marcarDor/togglePain.
    for (const m of src.matchAll(/(togglePain|marcarDor)\([^)]*\)[^\n]*/g)) expect(m[0]).not.toContain("track(");
    expect(src).not.toMatch(/track\([^)]*(pain|dor)/i);
  });
});

describe("swapInDraft: 'Senti dor' não passa para o exercício substituto", () => {
  it("marcar dor e trocar o exercício (sem série feita): o substituto começa sem a marca", () => {
    const program: Program = {
      id: "p1",
      userId: "u",
      name: "Ficha",
      createdBy: "u",
      active: true,
      daysPerWeek: 3,
      durationWeeks: 8,
      createdAt: T0,
      updatedAt: T0,
      days: [{ key: "A", title: "Peito", exercises: [{ exerciseId: "supino_reto_barra", sets: 3, repsMin: 8, repsMax: 12, restSec: 90, loadKg: null }] }],
    } as unknown as Program;
    const d0 = buildDraft("u", program, "A", []);
    const uid = d0.session.exercises[0]!.uid;
    const d1: WorkoutDraft = { ...d0, session: marcarDor(d0.session, uid, true) };
    expect(d1.session.exercises[0]!.pain).toBe(true);
    const d2 = swapInDraft(d1, uid, { id: "supino_reto_halter", name: "Supino reto com halteres", compound: true }, []);
    expect(d2.session.exercises[0]!.exerciseId).toBe("supino_reto_halter");
    expect("pain" in d2.session.exercises[0]!).toBe(false);
  });

  it("a marca de dor sobrevive a recarregar a página (rascunho gravado e lido)", () => {
    const d = { session: sessao([ex("a", "supino_reto_barra", [vazia()], { pain: true })]), suggestions: {}, restSec: {} };
    expect(parseDraft(JSON.stringify(d))!.session.exercises[0]!.pain).toBe(true);
  });
});

describe("meta da semana na página do aluno (R3-16 + E2-meta-snapshot)", () => {
  it("'de {meta}' e as casas vazias só em 'Esta semana'; a meta vem de weeklyGoal (ficha ativa, senão cadastro)", () => {
    const src = read("app/(painel)/alunos/[id]/page.tsx");
    expect(src).toContain("weeklyGoal(active?.daysPerWeek, student.daysPerWeek)");
    expect(src).toContain("{target && current ? ` de ${target}` : \"\"}");
    expect(src).toContain("Math.max(current ? target : 0, w.count, 1)");
  });
});

describe("relatório (R3-15, E2-meta-snapshot) na tela", () => {
  it("a folha mostra a nota da meta atual e os rótulos de 'recebidos' pela função", () => {
    const src = read("components/views/report-view.tsx");
    expect(src).toContain("reportGoalNote(r)");
    expect(src).toContain("reportLabels(r)");
    expect(src).not.toContain('"Treinos feitos"');
    expect(src).toContain("Nenhum treino recebido nem avaliação");
  });
});
