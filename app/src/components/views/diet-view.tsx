"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, IdCard, MessageCircle, MoreHorizontal, Pencil, Plus, Printer, Replace, Search, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { shareNames } from "@/components/program/program-share";
import { ActionSheet, Alert, Button, Dialog, Empty, Field, IconButton, Input, Panel, Select, Skeleton, Textarea, cx, type SheetAction } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { OfflineError, aiAvailable, aiDietAnalyze, aiDietGenerate, useAI, type DietAnalysis } from "@/lib/ai/client";
import { COACH_IDENTITY_HINT, needsCoachIdentity } from "@/lib/data/demo";
import { dietToText, householdMeasure, parseDietBody, type DietBodyInput } from "@/lib/domain/diet-share";
import { normalize } from "@/lib/domain/exercises";
import { allFoods, getFood, type Food } from "@/lib/domain/foods";
import { firstName, waLink, waPhone } from "@/lib/domain/format";
import { uid } from "@/lib/domain/ids";
import { ACTIVITY_LABEL, analyzeDietText, buildDietTemplate, dietTotals, itemFromFood, sumItems, targetsForProfile } from "@/lib/domain/nutrition";
import { coachSignature, signerFor } from "@/lib/domain/program-share";
import { consentConfirmed } from "@/lib/domain/transfer";
import { fmtDate } from "@/lib/hooks";
import { reportError, track } from "@/lib/analytics";
import type { ActivityLevel, DietItem, DietPlan, MacroTargets, Meal, Profile } from "@/lib/domain/types";

const MACROS: { key: keyof MacroTargets; label: string; short: string; unit: string; color: string }[] = [
  { key: "kcal", label: "Calorias", short: "kcal", unit: "kcal", color: "bg-iron" },
  { key: "proteinG", label: "Proteína", short: "P", unit: "g", color: "bg-plate-red" },
  { key: "carbsG", label: "Carboidrato", short: "C", unit: "g", color: "bg-plate-yellow" },
  { key: "fatG", label: "Gordura", short: "G", unit: "g", color: "bg-plate-blue" },
];
const CRN_KEY = "sr:crn";
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");

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

