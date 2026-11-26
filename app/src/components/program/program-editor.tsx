"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Copy, FileText, IdCard, MoreHorizontal, MoveLeft, MoveRight, Plus, Trash2, TriangleAlert } from "lucide-react";
import { ExercisePicker } from "@/components/exercise-picker";
import { FichaDay } from "@/components/ficha";
import { EditorDeliveryLine, FichaContextHeader, FichaStatusLine, PanelDeliveryLines } from "@/components/program/editor-context";
import { PostSaveBar, SendFichaLink } from "@/components/program/save-summary";
import { ProgramShare, shareNames } from "@/components/program/program-share";
import { ActionSheet, Alert, Button, Dialog, Field, IconButton, Input, Panel, Select, Skeleton, Textarea, cx } from "@/components/ui";
import { reportError, track } from "@/lib/analytics";
import { useApp } from "@/lib/app-context";
import { COACH_IDENTITY_HINT, needsCoachIdentity } from "@/lib/data/demo";
import { avaliacaoPendente } from "@/lib/domain/anamnese-ficha";
import { prepStatusText, type DeliveryIcon, type PrepVia } from "@/lib/domain/delivery";
import { GROUP_LABEL, getExercise, unitOf } from "@/lib/domain/exercises";
import {
  editDuration,
  editorWidth,
  fichaCoach,
  fichaContextText,
  fichaKind,
  newFichaMessage,
  postSaveNextStep,
  postSaveTitle,
  programAdjustedNote,
  sendReady,
  shouldMarkAdjusted,
  showEditorDeliveryLine,
  type FichaContextInput,
  type FichaKind,
} from "@/lib/domain/ficha-context";
import { firstName, fmtDayMonth, fmtLoad, fmtRest, fmtScheme, programValidity, validityEnd } from "@/lib/domain/format";
import { GOAL_LABEL, LEVEL_LABEL, TECHNIQUE_LABEL, buildPlanned, estimateDayMinutes, repScheme } from "@/lib/domain/generator";
import { uid } from "@/lib/domain/ids";
import { PLANS } from "@/lib/domain/plans";
import { coachSignature, nextDayKey, programSetsPerGroup, signerFor, techniqueText } from "@/lib/domain/program-share";
import { draftToRestore, parseFichaDraft, programForSave, programSignature, type FichaDraft } from "@/lib/domain/program-signature";
import { getSystem } from "@/lib/domain/systems";
import { fmtDate, selectAllSoon, useStickyBarScrollPadding } from "@/lib/hooks";
import type { Exercise, Goal, Level, PlannedExercise, Profile, Program, Technique, Unit, WorkoutDay } from "@/lib/domain/types";

const RESTS = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];
const UNIT_FIELDS: Record<Unit, { min: string; max: string; single: string; hi: number }> = {
  reps: { min: "Reps mín", max: "Reps máx", single: "Reps", hi: 100 },
  seg: { min: "Seg mín", max: "Seg máx", single: "Segundos", hi: 600 },
  min: { min: "Min mín", max: "Min máx", single: "Minutos", hi: 180 },
};

interface Props {
  programId: string;
  onSaved?: (p: Program) => void;
  /** Aluno dono da ficha quando quem edita é o personal. */
  student?: Profile | null;
  /** Link de volta (o editor avisa se houver alterações não salvas). */
  back?: { href: string; label: string };
}

/** Barra depois de salvar (e na chegada do gerador): título, frase do próximo passo e, no lugar da frase, o envio. */
interface PostSave {
  title: string;
  text: string | null;
  /** Frase que é estado de um envio feito pela barra (ícone do canal). */
  textIcon?: DeliveryIcon;
  send: boolean;
}

const hasExercises = (p: Program) => p.days.some((x) => x.exercises.length > 0);

