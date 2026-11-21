"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Dialog, Field, Input, Select, Textarea } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { GOAL_LABEL, LEVEL_LABEL } from "@/lib/domain/generator";
import { ACTIVITY_LABEL } from "@/lib/domain/nutrition";
import { track } from "@/lib/analytics";
import type { ActivityLevel, Equipment, Goal, Level, Profile, Sex, StudentDraft } from "@/lib/domain/types";

/** "(11) 91234-5678" enquanto digita; guardamos só os dígitos. */
export function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

interface FormState {
  name: string;
  phone: string;
  goal: Goal | "";
  level: Level | "";
  daysPerWeek: string;
  sessionMinutes: string;
  equipment: Equipment | "";
  limitations: string;
  sex: Sex | "";
  birthYear: string;
  heightCm: string;
  weightKg: string;
  activity: ActivityLevel | "";
  coachNotes: string;
}

function initial(s?: Profile | null): FormState {
  return {
    name: s?.name ?? "",
    phone: maskPhone(s?.phone ?? ""),
    goal: s?.goal ?? "hipertrofia",
    level: s?.level ?? "iniciante",
    daysPerWeek: String(s?.daysPerWeek ?? 3),
    sessionMinutes: String(s?.sessionMinutes ?? 60),
    equipment: s?.equipment ?? "academia",
    limitations: s?.limitations ?? "",
    sex: s?.sex ?? "",
    birthYear: s?.birthYear ? String(s.birthYear) : "",
    heightCm: s?.heightCm ? String(s.heightCm) : "",
    weightKg: s?.weightKg ? String(s.weightKg).replace(".", ",") : "",
    activity: s?.activity ?? "",
    coachNotes: s?.coachNotes ?? "",
  };
}

const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return v.trim() && Number.isFinite(n) ? n : undefined;
};

/**
 * Cadastro e edição do aluno pelo personal (anamnese básica).
 * Só o nome é obrigatório: o resto melhora a ficha e as metas da dieta.
 */
