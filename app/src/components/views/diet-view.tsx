"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, CircleAlert, Copy, IdCard, MessageCircle, MoreHorizontal, Plus, Printer, Replace, Search, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { shareNames } from "@/components/program/program-share";
import { CopyButton } from "@/components/copy-button";
import { DeliveryLine, StatusRegion } from "@/components/delivery-status";
import { ActionSheet, Alert, Button, Dialog, Empty, Field, IconButton, Input, Panel, Select, Skeleton, Textarea, cx, type SheetAction } from "@/components/ui";
import { DietRead, NotesRead, PlanVsTargets } from "@/components/views/diet-read";
import { useApp } from "@/lib/app-context";
import { OfflineError, aiAvailable, aiDietAnalyze, aiDietGenerate, useAI, type DietAnalysis } from "@/lib/ai/client";
import { COACH_IDENTITY_HINT, needsCoachIdentity } from "@/lib/data/demo";
import { avisoDieta, pesoParaIA } from "@/lib/domain/anamnese-perfil";
import {
  MACRO_LABEL,
  MACRO_ORDER,
  adjustedNote,
  adjustingText,
  adjustingTitle,
  canAdjust,
  dietOrigin,
  dietScreen,
  itemsBand,
  mealsChanged,
  originLine,
  screenMode,
  usePlanAction,
  type DietOrigin,
  type DietScreen,
} from "@/lib/domain/diet-plan";
import { dietToText, householdMeasure, macroLine, parseDietBody, type DietBodyInput } from "@/lib/domain/diet-share";
import { normalize } from "@/lib/domain/exercises";
import { allFoods, getFood, type Food } from "@/lib/domain/foods";
import { SOLO_TESTER_ID } from "@/lib/domain/ficha-context";
import { firstName, fmtDayMonth, waLink, waPhone } from "@/lib/domain/format";
import { uid } from "@/lib/domain/ids";
import { ACTIVITY_LABEL, analyzeDietText, buildDietTemplate, descartarNaoLido, dietTotals, editarItem, itemFromFood, removerItem, revisarAnalise, sumItems, targetsForProfile, type LeituraDieta, type LeituraItem } from "@/lib/domain/nutrition";
import { coachSignature, signerFor } from "@/lib/domain/program-share";
import { fichaDeliveryLines, prepStatusText, type PrepVia } from "@/lib/domain/delivery";
import { consentConfirmed } from "@/lib/domain/transfer";
import { fmtDate, selectAllSoon, useStickyBarScrollPadding } from "@/lib/hooks";
import { reportError, track, type DietAnalyzedProps } from "@/lib/analytics";
import { useFichaDelivery, useFichaLink } from "@/lib/use-ficha-link";
import type { ActivityLevel, DietItem, DietPlan, MacroTargets, Meal, Profile } from "@/lib/domain/types";

const CRN_KEY = "sr:crn";
/** R3-12: sem trocar alimento grama por grama (a própria base desmente essa troca). */
const NOTAS_PLACEHOLDER = "Ex.: horários, preferências, o que evitar";
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const countItems = (meals: Meal[]) => meals.reduce((n, m) => n + m.items.length, 0);
/** "24/11/2026" (impressão). */
const fmtFullDate = (iso: string) => fmtDate(iso, { day: "2-digit", month: "2-digit", year: "numeric" });

/** Recalcula um item para uma nova quantidade (pelo alimento da base, ou proporcional quando não há). */
function resizeItem(item: DietItem, grams: number): DietItem {
  const food = item.foodId ? getFood(item.foodId) : undefined;
  if (food) return { ...itemFromFood(food, grams), uid: item.uid, name: item.name };
  const k = item.grams > 0 ? grams / item.grams : 0;
  return { ...item, grams, kcal: Math.round(item.kcal * k), proteinG: Math.round(item.proteinG * k * 10) / 10, carbsG: Math.round(item.carbsG * k * 10) / 10, fatG: Math.round(item.fatG * k * 10) / 10 };
}

function searchFoodsLocal(query: string): Food[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const all = allFoods();
  const hit = words.length ? all.filter((f) => words.every((w) => normalize(f.name).includes(w) || f.aliases.some((a) => normalize(a).includes(w)))) : all;
  const custom = (f: Food) => (f.id.startsWith("custom_") ? 0 : 1);
  return [...hit].sort((a, b) => custom(a) - custom(b) || (words.length ? a.name.length - b.name.length : 0)).slice(0, 60);
}

const dietDraftKey = (editorId: string, ownerId: string) => `sr:dietdraft:${editorId}:${ownerId}`;

function readDraft(editorId: string, ownerId: string): DietPlan | null {
  try {
    const raw = sessionStorage.getItem(dietDraftKey(editorId, ownerId));
    const d = raw ? (JSON.parse(raw) as DietPlan) : null;
    return d && d.ownerId === ownerId && Array.isArray(d.meals) ? d : null;
  } catch {
    return null;
  }
}

/**
 * `onDeliveryChange` (página do aluno, no personal): chamado depois de salvar a dieta e depois de um toque de envio no
 * painel daqui, para quem mostra a situação do envio fora desta tela reler o aparelho.
 */
