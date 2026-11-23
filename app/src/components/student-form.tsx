"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Dialog, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { GOAL_LABEL, LEVEL_LABEL } from "@/lib/domain/generator";
import { maskPhone } from "@/lib/domain/format";
import { ACTIVITY_LABEL } from "@/lib/domain/nutrition";
import { consentConfirmed, consentFromCheckbox, consentMetric, hasHealthData } from "@/lib/domain/transfer";
import { reportError, track } from "@/lib/analytics";
import type { ActivityLevel, Equipment, Goal, Level, Profile, Sex, StudentDraft } from "@/lib/domain/types";

export { maskPhone };

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
  /** "O aluno autorizou registrar estes dados de saúde" (começa desmarcado em cadastro novo). */
  consent: boolean;
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
    // Data carimbada sozinha por versões anteriores (sem origem) não conta: o checkbox começa desmarcado.
    consent: consentConfirmed(s),
  };
}

const CONSENT_ERROR = "Marque a autorização do aluno para salvar limitações e medidas.";

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

  const formRef = useRef<HTMLFormElement>(null);
  // O que foi digitado só é trocado quando o formulário abre para OUTRO aluno ou depois de salvar:
  // fechar sem querer (toque fora, Esc, voltar do aparelho) e reabrir não apaga a anamnese.
  const shownFor = useRef<string | null>(null);
  const subject = student?.id ?? "novo";

  useEffect(() => {
    if (!open) return;
    if (shownFor.current !== subject) {
      shownFor.current = subject;
      setF(initial(student));
      setErrors({});
    }
    setErr(null);
  }, [open, subject, student]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  /** Campo de saúde: apagar todos tira o aviso da autorização (sem dados de saúde, ela não é exigida). */
  const setHealth = (k: "limitations" | "heightCm" | "weightKg", v: string) => {
    set(k, v);
    if (errors.consent) {
      const next = { ...f, [k]: v };
      if (!hasHealthData({ limitations: next.limitations, weightKg: num(next.weightKg), heightCm: num(next.heightCm) })) setErrors((e) => ({ ...e, consent: undefined }));
    }
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
    // Dados de saúde só com a autorização do aluno registrada; o resto do cadastro não depende dela.
    if (!f.consent && hasHealthData({ limitations: f.limitations, weightKg: w, heightCm: h })) e.consent = CONSENT_ERROR;
    setErrors(e);
    const firstBad = (Object.keys(e) as (keyof FormState)[])[0];
    if (firstBad) {
      // Leva até o primeiro campo com problema: o formulário é mais alto que a tela do celular.
      const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${firstBad}"]`);
      el?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      el?.focus({ preventScroll: true });
      return null;
    }
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
      ...consentFromCheckbox(student, f.consent, "personal", new Date().toISOString()),
    };
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const draft = validate();
    if (!draft || !user) return;
    setSaving(true);
    setErr(null);
    try {
      const consent = consentMetric(draft, Boolean(draft.consentHealthAt));
      if (student) {
        const saved = await repo.saveProfile({ ...student, ...draft });
        // Nada que diga se o aluno tem lesão, peso ou altura: só a situação da autorização.
        track("student_edited", { has_phone: Boolean(draft.phone), consent });
        shownFor.current = null;
        onSaved(saved, false);
      } else {
        const created = await repo.createStudent(user.id, draft);
        track("student_created", { has_phone: Boolean(draft.phone), consent });
        shownFor.current = null;
        onSaved(created, true);
      }
    } catch (e) {
      reportError(e, "aluno:salvar");
      setErr(e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={student ? "Dados do aluno" : "Adicionar aluno"} wide>
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Field label="Nome" error={errors.name}>
            <Input data-field="name" value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" placeholder="Nome e sobrenome" required autoFocus={!student} />
          </Field>
          <Field label="WhatsApp" hint="Opcional. Abre a conversa ao enviar ficha e dieta." error={errors.phone}>
            <Input data-field="phone" value={f.phone} onChange={(e) => set("phone", maskPhone(e.target.value))} inputMode="tel" autoComplete="off" placeholder="(11) 91234-5678" />
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
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="col-head mb-3">Limitações e medidas</legend>
          <div>
            <label className={cx("flex min-h-11 cursor-pointer items-start gap-3 rounded-[8px] border bg-paper p-3 text-[0.9375rem] font-semibold", errors.consent ? "border-plate-red" : "border-rule")}>
              <input
                type="checkbox"
                data-field="consent"
                checked={f.consent}
                onChange={(e) => set("consent", e.target.checked)}
                aria-invalid={Boolean(errors.consent)}
                aria-describedby={errors.consent ? "aluno-autorizacao-erro" : undefined}
                className="mt-0.5 size-5 shrink-0 accent-[var(--color-iron)]"
              />
              <span>O aluno autorizou registrar estes dados de saúde</span>
            </label>
            {errors.consent ? (
              <p id="aluno-autorizacao-erro" className="mt-1 text-sm text-plate-red-ink">
                {errors.consent}
              </p>
            ) : null}
          </div>
          <Field label="Dor, lesão ou limitação" hint="Ex.: condromalácia no joelho direito, hérnia lombar. A ficha gerada evita o que carrega a região.">
            <Textarea value={f.limitations} onChange={(e) => setHealth("limitations", e.target.value)} rows={2} className="min-h-20" placeholder="Deixe em branco se não tiver" />
          </Field>
          <p className="text-sm text-steel">Medidas são opcionais. Com sexo, idade, altura e peso o app calcula as metas de calorias e proteína.</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Sexo">
              <Select value={f.sex} onChange={(e) => set("sex", e.target.value as Sex | "")}>
                <option value="">—</option>
                <option value="F">Feminino</option>
                <option value="M">Masculino</option>
              </Select>
            </Field>
            <Field label="Ano de nascimento" error={errors.birthYear}>
              <Input data-field="birthYear" value={f.birthYear} onChange={(e) => set("birthYear", e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="1994" />
            </Field>
            <Field label="Altura (cm)" error={errors.heightCm}>
              <Input data-field="heightCm" value={f.heightCm} onChange={(e) => setHealth("heightCm", e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="172" />
            </Field>
            <Field label="Peso (kg)" error={errors.weightKg}>
              <Input data-field="weightKg" value={f.weightKg} onChange={(e) => setHealth("weightKg", e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))} inputMode="decimal" placeholder="72,5" />
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

        {err ? <Alert tone="error">{err}</Alert> : Object.values(errors).some(Boolean) ? <Alert tone="error">Confira os campos marcados acima antes de salvar.</Alert> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              shownFor.current = null;
              onClose();
            }}
          >
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
