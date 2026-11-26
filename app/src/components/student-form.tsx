"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Alert, Button, Dialog, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { GOAL_LABEL, LEVEL_LABEL } from "@/lib/domain/generator";
import { maskPhone } from "@/lib/domain/format";
import { ACTIVITY_LABEL } from "@/lib/domain/nutrition";
import { consentFromCheckbox, consentMetric, hasHealthData } from "@/lib/domain/transfer";
import { TEXTO_REVOGAR, idsDeRespostas, revogarSaude } from "@/lib/domain/anamnese-perfil";
import { reportError, track } from "@/lib/analytics";
import { evStudentCreatedExtra } from "@/lib/anamnese-events";
import { estadoChave, questionarioLigado } from "@/lib/flags";
import { marcarApagado } from "@/lib/questionario-client";
import {
  LIMITACOES_MAX_FORM,
  MODOS_CADASTRO,
  MODO_BOTAO,
  MODO_DICA,
  MODO_ROTULO,
  formInicial,
  modoSugerido,
  numeroDoCampo as num,
  patchDoFormulario,
  pedeRevogacao,
  perfilEditado,
  rascunhoRapido,
  type FormState,
  type ModoCadastro,
} from "@/lib/student-form-state";
import type { ActivityLevel, Equipment, Goal, Level, Profile, Sex, StudentDraft } from "@/lib/domain/types";

export { maskPhone };

/**
 * Chave `questionario` (portas de entrada do personal). Em "todos" (padrão) vale já no primeiro render; nos outros
 * estados depende do aparelho e só é lida depois de montar (flags.ts): até lá, desligada.
 */
export function useQuestionarioLigado(): boolean {
  const imediato = estadoChave() === "todos";
  const [lido, setLido] = useState(false);
  useEffect(() => {
    if (!imediato) setLido(questionarioLigado());
  }, [imediato]);
  return imediato || lido;
}

/** Criação: os padrões de antes; edição: campo que o perfil não tem fica vazio ("Escolher") e não é gravado (entrada 16). */
const initial = (s?: Profile | null): FormState => formInicial(s ?? null, s ? "edicao" : "criacao");

const CONSENT_ERROR = "Marque a autorização do aluno para salvar limitações e medidas.";

/** Cadastro rápido do questionário (`modo`): "agora", "whatsapp" ou "depois"; formulário completo: "completo". */
export type StudentSavedModo = "agora" | "whatsapp" | "depois" | "completo";

type Erros = Partial<Record<keyof FormState, string>>;

/**
 * Cadastro e edição do aluno pelo personal.
 *  - Criação com a chave `questionario` (spec §5.1): cadastro rápido, só nome e WhatsApp, e a escolha do questionário
 *    inicial (Preencher agora · Mandar pelo WhatsApp · Depois). A escolha vem do jeito de trabalhar e acompanha o
 *    telefone digitado até o personal tocar nela. Grava só `{ name, phone }`. "Prefiro digitar os dados eu mesmo"
 *    abre o formulário completo de antes (modo "completo"); sem a chave, só ele.
 *  - Edição: campo que o perfil não tem fica vazio ("Escolher") e não é gravado. Desmarcar a autorização com saúde do
 *    questionário no perfil pede confirmação, salva com `revogarSaude` e grava `sr:v1:qapagado` das rodadas.
 * Só o nome é obrigatório.
 */
