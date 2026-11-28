import { describe, expect, it } from "vitest";
import { sessionVolume, volumeDaSessao, volumeElegivel } from "./progression";
import type { ExerciseLog, SetLog } from "./types";

/**
 * Rodada 3, Fundação (R3-6 B): a convenção única do volume. O teste de paridade entre tela, CSV, relatório e link é da
 * trilha S (volume-paridade.test.ts); aqui só a função e os casos de regressão do adendo.
 */
const feita = (loadKg: number | null, reps: number | null): SetLog => ({ loadKg, reps, done: true });
const log = (exerciseId: string, sets: SetLog[], unit?: ExerciseLog["unit"]): ExerciseLog => ({ uid: exerciseId, exerciseId, name: exerciseId, sets, ...(unit ? { unit } : {}) });

const supino = log("supino_reto_barra", [feita(40, 10), feita(40, 10), feita(40, 10)]);
const pranchaSeg = log("prancha", [feita(10, 60), feita(10, 60), feita(10, 60)], "seg");
const assistida = log("barra_fixa_assistida", [feita(40, 8), feita(40, 8), feita(40, 8)]);

describe("volumeElegivel / volumeDaSessao (R3-6 B)", () => {
  it("supino 3×10×40 + prancha 3×60 s com 10 kg + barra assistida = 1.200 kg", () => {
    expect(volumeDaSessao({ exercises: [supino, pranchaSeg, assistida] })).toBe(1200);
  });

  it("série por tempo não conta, mesmo sem unit gravada (vale a unidade do exercício, como na tela)", () => {
    const pranchaSemUnit = log("prancha", [feita(10, 60)]);
    expect(volumeElegivel(pranchaSemUnit, pranchaSemUnit.sets[0]!)).toBe(0);
    // A função antiga lia `ex.unit ?? "reps"` e contava 600. Agora `sessionVolume` delega a `volumeDaSessao` (convenção
    // única, trilha S): a mesma unidade da tela, 0.
    expect(sessionVolume({ exercises: [pranchaSemUnit] })).toBe(0);
  });

  it("máquina assistida: a carga é ajuda, volume 0", () => {
    expect(volumeElegivel(assistida, assistida.sets[0]!)).toBe(0);
  });

  it("unilateral: a carga registrada (por lado), sem dobrar", () => {
    const serrote = log("remada_unilateral_halter", [feita(20, 10)]);
    expect(volumeDaSessao({ exercises: [serrote] })).toBe(200);
  });

  it("peso corporal e elástico sem carga numérica: 0; com carga extra, carga × reps", () => {
    expect(volumeElegivel(log("flexao", []), feita(null, 12))).toBe(0);
    expect(volumeElegivel(log("flexao", []), feita(0, 12))).toBe(0);
    expect(volumeElegivel(log("flexao", []), feita(10, 12))).toBe(120);
  });

  it("exercício próprio sem unidade conta como reps", () => {
    expect(volumeElegivel(log("custom_meu_exercicio", []), feita(15, 10))).toBe(150);
    expect(volumeElegivel(log("custom_meu_exercicio", [], "min"), feita(15, 10))).toBe(0);
  });

  it("série não concluída, sem reps ou com carga inválida não gera volume", () => {
    const ex = log("supino_reto_barra", []);
    expect(volumeElegivel(ex, { loadKg: 40, reps: 10, done: false })).toBe(0);
    expect(volumeElegivel(ex, feita(40, null))).toBe(0);
    expect(volumeElegivel(ex, feita(40, 0))).toBe(0);
    expect(volumeElegivel(ex, feita(-5, 10))).toBe(0);
    expect(volumeElegivel(ex, feita(Number.NaN, 10))).toBe(0);
  });

  it("volumeDaSessao ignora o volumeKg gravado (cache com a convenção antiga)", () => {
    const antiga = { exercises: [supino, assistida], volumeKg: 2160 };
    expect(volumeDaSessao(antiga)).toBe(1200);
  });

  it("carga decimal arredonda só no total", () => {
    const ex = log("supino_reto_barra", [feita(42.5, 10), feita(42.5, 9)]);
    expect(volumeDaSessao({ exercises: [ex] })).toBe(808);
  });
});
