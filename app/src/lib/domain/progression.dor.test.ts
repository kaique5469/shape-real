import { describe, expect, it } from "vitest";
import { isPainSuggestion, painOnLastSession, PAIN_SUGGESTION_TEXT, suggestFromHistory, suggestNext } from "./progression";
import type { ExerciseLog, Session, SetLog } from "./types";

/**
 * Rodada 3, trilha S (R3-7, comportamento do adendo do estudo 2): com "Senti dor" marcado na última sessão do
 * exercício, nenhuma sugestão de carga (nem "manter", nem aumento). Dados fictícios.
 */
const feita = (loadKg: number | null, reps: number): SetLog => ({ loadKg, reps, done: true });
const log = (exerciseId: string, sets: SetLog[], extra: Partial<ExerciseLog> = {}): ExerciseLog => ({ uid: `${exerciseId}-${Math.random()}`, exerciseId, name: exerciseId, sets, ...extra });
let n = 0;
const session = (startedAt: string, exercises: ExerciseLog[]): Session => ({ id: `s${n++}`, userId: "u", startedAt, finishedAt: startedAt, exercises, volumeKg: 0, prs: [] });
const plano = { sets: 3, repsMin: 8, repsMax: 12 };
const fechou = () => [feita(40, 12), feita(40, 12), feita(40, 12)];
const NOW = new Date("2026-11-27T12:00:00Z");

describe("suggestNext com dor (R3-7)", () => {
  it("aceite: dor no supino da última vez → kind dor, loadKg null, texto sem 'Manter' nem 'aument'", () => {
    const s = suggestNext(log("supino_reto_barra", fechou(), { pain: true }), plano, "supino_reto_barra");
    expect(s).toEqual({ kind: "dor", loadKg: null, text: PAIN_SUGGESTION_TEXT });
    expect(s.text).not.toMatch(/Manter/i);
    expect(s.text).not.toMatch(/aument/i);
    expect(s.text).not.toMatch(/\d/);
    expect(isPainSuggestion(s)).toBe(true);
  });

  it("texto: suspende a carga e manda parar e falar com o personal ou um profissional de saúde", () => {
    expect(PAIN_SUGGESTION_TEXT).toBe(
      "Sem sugestão de carga hoje: você marcou dor neste exercício da última vez. Se a dor aparecer, pare este exercício e fale com seu personal ou um profissional de saúde.",
    );
  });

  it("a dor vence todas as outras regras: retorno após pausa, faixa nova, assistida, tempo e minutos", () => {
    const comDor = (id: string, sets: SetLog[], unit?: ExerciseLog["unit"]) => log(id, sets, { pain: true, ...(unit ? { unit } : {}) });
    expect(suggestNext(comDor("supino_reto_barra", fechou()), plano, "supino_reto_barra", { lastAt: "2026-09-01T10:00:00Z", now: NOW }).kind).toBe("dor");
    expect(suggestNext({ ...comDor("supino_reto_barra", fechou()), planned: { sets: 3, repsMin: 3, repsMax: 5 } }, plano, "supino_reto_barra").kind).toBe("dor");
    expect(suggestNext(comDor("barra_fixa_assistida", [feita(30, 12), feita(30, 12), feita(30, 12)]), plano, "barra_fixa_assistida").kind).toBe("dor");
    expect(suggestNext(comDor("prancha", [feita(null, 45)], "seg"), { ...plano, repsMin: 30, repsMax: 45, unit: "seg" }, "prancha").kind).toBe("dor");
    expect(suggestNext(comDor("esteira", [feita(null, 20)], "min"), { sets: 1, repsMin: 20, repsMax: 20, unit: "min" }, "esteira").kind).toBe("dor");
  });

  it("negativo: sem dor, a sugestão é a de sempre (fechou o topo → aumentar)", () => {
    const sem = suggestNext(log("supino_reto_barra", fechou()), plano, "supino_reto_barra");
    expect(sem).toMatchObject({ kind: "aumentar", loadKg: 42.5 });
    // `pain: false` (desmarcado) é igual a nunca ter marcado.
    expect(suggestNext(log("supino_reto_barra", fechou(), { pain: false }), plano, "supino_reto_barra")).toEqual(sem);
  });
});

describe("suggestFromHistory com dor (última sessão do exercício)", () => {
  it("dor na última sessão → dor; a carga anterior não vira sugestão", () => {
    const hist = [session("2026-11-20T10:00:00Z", [log("supino_reto_barra", fechou())]), session("2026-11-24T10:00:00Z", [log("supino_reto_barra", fechou(), { pain: true })])];
    expect(suggestFromHistory(hist, plano, "supino_reto_barra", NOW)).toMatchObject({ kind: "dor", loadKg: null });
  });

  it("parou o exercício por causa da dor (registro só com a dor, sem série feita): ainda é dor", () => {
    const parou = log("supino_reto_barra", [{ loadKg: 40, reps: null, done: false }], { pain: true });
    const hist = [session("2026-11-20T10:00:00Z", [log("supino_reto_barra", fechou())]), session("2026-11-24T10:00:00Z", [parou])];
    expect(painOnLastSession(hist, "supino_reto_barra")).toBe(true);
    expect(suggestFromHistory(hist, plano, "supino_reto_barra", NOW).kind).toBe("dor");
  });

  it("dor numa sessão anterior, e a última sem dor: volta a sugestão de sempre", () => {
    const hist = [session("2026-11-20T10:00:00Z", [log("supino_reto_barra", fechou(), { pain: true })]), session("2026-11-24T10:00:00Z", [log("supino_reto_barra", fechou())])];
    expect(suggestFromHistory(hist, plano, "supino_reto_barra", NOW).kind).toBe("aumentar");
  });

  it("aceite: dor em outro exercício não afeta este", () => {
    const hist = [session("2026-11-24T10:00:00Z", [log("supino_reto_barra", fechou()), log("desenvolvimento_halter", [feita(14, 10)], { pain: true })])];
    expect(suggestFromHistory(hist, plano, "supino_reto_barra", NOW).kind).toBe("aumentar");
    expect(suggestFromHistory(hist, plano, "desenvolvimento_halter", NOW).kind).toBe("dor");
  });

  it("a ordem do array não importa (vale a data do treino)", () => {
    const hist = [session("2026-11-24T10:00:00Z", [log("supino_reto_barra", fechou(), { pain: true })]), session("2026-11-20T10:00:00Z", [log("supino_reto_barra", fechou())])];
    expect(suggestFromHistory(hist, plano, "supino_reto_barra", NOW).kind).toBe("dor");
  });

  it("sessão com o exercício duas vezes: dor em qualquer um dos registros conta", () => {
    const hist = [session("2026-11-24T10:00:00Z", [log("supino_reto_barra", fechou()), log("supino_reto_barra", [feita(40, 8)], { pain: true })])];
    expect(painOnLastSession(hist, "supino_reto_barra")).toBe(true);
  });

  it("sem histórico: primeira vez (nada muda)", () => {
    expect(painOnLastSession([], "supino_reto_barra")).toBe(false);
    expect(suggestFromHistory([], plano, "supino_reto_barra", NOW).kind).toBe("primeira");
  });
});
