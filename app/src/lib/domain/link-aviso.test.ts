import { describe, expect, it } from "vitest";
import type { Profile, Program } from "./types";
import { avisoDoLink, oQueVaiNaFicha, oQueVaiNosTreinos } from "./link-aviso";
import { buildFichaPacket, buildTreinosPacket } from "./transfer";

// R3-17: o envio da ficha diz o que vai no link. Dados fictícios.

const coach: Profile = { id: "c1", name: "Rafael Nunes", role: "coach", plan: "coach", onboarded: true, createdAt: "2026-01-01T00:00:00Z" };
const aluna: Profile = { id: "s1", name: "Marina Costa", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-01-02T00:00:00Z", managedBy: "c1" };
const program: Program = {
  id: "p1",
  ownerId: "s1",
  createdBy: "c1",
  name: "ABC",
  system: "abc",
  goal: "hipertrofia",
  level: "intermediario",
  daysPerWeek: 3,
  days: [{ key: "A", title: "A", focus: ["peito"], exercises: [{ uid: "u1", exerciseId: "supino_reto_barra", name: "Supino", sets: 3, repsMin: 8, repsMax: 10, restSec: 90, loadKg: 40, technique: "normal" }] }],
  active: true,
  source: "personal",
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
};
const diet = { id: "d1", ownerId: "s1", createdBy: "c1", name: "Plano", targets: { kcal: 1650, proteinG: 120, carbsG: 180, fatG: 50 }, meals: [], updatedAt: "2026-11-02T10:00:00Z" };
const ficha = (student: Profile, withDiet = true) => buildFichaPacket({ coach, student, program, diet: withDiet ? diet : null, customExercises: [], customFoods: [] });
const SEGURO = /\b(segur[oa]s?|protegid[oa]s?|criptografad[oa]s?)\b/i;

describe("avisoDoLink", () => {
  it("pacote com peso, altura e limitações: o texto do adendo, citando esses dados", () => {
    const pk = ficha({ ...aluna, weightKg: 62, heightCm: 165, limitations: "joelho direito" });
    expect(avisoDoLink({ ...oQueVaiNaFicha(pk), aluno: aluna.name })).toBe("O link leva a ficha e a dieta e o peso, a altura e as limitações de Marina. Quem tiver o link consegue ler: mande só para Marina.");
  });

  it("só o peso: cita só o peso; nenhuma limitação vazia é citada", () => {
    const pk = ficha({ ...aluna, weightKg: 62, limitations: "  " });
    expect(oQueVaiNaFicha(pk).saude).toEqual(["peso"]);
    expect(avisoDoLink({ ...oQueVaiNaFicha(pk), aluno: aluna.name })).toBe("O link leva a ficha e a dieta e o peso de Marina. Quem tiver o link consegue ler: mande só para Marina.");
  });

  it("pacote sem dado de saúde: aviso sem essa parte", () => {
    const pk = ficha(aluna, false);
    expect(oQueVaiNaFicha(pk)).toEqual({ leva: ["ficha"], saude: [] });
    expect(avisoDoLink({ ...oQueVaiNaFicha(pk), aluno: aluna.name })).toBe("O link leva a ficha de Marina. Quem tiver o link consegue ler: mande só para Marina.");
  });

  it("treinos do aluno para o personal: segunda pessoa, com as medidas quando vão", () => {
    const sess = { id: "t1", userId: "a", startedAt: "2026-11-05T18:00:00Z", exercises: [], volumeKg: 0, prs: [] };
    const comMedidas = buildTreinosPacket({ student: aluna, coachId: "c1", studentRef: "s1", sessions: [sess], metrics: [{ id: "m1", userId: "a", date: "2026-11-05", weightKg: 62 }] });
    expect(avisoDoLink({ ...oQueVaiNosTreinos(comMedidas), aluno: null, para: "Rafael Nunes" })).toBe("O link leva seus treinos e suas medidas. Quem tiver o link consegue ler: mande só para Rafael.");
    const sem = buildTreinosPacket({ student: aluna, coachId: "c1", studentRef: "s1", sessions: [sess] });
    expect(avisoDoLink({ ...oQueVaiNosTreinos(sem), aluno: null, para: "Rafael Nunes" })).toBe("O link leva seus treinos. Quem tiver o link consegue ler: mande só para Rafael.");
  });

  it("nada a levar: só o aviso de leitura; sem destinatário: 'não encaminhe'", () => {
    expect(avisoDoLink({ leva: [], saude: [], aluno: "Marina Costa" })).toBe("Quem tiver o link consegue ler: mande só para Marina.");
    expect(avisoDoLink({ leva: ["treinos"], saude: [], aluno: null })).toBe("O link leva seus treinos. Quem tiver o link consegue ler: não encaminhe.");
  });

  it("a ordem do texto não depende da ordem da entrada", () => {
    expect(avisoDoLink({ leva: ["dieta", "ficha"], saude: ["limitacoes", "peso"], aluno: "Marina" })).toBe("O link leva a ficha e a dieta e o peso e as limitações de Marina. Quem tiver o link consegue ler: mande só para Marina.");
  });

  it("teste negativo: nenhum texto chama o link de seguro, protegido ou criptografado", () => {
    const casos = [
      avisoDoLink({ leva: ["ficha", "dieta"], saude: ["peso", "altura", "limitacoes"], aluno: "Marina" }),
      avisoDoLink({ leva: ["treinos", "medidas"], saude: [], aluno: null, para: "Rafael" }),
      avisoDoLink({ leva: [], saude: [], aluno: null }),
    ];
    for (const t of casos) {
      expect(t).toMatch(/Quem tiver o link consegue ler/);
      expect(t).not.toMatch(SEGURO);
    }
  });

  it("teste negativo: o pacote não muda (o aviso só lê)", () => {
    const pk = ficha({ ...aluna, weightKg: 62 });
    const antes = JSON.stringify(pk);
    avisoDoLink({ ...oQueVaiNaFicha(pk), aluno: aluna.name });
    expect(JSON.stringify(pk)).toBe(antes);
  });

  it("cabe a 360 px sem palavra gigante (nenhuma palavra passa de 20 caracteres)", () => {
    const t = avisoDoLink({ leva: ["ficha", "dieta"], saude: ["peso", "altura", "limitacoes"], aluno: "Maria Aparecida dos Santos" });
    for (const w of t.split(/\s+/)) expect(w.length).toBeLessThanOrEqual(20);
  });
});