export function ProgramEditor({ programId, onSaved, student, back }: Props) {
  const { repo, user, plan, mode, returnTo } = useApp();
  const router = useRouter();
  const [program, setProgram] = useState<Program | null>(null);
  // Última versão lida ou gravada no repositório: base do rascunho (baseSig) e do "não salvo" (assinaturas diferentes).
  const [base, setBase] = useState<Program | null>(null);
  // Perfil local de quem montou uma ficha recebida, quando não é o personal atual (nome no cabeçalho e na impressão).
  const [creator, setCreator] = useState<Profile | null>(null);
  const [day, setDay] = useState(0);
  const [openEx, setOpenEx] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ replace?: string } | null>(null);
  const [dayMenu, setDayMenu] = useState(false);
  const [confirmDay, setConfirmDay] = useState(false);
  // Destino pedido enquanto havia alterações não salvas (null = ninguém pediu para sair).
  const [leave, setLeave] = useState<string | null>(null);
  // "Sair sem salvar": as alterações continuam na tela até a navegação terminar, mas sem proteção nem rascunho.
  const [discarded, setDiscarded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "done" | "error" | "info"; text: string } | null>(null);
  const [restored, setRestored] = useState(false);
  const [postSave, setPostSave] = useState<PostSave | null>(null);
  // Contadores: foco no título da barra; salvamentos (remonta o envio da barra e refaz o link); releitura do envio.
  const [focusTitle, setFocusTitle] = useState(0);
  const [saveCount, setSaveCount] = useState(0);
  const [deliveryVersion, setDeliveryVersion] = useState(0);
  const [openedAt] = useState(() => Date.now());
  const ready = useRef(false);
  const [notFound, setNotFound] = useState(false);
  const autoPrint = useRef(false);
  const saveBar = useRef<HTMLDivElement>(null);
  const barAction = useRef<HTMLDivElement>(null);
  // Barra fixa de baixo (sempre montada depois de carregar): o foco do teclado não para atrás dela (WCAG 2.4.11).
  const stickyBar = useRef<HTMLDivElement>(null);
  useStickyBarScrollPadding(stickyBar, Boolean(program));

  useEffect(() => {
    let alive = true;
    repo
      .getProgram(programId)
      .then((p) => {
        if (!alive) return;
        if (!p) return setNotFound(true);
        const q = new URLSearchParams(window.location.search);
        setBase(p);
        // Edição que ficou sem salvar (voltar do aparelho, recarregar, menu): volta como estava, desde que a ficha
        // salva ainda seja a mesma versão em que a edição começou (assinatura de conteúdo: uma carga copiada de um
        // treino depois do rascunho o invalida). Rascunho sem diferença da versão salva é descartado em silêncio.
        const draft = draftToRestore(readDraft(user?.id ?? "", programId), p);
        if (draft) {
          setProgram(draft);
          setRestored(true);
          setMsg({ tone: "info", text: "Recuperamos as alterações que você ainda não tinha salvado." });
        } else {
          setProgram(p);
          if (q.get("enviada")) {
            // Chegada do gerador: com aluno real, a barra já abre com o envio (visível sem rolar); senão, uma frase.
            const k: FichaKind = user ? fichaKind({ viewer: user, program: p, returnTo }) : "propria";
            const real = Boolean(student && !student.sample);
            const m = newFichaMessage({
              kind: k,
              mode,
              program: p,
              studentFirst: student ? firstName(student.name) : null,
              coachFirst: null,
              currentCoach: false,
              sample: !real,
              hasExercises: hasExercises(p),
            });
            if ("bar" in m) setPostSave({ title: postSaveTitle(k, mode, { fromGenerator: true }), text: m.text, send: true });
            else setMsg({ tone: "done", text: m.text });
          } else if (q.get("salva")) {
            const inactive = !p.active && !(user?.role === "coach" && p.ownerId === user.id);
            setMsg({ tone: "done", text: user?.role === "coach" ? "Modelo salvo. Monte os treinos e depois aplique a um aluno." : inactive ? "Ficha criada, ainda inativa: sua ficha atual continua valendo até você tocar em “Tornar ativa”." : "Ficha salva e ativa. Ela já aparece em Hoje." });
          }
          autoPrint.current = Boolean(q.get("imprimir"));
        }
        ready.current = true;
        // Os avisos e a impressão automática valem uma vez: sem isto voltariam a cada recarga ou "voltar".
        if (q.get("enviada") || q.get("salva") || q.get("imprimir")) window.history.replaceState(null, "", window.location.pathname);
      })
      .catch(() => alive && setNotFound(true));
    return () => {
      alive = false;
    };
  }, [programId, repo]);

  useEffect(() => {
    if (program && autoPrint.current) {
      autoPrint.current = false;
      const t = setTimeout(() => window.print(), 350);
      return () => clearTimeout(t);
    }
  }, [program]);

  // Assinatura da versão de onde a edição partiu: vai junto no rascunho e decide o "não salvo".
  const baseSig = useMemo(() => (base ? programSignature(base) : undefined), [base]);
  // "Não salvo" = diferença real de conteúdo (mudar e voltar ao valor de antes não conta).
  const dirty = useMemo(() => Boolean(program && baseSig !== undefined && programSignature(program) !== baseSig), [program, baseSig]);
  const guard = dirty && !discarded;

  useEffect(() => {
    if (!guard) return;
    const unload = (e: BeforeUnloadEvent) => e.preventDefault();
    // Qualquer link do app (menu inferior, logo, voltar) pergunta antes de sair com alterações pendentes.
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeave(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [guard]);

  // Guarda o que está em edição enquanto não for salvo (cobre o "voltar" do aparelho e a recarga).
  useEffect(() => {
    if (!ready.current) return;
    try {
      const draft: FichaDraft | null = guard && program ? { program, ...(baseSig ? { baseSig } : {}) } : null;
      if (draft) sessionStorage.setItem(fichaDraftKey(user?.id ?? "", programId), JSON.stringify(draft));
      else sessionStorage.removeItem(fichaDraftKey(user?.id ?? "", programId));
    } catch {
      /* sem espaço ou modo privado: segue só em memória */
    }
  }, [program, guard, baseSig, programId, user?.id]);

  // Ficha recebida de um personal que não é o atual: o nome vem do perfil local dele (gravado quando o link chegou).
  const createdBy = program?.createdBy;
  const needCreator = Boolean(createdBy && user && user.role !== "coach" && createdBy !== user.id && user.remoteCoach?.id !== createdBy);
  useEffect(() => {
    if (!needCreator || !createdBy) return;
    let alive = true;
    repo
      .getProfile(createdBy)
      .then((p) => {
        if (alive) setCreator(p);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [needCreator, createdBy, repo]);

  function dropDraft() {
    try {
      sessionStorage.removeItem(fichaDraftKey(user?.id ?? "", programId));
    } catch {}
  }

  async function discard() {
    dropDraft();
    setRestored(false);
    setMsg(null);
    const fresh = await repo.getProgram(programId).catch(() => null);
    if (fresh) {
      setProgram(fresh);
      setBase(fresh);
    }
  }

  const volume = useMemo(() => (program ? programSetsPerGroup(program) : []), [program]);

  const backLink = back ? (
    <Link
      href={back.href}
      className="no-print mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-steel hover:text-iron"
    >
      <ArrowLeft className="size-4" /> {back.label}
    </Link>
  ) : null;

  if (notFound)
    return (
      <>
        {backLink}
        <Alert tone="error">Ficha não encontrada. Ela pode ter sido excluída.</Alert>
      </>
    );
  if (!program) return <Skeleton className="h-96" />;

  const index = Math.min(day, program.days.length - 1);
  const d = program.days[index]!;
  const isCoachEditing = Boolean(student) && user?.id !== program.ownerId;
  // Ficha do próprio personal = modelo reutilizável (não tem "ativa" nem validade correndo).
  const template = user?.role === "coach" && program.ownerId === user.id;
  const validity = programValidity(program.createdAt, program.durationWeeks);
  const names = shareNames(user, student);
  const kind: FichaKind = user ? fichaKind({ viewer: user, program, returnTo }) : "propria";
  const realStudent = Boolean(student && !student.sample);
  const studentFirst = kind === "como_aluno" ? (user ? firstName(user.name) : null) : student ? firstName(student.name) : null;
  const coach = fichaCoach({ createdBy: program.createdBy, remoteCoach: user?.remoteCoach, creator });
  const contextOf = (p: Pick<Program, "active" | "adjustedAt">): FichaContextInput => ({ kind, mode, program: p, studentFirst, coachFirst: coach.first, currentCoach: coach.current });
  const context = fichaContextText(contextOf(program), fmtDayMonth);
  const fmtFull = (iso: string) => fmtDate(iso, { day: "2-digit", month: "2-digit", year: "numeric" });
  // Ficha do personal ajustada no aparelho do aluno: sai sem a assinatura dele, com "Ajustada em … a partir da ficha de …".
  const adjustedNote = kind === "recebida" ? programAdjustedNote(program, coach.full, fmtFull) : null;
  // Assinatura "Nome · CREF …" da ficha impressa: o personal logado ou, no celular do aluno, o personal que enviou a
  // ficha. Conteúdo alterado no aparelho do aluno (adjustedAt) nunca leva nome nem CREF do personal.
  const signature = program.adjustedAt ? undefined : coachSignature(signerFor(user, program.createdBy));
  // Impressão: a mesma data da tela (validade conta da criação da ficha). O modelo não tem data: as cópias contam da
  // própria criação, então o papel do modelo continua com a duração planejada.
  const printValidity = program.durationWeeks
    ? template
      ? `Validade: ${program.durationWeeks} semanas`
      : `Válida até ${fmtFull(validityEnd(program.createdAt, program.durationWeeks).toISOString())}`
    : null;
  const barOpen = !dirty && postSave !== null;
  // Um botão de envio por vez: com a barra mostrando o envio, o painel do fim mostra só as linhas e "Outras formas".
  const barSends = barOpen && Boolean(postSave?.send) && realStudent;
  // Painel com o link do app: ficha de aluno real, no modo local (modelo, ficha própria, exemplo e nuvem: como antes).
  const linkPanel = kind === "aluno" && mode === "local" && realStudent && student ? student : null;
  // Faixa do questionário (spec §6.1): trava ou porta abertas, ou respostas ilegíveis. Nunca nomeia a condição.
  const avaliacao = kind === "aluno" && student && avaliacaoPendente(student, new Date()) ? student : null;

  const change = (fn: (p: Program) => Program) => {
    setProgram((p) => (p ? fn(p) : p));
    setMsg(null);
    // A barra depois de salvar fica até a próxima alteração (aí volta a de "não salvo").
    setPostSave(null);
  };
  const changeDays = (fn: (days: WorkoutDay[]) => WorkoutDay[]) => change((p) => ({ ...p, days: fn(p.days) }));
  const patchDay = (patch: Partial<WorkoutDay>) => changeDays((days) => days.map((x, i) => (i === index ? { ...x, ...patch } : x)));
  const changeList = (fn: (ex: PlannedExercise[]) => PlannedExercise[]) => changeDays((days) => days.map((x, i) => (i === index ? { ...x, exercises: fn(x.exercises) } : x)));
  const changeEx = (u: string, patch: Partial<PlannedExercise>) => changeList((list) => list.map((e) => (e.uid === u ? { ...e, ...patch } : e)));

  function pick(e: Exercise) {
    const scheme = repScheme(program!.goal, program!.level, e, program!.system, false);
    const fresh = buildPlanned(e, scheme);
    if (picker?.replace) {
      changeList((list) =>
        list.map((x) => {
          if (x.uid !== picker.replace) return x;
          // Mesma unidade: mantém séries, faixa e descanso que o personal já ajustou.
          const sameUnit = unitOf(x.exerciseId, x.unit) === unitOf(e.id);
          return sameUnit ? { ...x, exerciseId: e.id, name: e.name, loadKg: null, unit: undefined } : { ...fresh, uid: x.uid, notes: x.notes };
        }),
      );
    } else {
      changeList((list) => [...list, fresh]);
    }
  }

  function addDay() {
    changeDays((days) => [...days, { key: nextDayKey(days), title: "", focus: [], exercises: [] }]);
    setDay(program!.days.length);
    setOpenEx(null);
  }
  function duplicateDay() {
    changeDays((days) => {
      const copy: WorkoutDay = { ...d, key: nextDayKey(days), focus: [...d.focus], exercises: d.exercises.map((e) => ({ ...e, uid: uid() })) };
      return [...days.slice(0, index + 1), copy, ...days.slice(index + 1)];
    });
    setDay(index + 1);
  }
  function moveDay(dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= program!.days.length) return;
    changeDays((days) => swap(days, index, to));
    setDay(to);
  }
  function deleteDay() {
    changeDays((days) => days.filter((_, i) => i !== index));
    setDay(Math.max(0, index - 1));
    setConfirmDay(false);
  }

  async function save(): Promise<boolean> {
    if (!program) return false;
    // Sem diferença da versão gravada, nada é gravado (a data de edição só muda com conteúdo).
    if (!dirty) return true;
    const fail = (text: string) => {
      setMsg({ tone: "error", text });
      return false;
    };
    const name = program.name.trim();
    if (!name) return fail("Dê um nome à ficha antes de salvar.");
    const keys = program.days.map((x) => x.key.trim().toUpperCase());
    if (keys.some((k) => !k)) return fail("Todo treino precisa de uma letra ou nome curto (A, B, Push…).");
    if (new Set(keys).size !== keys.length) return fail("Dois treinos estão com a mesma letra. Use letras diferentes para cada um.");
    // O "Salvar ficha" some ao salvar: se o foco estava nele, vai para o título da barra (não para o body).
    const focusWasOnSave = Boolean(saveBar.current?.contains(document.activeElement));
    setSaving(true);
    try {
      // Ficha recebida do personal, no modo local, com diferença: grava adjustedAt e mantém createdBy.
      const { program: clean } = programForSave(program, base, { now: new Date().toISOString(), markAdjusted: shouldMarkAdjusted(kind, mode) });
      const saved = await repo.saveProgram(clean);
      setProgram(saved);
      setBase(saved);
      setRestored(false);
      setMsg(null);
      setSaveCount((n) => n + 1);
      setDeliveryVersion((n) => n + 1);
      const planned = saved.days.flatMap((x) => x.exercises);
      const withExercises = planned.length > 0;
      track("program_edited", {
        days: saved.days.length,
        exercises: planned.length,
        with_technique: planned.filter((e) => e.technique !== "normal").length,
        timed: planned.filter((e) => unitOf(e.exerciseId, e.unit) !== "reps").length,
        custom: planned.filter((e) => e.exerciseId.startsWith("custom_")).length,
        with_notes: planned.filter((e) => e.notes).length,
        has_validity: Boolean(saved.durationWeeks),
        system: saved.system,
        kind,
        send_ready: sendReady({ kind, mode, sample: !realStudent, active: saved.active, hasExercises: withExercises }),
        tela: editorWidth(window.innerWidth),
        duracao: editDuration(Date.now() - openedAt),
      });
      const next = postSaveNextStep({ ...contextOf(saved), sample: !realStudent, hasExercises: withExercises });
      setPostSave({ title: postSaveTitle(kind, mode), text: next && "text" in next ? next.text : null, send: Boolean(next && "send" in next) });
      if (focusWasOnSave) setFocusTitle((n) => n + 1);
      onSaved?.(saved);
      return true;
    } catch (e) {
      reportError(e, "ficha:salvar");
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo." });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function activate() {
    try {
      await repo.setActiveProgram(program!.ownerId, program!.id);
      setProgram((p) => (p ? { ...p, active: true } : p));
      setBase((b) => (b ? { ...b, active: true } : b));
      // O próximo passo da barra falava da ficha inativa: deixa de valer.
      setPostSave(null);
      setDeliveryVersion((n) => n + 1);
      setMsg({ tone: "done", text: "Esta é a ficha ativa agora." });
    } catch (e) {
      reportError(e, "ficha:ativar");
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Não foi possível ativar a ficha. Tente de novo." });
    }
  }

  /** Envio feito pela barra: a linha de envio é relida e a barra troca o envio pelo estado do toque. */
  function barSent(via: PrepVia, at: string) {
    setDeliveryVersion((n) => n + 1);
    const focusWasInBar = Boolean(barAction.current?.contains(document.activeElement));
    // Depois do clique: a âncora do WhatsApp precisa continuar montada até o navegador abrir o link.
    setTimeout(() => {
      setPostSave((s) => (s ? { ...s, text: prepStatusText(via, at, studentFirst ?? "o aluno", "personal"), textIcon: via === "copy" ? "copia" : "whatsapp", send: false } : s));
      if (focusWasInBar) setFocusTitle((n) => n + 1);
    }, 0);
  }

  const recent = program.days.flatMap((x) => x.exercises.map((e) => e.exerciseId)).filter((id, i, all) => all.indexOf(id) === i);
  const empty = program.days.every((x) => !x.exercises.length);
  const shareTitle = student ? `Enviar para ${firstName(student.name)}` : template ? "Compartilhar modelo" : "Compartilhar ficha";
  const shareProps = { program, student, canExport: PLANS[plan].export, onPrint: () => window.print(), disabled: dirty || empty };
  const programShare = <ProgramShare {...shareProps} />;
  const pendingNote = dirty ? (
    <p className="mb-3 text-sm text-steel">Salve as alterações para compartilhar a versão nova.</p>
  ) : empty ? (
    <p className="mb-3 text-sm text-steel">Adicione exercícios antes de enviar.</p>
  ) : null;

  return (
    <div className="space-y-5">
      {backLink}

      <FichaContextHeader
        title={context.title}
        status={
          <FichaStatusLine
            badge={template ? "modelo" : program.active ? "ativa" : "inativa"}
            system={getSystem(program.system).name}
            validity={template ? null : validity}
            onActivate={!program.active && !template ? () => void activate() : undefined}
          />
        }
        note={context.note}
        delivery={
          student && showEditorDeliveryLine({ kind, mode, sample: !realStudent, active: program.active, dirty }) ? <EditorDeliveryLine student={student} version={deliveryVersion} /> : null
        }
      />

      {avaliacao ? (
        <Alert tone="warn" icon={<FileText className="mt-0.5 size-[18px] shrink-0 text-warn-ink" aria-hidden />} className="no-print ph-no-capture">
          <Link href={`/alunos/${avaliacao.id}#resumo-aluno`} className="inline-flex min-h-11 items-center font-semibold underline">
            {firstName(avaliacao.name)}: avaliação médica pendente (ver resumo)
          </Link>
        </Alert>
      ) : null}

      {msg && !(dirty && msg.tone === "error") ? (
        <Alert tone={msg.tone} className="no-print">
          {msg.text}
        </Alert>
      ) : null}
      {restored && dirty ? (
        <button type="button" onClick={() => void discard()} className="no-print min-h-11 text-sm font-semibold text-steel underline hover:text-iron">
          Descartar essas alterações e voltar à versão salva
        </button>
      ) : null}

      <div className="no-print space-y-3">
        <Field label={template ? "Nome do modelo" : "Nome da ficha"}>
          <Input value={program.name} onChange={(e) => change((p) => ({ ...p, name: e.target.value }))} maxLength={60} />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Objetivo">
            <Select value={program.goal} onChange={(e) => change((p) => ({ ...p, goal: e.target.value as Goal }))} className="px-2">
              {(Object.keys(GOAL_LABEL) as Goal[]).map((g) => (
                <option key={g} value={g}>
                  {GOAL_LABEL[g]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nível">
            <Select value={program.level} onChange={(e) => change((p) => ({ ...p, level: e.target.value as Level }))} className="px-2">
              {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Validade">
            <Select value={program.durationWeeks ?? 0} onChange={(e) => change((p) => ({ ...p, durationWeeks: Number(e.target.value) || undefined }))} className="px-2">
              <option value={0}>Sem validade</option>
              {[4, 6, 8, 10, 12, 16].map((w) => (
                <option key={w} value={w}>
                  {w} semanas
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="no-print -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Treinos da ficha">
        {program.days.map((x, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === index}
            onClick={() => {
              setDay(i);
              setOpenEx(null);
            }}
            className={cx("min-w-14 shrink-0 rounded-[6px] border px-3 py-2 text-left", i === index ? "border-iron bg-iron text-chalk" : "border-rule-strong bg-paper hover:border-iron")}
          >
            <span className="plate-type block max-w-24 truncate text-lg leading-none">{x.key || "?"}</span>
            <span className={cx("num mt-1 block whitespace-nowrap text-xs", i === index ? "text-chalk/70" : "text-steel")}>{x.exercises.length} exerc.</span>
          </button>
        ))}
        {program.days.length < 10 ? (
          <button type="button" onClick={addDay} className="flex shrink-0 items-center gap-1.5 rounded-[6px] border border-dashed border-rule-strong px-3 text-sm font-semibold hover:border-iron">
            <Plus className="size-4" aria-hidden /> Treino
          </button>
        ) : null}
      </div>

      <section className="no-print space-y-3" aria-label={`Treino ${d.key}`}>
        <div className="flex items-end gap-2">
          <Field label="Letra" className="w-20 shrink-0">
            <Input
              value={d.key}
              onChange={(e) => {
                const v = e.target.value.slice(0, 6);
                // Letra solta sai maiúscula (A, B, U1); nome curto fica como digitado (Push, Pull).
                patchDay({ key: v.length <= 2 ? v.toUpperCase() : v });
              }}
              autoCapitalize="characters"
              aria-label="Letra ou nome curto do treino"
              className="text-center font-bold"
            />
          </Field>
          <Field label="Título do treino" className="min-w-0 flex-1">
            <Input value={d.title} onChange={(e) => patchDay({ title: e.target.value })} maxLength={60} placeholder="Ex.: Peito e tríceps" />
          </Field>
          <IconButton label="Opções deste treino" onClick={() => setDayMenu(true)} className="border border-rule-strong bg-paper">
            <MoreHorizontal className="size-5" />
          </IconButton>
        </div>
        <p className="num text-sm text-steel">
          {d.exercises.length ? `${d.exercises.length} ${d.exercises.length === 1 ? "exercício" : "exercícios"} · cerca de ${estimateDayMinutes(d)} min` : "Nenhum exercício neste treino ainda."}
        </p>

        {d.exercises.length ? (
          <ol className="space-y-2">
            {d.exercises.map((e, i) => {
              const open = openEx === e.uid;
              const unit = unitOf(e.exerciseId, e.unit);
              const labels = UNIT_FIELDS[unit];
              const summary = [fmtScheme(e), e.loadKg ? fmtLoad(e.loadKg) : null, e.restSec ? `desc. ${fmtRest(e.restSec)}` : null, techniqueText(d.exercises, i)].filter(Boolean).join(" · ");
              return (
                <li key={e.uid} className={cx("rounded-[8px] border bg-paper", open ? "border-iron" : "border-rule")}>
                  <div className="flex items-stretch">
                    <button type="button" onClick={() => setOpenEx(open ? null : e.uid)} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-2.5 py-2.5 pl-3 pr-1 text-left">
                      <span className="num mt-0.5 grid size-6 shrink-0 place-items-center rounded bg-chalk-2 text-xs font-bold">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold leading-snug">{e.name}</span>
                        <span className="num block text-sm text-steel">{summary}</span>
                        {!open && e.notes ? <span className="block truncate text-xs text-steel">{e.notes}</span> : null}
                      </span>
                      <ChevronDown className={cx("mt-1 size-4 shrink-0 text-steel transition-transform", open && "rotate-180")} aria-hidden />
                    </button>
                    <div className="flex shrink-0 items-center pr-1">
                      <IconButton label={`Subir ${e.name}`} disabled={i === 0} onClick={() => changeList((l) => swap(l, i, i - 1))}>
                        <ArrowUp className="size-4" />
                      </IconButton>
                      <IconButton label={`Descer ${e.name}`} disabled={i === d.exercises.length - 1} onClick={() => changeList((l) => swap(l, i, i + 1))}>
                        <ArrowDown className="size-4" />
                      </IconButton>
                    </div>
                  </div>

                  {open ? (
                    <div className="space-y-3 border-t border-rule px-3 pb-3 pt-3">
                      {getExercise(e.exerciseId)?.cue ? <p className="text-xs text-steel">{getExercise(e.exerciseId)!.cue}</p> : null}
                      <div className="grid grid-cols-3 gap-2">
                        <NumField label="Séries" value={e.sets} min={1} max={20} onCommit={(v) => changeEx(e.uid, { sets: v ?? 1 })} />
                        {unit === "min" ? (
                          <NumField label={labels.single} value={e.repsMax} min={1} max={labels.hi} onCommit={(v) => changeEx(e.uid, { repsMin: v ?? 1, repsMax: v ?? 1 })} className="col-span-2" />
                        ) : (
                          <>
                            <NumField label={labels.min} value={e.repsMin} min={1} max={labels.hi} onCommit={(v, final) => changeEx(e.uid, final ? { repsMin: v ?? 1, repsMax: Math.max(e.repsMax, v ?? 1) } : { repsMin: v ?? 1 })} />
                            <NumField label={labels.max} value={e.repsMax} min={1} max={labels.hi} onCommit={(v, final) => changeEx(e.uid, final ? { repsMax: v ?? 1, repsMin: Math.min(e.repsMin, v ?? 1) } : { repsMax: v ?? 1 })} />
                          </>
                        )}
                        {unit !== "min" ? <NumField label="Carga (kg)" value={e.loadKg ?? null} min={0} max={999} decimal allowEmpty onCommit={(v) => changeEx(e.uid, { loadKg: v || null })} /> : null}
                        <label className="block">
                          <span className="col-head mb-1 block text-steel">Descanso</span>
                          <Select value={e.restSec} onChange={(ev) => changeEx(e.uid, { restSec: Number(ev.target.value) })} className="h-11 px-2">
                            {(RESTS.includes(e.restSec) ? RESTS : [...RESTS, e.restSec].sort((a, b) => a - b)).map((r) => (
                              <option key={r} value={r}>
                                {r === 0 ? "Sem" : fmtRest(r)}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <label className="block">
                          <span className="col-head mb-1 block text-steel">Contagem</span>
                          <Select
                            value={unit}
                            onChange={(ev) => {
                              const u = ev.target.value as Unit;
                              const base = u === "reps" ? { repsMin: 8, repsMax: 12 } : u === "seg" ? { repsMin: 30, repsMax: 45 } : { repsMin: 15, repsMax: 15 };
                              changeEx(e.uid, { unit: u, ...base, ...(u === "min" ? { loadKg: null, sets: 1 } : {}) });
                            }}
                            className="h-11 px-2"
                          >
                            <option value="reps">Reps</option>
                            <option value="seg">Seg.</option>
                            <option value="min">Min.</option>
                          </Select>
                        </label>
                        <label className={cx("block", unit === "min" ? "col-span-3" : "col-span-3 sm:col-span-1")}>
                          <span className="col-head mb-1 block text-steel">Técnica</span>
                          <Select value={e.technique} onChange={(ev) => changeEx(e.uid, { technique: ev.target.value as Technique })} className="h-11 px-2">
                            {(Object.keys(TECHNIQUE_LABEL) as Technique[]).map((t) => (
                              <option key={t} value={t}>
                                {t === "normal" ? "Sem técnica especial" : TECHNIQUE_LABEL[t]}
                              </option>
                            ))}
                          </Select>
                        </label>
                      </div>
                      <label className="block">
                        <span className="col-head mb-1 block text-steel">Observação para o aluno</span>
                        <Input value={e.notes ?? ""} onChange={(ev) => changeEx(e.uid, { notes: ev.target.value || undefined })} placeholder="Cadência, pegada, amplitude, ajuste do banco…" maxLength={160} />
                      </label>
                      {/* 44 px de altura; "Remover" fica no lugar, com ícone e contorno (destrutivo nunca cheio), sem diálogo: a remoção é parte de uma edição ainda não salva. */}
                      <div className="grid grid-cols-3 gap-2">
                        <Button variant="secondary" className="px-1!" onClick={() => setPicker({ replace: e.uid })}>
                          Trocar
                        </Button>
                        <Button variant="secondary" className="px-1!" onClick={() => changeList((l) => [...l.slice(0, i + 1), { ...e, uid: uid() }, ...l.slice(i + 1)])}>
                          Duplicar
                        </Button>
                        <Button
                          variant="danger"
                          className="gap-1.5! px-1!"
                          icon={<Trash2 className="size-4 shrink-0" aria-hidden />}
                          onClick={() => {
                            changeList((l) => l.filter((x) => x.uid !== e.uid));
                            setOpenEx(null);
                          }}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}

        <Button variant={d.exercises.length ? "secondary" : "primary"} className="w-full" onClick={() => setPicker({})} icon={<Plus className="size-4" />}>
          Adicionar exercícios ao treino {d.key}
        </Button>
      </section>

      {volume.length ? (
        <Panel title="Séries por grupo em uma volta da ficha" className="no-print">
          <ul className="flex flex-wrap gap-1.5">
            {volume.map((v) => (
              <li key={v.group} className="num rounded-full border border-rule-strong px-2.5 py-1 text-sm">
                {GROUP_LABEL[v.group]} <span className="font-bold">{v.sets}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-steel">Conta as séries do grupo principal de cada exercício. Multiplique pela frequência semanal de cada treino.</p>
        </Panel>
      ) : null}

      <Field label="Orientações gerais da ficha" className="no-print" hint={isCoachEditing || template ? "Aparecem para o aluno em Hoje e no texto enviado pelo WhatsApp." : "Aparecem em Hoje e no texto que você compartilhar."}>
        <Textarea value={program.notes ?? ""} onChange={(e) => change((p) => ({ ...p, notes: e.target.value }))} rows={3} maxLength={800} placeholder="Aquecimento, progressão de carga, cardio, dias de descanso…" />
      </Field>

      <Panel title={shareTitle} className="no-print">
        {needsCoachIdentity(user) ? (
          <Link href="/conta" className="mb-2 flex min-h-11 items-center gap-2 text-sm font-semibold underline">
            <IdCard className="size-4 shrink-0" aria-hidden /> {COACH_IDENTITY_HINT}
          </Link>
        ) : null}
        {linkPanel && program.active ? (
          <>
            {/* Link para o app do aluno como ação principal; texto, PDF e planilha em "Outras formas" (U2 §3.5, anamnese §8.6). */}
            {pendingNote ?? <PanelDeliveryLines student={linkPanel} version={deliveryVersion} className="mb-3" />}
            {barSends ? null : <SendFichaLink student={linkPanel} where="editor" enabled={!dirty && !empty} version={saveCount} onSent={() => setDeliveryVersion((n) => n + 1)} />}
            <div className={cx(!barSends && "mt-4 border-t border-rule pt-3")}>
              <h3 className="text-sm font-bold">Outras formas</h3>
              <p className="mb-3 mt-0.5 text-sm text-steel">Texto, PDF e planilha não atualizam o app de {firstName(linkPanel.name)}.</p>
              {/* O link é o único verde do painel: o texto pelo WhatsApp fica secundário ("Mandar como texto"). */}
              <ProgramShare {...shareProps} secondary />
            </div>
          </>
        ) : linkPanel ? (
          <>
            <p className="mb-3 text-sm text-steel">Torne a ficha ativa para enviar o link.</p>
            {pendingNote}
            {/* Ficha inativa: o link fica para depois de ativar; o texto continua, como secundário (spec §8.6). */}
            <ProgramShare {...shareProps} secondary />
          </>
        ) : (
          <>
            {pendingNote}
            {programShare}
          </>
        )}
      </Panel>

      {/* Versão de impressão: a ficha inteira em papel */}
      <div className="hidden print:block">
        <header className="mb-4 border-b-2 border-iron pb-2">
          <h1 className="plate-type text-2xl">{program.name}</h1>
          {adjustedNote ? <p className="text-sm font-semibold">{adjustedNote}</p> : signature ? <p className="text-sm font-semibold">{signature}</p> : null}
          <p className="text-sm">
            {[names.studentName && `${names.studentLabel}: ${names.studentName}`, `Emitida em ${fmtFull(new Date().toISOString())}`, printValidity].filter(Boolean).join(" · ")}
          </p>
        </header>
        <div className="space-y-4">
          {program.days
            .filter((x) => x.exercises.length)
            .map((x, i) => (
              <FichaDay key={i} day={x} className="break-inside-avoid" />
            ))}
        </div>
        {program.notes?.trim() ? (
          <div className="mt-4 break-inside-avoid">
            <p className="col-head mb-1">Orientações</p>
            <p className="whitespace-pre-wrap text-sm">{program.notes}</p>
          </div>
        ) : null}
      </div>

      {/* Barra fixa: "não salvo" com "Salvar ficha" ou, depois de salvar, o resumo com o próximo passo. Sempre montada. */}
      <div ref={stickyBar} className="no-print sticky bottom-nav-safe z-10 lg:bottom-4">
        {dirty ? (
          <div ref={saveBar} className="space-y-2">
            {msg?.tone === "error" ? (
              // Fundo opaco: a barra flutua sobre a lista de exercícios.
              <div className="rounded-[var(--radius-ficha)] bg-paper shadow-lift">
                <Alert tone="error">{msg.text}</Alert>
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-3">
              <span className="inline-flex items-center gap-1.5 rounded bg-warn-fill px-2 py-1 text-sm font-semibold text-iron">
                <TriangleAlert className="size-4 shrink-0" aria-hidden /> Alterações não salvas
              </span>
              <Button size="lg" onClick={() => void save()} loading={saving} className="shadow-lift">
                Salvar ficha
              </Button>
            </div>
          </div>
        ) : null}
        <PostSaveBar
          open={barOpen}
          title={postSave?.title ?? ""}
          text={postSave?.text}
          textIcon={postSave?.textIcon}
          focusRequest={focusTitle}
          onClose={() => setPostSave(null)}
          action={
            barSends && linkPanel ? (
              <div ref={barAction}>
                <SendFichaLink key={saveCount} student={linkPanel} where="editor_salvo" enabled version={saveCount} compact status={false} onSent={barSent} />
              </div>
            ) : null
          }
        />
      </div>

      <ExercisePicker
        open={Boolean(picker)}
        onClose={() => setPicker(null)}
        onPick={pick}
        multi={!picker?.replace}
        recent={recent}
        title={picker?.replace ? "Trocar exercício" : `Adicionar ao treino ${d.key}`}
      />

      <ActionSheet
        open={dayMenu}
        onClose={() => setDayMenu(false)}
        title={`Treino ${d.key}`}
        actions={[
          { label: "Duplicar este treino", icon: <Copy className="size-5" />, hint: "Cria uma cópia para você variar os exercícios.", onSelect: duplicateDay, disabled: program.days.length >= 10 },
          { label: "Mover para antes", icon: <MoveLeft className="size-5" />, onSelect: () => moveDay(-1), disabled: index === 0 },
          { label: "Mover para depois", icon: <MoveRight className="size-5" />, onSelect: () => moveDay(1), disabled: index === program.days.length - 1 },
          {
            label: "Excluir este treino",
            icon: <Trash2 className="size-5" />,
            tone: "danger",
            disabled: program.days.length <= 1,
            hint: program.days.length <= 1 ? "A ficha precisa de pelo menos um treino." : undefined,
            onSelect: () => (d.exercises.length ? setConfirmDay(true) : deleteDay()),
          },
        ]}
      />

      <Dialog open={confirmDay} onClose={() => setConfirmDay(false)} title={`Excluir o treino ${d.key}?`}>
        <p className="text-[0.9375rem] text-steel">
          {d.exercises.length === 1 ? "O exercício deste treino sai da ficha." : `Os ${d.exercises.length} exercícios deste treino saem da ficha.`} Os treinos já registrados continuam no histórico.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setConfirmDay(false)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={deleteDay}>
            Excluir treino
          </Button>
        </div>
      </Dialog>

      <Dialog open={leave !== null} onClose={() => setLeave(null)} title="Salvar antes de sair?">
        <p className="text-[0.9375rem] text-steel">Você alterou a ficha e ainda não salvou.</p>
        {msg?.tone === "error" ? (
          <Alert tone="error" className="mt-3">
            {msg.text}
          </Alert>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => setLeave(null)} disabled={saving}>
            Continuar editando
          </Button>
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => {
              const to = leave;
              dropDraft();
              setDiscarded(true);
              setLeave(null);
              if (to) router.push(to);
            }}
          >
            Sair sem salvar
          </Button>
          <Button
            loading={saving}
            onClick={async () => {
              const to = leave;
              if (!(await save())) return;
              setLeave(null);
              if (to) router.push(to);
            }}
          >
            Salvar e sair
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

const fichaDraftKey = (editorId: string, programId: string) => `sr:fichadraft:${editorId}:${programId}`;

/** Rascunho `{ program, baseSig }` (ou a ficha solta, de antes da U5a); null sem rascunho ou com armazenamento bloqueado. */
function readDraft(editorId: string, programId: string): FichaDraft | null {
  try {
    return parseFichaDraft(sessionStorage.getItem(fichaDraftKey(editorId, programId)), programId);
  } catch {
    return null;
  }
}

function swap<T>(list: T[], a: number, b: number): T[] {
  const copy = [...list];
  [copy[a], copy[b]] = [copy[b]!, copy[a]!];
  return copy;
}

const show = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

/**
 * Campo numérico que deixa apagar e digitar à vontade: guarda o texto localmente e só
 * confirma valores válidos; ao sair do campo, ajusta para a faixa permitida.
 */
function NumField({
  label,
  value,
  onCommit,
  min,
  max,
  decimal,
  allowEmpty,
  className,
}: {
  label: string;
  value: number | null;
  onCommit: (v: number | null, final: boolean) => void;
  min: number;
  max: number;
  decimal?: boolean;
  allowEmpty?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(show(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(show(value));
  }, [value, focused]);

  const parse = (raw: string): number | null => {
    if (!raw.trim()) return null;
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n)) return null;
    return decimal ? Math.round(n * 100) / 100 : Math.round(n);
  };

  return (
    <label className={cx("block", className)}>
      <span className="col-head mb-1 block text-steel">{label}</span>
      <Input
        inputMode={decimal ? "decimal" : "numeric"}
        value={text}
        onFocus={(e) => {
          setFocused(true);
          selectAllSoon(e.target);
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(decimal ? /[^\d.,]/g : /\D/g, "").slice(0, 6);
          setText(raw);
          const n = parse(raw);
          if (n === null) {
            if (allowEmpty) onCommit(null, false);
          } else if (n >= min && n <= max) onCommit(n, false);
        }}
        onBlur={() => {
          setFocused(false);
          const n = parse(text);
          const next = n === null ? (allowEmpty ? null : value ?? min) : Math.min(max, Math.max(min, n));
          if (next !== value) onCommit(next, true);
          else setText(show(value));
        }}
        className="num h-11 px-2 text-center font-bold"
      />
    </label>
  );
}
