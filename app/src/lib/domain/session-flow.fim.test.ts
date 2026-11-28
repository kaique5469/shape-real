import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALLOWED_PROPS } from "@/lib/analytics-props";
import { marcarDor, sessaoParaSalvar } from "./session-flow";
import { activeMinutes, completude, iniciarTempo, registrarAtividade } from "./session-time";
import { volumeDaSessao } from "./progression";
import type { ExerciseLog, Session, SetLog } from "./types";

/**
 * Rodada 3, trilha S: o que o "Finalizar" grava (R3-4: séries planejadas antes do filtro, minutos ativos; R3-7: dor;
 * R3-6 B: volume pela convenção única). Dados fictícios.
 */
const T0 = "2026-11-25T18:00:00.000Z";
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000);
const feita = (loadKg: number | null, reps: number): SetLog => ({ loadKg, reps, done: true });
const vazia = (): SetLog => ({ loadKg: 40, reps: null, done: false });
const ex = (uid: string, exerciseId: string, sets: SetLog[], extra: Partial<ExerciseLog> = {}): ExerciseLog => ({ uid, exerciseId, name: exerciseId, sets, ...extra });
const rascunho = (exercises: ExerciseLog[], extra: Partial<Session> = {}): Session => ({ id: "s1", userId: "u", programId: "p1", dayKey: "B", startedAt: T0, exercises, volumeKg: 0, prs: [], ...extra });

describe("sessaoParaSalvar: séries planejadas antes do filtro (R3-4 item 1)", () => {
  it("aceite (QA-12): 6 exercícios × 4 séries com 1 série feita → plannedSets 24, e o filtro tira os 5 sem série", () => {
    const exercises = Array.from({ length: 6 }, (_, i) => ex(`e${i}`, "supino_reto_barra", i === 0 ? [feita(40, 10), vazia(), vazia(), vazia()] : [vazia(), vazia(), vazia(), vazia()]));
    const s = sessaoParaSalvar(rascunho(exercises), { agora: at(20) })!;
    expect(s.plannedSets).toBe(24);
    expect(s.exercises).toHaveLength(1);
    expect(completude(s)).toEqual({ feitas: 1, planejadas: 24, texto: "1 de 24 séries", parcial: true });
  });

  it("série acrescentada ou tirada no treino entra na conta (o que estava no treino na hora de finalizar)", () => {
    const s = sessaoParaSalvar(rascunho([ex("a", "supino_reto_barra", [feita(40, 10), feita(40, 10), feita(40, 10), feita(40, 10), feita(40, 8)])]), { agora: at(20) })!;
    expect(s.plannedSets).toBe(5);
    expect(completude(s).texto).toBeNull();
  });

  it("nenhuma série feita: null (a tela pede para marcar uma); nada é gravado", () => {
    expect(sessaoParaSalvar(rascunho([ex("a", "supino_reto_barra", [vazia(), vazia()])]), { agora: at(20) })).toBeNull();
    expect(sessaoParaSalvar(rascunho([]), { agora: at(20) })).toBeNull();
    // Só dor, sem série feita em nenhum exercício: também não vira treino.
    expect(sessaoParaSalvar(rascunho([ex("a", "supino_reto_barra", [vazia()], { pain: true })]), { agora: at(20) })).toBeNull();
  });

  it("finishedAt é o toque em Finalizar; id, ficha e dia do rascunho ficam", () => {
    const s = sessaoParaSalvar(rascunho([ex("a", "supino_reto_barra", [feita(40, 10)])]), { agora: at(42) })!;
    expect(s).toMatchObject({ id: "s1", programId: "p1", dayKey: "B", startedAt: T0, finishedAt: at(42).toISOString() });
  });
});