export function DietView({ owner, mode, onDeliveryChange }: { owner: Profile; mode: "self" | "coach"; onDeliveryChange?: () => void }) {
  const { repo, user, mode: dataMode, accessToken, returnTo } = useApp();
  const ai = useAI(dataMode === "supabase");
  const [diet, setDiet] = useState<DietPlan | null>(null);
  /** Última versão lida do repositório ou acabada de gravar (a leitura e o "sem mudança" comparam com ela). */
  const [saved, setSaved] = useState<DietPlan | null>(null);
  /** Aluno: tocou em "Ajustar cardápio" / "Editar dieta" (a edição dura até salvar ou cancelar). */
  const [editing, setEditing] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "done" | "error" | "info" | "warn"; text: string } | null>(null);
  const [draftTargets, setDraftTargets] = useState<MacroTargets | null>(null);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [prefs, setPrefs] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [picker, setPicker] = useState<{ meal: string; swap?: DietItem } | null>(null);
  const [mealMenu, setMealMenu] = useState<Meal | null>(null);
  const [itemMenu, setItemMenu] = useState<{ meal: string; item: DietItem } | null>(null);
  const [pendingPlan, setPendingPlan] = useState<Meal[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [crnSeen, setCrnSeen] = useState(true);
  const [restored, setRestored] = useState(false);
  const [dropMeal, setDropMeal] = useState<Meal | null>(null);
  /** Sobe a cada "Salvar dieta" do personal: o link do painel de envio é refeito com a versão nova. */
  const [savedCount, setSavedCount] = useState(0);
  const ready = useRef(false);
  /** Foco depois da troca de tela (U3 §3.4): botão que abriu a edição, título do alerta do ajuste ou título das metas. */
  const focusNext = useRef<"opener" | "alert" | "targets" | null>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const alertHeadRef = useRef<HTMLHeadingElement>(null);
  const targetsRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const viewed = useRef(false);

  const computed = useMemo(() => targetsForProfile(owner), [owner]);
  const who = firstName(owner.name);
  const coach = mode === "coach";
  // "Ver como aluno": o personal vê o app como o aluno. O modo de teste "aluno sem personal" também liga returnTo e fica de fora.
  const byCoach = Boolean(returnTo) && user?.id !== SOLO_TESTER_ID;
  // De quem é o plano aberto (R2), no aparelho de quem segue a dieta.
  const origin: DietOrigin | null = !coach && diet ? dietOrigin(diet, owner.id, { remoteCoach: user?.remoteCoach, returnTo }) : null;
  const screen = dietScreen({ mode, editing, dirty, saved, hasDraftOrDiet: Boolean(diet), origin });
  const reading = screen === "leitura" || screen === "leitura_metas";
  const adjusting = screen === "ajuste";
  const texts = origin && origin.kind === "personal" ? adjustingText(origin) : null;
  // R5: cardápio ajustado neste aparelho sai sem "Nome · CREF" e com a linha do ajuste (dd/mm no texto; DD/MM/AAAA no papel).
  const noteText = origin ? adjustedNote(origin, fmtDayMonth) : null;
  const notePrint = origin ? adjustedNote(origin, fmtFullDate) : null;
  // Assinatura "Nome · CREF …": o personal logado ou, no celular do aluno, o personal que mandou a dieta.
  const signer = noteText ? null : signerFor(user, coach ? user?.id : diet?.createdBy);
  const signature = coachSignature(signer);
  const textOpts = { ...shareNames(user, coach ? owner : null), coachName: signer?.name, coachCref: signer?.cref, adjustedNote: noteText };
  const planAction = usePlanAction(mode, diet, owner.id);
  // Personal, modo local, aluno real: o envio principal é o link que atualiza o app do aluno (U2 R7).
  const linkPanel = coach && dataMode === "local" && !owner.sample;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    ready.current = false;
    repo
      .getDiet(owner.id)
      .then((d) => {
        if (!alive) return;
        setSaved(d);
        setEditing(false);
        // Edição que não chegou a ser salva (troca de aba, menu, voltar do aparelho): volta como estava.
        const draft = readDraft(user!.id, owner.id);
        if (draft) {
          setDiet(draft);
          setDirty(true);
          setRestored(true);
          setMsg({ tone: "info", text: "Recuperamos as alterações que você ainda não tinha salvado." });
        } else {
          setDiet(d);
          setDirty(false);
          setRestored(false);
        }
        ready.current = true;
      })
      .catch((e) => alive && setLoadErr(e instanceof Error ? e.message : "Não foi possível carregar a dieta."))
      .finally(() => alive && setLoading(false));
    try {
      setCrnSeen(localStorage.getItem(CRN_KEY) === "1");
    } catch {
      setCrnSeen(false);
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, owner.id, user?.id]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // Guarda o que está em edição enquanto não for salvo; some ao salvar ou descartar.
  useEffect(() => {
    if (!ready.current) return;
    try {
      if (dirty && diet) sessionStorage.setItem(dietDraftKey(user!.id, owner.id), JSON.stringify(diet));
      else sessionStorage.removeItem(dietDraftKey(user!.id, owner.id));
    } catch {
      /* sem espaço ou modo privado: segue só em memória */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diet, dirty, owner.id, user?.id]);

  // Uma vez por montagem, no aparelho de quem segue a dieta: em que estado a tela abriu (só categorias).
  useEffect(() => {
    if (coach || loading || loadErr || viewed.current) return;
    viewed.current = true;
    track("section_viewed", { area: "dieta", modo: screenMode(screen as Exclude<DietScreen, "coach">), origem: origin?.kind ?? "nenhum", by_coach: byCoach });
  }, [coach, loading, loadErr, screen, origin?.kind, byCoach]);

  // Foco depois de abrir ou fechar a edição (o elemento só existe depois de a tela trocar).
  useEffect(() => {
    const f = focusNext.current;
    if (!f) return;
    focusNext.current = null;
    if (f === "alert") return alertHeadRef.current?.focus();
    if (f === "targets") {
      const h = targetsRef.current?.querySelector<HTMLElement>("h2");
      if (h) {
        h.tabIndex = -1;
        h.focus();
      }
      return;
    }
    (openerRef.current ?? msgRef.current)?.focus();
  });

  /** Fecha a edição do aluno e devolve o foco ao botão que a abriu. */
  function leaveEditing(next: DietPlan | null) {
    setEditing(false);
    setAskDiscard(false);
    if (next) {
      setSaved(next);
      setDiet(next);
    }
    setDirty(false);
    setRestored(false);
    focusNext.current = "opener";
  }

  async function discard() {
    try {
      sessionStorage.removeItem(dietDraftKey(user!.id, owner.id));
    } catch {}
    setRestored(false);
    setMsg(null);
    setDirty(false);
    setEditing(false);
    setAskDiscard(false);
    try {
      const d = await repo.getDiet(owner.id);
      if (!coach) focusNext.current = "opener";
      setSaved(d);
      setDiet(d);
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Não foi possível recarregar a dieta." });
    }
  }

  /** "Ajustar cardápio" (plano do personal) ou "Editar dieta" (próprio). */
  function startEditing() {
    if (!origin) return;
    setMsg(null);
    setEditing(true);
    focusNext.current = origin.kind === "personal" ? "alert" : "targets";
    track("diet_adjust_started", { origem: origin.kind });
  }

  /** "Cancelar" da barra: sem alterações volta à leitura; com alterações, pergunta antes de descartar. */
  function cancelEditing() {
    if (dirty) setAskDiscard(true);
    else leaveEditing(null);
  }

  const targets: MacroTargets | null = diet?.targets ?? draftTargets ?? (computed ? { kcal: computed.kcal, proteinG: computed.proteinG, carbsG: computed.carbsG, fatG: computed.fatG } : null);
  const totals = diet ? dietTotals(diet) : null;
  const hasItems = Boolean(diet?.meals.some((m) => m.items.length));

  const change = (fn: (d: DietPlan) => DietPlan) => {
    setDiet((d) => (d ? fn(d) : d));
    setDirty(true);
    setMsg(null);
  };
  const changeMeal = (mealUid: string, fn: (m: Meal) => Meal) => change((d) => ({ ...d, meals: d.meals.map((m) => (m.uid === mealUid ? fn(m) : m)) }));

  function blankDiet(t: MacroTargets, meals?: Meal[]): DietPlan {
    return {
      id: diet?.id ?? uid(),
      ownerId: owner.id,
      createdBy: user!.id,
      name: coach ? `Plano alimentar de ${who}` : "Minha dieta",
      targets: t,
      meals: meals ?? ["Café da manhã", "Almoço", "Lanche da tarde", "Jantar"].map((name) => ({ uid: uid(), name, items: [] })),
      notes: diet?.notes,
      updatedAt: new Date().toISOString(),
    };
  }

  function applyTargets(t: MacroTargets) {
    track("diet_targets_edited", { where: mode, had_computed: Boolean(computed) });
    if (diet) change((d) => ({ ...d, targets: t }));
    else {
      // Sem cardápio ainda: as metas só ficam guardadas junto com um plano, então abre um em branco para salvar.
      setDraftTargets(t);
      setDiet(blankDiet(t));
      setDirty(true);
      setMsg({ tone: "info", text: "Metas definidas. Monte o cardápio e toque em “Salvar dieta” para guardar." });
    }
    setTargetsOpen(false);
  }

  async function save() {
    if (!diet) return;
    // Aluno, cardápio do personal (R3, R4): só as refeições mudam. Sem mudança, só volta à leitura, sem gravar nada
    // (senão "ajustado por você" e a falta da assinatura afirmariam um ajuste que não houve).
    if (adjusting && saved && !mealsChanged(diet.meals, saved.meals)) return leaveEditing(saved);
    if (!coach && !adjusting && editing && !dirty) return leaveEditing(saved);
    setSaving(true);
    try {
      let next: DietPlan;
      if (adjusting) {
        const base = saved ?? diet;
        // "Ver como aluno" nunca marca ajuste (quem edita é o próprio personal); na nuvem o plano é a mesma linha dos dois lados.
        const mark = dataMode === "local" && !byCoach;
        next = { ...base, meals: diet.meals, createdBy: base.createdBy, ...(mark ? { adjustedAt: new Date().toISOString() } : {}) };
      } else {
        next = { ...diet, name: diet.name.trim() || (coach ? `Plano alimentar de ${who}` : "Minha dieta"), createdBy: coach ? user!.id : diet.createdBy || user!.id };
      }
      const result = await repo.saveDiet(next);
      const dietItems = result.meals.flatMap((m) => m.items);
      track("diet_saved", {
        where: mode,
        meals: result.meals.length,
        items: dietItems.length,
        custom_items: dietItems.filter((i) => i.foodId?.startsWith("custom_")).length,
        has_notes: Boolean(result.notes?.trim()),
        ...(origin ? { origem: origin.kind } : {}),
      });
      if (coach) {
        setSaved(result);
        setDiet(result);
        setDirty(false);
        setRestored(false);
        setSavedCount((n) => n + 1);
        onDeliveryChange?.();
        setMsg({
          tone: "done",
          text: linkPanel
            ? `Dieta salva neste aparelho. Para ${who} receber, toque em Enviar link no WhatsApp.`
            : repo.capabilities.invites
              ? `Dieta salva. ${who} já vê no app; use os botões abaixo para enviar pelo WhatsApp.`
              : `Dieta salva. Use os botões abaixo para enviar a ${who} pelo WhatsApp.`,
        });
      } else {
        leaveEditing(result);
        setMsg({ tone: "done", text: adjusting && texts ? texts.saved : dataMode === "local" ? "Dieta salva neste aparelho." : "Dieta salva." });
      }
    } catch (e) {
      reportError(e, "dieta:salvar");
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo." });
    } finally {
      setSaving(false);
    }
  }

  /** Cardápio base calculado no aparelho, com as mesmas metas (IA desligada ou sem internet). */
  function generateLocal(offline: boolean) {
    if (!targets) return;
    const local = buildDietTemplate(targets, { ownerId: owner.id, createdBy: user!.id });
    setDiet({ ...local, id: diet?.id ?? local.id, name: diet?.name ?? blankDiet(targets).name, targets, notes: local.notes ?? diet?.notes });
    setDirty(true);
    setGenOpen(false);
    setMsg({ tone: "info", text: offline && ai.enabled ? "Sem conexão agora: este cardápio base foi montado pelo app, sem a IA. Ajuste as porções e salve." : "Cardápio montado. Ajuste as porções e salve." });
    track("diet_generated", { source: offline ? "offline" : "motor", where: mode });
  }

  async function generate() {
    if (!targets) return;
    setGenBusy(true);
    try {
      // IA desligada para esta pessoa: nada vai ao servidor (nem peso nem metas). O motor roda aqui mesmo.
      if (!(await aiAvailable(dataMode === "supabase"))) return generateLocal(false);
      const r = await aiDietGenerate({ targets, goal: owner.goal, weightKg: pesoParaIA(owner), preferences: ai.enabled && prefs.trim() ? prefs.trim() : undefined, ownerId: owner.id, createdBy: user!.id }, await accessToken());
      setDiet({ ...r.data, id: diet?.id ?? r.data.id, name: diet?.name ?? blankDiet(targets).name, targets, notes: r.data.notes ?? diet?.notes });
      setDirty(true);
      setGenOpen(false);
      setMsg(r.notice?.trim() ? { tone: r.quota ? "warn" : "info", text: r.notice } : { tone: "info", text: "Cardápio montado. Ajuste as porções e salve." });
      track("diet_generated", { source: r.source, where: mode });
    } catch (e) {
      setGenOpen(false);
      // Sem internet: o cardápio base é calculado no aparelho, com as mesmas metas.
      if (e instanceof OfflineError) return generateLocal(true);
      reportError(e, "dieta:gerar");
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Não foi possível montar o cardápio. Tente de novo." });
    } finally {
      setGenBusy(false);
    }
  }

  function usePlan(meals: Meal[]) {
    if (!targets) return;
    const fresh = meals.filter((m) => m.items.length).map((m) => ({ ...m, uid: uid(), items: m.items.map((i) => ({ ...i, uid: uid() })) }));
    setDiet(blankDiet(targets, fresh));
    setDirty(true);
    setPendingPlan(null);
    setMsg({ tone: "info", text: "O que foi analisado virou o cardápio. Ajuste as porções e salve." });
  }

  async function copyText() {
    if (!diet) return;
    try {
      await navigator.clipboard.writeText(dietToText(diet, textOpts));
      setCopied(true);
      track("diet_shared", { via: "copy" });
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setMsg({ tone: "error", text: "Não consegui copiar automaticamente. Use “Enviar pelo WhatsApp” ou “Imprimir”." });
    }
  }

  // Aviso fixo (spec §7, fim): com gatilho clínico de nutricionista nas respostas, a aba serve só para registrar as
  // metas do nutricionista. Sem botão de fechar, acima de tudo, e nunca nomeia a condição.
  const aviso = coach ? avisoDieta(owner) : null;
  const avisoFixo = aviso ? (
    <Alert tone="warn" className="no-print ph-no-capture">
      {aviso}
    </Alert>
  ) : null;
  if (loading)
    return avisoFixo ? (
      <div className="space-y-5">
        {avisoFixo}
        <Skeleton className="h-80" />
      </div>
    ) : (
      <Skeleton className="h-80" />
    );
  if (loadErr)
    return (
      <div className="space-y-5">
        {avisoFixo}
        <Alert tone="error">{loadErr}</Alert>
      </div>
    );

  const mealActions = (meal: Meal): SheetAction[] => {
    const i = diet?.meals.findIndex((m) => m.uid === meal.uid) ?? -1;
    const move = (dir: -1 | 1) =>
      change((d) => {
        const meals = [...d.meals];
        const to = i + dir;
        if (to < 0 || to >= meals.length) return d;
        [meals[i], meals[to]] = [meals[to]!, meals[i]!];
        return { ...d, meals };
      });
    return [
      { label: "Mover para cima", icon: <ArrowUp className="size-5" />, disabled: i <= 0, onSelect: () => move(-1) },
      { label: "Mover para baixo", icon: <ArrowDown className="size-5" />, disabled: i < 0 || i >= (diet?.meals.length ?? 0) - 1, onSelect: () => move(1) },
      { label: "Excluir refeição", icon: <Trash2 className="size-5" />, tone: "danger", onSelect: () => (meal.items.length ? setDropMeal(meal) : change((d) => ({ ...d, meals: d.meals.filter((m) => m.uid !== meal.uid) }))) },
    ];
  };

  // Compartilhar: o personal sempre; o aluno só na leitura de um cardápio com itens (é a versão salva).
  const canShare = coach || screen === "leitura";
  const share = diet && hasItems ? dietToText(diet, textOpts) : "";
  const analyzer = targets ? (
    <Analyzer owner={owner} targets={targets} coach={coach} aiOn={ai.enabled} useLabel={planAction === "usar" ? "Usar como cardápio" : planAction === "usar_meu" ? "Usar como meu cardápio" : null} onUse={(meals) => (hasItems ? setPendingPlan(meals) : usePlan(meals))} />
  ) : null;
  // Barra fixa de salvar: personal com alterações; aluno durante a edição (com "Cancelar").
  const showBar = Boolean(diet) && (coach ? dirty : adjusting || (screen === "edicao_propria" && (editing || dirty)));

  return (
    <div className="space-y-5">
      {avisoFixo}
      {coach && !crnSeen ? (
        <Alert tone="info" className="no-print">
          <div className="flex items-start gap-2">
            <p className="flex-1">Prescrição de dieta individualizada é atividade do nutricionista (CRN). Use este espaço para metas e orientações gerais, ou em parceria com o nutricionista do aluno.</p>
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={() => {
                setCrnSeen(true);
                try {
                  localStorage.setItem(CRN_KEY, "1");
                } catch {}
              }}
              className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded hover:bg-plate-blue/10"
            >
              <X className="size-4" />
            </button>
          </div>
        </Alert>
      ) : null}

      {/* Ajuste do cardápio do personal no aparelho do aluno (B): o que muda e onde fica. */}
      {adjusting && origin ? (
        <Alert tone="info" className="no-print">
          <h2 ref={alertHeadRef} tabIndex={-1} className="font-bold">
            {adjustingTitle(origin)}
          </h2>
          {texts ? <p className="mt-1">{texts.alert}</p> : null}
        </Alert>
      ) : null}

      {reading && diet && origin ? (
        <div className="no-print space-y-5">
          <DietRead diet={diet} origin={origin} screen={screen as "leitura" | "leitura_metas"} canAdjust={canAdjust(screen, byCoach)} onAdjust={startEditing} adjustButtonRef={openerRef} />
        </div>
      ) : targets ? (
        <div ref={targetsRef}>
          <PlanVsTargets
            className="no-print"
            targets={targets}
            totals={hasItems ? totals : null}
            editTargets={adjusting ? undefined : () => setTargetsOpen(true)}
            lockedNote={adjusting && texts ? texts.locked : undefined}
            tdeeLine={computed ? `Gasto diário estimado${coach ? ` de ${who}` : ""}: ${int(computed.tdee)} kcal.` : null}
          />
        </div>
      ) : (
        <Panel title="Metas do dia" className="no-print">
          {coach ? (
            <>
              <p className="text-[0.9375rem] text-steel">
                {`${who} ainda não tem sexo, idade, altura e peso no cadastro, então o app não calcula as metas sozinho. Defina manualmente ou complete o cadastro em “Editar dados do aluno”.`}
              </p>
              <Button className="mt-3" variant="secondary" onClick={() => setTargetsOpen(true)}>
                Definir metas manualmente
              </Button>
            </>
          ) : (
            <DietBodyForm owner={owner} onManual={() => setTargetsOpen(true)} />
          )}
        </Panel>
      )}

      {/* Analisador: no personal, recolhido acima do cardápio ("Usar como cardápio" troca o que está logo abaixo); no aluno, depois do cardápio. */}
      {coach ? analyzer : null}

      <div className="no-print space-y-3">
        {!diet && msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
        {reading ? null : diet ? (
          <section id="cardapio" className="space-y-3" aria-label="Cardápio">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 flex-1">
                {adjusting ? (
                  // R4: no ajuste, o nome do plano é do personal e não tem campo.
                  <p className="text-lg font-bold">{diet.name.trim() || "Plano alimentar"}</p>
                ) : (
                  <input
                    aria-label="Nome do plano alimentar"
                    value={diet.name}
                    onChange={(e) => change((d) => ({ ...d, name: e.target.value }))}
                    maxLength={60}
                    className="h-11 w-full min-w-0 rounded border border-transparent bg-transparent text-lg font-bold hover:border-rule focus:border-iron focus:outline-none"
                  />
                )}
                {origin && origin.kind === "personal" ? <p className="text-sm text-steel">{originLine(origin, fmtDayMonth)}</p> : null}
              </div>
              {adjusting ? null : (
                <Button variant="secondary" size="sm" className="self-start" icon={ai.enabled ? <Sparkles className="size-4" /> : <Wand2 className="size-4" />} onClick={() => setGenOpen(true)} disabled={!targets}>
                  {hasItems ? (ai.enabled ? "Gerar outro com IA" : "Montar outro automático") : ai.enabled ? "Gerar cardápio com IA" : "Montar cardápio automático"}
                </Button>
              )}
            </div>

            {diet.meals.map((meal) => {
              const t = sumItems(meal.items);
              return (
                <div key={meal.uid} className="overflow-hidden rounded-[8px] border border-rule bg-paper">
                  <div className="flex items-center gap-2 border-b border-rule bg-chalk py-1.5 pl-4 pr-1">
                    <input
                      aria-label="Nome da refeição"
                      value={meal.name}
                      onChange={(e) => changeMeal(meal.uid, (m) => ({ ...m, name: e.target.value }))}
                      maxLength={40}
                      className="h-11 min-w-0 flex-1 rounded border border-transparent bg-transparent text-base font-bold hover:border-rule focus:border-iron focus:outline-none"
                    />
                    <input
                      aria-label={`Horário de ${meal.name}`}
                      type="time"
                      value={meal.time ?? ""}
                      onChange={(e) => changeMeal(meal.uid, (m) => ({ ...m, time: e.target.value || undefined }))}
                      className="num h-11 w-[6.5rem] shrink-0 rounded border border-transparent bg-transparent text-base text-steel hover:border-rule focus:border-iron focus:outline-none"
                    />
                    <IconButton label={`Opções de ${meal.name}`} onClick={() => setMealMenu(meal)}>
                      <MoreHorizontal className="size-5" />
                    </IconButton>
                  </div>
                  {meal.items.length ? (
                    <ul className="ruled">
                      {meal.items.map((i) => {
                        const measure = householdMeasure(i.foodId ? getFood(i.foodId) : undefined, i.grams);
                        return (
                          <li key={i.uid} className="flex items-center gap-2 py-1.5 pl-4 pr-1">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[0.9375rem] font-semibold">{i.name}</span>
                              <span className="num block truncate text-xs text-steel">
                                {measure ? `${measure} · ` : ""}
                                {int(i.kcal)} kcal · P {int(i.proteinG)} · C {int(i.carbsG)} · G {int(i.fatG)}
                              </span>
                            </span>
                            <GramsInput value={i.grams} label={`Gramas de ${i.name}`} onChange={(g) => changeMeal(meal.uid, (m) => ({ ...m, items: m.items.map((x) => (x.uid === i.uid ? resizeItem(x, g) : x)) }))} />
                            <IconButton label={`Opções de ${i.name}`} onClick={() => setItemMenu({ meal: meal.uid, item: i })}>
                              <MoreHorizontal className="size-5" />
                            </IconButton>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="px-4 py-3 text-sm text-steel">Nenhum alimento nesta refeição.</p>
                  )}
                  <div className="flex items-center justify-between gap-3 border-t border-rule pl-2 pr-4">
                    <button type="button" onClick={() => setPicker({ meal: meal.uid })} className="flex min-h-11 items-center gap-2 px-2 text-sm font-semibold hover:underline">
                      <Plus className="size-4" aria-hidden /> Adicionar alimento
                    </button>
                    {meal.items.length ? (
                      <span className="num text-sm font-semibold">
                        {int(t.kcal)} kcal · {int(t.proteinG)} g P
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}

            <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => change((d) => ({ ...d, meals: [...d.meals, { uid: uid(), name: "Nova refeição", items: [] }] }))}>
              Adicionar refeição
            </Button>

            {adjusting && origin ? (
              // R4: as orientações são do personal; no ajuste, só leitura.
              <NotesRead notes={diet.notes} origin={origin} />
            ) : (
              <Field label="Orientações gerais" hint={coach ? "Água, substituições, pré e pós-treino. Vai junto no texto do WhatsApp." : "Água, substituições, lembretes para você."}>
                <Textarea value={diet.notes ?? ""} onChange={(e) => change((d) => ({ ...d, notes: e.target.value }))} rows={3} maxLength={800} placeholder={NOTAS_PLACEHOLDER} />
              </Field>
            )}
          </section>
        ) : (
          <Empty
            title={coach ? `${who} ainda não tem cardápio` : "Monte seu cardápio"}
            body={
              targets
                ? "Comece por um cardápio base com alimentos do dia a dia que fecha as metas de calorias e proteína, ou monte refeição por refeição."
                : "Defina as metas acima para montar o cardápio."
            }
            action={
              <div className="flex flex-wrap gap-2">
                <Button icon={ai.enabled ? <Sparkles className="size-4" /> : <Wand2 className="size-4" />} onClick={() => (ai.enabled ? setGenOpen(true) : void generate())} loading={genBusy && !genOpen} disabled={!targets}>
                  {ai.enabled ? "Gerar cardápio com IA" : "Montar cardápio automático"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={!targets}
                  onClick={() => {
                    if (!targets) return;
                    setDiet(blankDiet(targets));
                    setDirty(true);
                  }}
                >
                  Montar do zero
                </Button>
              </div>
            }
          />
        )}

        {diet && msg ? (
          <div ref={msgRef} tabIndex={-1} className="focus:outline-none">
            <Alert tone={msg.tone}>{msg.text}</Alert>
          </div>
        ) : null}
        {coach && diet && restored && dirty ? (
          <button type="button" onClick={() => void discard()} className="min-h-11 text-sm font-semibold text-steel underline hover:text-iron">
            Descartar essas alterações e voltar à versão salva
          </button>
        ) : null}

        {/* Aluno: o analisador vem depois do cardápio, sempre no mesmo lugar da árvore (com ou sem dieta, não perde o texto). */}
        {!coach ? analyzer : null}

        {diet && linkPanel ? (
          <SendDietPanel
            student={owner}
            dirty={dirty}
            version={savedCount}
            identityHint={needsCoachIdentity(user)}
            textHref={dirty || !hasItems ? undefined : waLink(share, owner.phone)}
            hasItems={hasItems}
            copied={copied}
            onTextWhatsApp={() => track("diet_shared", { via: "whatsapp", direct: Boolean(waPhone(owner.phone)) })}
            onCopyText={copyText}
            onPrint={() => {
              track("diet_shared", { via: "print" });
              window.print();
            }}
            onSent={onDeliveryChange}
          />
        ) : diet && canShare ? (
          <Panel title={coach ? `Enviar para ${who}` : "Compartilhar"}>
            {coach && needsCoachIdentity(user) ? (
              <Link href="/conta" className="mb-2 flex min-h-11 items-center gap-2 text-sm font-semibold underline">
                <IdCard className="size-4 shrink-0" aria-hidden /> {COACH_IDENTITY_HINT}
              </Link>
            ) : null}
            {dirty ? <p className="mb-3 text-sm text-steel">Salve as alterações para compartilhar a versão nova.</p> : !hasItems ? <p className="mb-3 text-sm text-steel">Adicione alimentos antes de enviar.</p> : null}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <a
                href={dirty || !hasItems ? undefined : waLink(share, coach ? owner.phone : undefined)}
                aria-disabled={dirty || !hasItems}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => !(dirty || !hasItems) && track("diet_shared", { via: "whatsapp", direct: Boolean(coach && waPhone(owner.phone)) })}
                className={cx(
                  "col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-[6px] bg-plate-green px-4 text-[0.9375rem] font-semibold text-white hover:bg-plate-green-ink",
                  (dirty || !hasItems) && "pointer-events-none opacity-50",
                )}
              >
                <MessageCircle className="size-4" aria-hidden /> Enviar pelo WhatsApp
              </a>
              <Button variant="secondary" disabled={dirty || !hasItems} onClick={copyText} icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>
                {copied ? "Copiado" : "Copiar texto"}
              </Button>
              <Button
                variant="secondary"
                disabled={dirty || !hasItems}
                icon={<Printer className="size-4" />}
                onClick={() => {
                  track("diet_shared", { via: "print" });
                  window.print();
                }}
              >
                Imprimir / PDF
              </Button>
            </div>
          </Panel>
        ) : null}
      </div>

      {/* Fora do bloco do cardápio: dentro dele, a barra só grudava depois de rolar (o bloco começa abaixo das metas)
          e, no topo da página, ficava atrás do menu de baixo. */}
      {showBar ? (
        <StickySaveBar className="no-print sticky bottom-nav-safe z-10 flex flex-wrap items-center justify-end gap-2 lg:bottom-4">
          {dirty ? (
            <span className="flex w-full justify-end sm:w-auto">
              <span className="rounded bg-warn-fill px-2 py-1 text-sm font-semibold text-iron">Alterações não salvas</span>
            </span>
          ) : null}
          {coach ? null : (
            <Button variant="secondary" size="lg" onClick={cancelEditing} disabled={saving} className="shadow-lift">
              Cancelar
            </Button>
          )}
          <Button size="lg" onClick={save} loading={saving} className="shadow-lift">
            {adjusting ? "Salvar ajustes" : "Salvar dieta"}
          </Button>
        </StickySaveBar>
      ) : null}

      <Dialog open={askDiscard} onClose={() => setAskDiscard(false)} title={adjusting ? "Descartar os ajustes?" : "Descartar as alterações?"}>
        <p className="text-[0.9375rem] text-steel">{adjusting ? "O que você mudou agora não fica salvo. O cardápio volta a ser o de antes." : "O que você mudou agora não fica salvo. A dieta volta a ser a de antes."}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setAskDiscard(false)}>
            {adjusting ? "Continuar ajustando" : "Continuar editando"}
          </Button>
          <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => void discard()}>
            {adjusting ? "Descartar ajustes" : "Descartar alterações"}
          </Button>
        </div>
      </Dialog>

      <Dialog open={Boolean(dropMeal)} onClose={() => setDropMeal(null)} title="Excluir esta refeição?">
        <p className="text-[0.9375rem] text-steel">
          {dropMeal ? `“${dropMeal.name}” sai do cardápio com ${dropMeal.items.length === 1 ? "o alimento que está nela" : `os ${dropMeal.items.length} alimentos que estão nela`}.` : ""}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setDropMeal(null)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const gone = dropMeal;
              setDropMeal(null);
              if (gone) change((d) => ({ ...d, meals: d.meals.filter((m) => m.uid !== gone.uid) }));
            }}
          >
            Excluir refeição
          </Button>
        </div>
      </Dialog>

      {/* Versão de impressão (a versão salva: o aluno só imprime na leitura; o personal, sem alterações pendentes). */}
      {diet && hasItems ? (
        <div className="hidden print:block">
          <header className="mb-4 border-b-2 border-iron pb-2">
            <h1 className="plate-type text-2xl">{coach ? `Plano alimentar — ${owner.name}` : diet.name}</h1>
            {notePrint ? <p className="text-sm font-semibold">{notePrint}</p> : signature ? <p className="text-sm font-semibold">{signature}</p> : null}
            <p className="num text-sm">Metas do dia: {macroLine(diet.targets)}</p>
          </header>
          {diet.meals
            .filter((m) => m.items.length)
            .map((meal) => {
              const t = sumItems(meal.items);
              return (
                <table key={meal.uid} className="num mb-4 w-full break-inside-avoid border border-rule-strong text-sm">
                  <thead>
                    <tr className="bg-chalk text-left">
                      <th className="px-3 py-1.5">
                        {meal.name}
                        {meal.time ? ` · ${meal.time}` : ""}
                      </th>
                      <th className="w-24 px-3 py-1.5 text-right">Quantidade</th>
                      <th className="w-40 px-3 py-1.5 text-right">Medida caseira</th>
                      <th className="w-20 px-3 py-1.5 text-right">kcal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meal.items.map((i) => (
                      <tr key={i.uid} className="border-t border-rule">
                        <td className="px-3 py-1.5">{i.name}</td>
                        <td className="px-3 py-1.5 text-right">{int(i.grams)} g</td>
                        <td className="px-3 py-1.5 text-right">{householdMeasure(i.foodId ? getFood(i.foodId) : undefined, i.grams) ?? ""}</td>
                        <td className="px-3 py-1.5 text-right">{int(i.kcal)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-rule-strong font-bold">
                      <td className="px-3 py-1.5" colSpan={3}>
                        Subtotal · {int(t.proteinG)} g de proteína
                      </td>
                      <td className="px-3 py-1.5 text-right">{int(t.kcal)}</td>
                    </tr>
                  </tbody>
                </table>
              );
            })}
          {totals ? (
            <p className="num text-sm font-bold">Total do cardápio: {macroLine(totals)}</p>
          ) : null}
          {diet.notes?.trim() ? (
            <div className="mt-4">
              <p className="col-head mb-1">Orientações</p>
              <p className="whitespace-pre-wrap text-sm">{diet.notes}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <TargetsDialog open={targetsOpen} onClose={() => setTargetsOpen(false)} current={targets} computed={computed ? { kcal: computed.kcal, proteinG: computed.proteinG, carbsG: computed.carbsG, fatG: computed.fatG } : null} onApply={applyTargets} />

      <Dialog open={genOpen} onClose={() => setGenOpen(false)} title={ai.enabled ? "Gerar cardápio com IA" : "Montar cardápio automático"}>
        {ai.enabled ? (
          <Field label="Preferências e restrições" hint="Opcional. Ex.: “não come peixe”, “vegetariano”, “sem lactose”, “almoça no restaurante”, “orçamento apertado”.">
            <Textarea value={prefs} onChange={(e) => setPrefs(e.target.value)} rows={3} maxLength={500} />
          </Field>
        ) : (
          <p className="text-[0.9375rem] text-steel">O app monta um cardápio base com alimentos do dia a dia que fecha as metas de calorias e proteína. Depois você troca alimentos e ajusta as porções.</p>
        )}
        {hasItems ? <p className="mt-3 text-sm font-semibold">O cardápio atual será substituído pelo novo.</p> : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setGenOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={generate} loading={genBusy}>
            {hasItems ? "Substituir cardápio" : "Montar cardápio"}
          </Button>
        </div>
      </Dialog>

      <Dialog open={Boolean(pendingPlan)} onClose={() => setPendingPlan(null)} title="Substituir o cardápio atual?">
        <p className="text-[0.9375rem] text-steel">As refeições analisadas entram no lugar do cardápio que está na tela. Nada é salvo até você tocar em “Salvar dieta”.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setPendingPlan(null)}>
            Cancelar
          </Button>
          <Button onClick={() => pendingPlan && usePlan(pendingPlan)}>Substituir</Button>
        </div>
      </Dialog>

      <ActionSheet open={Boolean(mealMenu)} onClose={() => setMealMenu(null)} title={mealMenu?.name || "Refeição"} actions={mealMenu ? mealActions(mealMenu) : []} />

      <ActionSheet
        open={Boolean(itemMenu)}
        onClose={() => setItemMenu(null)}
        title={itemMenu?.item.name ?? "Alimento"}
        actions={
          itemMenu
            ? [
                { label: "Trocar por outro alimento", icon: <Replace className="size-5" />, hint: "Mantém as calorias parecidas.", onSelect: () => setPicker({ meal: itemMenu.meal, swap: itemMenu.item }) },
                {
                  label: "Remover",
                  icon: <Trash2 className="size-5" />,
                  tone: "danger",
                  onSelect: () => changeMeal(itemMenu.meal, (m) => ({ ...m, items: m.items.filter((x) => x.uid !== itemMenu.item.uid) })),
                },
              ]
            : []
        }
      />

      <FoodPicker
        open={Boolean(picker)}
        swap={picker?.swap}
        onClose={() => setPicker(null)}
        onAdd={(food, grams) => {
          if (!picker) return;
          const fresh = itemFromFood(food, grams);
          changeMeal(picker.meal, (m) => ({ ...m, items: picker.swap ? m.items.map((x) => (x.uid === picker.swap!.uid ? fresh : x)) : [...m.items, fresh] }));
        }}
      />
    </div>
  );
}

/**
 * Painel "Enviar para {aluno}" da aba Dieta (personal, modo local, aluno real; U3a com U2 R7). A ação principal é o
 * link que atualiza o app do aluno (`useFichaLink`, o mesmo do "Enviar para o celular" da página do aluno): o link e
 * a mensagem ficam prontos ANTES do toque, e o toque grava o registro único do envio (`sr:sent:{aluno}:ficha`). Acima
 * dos botões, as linhas M/D da situação do envio; depois do toque, o que o aparelho viu ("Envio iniciado às 14:02…"),
 * nunca que a mensagem saiu ou chegou. Texto e PDF ficam em "Outras formas": eles não atualizam o app do aluno.
 */
/** Barra fixa de salvar (montada só enquanto aparece): o foco do teclado não para atrás dela nem do menu (WCAG 2.4.11). */
function StickySaveBar({ className, children }: { className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useStickyBarScrollPadding(ref, true);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

function SendDietPanel({
  student,
  dirty,
  version,
  identityHint,
  textHref,
  hasItems,
  copied,
  onTextWhatsApp,
  onCopyText,
  onPrint,
  onSent,
}: {
  student: Profile;
  dirty: boolean;
  version: number;
  identityHint: boolean;
  textHref: string | undefined;
  hasItems: boolean;
  copied: boolean;
  onTextWhatsApp: () => void;
  onCopyText: () => void;
  onPrint: () => void;
  /** Depois de um toque de envio (o registro já foi gravado). */
  onSent?: () => void;
}) {
  const first = firstName(student.name);
  const [tick, setTick] = useState(0);
  // Com alterações não salvas, o link levaria a versão antiga: só monta depois de salvar.
  const { estado, erro, toque, aoEnviar } = useFichaLink(student, !dirty, { where: "dieta", version });
  // `version` (salvamentos) e `tick` (toques aqui) só sobem: a soma muda sempre que um dos dois muda.
  const delivery = useFichaDelivery(student, version + tick);
  const lines = delivery ? fichaDeliveryLines(delivery, first) : null;
  const empty = Boolean(estado && !estado.programa && !estado.dieta);
  const off = dirty || !estado || empty;

  function sent(via: PrepVia) {
    if (!aoEnviar(via)) return;
    setTick((n) => n + 1);
    onSent?.();
  }

  return (
    <Panel title={`Enviar para ${first}`}>
      {identityHint ? (
        <Link href="/conta" className="mb-2 flex min-h-11 items-center gap-2 text-sm font-semibold underline">
          <IdCard className="size-4 shrink-0" aria-hidden /> {COACH_IDENTITY_HINT}
        </Link>
      ) : null}
      {dirty ? (
        <p className="mb-3 text-sm text-steel">Salve as alterações para enviar a versão nova.</p>
      ) : empty ? (
        <p className="mb-3 text-sm text-steel">Monte a ficha ou o cardápio de {first} antes de enviar.</p>
      ) : lines?.dialog.length ? (
        <div className="mb-3 space-y-1 text-sm">
          <DeliveryLine icon={lines.dialogIcon ?? "pendente"}>{lines.dialog[0]}</DeliveryLine>
          {lines.dialog[1] ? <p className="pl-[calc(1.05em+0.375rem)] text-steel">{lines.dialog[1]}</p> : null}
        </div>
      ) : null}
      {erro ? (
        <Alert tone="error" className="mb-3">
          {erro}
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <a
          href={off ? undefined : waLink(estado!.texto, student.phone)}
          aria-disabled={off}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => !off && sent("whatsapp")}
          className={cx(
            "inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[6px] bg-plate-green px-4 text-[0.9375rem] font-semibold text-white hover:bg-plate-green-ink",
            off && "pointer-events-none opacity-50",
          )}
        >
          <MessageCircle className="size-4" aria-hidden /> Enviar link no WhatsApp
        </a>
        {/* O mesmo botão do envio da ficha (correção da revisão): a cópia que falha não registra o toque, diz o que fazer
            e mostra a mensagem inteira, com o link, para segurar e copiar. */}
        <CopyButton text={estado?.texto ?? ""} disabled={off} onCopied={() => sent("copy")} />
      </div>
      {/* Montada junto com os botões, antes de qualquer toque; só o texto muda. */}
      <StatusRegion className="mt-2" text={toque ? prepStatusText(toque.via, toque.at, first, "personal") : null} icon={toque?.via === "copy" ? "copia" : "whatsapp"} />
      {/* R3-17: o que vai no link e quem consegue ler (o mesmo aviso do envio da ficha). */}
      {/* Só com o envio liberado: sem ficha nem cardápio (ou com alterações por salvar) o aviso falaria de outro link. */}
      {!off && estado ? <p className="mt-2 text-sm text-steel">{estado.aviso}</p> : null}

      <div className="mt-4 border-t border-rule pt-3">
        <h3 className="text-sm font-bold">Outras formas</h3>
        <p className="text-sm text-steel">Texto e PDF não atualizam o app de {first}.</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <a
            href={textHref}
            aria-disabled={!textHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => textHref && onTextWhatsApp()}
            className={cx(
              "col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-ficha)] border border-rule-strong bg-paper px-4 text-[0.9375rem] font-semibold text-iron hover:border-iron",
              !textHref && "pointer-events-none opacity-50",
            )}
          >
            <MessageCircle className="size-4" aria-hidden /> Mandar como texto
          </a>
          <Button variant="secondary" disabled={dirty || !hasItems} onClick={onCopyText} icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>
            {copied ? "Copiado" : "Copiar texto"}
          </Button>
          <Button variant="secondary" disabled={dirty || !hasItems} icon={<Printer className="size-4" />} onClick={onPrint}>
            Imprimir / PDF
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/**
 * Sem sexo, idade, altura e peso o app não calcula as metas: a pessoa informa aqui mesmo (o onboarding não pede
 * mais). Na primeira vez, guardar esses dados de saúde depende do checkbox de autorização, que começa desmarcado.
 */
function DietBodyForm({ owner, onManual }: { owner: Profile; onManual: () => void }) {
  const { mode: dataMode, returnTo, updateProfile } = useApp();
  const formRef = useRef<HTMLFormElement>(null);
  const [f, setF] = useState<DietBodyInput & { activity: ActivityLevel }>(() => ({
    sex: owner.sex ?? "",
    birthYear: owner.birthYear ? String(owner.birthYear) : "",
    heightCm: owner.heightCm ? String(owner.heightCm) : "",
    weightKg: owner.weightKg ? String(owner.weightKg).replace(".", ",") : "",
    activity: owner.activity ?? "moderado",
  }));
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState<{ field: keyof DietBodyInput | "consent" | "form"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const needsConsent = !consentConfirmed(owner);
  // Personal vendo o app como o aluno vê: quem marca é o personal, pelo aluno.
  const byCoach = Boolean(returnTo);
  const consentLabel = byCoach ? "O aluno autorizou registrar estes dados de saúde" : dataMode === "local" ? "Autorizo guardar meus dados de saúde neste celular" : "Autorizo guardar meus dados de saúde na minha conta";
  const fieldErr = (k: keyof DietBodyInput) => (err?.field === k ? err.text : undefined);
  const edit = (patch: Partial<typeof f>) => {
    setF((x) => ({ ...x, ...patch }));
    if (err && err.field !== "consent") setErr(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const r = parseDietBody(f, { thisYear: new Date().getFullYear(), needsConsent, consent });
    if (!r.ok) {
      setErr({ field: r.field, text: r.field === "consent" && byCoach ? "Marque a autorização do aluno para salvar limitações e medidas." : r.error });
      formRef.current?.querySelector<HTMLElement>(`[data-field="${r.field}"]`)?.focus();
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await updateProfile({ ...r.data, activity: f.activity, ...(needsConsent ? { consentHealthAt: new Date().toISOString(), consentSource: byCoach ? "personal" : "aluno" } : {}) });
      track("diet_targets_edited", { where: "self", had_computed: false, via: "dados_corporais" });
    } catch (e2) {
      reportError(e2, "dieta:dados");
      setErr({ field: "form", text: e2 instanceof Error && e2.message ? e2.message : "Não foi possível salvar. Tente de novo." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
      <p className="text-[0.9375rem] text-steel">Para o app calcular suas metas, informe sexo, ano de nascimento, altura e peso. Ou defina as metas manualmente.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Sexo" error={fieldErr("sex")}>
          <Select data-field="sex" value={f.sex} onChange={(e) => edit({ sex: e.target.value as DietBodyInput["sex"] })}>
            <option value="">—</option>
            <option value="F">Feminino</option>
            <option value="M">Masculino</option>
          </Select>
        </Field>
        <Field label="Ano de nascimento" error={fieldErr("birthYear")}>
          <Input data-field="birthYear" inputMode="numeric" value={f.birthYear} onChange={(e) => edit({ birthYear: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="Ex.: 1994" />
        </Field>
        <Field label="Altura (cm)" error={fieldErr("heightCm")}>
          <Input data-field="heightCm" inputMode="numeric" value={f.heightCm} onChange={(e) => edit({ heightCm: e.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder="Ex.: 172" />
        </Field>
        <Field label="Peso (kg)" error={fieldErr("weightKg")}>
          <Input data-field="weightKg" inputMode="decimal" value={f.weightKg} onChange={(e) => edit({ weightKg: e.target.value.replace(/[^\d.,]/g, "").slice(0, 6) })} placeholder="Ex.: 72,5" />
        </Field>
      </div>
      <Field label="Nível de atividade">
        <Select value={f.activity} onChange={(e) => edit({ activity: e.target.value as ActivityLevel })}>
          {(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((a) => (
            <option key={a} value={a}>
              {ACTIVITY_LABEL[a]}
            </option>
          ))}
        </Select>
      </Field>
      {needsConsent ? (
        <div>
          <label className={cx("flex min-h-11 cursor-pointer items-start gap-3 rounded-[8px] border bg-paper p-3 text-[0.9375rem]", err?.field === "consent" ? "border-danger" : "border-rule")}>
            <input
              type="checkbox"
              data-field="consent"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                if (err?.field === "consent") setErr(null);
              }}
              aria-invalid={err?.field === "consent"}
              aria-describedby={err?.field === "consent" ? "dieta-autorizacao-erro" : undefined}
              className="mt-0.5 size-5 shrink-0 accent-[var(--color-iron)]"
            />
            <span>{consentLabel}</span>
          </label>
          {err?.field === "consent" ? (
            <p id="dieta-autorizacao-erro" className="mt-1 flex items-start gap-1.5 text-sm text-danger">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0">{err.text}</span>
            </p>
          ) : null}
        </div>
      ) : null}
      {err?.field === "form" ? <Alert tone="error">{err.text}</Alert> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" loading={saving}>
          Calcular minhas metas
        </Button>
        <Button type="button" variant="secondary" onClick={onManual}>
          Definir metas manualmente
        </Button>
      </div>
    </form>
  );
}

/** Campo de gramas: aceita apagar e redigitar; confirma valores entre 1 e `max` (2000 g no cardápio). Em ml quando 1 ml ≈ 1 g. */
function GramsInput({ value, onChange, label, id, unit = "g", max = 2000 }: { value: number; onChange: (g: number) => void; label: string; id?: string; unit?: "g" | "ml"; max?: number }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);
  return (
    <span className="relative shrink-0">
      <input
        id={id}
        aria-label={label}
        inputMode="numeric"
        value={text}
        onFocus={(e) => {
          setFocused(true);
          selectAllSoon(e.currentTarget);
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
          setText(raw);
          const n = Number(raw);
          if (raw && n >= 1 && n <= max) onChange(n);
        }}
        onBlur={() => setFocused(false)}
        className={cx("num h-11 rounded-[6px] border border-field bg-paper pl-2 text-right text-base font-bold focus:border-iron focus:outline-none", unit === "ml" ? "w-24 pr-8" : "w-20 pr-6")}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-steel">{unit}</span>
    </span>
  );
}

function TargetsDialog({ open, onClose, current, computed, onApply }: { open: boolean; onClose: () => void; current: MacroTargets | null; computed: MacroTargets | null; onApply: (t: MacroTargets) => void }) {
  const [f, setF] = useState<Record<keyof MacroTargets, string>>({ kcal: "", proteinG: "", carbsG: "", fatG: "" });
  const [err, setErr] = useState<string | null>(null);
  const fill = (t: MacroTargets | null) => setF({ kcal: t ? String(t.kcal) : "", proteinG: t ? String(t.proteinG) : "", carbsG: t ? String(t.carbsG) : "", fatG: t ? String(t.fatG) : "" });
  useEffect(() => {
    if (open) {
      fill(current ?? computed);
      setErr(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const n = { kcal: Number(f.kcal), proteinG: Number(f.proteinG), carbsG: Number(f.carbsG), fatG: Number(f.fatG) };
  const fromMacros = n.proteinG * 4 + n.carbsG * 4 + n.fatG * 9;
  const mismatch = n.kcal > 0 && fromMacros > 0 && Math.abs(fromMacros - n.kcal) > n.kcal * 0.12;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!(n.kcal >= 800 && n.kcal <= 6000)) return setErr("Calorias: use um valor entre 800 e 6.000 kcal.");
    if (!(n.proteinG >= 20 && n.proteinG <= 400)) return setErr("Proteína: use um valor entre 20 e 400 g.");
    if (!(n.carbsG >= 0 && n.carbsG <= 900)) return setErr("Carboidrato: use um valor entre 0 e 900 g.");
    if (!(n.fatG >= 10 && n.fatG <= 300)) return setErr("Gordura: use um valor entre 10 e 300 g.");
    onApply({ kcal: Math.round(n.kcal), proteinG: Math.round(n.proteinG), carbsG: Math.round(n.carbsG), fatG: Math.round(n.fatG) });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Metas do dia">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {MACRO_ORDER.map((k) => (
            <Field key={k} label={`${MACRO_LABEL[k].long} (${MACRO_LABEL[k].unit})`}>
              <Input inputMode="numeric" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
            </Field>
          ))}
        </div>
        {mismatch ? (
          <Alert tone="warn">
            Os macros somam cerca de {int(fromMacros)} kcal, diferente das {int(n.kcal)} kcal informadas. Pode salvar assim, mas vale conferir.
          </Alert>
        ) : null}
        {err ? <Alert tone="error">{err}</Alert> : null}
        {computed ? (
          <button type="button" onClick={() => fill(computed)} className="min-h-11 text-sm font-semibold underline">
            Recalcular pelas medidas do cadastro
          </button>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Usar estas metas</Button>
        </div>
      </form>
    </Dialog>
  );
}

function FoodPicker({ open, onClose, onAdd, swap }: { open: boolean; onClose: () => void; onAdd: (f: Food, g: number) => void; swap?: DietItem }) {
  const { customVersion } = useApp();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Food | null>(null);
  const [grams, setGrams] = useState("100");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(null);
      setCreating(false);
    }
  }, [open]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const list = useMemo(() => searchFoodsLocal(q), [q, customVersion]);

  function select(f: Food) {
    setSel(f);
    // Na troca, sugere a quantidade que mantém as calorias do alimento anterior.
    const same = swap && f.kcal > 0 ? Math.max(5, Math.round(((swap.kcal / f.kcal) * 100) / 5) * 5) : null;
    setGrams(String(same ?? f.unit?.g ?? 100));
  }

  const g = Number(grams) || 0;
  const preview = sel ? itemFromFood(sel, g) : null;

  return (
    <Dialog open={open} onClose={onClose} title={creating ? "Criar alimento" : swap ? `Trocar ${swap.name}` : "Adicionar alimento"} wide>
      {creating ? (
        <CreateFood
          initialName={q.trim()}
          onCancel={() => setCreating(false)}
          onCreated={(f) => {
            setCreating(false);
            select(f);
          }}
        />
      ) : !sel ? (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel" aria-hidden />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: arroz, frango, ovo, whey…" aria-label="Buscar alimento" className="pl-9" />
          </div>
          <ul className="ruled mt-3 rounded-[8px] border border-rule">
            {list.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => select(f)} className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-chalk">
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {f.name}
                      {f.id.startsWith("custom_") ? <span className="ml-2 rounded bg-plate-blue/10 px-1.5 py-0.5 text-[0.6875rem] font-bold text-plate-blue-ink">seu</span> : null}
                    </span>
                    {f.unit ? (
                      <span className="num block text-xs text-steel">
                        1 {f.unit.label} ≈ {f.unit.g} g
                      </span>
                    ) : null}
                  </span>
                  <span className="num shrink-0 text-right text-xs text-steel">
                    {f.kcal} kcal
                    <span className="block">P {f.p} g /100 g</span>
                  </span>
                </button>
              </li>
            ))}
            {!list.length ? <li className="px-3 py-4 text-sm text-steel">Nenhum alimento encontrado para “{q.trim()}”. Crie o seu abaixo.</li> : null}
          </ul>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-3 flex min-h-12 w-full items-center gap-2 rounded-[8px] border border-dashed border-rule-strong px-3 py-2 text-left font-semibold hover:border-iron"
          >
            <Plus className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">{q.trim() && !list.some((f) => normalize(f.name) === normalize(q)) ? `Criar alimento “${q.trim()}”` : "Criar alimento novo"}</span>
          </button>
        </>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="font-bold">{sel.name}</p>
            <p className="num text-sm text-steel">
              Por 100 g: {sel.kcal} kcal · P {sel.p} g · C {sel.c} g · G {sel.f} g
            </p>
          </div>
          {sel.unit ? (
            <div>
              <p className="col-head mb-1.5 text-steel">Medida caseira ({sel.unit.label} ≈ {sel.unit.g} g)</p>
              <div className="flex flex-wrap gap-2">
                {[0.5, 1, 1.5, 2, 3].map((k) => {
                  const val = Math.round(sel.unit!.g * k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setGrams(String(val))}
                      aria-pressed={g === val}
                      className={cx("num h-11 min-w-12 rounded-[6px] border px-3 text-sm font-bold", g === val ? "border-iron bg-iron text-chalk" : "border-rule-strong bg-paper hover:border-iron")}
                    >
                      {k === 0.5 ? "½" : k === 1.5 ? "1 ½" : k}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <Field label="Quantidade (g)">
            <Input inputMode="numeric" value={grams} onChange={(e) => setGrams(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </Field>
          {preview ? (
            <p className="num rounded-[6px] bg-chalk px-3 py-2 text-sm">
              <span className="font-bold">{int(preview.kcal)} kcal</span> · proteína {preview.proteinG} g · carboidrato {preview.carbsG} g · gordura {preview.fatG} g
              {swap ? <span className="block text-steel">Antes: {int(swap.kcal)} kcal em {int(swap.grams)} g de {swap.name}.</span> : null}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setSel(null)}>
              Voltar para a busca
            </Button>
            <Button
              disabled={g < 1 || g > 2000}
              onClick={() => {
                onAdd(sel, g);
                onClose();
              }}
            >
              {swap ? "Trocar" : "Adicionar"}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function CreateFood({ initialName, onCancel, onCreated }: { initialName: string; onCancel: () => void; onCreated: (f: Food) => void }) {
  const { user, repo, refreshCustom } = useApp();
  const [f, setF] = useState({ name: initialName ? initialName[0]!.toUpperCase() + initialName.slice(1) : "", kcal: "", p: "", c: "", fat: "", unitLabel: "", unitG: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const num = (v: string) => Number(v.replace(",", "."));
  const dec = (v: string) => v.replace(/[^\d.,]/g, "").slice(0, 5);
  const kcalFromMacros = num(f.p) * 4 + num(f.c) * 4 + num(f.fat) * 9;
  const mismatch = num(f.kcal) > 0 && kcalFromMacros > 0 && Math.abs(kcalFromMacros - num(f.kcal)) > Math.max(25, num(f.kcal) * 0.2);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    const name = f.name.trim().replace(/\s+/g, " ");
    if (name.length < 2) return setErr("Dê um nome ao alimento.");
    if (allFoods().some((x) => normalize(x.name) === normalize(name))) return setErr("Já existe um alimento com esse nome. Volte e busque por ele.");
    const kcal = num(f.kcal);
    const p = num(f.p) || 0;
    const c = num(f.c) || 0;
    const fat = num(f.fat) || 0;
    if (!(kcal >= 0 && kcal <= 900) || f.kcal.trim() === "") return setErr("Calorias por 100 g: informe um valor entre 0 e 900.");
    if ([p, c, fat].some((v) => !(v >= 0 && v <= 100)) || p + c + fat > 100.5) return setErr("Proteína, carboidrato e gordura são por 100 g: cada um entre 0 e 100, somando no máximo 100.");
    const unitG = num(f.unitG);
    if (f.unitLabel.trim() && !(unitG >= 1 && unitG <= 1000)) return setErr("Informe quantos gramas tem a medida caseira.");
    if (!user) return;
    setSaving(true);
    setErr(null);
    try {
      const food: Food = { id: `custom_${uid()}`, name, aliases: [normalize(name)], kcal: Math.round(kcal), p, c, f: fat, unit: f.unitLabel.trim() ? { label: f.unitLabel.trim().toLowerCase(), g: Math.round(unitG) } : undefined, category: "outros" };
      const saved = await repo.saveCustomFood(user.id, food);
      await refreshCustom();
      track("custom_food_created", {});
      onCreated(saved);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível criar o alimento.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nome do alimento">
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus maxLength={60} placeholder="Ex.: Iogurte proteico de morango" />
      </Field>
      <fieldset>
        <legend className="col-head mb-2 text-steel">Valores por 100 g (veja o rótulo)</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Calorias (kcal)">
            <Input inputMode="decimal" value={f.kcal} onChange={(e) => setF({ ...f, kcal: dec(e.target.value) })} />
          </Field>
          <Field label="Proteína (g)">
            <Input inputMode="decimal" value={f.p} onChange={(e) => setF({ ...f, p: dec(e.target.value) })} />
          </Field>
          <Field label="Carboidrato (g)">
            <Input inputMode="decimal" value={f.c} onChange={(e) => setF({ ...f, c: dec(e.target.value) })} />
          </Field>
          <Field label="Gordura (g)">
            <Input inputMode="decimal" value={f.fat} onChange={(e) => setF({ ...f, fat: dec(e.target.value) })} />
          </Field>
        </div>
      </fieldset>
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-3">
        <Field label="Medida caseira" hint="Opcional. Ex.: pote, fatia, unidade.">
          <Input value={f.unitLabel} onChange={(e) => setF({ ...f, unitLabel: e.target.value })} maxLength={24} />
        </Field>
        <Field label="Gramas da medida">
          <Input inputMode="numeric" value={f.unitG} onChange={(e) => setF({ ...f, unitG: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
        </Field>
      </div>
      {mismatch ? <Alert tone="warn">Pelos macros, o alimento teria cerca de {int(kcalFromMacros)} kcal por 100 g. Confira se os valores são por 100 g e não por porção.</Alert> : null}
      {err ? <Alert tone="error">{err}</Alert> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Voltar para a busca
        </Button>
        <Button type="submit" loading={saving}>
          Criar alimento
        </Button>
      </div>
    </form>
  );
}

/** Resultado na tela: o da IA (sem `leitura`) ou o do motor (com `leitura`, `parcial` e `conferir`, R3-5). */
type Resultado = DietAnalysis & {
  source: string;
  notice?: string;
  quota?: boolean;
  leitura?: LeituraDieta["leitura"];
  parcial?: boolean;
  conferir?: number;
  /** A pessoa mexeu na leitura (editou, escolheu, removeu ou tirou da conta). */
  revisado?: boolean;
};

/** O total dito ao leitor de tela depois de uma correção. */
function totalFalado(r: Resultado, t: MacroTargets): string {
  if (!r.meals.length) return "Nenhum alimento na conta.";
  return `Total${r.parcial ? " parcial" : ""}: ${int(r.totals.kcal)} de ${int(t.kcal)} kcal e ${int(r.totals.proteinG)} g de proteína.`;
}

/**
 * "Conferir o que comi" (aluno) / "Analisar o que {aluno} comeu" (personal). `useLabel` (R12): "Usar como cardápio"
 * (personal), "Usar como meu cardápio" (plano próprio ou sem plano) ou null (plano do personal, no aparelho do aluno).
 * R3-5: o resultado mostra o que não foi lido logo abaixo do resumo e os itens lidos ANTES das dicas, cada um com
 * quantidade editável, remover e "Confira" quando a leitura tem dúvida; cada correção refaz a conta na hora.
 */
function Analyzer({ owner, targets, coach, aiOn, useLabel, onUse }: { owner: Profile; targets: MacroTargets; coach: boolean; aiOn: boolean; useLabel: string | null; onUse: (meals: Meal[]) => void }) {
  const { user, accessToken, mode: dataMode } = useApp();
  const [open, setOpen] = useState(!coach);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** Anúncio para o leitor de tela depois de uma correção (o total muda sem a pessoa sair do lugar). */
  const [aviso, setAviso] = useState<string | null>(null);
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumoRef = useRef<HTMLParagraphElement>(null);
  const idBase = useId();
  const qtdId = (itemUid: string) => `${idBase}-q-${itemUid}`;
  const naoContarId = (i: number) => `${idBase}-nc-${i}`;
  const who = firstName(owner.name);

  useEffect(
    () => () => {
      if (avisoTimer.current) clearTimeout(avisoTimer.current);
    },
    [],
  );

  /** Resultado novo: o resumo também vai para a região viva (a análise chega sozinha, às vezes depois da rede). */
  function mostrar(r: Resultado) {
    if (avisoTimer.current) clearTimeout(avisoTimer.current);
    setAviso(`Análise pronta. ${r.summary}`);
    setRes(r);
  }

  /** Análise pelo motor de regras, no aparelho: o texto da refeição e o peso não saem do celular. */
  function runLocal(offline: boolean) {
    const r = analyzeDietText(text, targets, owner.weightKg);
    mostrar({ ...r, source: "motor", notice: offline && aiOn ? "Sem conexão agora: a análise foi feita pela base de alimentos do app, sem a IA." : undefined });
    track("diet_analyzed", { source: offline ? "offline" : "motor", where: coach ? "coach" : "self", itens: itemsBand(countItems(r.meals)) } satisfies DietAnalyzedProps);
  }

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      // IA desligada: nenhuma chamada a /api/ai/* (mesma regra da geração da ficha no onboarding).
      if (!(await aiAvailable(dataMode === "supabase"))) return runLocal(false);
      const r = await aiDietAnalyze({ text, targets, goal: owner.goal, weightKg: pesoParaIA(owner), ownerId: owner.id, createdBy: user!.id }, await accessToken());
      mostrar({ ...r.data, source: r.source, notice: r.notice, quota: r.quota });
      track("diet_analyzed", { source: r.source, where: coach ? "coach" : "self", itens: itemsBand(countItems(r.data.meals)) } satisfies DietAnalyzedProps);
    } catch (e) {
      if (e instanceof OfflineError) return runLocal(true);
      setErr(e instanceof Error ? e.message : "Não foi possível analisar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  /** Revisão (R3-5): refaz a conta com a correção e anuncia o total novo (com atraso enquanto a pessoa digita). */
  function revisar(l: Pick<LeituraDieta, "meals" | "unknown"> & { leitura?: LeituraDieta["leitura"] }, feito: string, atraso = 0) {
    if (!res) return;
    const next: Resultado = { ...res, ...revisarAnalise(l, targets, owner.weightKg, res.source === "ia"), revisado: true };
    setRes(next);
    if (avisoTimer.current) clearTimeout(avisoTimer.current);
    const falado = `${feito} ${totalFalado(next, targets)}`;
    avisoTimer.current = setTimeout(() => setAviso(falado), atraso);
  }

  /** Depois que o controle tocado some (opção escolhida, item removido), o foco vai para um vizinho que faça sentido. */
  function focarDepois(id: string | null) {
    setTimeout(() => {
      const alvo = id ? document.getElementById(id) : null;
      (alvo ?? resumoRef.current)?.focus();
    }, 0);
  }

  function remover(itemUid: string) {
    if (!res) return;
    const ordem = res.meals.flatMap((m) => m.items.map((i) => i.uid));
    const at = ordem.indexOf(itemUid);
    const vizinho = ordem[at + 1] ?? ordem[at - 1] ?? null;
    revisar(removerItem(res, itemUid), "Item removido.");
    focarDepois(vizinho ? qtdId(vizinho) : null);
  }

  function naoContar(index: number) {
    if (!res) return;
    const resta = res.unknown.length - 1;
    revisar(descartarNaoLido(res, index), "Trecho fora da conta.");
    focarDepois(resta > index ? naoContarId(index) : resta > 0 ? naoContarId(index - 1) : null);
  }

  function conferido(itemUid: string, grams: number, feito: string) {
    if (!res) return;
    revisar(editarItem(res, itemUid, grams), feito);
    focarDepois(qtdId(itemUid));
  }

  const recognized = res?.meals.filter((m) => m.items.length) ?? [];
  const dicasOcultas = res?.source === "ia" && res.revisado;

  return (
    <Panel
      title={coach ? `Analisar o que ${who} comeu` : "Conferir o que comi"}
      className="no-print"
      action={
        coach ? (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="-my-2 inline-flex min-h-11 min-w-11 items-center justify-end text-sm font-semibold underline">
            {open ? "Fechar" : "Abrir"}
          </button>
        ) : undefined
      }
      pad={open}
    >
      {open ? (
        <>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={4000}
            aria-label={coach ? "O que o aluno comeu" : "O que você comeu"}
            placeholder={coach ? "Cole aqui o que o aluno mandou no WhatsApp.\nCafé: 2 ovos, 1 pão francês com requeijão\nAlmoço: arroz, feijão, 150g de frango e salada" : "Café: 2 ovos, 1 pão francês com requeijão\nAlmoço: arroz, feijão, 150g de frango e salada\nLanche: whey com banana"}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={run} loading={busy} disabled={text.trim().length < 3} icon={aiOn ? <Sparkles className="size-4" /> : undefined}>
              {aiOn ? "Analisar com IA" : "Analisar"}
            </Button>
            <span className="min-w-0 flex-1 text-xs text-steel">
              {coach ? "Escreva como no WhatsApp. Com quantidades (gramas, colheres, unidades) a conta fica mais precisa." : "Escreva como no WhatsApp. O app estima pelo que você escreveu, e o texto não fica salvo."}
            </span>
          </div>
          {err ? (
            <Alert tone="error" className="mt-3">
              {err}
            </Alert>
          ) : null}
          <p role="status" className="sr-only">
            {aviso ?? ""}
          </p>
          {res ? (
            <div className="mt-4 space-y-3 border-t border-rule pt-4">
              {res.notice?.trim() ? <Alert tone={res.quota ? "warn" : "info"}>{res.notice}</Alert> : null}
              {/* Sem nota nem cor de problema (U3 R11/R13): resumo e números em iron/steel. Sem alimento lido, sem totais. */}
              <div data-area="dieta-numeros" className="min-w-0">
                <p ref={resumoRef} tabIndex={-1} className="font-semibold">
                  {res.summary}
                </p>
                {res.meals.length ? (
                  <>
                    <p className="num text-sm text-steel">
                      {int(res.totals.kcal)} de {int(targets.kcal)} kcal{res.parcial ? " (parcial)" : ""} · proteína {int(res.totals.proteinG)} de {int(targets.proteinG)} g
                    </p>
                    <p className="num text-sm text-steel">
                      carboidrato {int(res.totals.carbsG)} g · gordura {int(res.totals.fatG)} g
                    </p>
                  </>
                ) : null}
              </div>
              {res.unknown.length ? (
                <Alert tone="warn">
                  <p>{res.unknown.length === 1 ? "Não reconheci este trecho:" : `Não reconheci estes ${res.unknown.length} trechos:`}</p>
                  <ul className="mt-1">
                    {res.unknown.map((u, i) => (
                      <li key={`${i}:${u}`} className="flex flex-wrap items-center justify-between gap-x-3">
                        <strong className="min-w-0 [overflow-wrap:anywhere]">{u}</strong>
                        <Button id={naoContarId(i)} variant="ghost" size="sm" className="-mr-2" aria-label={`Não contar “${u}”`} onClick={() => naoContar(i)}>
                          Não contar
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-sm">Corrija no texto acima, com a quantidade e o nome do alimento, e analise de novo. Se um trecho não conta, toque em “Não contar”.</p>
                </Alert>
              ) : null}
              {recognized.length ? (
                <section data-area="dieta-numeros" aria-labelledby={`${idBase}-itens`} className="rounded-[6px] border border-rule">
                  <div className="border-b border-rule px-3 py-2">
                    <h3 id={`${idBase}-itens`} className="text-sm font-bold">
                      O que eu li
                    </h3>
                    <p className="text-xs text-steel">Corrija a quantidade ou remova um item: o total é refeito na hora.</p>
                  </div>
                  <div className="divide-y divide-rule">
                    {recognized.map((m) => (
                      <div key={m.uid} className="px-3 pt-2">
                        <p className="text-sm font-bold">{m.name}</p>
                        <ul className="divide-y divide-rule">
                          {m.items.map((i) => (
                            <ItemLido
                              key={i.uid}
                              item={i}
                              leitura={res.leitura?.[i.uid]}
                              inputId={qtdId(i.uid)}
                              onGrams={(g) => revisar(editarItem(res, i.uid, g), "Quantidade alterada.", 800)}
                              onRemove={() => remover(i.uid)}
                              onConferido={(g, feito) => conferido(i.uid, g, feito)}
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              {dicasOcultas ? (
                <p className="text-sm text-steel">Totais refeitos com a sua correção. As dicas da IA eram da leitura anterior e foram tiradas.</p>
              ) : res.highlights.length || res.adjustments.length ? (
                <div data-area="dieta-numeros" className="space-y-1">
                  {res.highlights.length ? (
                    <ul className="space-y-1 text-[0.9375rem]">
                      {res.highlights.map((h) => (
                        <li key={h} className="flex gap-2">
                          <Check className="mt-1 size-4 shrink-0 text-steel" aria-hidden />
                          {h}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {res.adjustments.length ? (
                    <ul className="space-y-1 text-[0.9375rem]">
                      {res.adjustments.map((h) => (
                        <li key={h} className="flex gap-2">
                          <span className="ml-[5px] mr-[5px] mt-2 size-1.5 shrink-0 rounded-full bg-iron" aria-hidden />
                          {h}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              {recognized.length && useLabel ? (
                <div className="space-y-1">
                  {res.conferir ? (
                    <p className="text-sm text-steel">
                      {res.conferir === 1 ? "1 item ainda está para conferir: ele entra no cardápio com a quantidade de agora." : `${res.conferir} itens ainda estão para conferir: eles entram no cardápio com a quantidade de agora.`}
                    </p>
                  ) : null}
                  <Button variant="secondary" size="sm" onClick={() => onUse(recognized)}>
                    {useLabel}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}

const fmtG = (v: number) => (Math.round(v * 10) / 10).toLocaleString("pt-BR");

/**
 * Um item lido, na revisão (R3-5): nome, quantidade editável (g, ou ml quando 1 ml ≈ 1 g), remover, e o que a leitura
 * precisa mostrar: a aproximação ("você escreveu…"), a conversão de ml e o "Confira" com as opções ou "Está certo".
 */
export function ItemLido({ item, leitura, inputId, onGrams, onRemove, onConferido }: { item: DietItem; leitura?: LeituraItem; inputId: string; onGrams: (g: number) => void; onRemove: () => void; onConferido: (g: number, feito: string) => void }) {
  const unit = leitura?.medida === "ml" ? "ml" : "g";
  return (
    <li className="py-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="font-semibold leading-snug">{item.name}</p>
          <p className="num text-sm text-steel">
            {int(item.kcal)} kcal · {fmtG(item.proteinG)} g de proteína
          </p>
        </div>
        <GramsInput id={inputId} value={item.grams} unit={unit} max={3000} label={`Quantidade de ${item.name}, em ${unit === "ml" ? "ml" : "gramas"}`} onChange={onGrams} />
        <IconButton label={`Remover ${item.name}`} onClick={onRemove} className="-mr-2">
          <Trash2 className="size-4" aria-hidden />
        </IconButton>
      </div>
      {leitura?.aproximado && leitura.entrada ? <p className="mt-1 text-sm text-steel [overflow-wrap:anywhere]">Você escreveu “{leitura.entrada}”. É o mais próximo na base.</p> : null}
      {leitura?.conversao ? <p className="num mt-1 text-sm text-steel">{leitura.conversao}</p> : null}
      {leitura?.confira ? (
        <div className="mt-2 rounded-[6px] border border-warn-line bg-warn-surface px-3 py-2">
          <p className="flex items-start gap-1.5 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn-ink" aria-hidden />
            <span className="min-w-0">
              <strong>Confira:</strong> {leitura.confira}
            </span>
          </p>
          <div role="group" aria-label={`Conferir ${item.name}`} className="mt-2 flex flex-wrap gap-2">
            {leitura.opcoes?.length ? (
              leitura.opcoes.map((o) => (
                <button
                  key={o.rotulo}
                  type="button"
                  onClick={() => onConferido(o.grams, "Quantidade escolhida.")}
                  className="num min-h-11 rounded-[var(--radius-ficha)] border border-rule-strong bg-paper px-3 py-2 text-left text-sm font-semibold hover:border-iron"
                >
                  {o.rotulo}
                </button>
              ))
            ) : (
              <Button variant="secondary" size="sm" icon={<Check className="size-4" aria-hidden />} onClick={() => onConferido(item.grams, "Item conferido.")}>
                Está certo
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}