export function StudentForm({
  open,
  onClose,
  student,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  student?: Profile | null;
  onSaved: (p: Profile, created: boolean, modo?: StudentSavedModo) => void;
}) {
  const { user, repo } = useApp();
  const ligado = useQuestionarioLigado();
  const [f, setF] = useState<FormState>(() => initial(student));
  const [errors, setErrors] = useState<Erros>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** "Prefiro digitar os dados eu mesmo": formulário completo na criação. */
  const [completo, setCompleto] = useState(false);
  /** Escolha tocada pelo personal; null = segue a sugestão (jeito de trabalhar + telefone digitado). */
  const [modoTocado, setModoTocado] = useState<ModoCadastro | null>(null);
  const [revogar, setRevogar] = useState(false);
  const rapido = !student && ligado && !completo;
  const modo: ModoCadastro = modoTocado ?? modoSugerido(user?.workStyle, f.phone);
  const nomeId = useId();
  const telId = useId();
  const dicaId = useId();
  const radioName = useId();

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
      setCompleto(false);
      setModoTocado(null);
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

  /** Mostra os erros e leva até o primeiro campo com problema (o formulário é mais alto que a tela do celular). */
  function marcarErros(e: Erros): boolean {
    setErrors(e);
    const firstBad = (Object.keys(e) as (keyof FormState)[])[0];
    if (!firstBad) return true;
    const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${firstBad}"]`);
    el?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    el?.focus({ preventScroll: true });
    return false;
  }

  function errosDoContato(): Erros {
    const e: Erros = {};
    if (f.name.trim().length < 2) e.name = "Informe o nome do aluno.";
    const digits = f.phone.replace(/\D/g, "");
    if (digits && digits.length < 10) e.phone = "Inclua o DDD. Ex.: (11) 91234-5678.";
    return e;
  }

  function validate(): StudentDraft | null {
    const e = errosDoContato();
    const name = f.name.trim();
    const year = num(f.birthYear);
    const thisYear = new Date().getFullYear();
    if (year !== undefined && (year < thisYear - 100 || year > thisYear - 10)) e.birthYear = "Ano de nascimento inválido.";
    const h = num(f.heightCm);
    if (h !== undefined && (h < 120 || h > 230)) e.heightCm = "Altura em centímetros. Ex.: 172.";
    const w = num(f.weightKg);
    if (w !== undefined && (w < 30 || w > 300)) e.weightKg = "Peso em quilos. Ex.: 72,5.";
    // Dados de saúde só com a autorização do aluno registrada; o resto do cadastro não depende dela.
    if (!f.consent && hasHealthData({ limitations: f.limitations, weightKg: w, heightCm: h })) e.consent = CONSENT_ERROR;
    if (!marcarErros(e)) return null;
    // Campo vazio não entra: nenhum padrão é gravado sem o personal escolher (entrada 16).
    return { ...patchDoFormulario(f), name, ...consentFromCheckbox(student, f.consent, "personal", new Date().toISOString()) };
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (rapido) return void salvarRapido();
    const draft = validate();
    if (!draft || !user) return;
    // Desmarcou a autorização com saúde do questionário no perfil: confirma antes de apagar (spec §11.2).
    if (student && pedeRevogacao(student, f)) {
      setRevogar(true);
      return;
    }
    await salvar(draft, false);
  }

  /** Cadastro rápido: só nome e WhatsApp, sem padrões de treino (as respostas preenchem o resto sem diferença falsa). */
  async function salvarRapido() {
    if (!marcarErros(errosDoContato()) || !user) return;
    setSaving(true);
    setErr(null);
    try {
      const draft = rascunhoRapido(f);
      const created = await repo.createStudent(user.id, draft);
      track("student_created", { has_phone: Boolean(draft.phone), consent: "sem_dados_saude", ...evStudentCreatedExtra(modo) });
      shownFor.current = null;
      onSaved(created, true, modo);
    } catch (e) {
      reportError(e, "aluno:salvar");
      setErr(e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  async function salvar(draft: StudentDraft, revogando: boolean) {
    if (!user) return;
    setSaving(true);
    setErr(null);
    try {
      const consent = consentMetric(draft, Boolean(draft.consentHealthAt));
      if (student) {
        // Campos do formulário que ficaram vazios saem do cadastro; o resto do perfil (questionário, passos) fica.
        const editado: Profile = { ...perfilEditado(student, f), consentHealthAt: draft.consentHealthAt, consentSource: draft.consentSource };
        // Os ids saem antes de revogar; o registro de "apagado" só vale se gravou.
        const rodadas = revogando ? idsDeRespostas(student) : [];
        const saved = await repo.saveProfile(revogando ? revogarSaude(editado) : editado);
        if (rodadas.length) {
          const at = new Date().toISOString();
          for (const id of rodadas) marcarApagado(id, at);
        }
        // Nada que diga se o aluno tem lesão, peso ou altura: só a situação da autorização.
        track("student_edited", { has_phone: Boolean(draft.phone), consent });
        shownFor.current = null;
        setRevogar(false);
        onSaved(saved, false);
      } else {
        const created = await repo.createStudent(user.id, draft);
        track("student_created", { has_phone: Boolean(draft.phone), consent, ...evStudentCreatedExtra("completo") });
        shownFor.current = null;
        onSaved(created, true, "completo");
      }
    } catch (e) {
      reportError(e, "aluno:salvar");
      setErr(e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo.");
      setRevogar(false);
    } finally {
      setSaving(false);
    }
  }

  function fechar() {
    shownFor.current = null;
    onClose();
  }

  // Cadastro rápido e formulário completo moram no mesmo diálogo: trocar de um para o outro não fecha e reabre a janela.
  const formRapido = rapido ? (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-5">
      <Field label="Nome do aluno" error={errors.name} noteId={nomeId}>
        <Input
          data-field="name"
          value={f.name}
          onChange={(e) => set("name", e.target.value)}
          autoComplete="off"
          placeholder="Nome e sobrenome"
          required
          autoFocus
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? nomeId : undefined}
        />
      </Field>
      <Field label="WhatsApp (com DDD)" hint="Para mandar o questionário e a ficha." error={errors.phone} noteId={telId}>
        <Input
          data-field="phone"
          value={f.phone}
          onChange={(e) => set("phone", maskPhone(e.target.value))}
          inputMode="tel"
          autoComplete="off"
          placeholder="Ex.: (11) 91234-5678"
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={telId}
        />
      </Field>
      {/* Grupo de rádio de verdade (input radio): as setas trocam a opção, e a dica da escolha fica ligada ao grupo. */}
      <fieldset aria-describedby={dicaId}>
        <legend className="mb-1.5 block text-sm font-semibold text-iron">Questionário inicial</legend>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          {MODOS_CADASTRO.map((m) => (
            <label key={m} className="block">
              <input type="radio" name={radioName} value={m} checked={modo === m} onChange={() => setModoTocado(m)} className="peer sr-only" />
              <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-[var(--radius-ficha)] border border-rule-strong bg-paper px-3 py-2 text-center text-[0.9375rem] font-semibold text-iron transition-colors hover:border-iron peer-checked:border-iron peer-checked:bg-iron peer-checked:text-chalk peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-plate-blue">
                {MODO_ROTULO[m]}
              </span>
            </label>
          ))}
        </div>
        <p id={dicaId} className="mt-1.5 text-[0.8125rem] text-steel">
          {MODO_DICA[modo]}
        </p>
      </fieldset>
      {err ? <Alert tone="error">{err}</Alert> : null}
      <div className="flex flex-col gap-3 sm:flex-row-reverse sm:items-center sm:justify-between">
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={fechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            {MODO_BOTAO[modo]}
          </Button>
        </div>
        <button
          type="button"
          onClick={() => {
            // O nome do formulário completo recebe o foco ao montar (autoFocus): o link que tinha o foco some.
            setErrors({});
            setCompleto(true);
          }}
          className="inline-flex min-h-11 items-center justify-center self-center text-sm font-semibold text-steel underline underline-offset-2 hover:text-iron sm:self-auto"
        >
          Prefiro digitar os dados eu mesmo
        </button>
      </div>
    </form>
  ) : null;

  return (
    <>
      <Dialog open={open} onClose={onClose} title={student ? "Dados do aluno" : "Adicionar aluno"} wide={!rapido}>
        {formRapido ?? (
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
                  <Select value={f.goal} onChange={(e) => set("goal", e.target.value as Goal | "")}>
                    {student ? <option value="">Escolher</option> : null}
                    {(Object.keys(GOAL_LABEL) as Goal[]).map((g) => (
                      <option key={g} value={g}>
                        {GOAL_LABEL[g]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Nível">
                  <Select value={f.level} onChange={(e) => set("level", e.target.value as Level | "")}>
                    {student ? <option value="">Escolher</option> : null}
                    {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => (
                      <option key={l} value={l}>
                        {LEVEL_LABEL[l]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Onde treina" className="col-span-2 sm:col-span-1">
                  <Select value={f.equipment} onChange={(e) => set("equipment", e.target.value as Equipment | "")}>
                    {student ? <option value="">Escolher</option> : null}
                    <option value="academia">Academia</option>
                    <option value="home">Em casa (halteres, elástico)</option>
                    <option value="peso_corporal">Sem equipamento</option>
                  </Select>
                </Field>
                <Field label="Dias por semana">
                  <Select value={f.daysPerWeek} onChange={(e) => set("daysPerWeek", e.target.value)}>
                    {student ? <option value="">Escolher</option> : null}
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                      <option key={d} value={d}>
                        {d}x
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Tempo por treino">
                  <Select value={f.sessionMinutes} onChange={(e) => set("sessionMinutes", e.target.value)}>
                    {student ? <option value="">Escolher</option> : null}
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
                <Textarea value={f.limitations} onChange={(e) => setHealth("limitations", e.target.value)} maxLength={LIMITACOES_MAX_FORM} rows={2} className="min-h-20" placeholder="Deixe em branco se não tiver" />
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
              <Button type="button" variant="secondary" onClick={fechar}>
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                {student ? "Salvar dados" : "Adicionar aluno"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* Confirmação da revogação (spec §11.2), por cima do formulário. */}
      <Dialog open={revogar} onClose={() => setRevogar(false)} title="Retirar a autorização de saúde?">
        <div className="ph-no-capture space-y-4">
          <p className="text-[0.9375rem]">{TEXTO_REVOGAR}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setRevogar(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" aria-hidden />}
              loading={saving}
              onClick={() => {
                const draft = validate();
                if (draft) void salvar(draft, true);
                else setRevogar(false);
              }}
            >
              Retirar e apagar
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