describe("sessaoParaSalvar: minutos ativos (R3-4)", () => {
  it("com o relógio do rascunho: 30 min ativos + 8 h parado antes de finalizar = 30", () => {
    let tempo = iniciarTempo(T0);
    for (const m of [10, 20, 30]) tempo = registrarAtividade(tempo, at(m).getTime()).tempo;
    const s = sessaoParaSalvar(rascunho([ex("a", "supino_reto_barra", [feita(40, 10)])]), { agora: at(30 + 8 * 60), tempo })!;
    expect(s.activeMin).toBe(30);
    expect(activeMinutes(s)).toBe(30);
  });

  it("rascunho antigo sem relógio: sem activeMin (vale a duração registrada até 180 min, nunca inventada)", () => {
    const curto = sessaoParaSalvar(rascunho([ex("a", "supino_reto_barra", [feita(40, 10)])]), { agora: at(55) })!;
    expect(curto).not.toHaveProperty("activeMin");
    expect(activeMinutes(curto)).toBe(55);
    const longo = sessaoParaSalvar(rascunho([ex("a", "supino_reto_barra", [feita(40, 10)])]), { agora: at(26 * 60) })!;
    expect(activeMinutes(longo)).toBeNull();
  });

  it("um activeMin ou ajuste que veio no rascunho por engano não sobrevive: o fim do treino recalcula", () => {
    const s = sessaoParaSalvar(rascunho([ex("a", "supino_reto_barra", [feita(40, 10)])], { activeMin: 999, activeEdited: true }), { agora: at(20) })!;
    expect(s).not.toHaveProperty("activeMin");
    expect(s).not.toHaveProperty("activeEdited");
  });
});

describe("sessaoParaSalvar: dor (R3-7) e volume (R3-6 B)", () => {
  it("exercício com 'Senti dor' fica mesmo sem série feita; sem dor e sem série sai", () => {
    const s = sessaoParaSalvar(rascunho([ex("a", "supino_reto_barra", [feita(40, 10)]), ex("b", "desenvolvimento_halter", [vazia(), vazia()], { pain: true }), ex("c", "remada_curvada_barra", [vazia()])]), { agora: at(30) })!;
    expect(s.exercises.map((e) => e.uid)).toEqual(["a", "b"]);
    expect(s.exercises[1]!.pain).toBe(true);
    expect(s.plannedSets).toBe(4);
  });

  it("volumeKg (cache) pela convenção única: assistida e série por tempo fora", () => {
    const s = sessaoParaSalvar(
      rascunho([ex("a", "supino_reto_barra", [feita(40, 10), feita(40, 10), feita(40, 10)]), ex("b", "prancha", [feita(10, 60)], { unit: "seg" }), ex("c", "barra_fixa_assistida", [feita(40, 8)])]),
      { agora: at(30) },
    )!;
    expect(s.volumeKg).toBe(1200);
    expect(s.volumeKg).toBe(volumeDaSessao(s));
  });
});

describe("marcarDor", () => {
  const base = rascunho([ex("a", "supino_reto_barra", [feita(40, 10)]), ex("b", "remada_curvada_barra", [feita(40, 10)])]);

  it("marca só o exercício tocado; os outros ficam iguais (mesmo objeto)", () => {
    const out = marcarDor(base, "a", true);
    expect(out.exercises[0]!.pain).toBe(true);
    expect(out.exercises[1]).toBe(base.exercises[1]);
    expect(base.exercises[0]).not.toHaveProperty("pain");
  });

  it("desmarcar tira o campo (igual a quem nunca marcou)", () => {
    const back = marcarDor(marcarDor(base, "a", true), "a", false);
    expect(back.exercises[0]).toEqual(base.exercises[0]);
    expect(back.exercises[0]).not.toHaveProperty("pain");
  });

  it("sem mudança ou uid inexistente: a mesma sessão", () => {
    expect(marcarDor(base, "a", false)).toBe(base);
    expect(marcarDor(base, "x", true)).toBe(base);
    const marcada = marcarDor(base, "a", true);
    expect(marcarDor(marcada, "a", true)).toBe(marcada);
  });
});

describe("workout_completed na tela do treino (R3-4, R3-7)", () => {
  const fonte = readFileSync(path.resolve(__dirname, "../../app/(painel)/sessao/page.tsx"), "utf8");
  const ini = fonte.indexOf('track("workout_completed"');
  const bloco = fonte.slice(ini, fonte.indexOf("});", ini));

  it("leva a faixa de minutos ATIVOS (minutos_ativos), nunca a duração bruta (minutes)", () => {
    expect(ini).toBeGreaterThan(0);
    expect(bloco).not.toMatch(/\bminutes\s*:/);
    expect(bloco).toContain("...tempoAtivo");
    expect(fonte).toMatch(/const tempoAtivo: WorkoutCompletedExtra = \{ minutos_ativos: faixaMinutosAtivos\(activeMinutes\(s\)\) \};/);
  });

  it("aceite: nenhuma chave de dor no evento (nem na chamada, nem na lista permitida)", () => {
    expect(bloco).not.toMatch(/pain|dor/i);
    expect((ALLOWED_PROPS.workout_completed as readonly string[]).some((k) => /pain|dor/i.test(k))).toBe(false);
  });
});