export function DietView({ owner, mode }: { owner: Profile; mode: "self" | "coach" }) {
  const { repo, user, mode: dataMode, accessToken } = useApp();
  const ai = useAI(dataMode === "supabase");
  const [diet, setDiet] = useState<DietPlan | null>(null);
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
  const ready = useRef(false);

  const computed = useMemo(() => targetsForProfile(owner), [owner]);
  const who = firstName(owner.name);
  const coach = mode === "coach";
  // Assinatura "Nome · CREF …": o personal logado ou, no celular do aluno, o personal que mandou a dieta.
  const signer = signerFor(user, coach ? user?.id : diet?.createdBy);
  const signature = coachSignature(signer);
  const textOpts = { ...shareNames(user, coach ? owner : null), coachName: signer?.name, coachCref: signer?.cref };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    ready.current = false;
    repo
      .getDiet(owner.id)
      .then((d) => {
        if (!alive) return;
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

  async function discard() {
    try {
      sessionStorage.removeItem(dietDraftKey(user!.id, owner.id));
    } catch {}
    setRestored(false);
    setMsg(null);
    setDirty(false);
    try {
      setDiet(await repo.getDiet(owner.id));
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Não foi possível recarregar a dieta." });
    }
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
    setSaving(true);
    try {
      const saved = await repo.saveDiet({ ...diet, name: diet.name.trim() || (coach ? `Plano alimentar de ${who}` : "Minha dieta"), createdBy: coach ? user!.id : diet.createdBy || user!.id });
      setDiet(saved);
      setDirty(false);
      setRestored(false);
      const dietItems = saved.meals.flatMap((m) => m.items);
      track("diet_saved", { where: mode, meals: saved.meals.length, items: dietItems.length, custom_items: dietItems.filter((i) => i.foodId?.startsWith("custom_")).length, has_notes: Boolean(saved.notes?.trim()) });
      setMsg({
        tone: "done",
        text: !coach ? "Dieta salva." : repo.capabilities.invites ? `Dieta salva. ${who} já vê no app; use os botões abaixo para enviar pelo WhatsApp.` : `Dieta salva. Use os botões abaixo para enviar a ${who} pelo WhatsApp.`,
      });
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
      const r = await aiDietGenerate({ targets, goal: owner.goal, weightKg: owner.weightKg, preferences: ai.enabled && prefs.trim() ? prefs.trim() : undefined, ownerId: owner.id, createdBy: user!.id }, await accessToken());
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

  if (loading) return <Skeleton className="h-80" />;
  if (loadErr) return <Alert tone="error">{loadErr}</Alert>;

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

  const share = diet && hasItems ? dietToText(diet, textOpts) : "";

  return (
    <div className="space-y-5">
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

      {targets ? (
        <Panel
          title="Metas diárias"
          className="no-print"
          action={
            <button type="button" onClick={() => setTargetsOpen(true)} className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold underline">
              <Pencil className="size-3.5" aria-hidden /> Editar metas
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            {MACROS.map((m) => {
              const t = targets[m.key];
              const v = totals?.[m.key] ?? 0;
              const pct = t ? (v / t) * 100 : 0;
              const over = pct > 108;
              return (
                <div key={m.key} className="min-w-0">
                  <p className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold">{m.label}</span>
                    <span className="num text-steel">meta {int(t)}</span>
                  </p>
                  <p className="num plate-type mt-1 text-2xl">
                    {hasItems ? int(v) : "—"}
                    <span className="text-sm font-semibold text-steel"> {m.unit}</span>
                  </p>
                  <div className="mt-1.5 h-2 rounded-full bg-chalk-2" aria-hidden>
                    <div className={cx("h-full rounded-full transition-[width]", over ? "bg-plate-red" : m.color)} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  {hasItems ? (
                    <p className={cx("num mt-1 text-xs", over ? "font-semibold text-plate-red-ink" : "text-steel")}>
                      {Math.abs(v - t) <= t * 0.05 ? "na meta" : v < t ? `faltam ${int(t - v)} ${m.unit}` : `passou ${int(v - t)} ${m.unit}`}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-steel">
            {computed ? `Gasto diário estimado${coach ? ` de ${who}` : ""}: ${int(computed.tdee)} kcal. ` : ""}
            {hasItems ? "Os números grandes são o total do cardápio abaixo." : "Monte o cardápio para comparar com as metas."}
          </p>
        </Panel>
      ) : (
        <Panel title="Metas diárias" className="no-print">
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

      {targets ? <Analyzer owner={owner} targets={targets} coach={coach} aiOn={ai.enabled} onUse={(meals) => (hasItems ? setPendingPlan(meals) : usePlan(meals))} /> : null}

      {diet ? (
        <section className="no-print space-y-3" aria-label="Cardápio">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <input
                aria-label="Nome do plano alimentar"
                value={diet.name}
                onChange={(e) => change((d) => ({ ...d, name: e.target.value }))}
                maxLength={60}
                className="h-10 w-full min-w-0 rounded border border-transparent bg-transparent text-lg font-bold hover:border-rule focus:border-iron focus:outline-none"
              />
              {diet.createdBy && diet.createdBy !== owner.id && !coach ? <p className="text-sm text-steel">Enviada pelo seu personal · atualizada em {fmtDate(diet.updatedAt)}</p> : null}
            </div>
            <Button variant="secondary" size="sm" className="self-start" icon={ai.enabled ? <Sparkles className="size-4" /> : <Wand2 className="size-4" />} onClick={() => setGenOpen(true)} disabled={!targets}>
              {hasItems ? (ai.enabled ? "Gerar outro com IA" : "Montar outro automático") : ai.enabled ? "Gerar cardápio com IA" : "Montar cardápio automático"}
            </Button>
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
                    className="h-10 min-w-0 flex-1 rounded border border-transparent bg-transparent font-bold hover:border-rule focus:border-iron focus:outline-none"
                  />
                  <input
                    aria-label={`Horário de ${meal.name}`}
                    type="time"
                    value={meal.time ?? ""}
                    onChange={(e) => changeMeal(meal.uid, (m) => ({ ...m, time: e.target.value || undefined }))}
                    className="num h-10 w-24 shrink-0 rounded border border-transparent bg-transparent text-sm text-steel hover:border-rule focus:border-iron focus:outline-none"
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

          <Field label="Orientações gerais" hint={coach ? "Água, substituições, pré e pós-treino. Vai junto no texto do WhatsApp." : "Água, substituições, lembretes para você."}>
            <Textarea value={diet.notes ?? ""} onChange={(e) => change((d) => ({ ...d, notes: e.target.value }))} rows={3} maxLength={800} placeholder="Ex.: 35 ml de água por kg. Pode trocar arroz por batata ou macarrão na mesma quantidade." />
          </Field>

          {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
          {restored && dirty ? (
            <button type="button" onClick={() => void discard()} className="min-h-11 text-sm font-semibold text-steel underline hover:text-iron">
              Descartar essas alterações e voltar à versão salva
            </button>
          ) : null}

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

          {dirty ? (
            <div className="sticky bottom-20 z-10 flex items-center justify-end gap-3 lg:bottom-4">
              <span className="rounded bg-plate-yellow px-2 py-1 text-sm font-semibold">Alterações não salvas</span>
              <Button size="lg" onClick={save} loading={saving} className="shadow-lift">
                Salvar dieta
              </Button>
            </div>
          ) : null}
        </section>
      ) : (
        <div className="no-print space-y-3">
          {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
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
        </div>
      )}

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

      {/* Versão de impressão */}
      {diet && hasItems ? (
        <div className="hidden print:block">
          <header className="mb-4 border-b-2 border-iron pb-2">
            <h1 className="plate-type text-2xl">{coach ? `Plano alimentar — ${owner.name}` : diet.name}</h1>
            {signature ? <p className="text-sm font-semibold">{signature}</p> : null}
            <p className="num text-sm">
              Metas do dia: {int(diet.targets.kcal)} kcal · proteína {int(diet.targets.proteinG)} g · carboidrato {int(diet.targets.carbsG)} g · gordura {int(diet.targets.fatG)} g
            </p>
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
            <p className="num text-sm font-bold">
              Total do dia: {int(totals.kcal)} kcal · proteína {int(totals.proteinG)} g · carboidrato {int(totals.carbsG)} g · gordura {int(totals.fatG)} g
            </p>
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
          <Input data-field="birthYear" inputMode="numeric" value={f.birthYear} onChange={(e) => edit({ birthYear: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="1994" />
        </Field>
        <Field label="Altura (cm)" error={fieldErr("heightCm")}>
          <Input data-field="heightCm" inputMode="numeric" value={f.heightCm} onChange={(e) => edit({ heightCm: e.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder="172" />
        </Field>
        <Field label="Peso (kg)" error={fieldErr("weightKg")}>
          <Input data-field="weightKg" inputMode="decimal" value={f.weightKg} onChange={(e) => edit({ weightKg: e.target.value.replace(/[^\d.,]/g, "").slice(0, 6) })} placeholder="72,5" />
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
          <label className={cx("flex min-h-11 cursor-pointer items-start gap-3 rounded-[8px] border bg-paper p-3 text-[0.9375rem]", err?.field === "consent" ? "border-plate-red" : "border-rule")}>
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
            <p id="dieta-autorizacao-erro" className="mt-1 text-sm text-plate-red-ink">
              {err.text}
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

/** Campo de gramas: aceita apagar e redigitar; confirma valores entre 1 e 2000 g. */
function GramsInput({ value, onChange, label }: { value: number; onChange: (g: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);
  return (
    <span className="relative shrink-0">
      <input
        aria-label={label}
        inputMode="numeric"
        value={text}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
          setText(raw);
          const n = Number(raw);
          if (raw && n >= 1 && n <= 2000) onChange(n);
        }}
        onBlur={() => setFocused(false)}
        className="num h-10 w-[4.5rem] rounded-[6px] border border-rule-strong bg-paper pl-2 pr-6 text-right text-sm font-bold focus:border-iron focus:outline-none"
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-steel">g</span>
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
    <Dialog open={open} onClose={onClose} title="Metas diárias">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {MACROS.map((m) => (
            <Field key={m.key} label={`${m.label} (${m.unit})`}>
              <Input inputMode="numeric" value={f[m.key]} onChange={(e) => setF({ ...f, [m.key]: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
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

function Analyzer({ owner, targets, coach, aiOn, onUse }: { owner: Profile; targets: MacroTargets; coach: boolean; aiOn: boolean; onUse: (meals: Meal[]) => void }) {
  const { user, accessToken, mode: dataMode } = useApp();
  const [open, setOpen] = useState(!coach);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<(DietAnalysis & { source: string; notice?: string; quota?: boolean }) | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const who = firstName(owner.name);

  /** Análise pelo motor de regras, no aparelho: o texto da refeição e o peso não saem do celular. */
  function runLocal(offline: boolean) {
    const r = analyzeDietText(text, targets, owner.weightKg);
    setRes({ ...r, source: "motor", notice: offline && aiOn ? "Sem conexão agora: a análise foi feita pela base de alimentos do app, sem a IA." : undefined });
    track("diet_analyzed", { source: offline ? "offline" : "motor", score: r.score, where: coach ? "coach" : "self" });
  }

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      // IA desligada: nenhuma chamada a /api/ai/* (mesma regra da geração da ficha no onboarding).
      if (!(await aiAvailable(dataMode === "supabase"))) return runLocal(false);
      const r = await aiDietAnalyze({ text, targets, goal: owner.goal, weightKg: owner.weightKg, ownerId: owner.id, createdBy: user!.id }, await accessToken());
      setRes({ ...r.data, source: r.source, notice: r.notice, quota: r.quota });
      track("diet_analyzed", { source: r.source, score: r.data.score, where: coach ? "coach" : "self" });
    } catch (e) {
      if (e instanceof OfflineError) return runLocal(true);
      setErr(e instanceof Error ? e.message : "Não foi possível analisar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  const recognized = res?.meals.filter((m) => m.items.length) ?? [];

  return (
    <Panel
      title={coach ? `Analisar o que ${who} comeu` : "O que você comeu hoje?"}
      className="no-print"
      action={
        coach ? (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="-my-2 inline-flex min-h-10 min-w-11 items-center justify-end text-sm font-semibold underline">
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
            <span className="min-w-0 flex-1 text-xs text-steel">Escreva como no WhatsApp. Com quantidades (gramas, colheres, unidades) a conta fica mais precisa.</span>
          </div>
          {err ? (
            <Alert tone="error" className="mt-3">
              {err}
            </Alert>
          ) : null}
          {res ? (
            <div className="mt-4 space-y-3 border-t border-rule pt-4">
              {res.notice?.trim() ? <Alert tone={res.quota ? "warn" : "info"}>{res.notice}</Alert> : null}
              <div className="flex items-center gap-4">
                <span
                  className={cx("num plate-type grid size-16 shrink-0 place-items-center rounded-full text-2xl text-white", res.score >= 80 ? "bg-plate-green" : res.score >= 55 ? "bg-plate-yellow !text-iron" : "bg-plate-red")}
                  aria-label={`Nota ${res.score} de 100`}
                >
                  {res.score}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{res.summary}</p>
                  <p className="num text-sm text-steel">
                    {int(res.totals.kcal)} de {int(targets.kcal)} kcal · proteína {int(res.totals.proteinG)} de {int(targets.proteinG)} g
                  </p>
                  <p className="num text-sm text-steel">
                    carboidrato {int(res.totals.carbsG)} g · gordura {int(res.totals.fatG)} g
                  </p>
                </div>
              </div>
              {res.highlights.length ? (
                <ul className="space-y-1 text-[0.9375rem]">
                  {res.highlights.map((h) => (
                    <li key={h} className="flex gap-2">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-plate-green" aria-hidden />
                      {h}
                    </li>
                  ))}
                </ul>
              ) : null}
              {res.adjustments.length ? (
                <ul className="space-y-1 text-[0.9375rem]">
                  {res.adjustments.map((h) => (
                    <li key={h} className="flex gap-2">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-plate-red" aria-hidden />
                      {h}
                    </li>
                  ))}
                </ul>
              ) : null}
              {recognized.length ? (
                <details className="rounded-[6px] border border-rule">
                  <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold">O que foi reconhecido</summary>
                  <div className="space-y-2 border-t border-rule px-3 py-2">
                    {recognized.map((m) => (
                      <div key={m.uid}>
                        <p className="text-sm font-bold">{m.name}</p>
                        <ul className="num text-sm text-steel">
                          {m.items.map((i) => (
                            <li key={i.uid}>
                              {i.name} · {int(i.grams)} g · {int(i.kcal)} kcal
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
              {res.unknown.length ? (
                <Alert tone="warn">
                  Não reconheci: <strong>{res.unknown.join("; ")}</strong>. Tente com a quantidade e o nome do alimento, ou crie o alimento ao montar o cardápio.
                </Alert>
              ) : null}
              {recognized.length ? (
                <Button variant="secondary" size="sm" onClick={() => onUse(recognized)}>
                  Usar como cardápio
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}