export function StudentForm({ open, onClose, student, onSaved }: { open: boolean; onClose: () => void; student?: Profile | null; onSaved: (p: Profile, created: boolean) => void }) {
  const { user, repo } = useApp();
  const [f, setF] = useState<FormState>(() => initial(student));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setF(initial(student));
      setErrors({});
      setErr(null);
    }
  }, [open, student]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  function validate(): StudentDraft | null {
    const e: Partial<Record<keyof FormState, string>> = {};
    const name = f.name.trim();
    if (name.length < 2) e.name = "Informe o nome do aluno.";
    const digits = f.phone.replace(/\D/g, "");
    if (digits && digits.length < 10) e.phone = "Inclua o DDD. Ex.: (11) 91234-5678.";
    const year = num(f.birthYear);
    const thisYear = new Date().getFullYear();
    if (year !== undefined && (year < thisYear - 100 || year > thisYear - 10)) e.birthYear = "Ano de nascimento inválido.";
    const h = num(f.heightCm);
    if (h !== undefined && (h < 120 || h > 230)) e.heightCm = "Altura em centímetros. Ex.: 172.";
    const w = num(f.weightKg);
    if (w !== undefined && (w < 30 || w > 300)) e.weightKg = "Peso em quilos. Ex.: 72,5.";
    setErrors(e);
    if (Object.keys(e).length) return null;
    return {
      name,
      phone: digits || undefined,
      goal: f.goal || undefined,
      level: f.level || undefined,
      daysPerWeek: num(f.daysPerWeek),
      sessionMinutes: num(f.sessionMinutes),
      equipment: f.equipment || undefined,
      limitations: f.limitations.trim() || undefined,
      sex: f.sex || undefined,
      birthYear: year,
      heightCm: h,
      weightKg: w,
      activity: f.activity || undefined,
      coachNotes: f.coachNotes.trim() || undefined,
    };
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const draft = validate();
    if (!draft || !user) return;
    setSaving(true);
    setErr(null);
    try {
      if (student) {
        const saved = await repo.saveProfile({ ...student, ...draft });
        onSaved(saved, false);
      } else {
        const created = await repo.createStudent(user.id, draft);
        track("student_created", { has_phone: Boolean(draft.phone), has_body: Boolean(draft.weightKg && draft.heightCm) });
        onSaved(created, true);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={student ? "Dados do aluno" : "Adicionar aluno"} wide>
      <form onSubmit={submit} noValidate className="space-y-6">
        {err ? <Alert tone="error">{err}</Alert> : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Field label="Nome" error={errors.name}>
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" placeholder="Nome e sobrenome" required autoFocus={!student} />
          </Field>
          <Field label="WhatsApp" hint="Opcional. Abre a conversa ao enviar ficha e dieta." error={errors.phone}>
            <Input value={f.phone} onChange={(e) => set("phone", maskPhone(e.target.value))} inputMode="tel" autoComplete="off" placeholder="(11) 91234-5678" />
          </Field>
        </div>

        <fieldset className="space-y-4">
          <legend className="col-head mb-3">Treino</legend>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Objetivo">
              <Select value={f.goal} onChange={(e) => set("goal", e.target.value as Goal)}>
                {(Object.keys(GOAL_LABEL) as Goal[]).map((g) => (
                  <option key={g} value={g}>
                    {GOAL_LABEL[g]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nível">
              <Select value={f.level} onChange={(e) => set("level", e.target.value as Level)}>
                {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Onde treina" className="col-span-2 sm:col-span-1">
              <Select value={f.equipment} onChange={(e) => set("equipment", e.target.value as Equipment)}>
                <option value="academia">Academia</option>
                <option value="home">Em casa (halteres, elástico)</option>
                <option value="peso_corporal">Sem equipamento</option>
              </Select>
            </Field>
            <Field label="Dias por semana">
              <Select value={f.daysPerWeek} onChange={(e) => set("daysPerWeek", e.target.value)}>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {d}x
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tempo por treino">
              <Select value={f.sessionMinutes} onChange={(e) => set("sessionMinutes", e.target.value)}>
                {[30, 45, 60, 75, 90].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Dor, lesão ou limitação" hint="Ex.: condromalácia no joelho direito, hérnia lombar. A ficha gerada evita o que carrega a região.">
            <Textarea value={f.limitations} onChange={(e) => set("limitations", e.target.value)} rows={2} className="min-h-20" placeholder="Deixe em branco se não tiver" />
          </Field>
        </fieldset>

        <fieldset>
          <legend className="col-head mb-1">Medidas</legend>
          <p className="mb-3 text-sm text-steel">Opcional. Com sexo, idade, altura e peso o app calcula as metas de calorias e proteína.</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Sexo">
              <Select value={f.sex} onChange={(e) => set("sex", e.target.value as Sex | "")}>
                <option value="">—</option>
                <option value="F">Feminino</option>
                <option value="M">Masculino</option>
              </Select>
            </Field>
            <Field label="Nascimento" error={errors.birthYear}>
              <Input value={f.birthYear} onChange={(e) => set("birthYear", e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="1994" />
            </Field>
            <Field label="Altura (cm)" error={errors.heightCm}>
              <Input value={f.heightCm} onChange={(e) => set("heightCm", e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="172" />
            </Field>
            <Field label="Peso (kg)" error={errors.weightKg}>
              <Input value={f.weightKg} onChange={(e) => set("weightKg", e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))} inputMode="decimal" placeholder="72,5" />
            </Field>
            <Field label="Rotina fora do treino" className="col-span-2 sm:col-span-4">
              <Select value={f.activity} onChange={(e) => set("activity", e.target.value as ActivityLevel | "")}>
                <option value="">—</option>
                {(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((a) => (
                  <option key={a} value={a}>
                    {ACTIVITY_LABEL[a]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </fieldset>

        <Field label="Suas anotações" hint="Só você vê. Rotina, histórico, combinados, preferências.">
          <Textarea value={f.coachNotes} onChange={(e) => set("coachNotes", e.target.value)} rows={3} className="min-h-24" placeholder="Ex.: treina às 6h, viaja a trabalho uma semana por mês, não gosta de agachamento livre." />
        </Field>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            {student ? "Salvar dados" : "Adicionar aluno"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
