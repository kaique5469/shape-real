"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Alert, Button, Dialog, Empty, Field, Input, Panel, Skeleton, Textarea, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { aiDietAnalyze, aiDietGenerate, type DietAnalysis } from "@/lib/ai/client";
import { FOODS, type Food } from "@/lib/domain/foods";
import { normalize } from "@/lib/domain/exercises";
import { dietTotals, itemFromFood, sumItems, targetsForProfile } from "@/lib/domain/nutrition";
import { uid } from "@/lib/domain/ids";
import { track } from "@/lib/analytics";
import type { DietPlan, MacroTargets, Profile } from "@/lib/domain/types";

const MACROS: { key: keyof MacroTargets; label: string; unit: string; color: string }[] = [
  { key: "kcal", label: "Calorias", unit: "kcal", color: "bg-iron" },
  { key: "proteinG", label: "Proteína", unit: "g", color: "bg-plate-red" },
  { key: "carbsG", label: "Carboidrato", unit: "g", color: "bg-plate-yellow" },
  { key: "fatG", label: "Gordura", unit: "g", color: "bg-plate-blue" },
];

export function DietView({ owner, mode }: { owner: Profile; mode: "self" | "coach" }) {
  const { repo, user, accessToken } = useApp();
  const [diet, setDiet] = useState<DietPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "done" | "error" | "info" | "warn"; text: string } | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [prefs, setPrefs] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [addTo, setAddTo] = useState<string | null>(null);

  const computed = useMemo(() => targetsForProfile(owner), [owner]);

  useEffect(() => {
    repo
      .getDiet(owner.id)
      .then(setDiet)
      .finally(() => setLoading(false));
  }, [repo, owner.id]);

  const targets: MacroTargets | null = diet?.targets ?? (computed ? { kcal: computed.kcal, proteinG: computed.proteinG, carbsG: computed.carbsG, fatG: computed.fatG } : null);
  const totals = diet ? dietTotals(diet) : null;

  const change = (fn: (d: DietPlan) => DietPlan) => {
    setDiet((d) => (d ? fn(d) : d));
    setDirty(true);
    setMsg(null);
  };

  async function save() {
    if (!diet) return;
    setSaving(true);
    try {
      const saved = await repo.saveDiet({ ...diet, createdBy: diet.createdBy || user!.id });
      setDiet(saved);
      setDirty(false);
      setMsg({ tone: "done", text: mode === "coach" ? `Dieta enviada para ${owner.name.split(" ")[0]}.` : "Dieta salva." });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Não foi possível salvar." });
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    if (!targets) return;
    setGenBusy(true);
    try {
      const r = await aiDietGenerate({ targets, goal: owner.goal, weightKg: owner.weightKg, preferences: prefs || undefined, ownerId: owner.id, createdBy: user!.id }, await accessToken());
      setDiet({ ...r.data, id: diet?.id ?? r.data.id, targets });
      setDirty(true);
      setGenOpen(false);
      setMsg(r.notice ? { tone: r.quota ? "warn" : "info", text: r.notice } : { tone: "info", text: "Cardápio gerado. Revise e salve." });
      track("diet_generated", { source: r.source, where: mode });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Não foi possível gerar." });
    } finally {
      setGenBusy(false);
    }
  }

  function startBlank() {
    if (!targets) return;
    setDiet({
      id: uid(),
      ownerId: owner.id,
      createdBy: user!.id,
      name: "Minha dieta",
      targets,
      meals: ["Café da manhã", "Almoço", "Lanche", "Jantar"].map((name) => ({ uid: uid(), name, items: [] })),
      updatedAt: new Date().toISOString(),
    });
    setDirty(true);
  }

  if (loading) return <Skeleton className="h-80" />;

  return (
    <div className="space-y-5">
      {!targets ? (
        <Alert tone="info">
          {mode === "self" ? (
            <>
              Para calcular suas metas, informe sexo, ano de nascimento, altura e peso em{" "}
              <Link href="/conta" className="font-semibold underline">
                Conta
              </Link>
              .
            </>
          ) : (
            "O aluno ainda não informou peso e altura. Defina as metas manualmente ao criar a dieta."
          )}
        </Alert>
      ) : null}

      {targets ? (
        <Panel title="Metas diárias" action={computed ? <span className="text-xs text-steel">gasto estimado: {computed.tdee} kcal</span> : undefined}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {MACROS.map((m) => {
              const t = targets[m.key];
              const v = totals?.[m.key] ?? 0;
              const pct = t ? Math.min(130, (v / t) * 100) : 0;
              return (
                <div key={m.key}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{m.label}</span>
                    {diet && (mode === "coach" || !diet.createdBy || diet.createdBy === user!.id) ? (
                      <input
                        aria-label={`Meta de ${m.label}`}
                        inputMode="numeric"
                        value={t}
                        onChange={(e) => change((d) => ({ ...d, targets: { ...d.targets, [m.key]: Number(e.target.value.replace(/\D/g, "")) || 0 } }))}
                        className="num w-16 rounded border border-transparent bg-transparent text-right text-sm text-steel hover:border-rule focus:border-iron focus:outline-none"
                      />
                    ) : (
                      <span className="num text-sm text-steel">{t}</span>
                    )}
                  </div>
                  <p className="num plate-type mt-1 text-2xl">
                    {Math.round(v)}
                    <span className="text-sm font-semibold text-steel"> {m.unit}</span>
                  </p>
                  <div className="mt-1.5 h-2 rounded-full bg-chalk-2">
                    <div className={cx("h-full rounded-full transition-[width]", pct > 110 ? "bg-plate-red" : m.color)} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {!diet ? <p className="mt-3 text-xs text-steel">Barras mostram o cardápio salvo em relação à meta.</p> : null}
        </Panel>
      ) : null}

      {mode === "self" && targets ? <Analyzer owner={owner} targets={targets} /> : null}

      {diet ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{diet.name}</h2>
              {diet.createdBy && diet.createdBy !== owner.id && mode === "self" ? <p className="text-sm text-steel">Enviada pelo seu personal</p> : null}
            </div>
            <Button variant="secondary" size="sm" icon={<Wand2 className="size-4" />} onClick={() => setGenOpen(true)} disabled={!targets}>
              Gerar outro cardápio
            </Button>
          </div>
          {diet.notes ? <p className="max-w-[70ch] text-[0.9375rem] text-steel">{diet.notes}</p> : null}
          {diet.meals.map((meal) => {
            const t = sumItems(meal.items);
            return (
              <div key={meal.uid} className="overflow-hidden rounded-[8px] border border-rule bg-paper">
                <div className="flex items-center gap-3 border-b border-rule bg-chalk px-4 py-2.5">
                  <input
                    aria-label="Nome da refeição"
                    value={meal.name}
                    onChange={(e) => change((d) => ({ ...d, meals: d.meals.map((m) => (m.uid === meal.uid ? { ...m, name: e.target.value } : m)) }))}
                    className="min-w-0 flex-1 bg-transparent font-bold focus:outline-none"
                  />
                  {meal.time ? <span className="num text-sm text-steel">{meal.time}</span> : null}
                  <span className="num text-sm font-semibold">
                    {t.kcal} kcal · {Math.round(t.proteinG)} g P
                  </span>
                </div>
                <ul className="ruled">
                  {meal.items.map((i) => (
                    <li key={i.uid} className="flex items-center gap-3 px-4 py-2">
                      <span className="min-w-0 flex-1 truncate text-[0.9375rem]">{i.name}</span>
                      <span className="num w-16 text-right text-sm font-semibold">{i.grams} g</span>
                      <span className="num hidden w-36 text-right text-xs text-steel sm:block">
                        {i.kcal} kcal · P {Math.round(i.proteinG)} · C {Math.round(i.carbsG)} · G {Math.round(i.fatG)}
                      </span>
                      <button
                        onClick={() => change((d) => ({ ...d, meals: d.meals.map((m) => (m.uid === meal.uid ? { ...m, items: m.items.filter((x) => x.uid !== i.uid) } : m)) }))}
                        className="grid size-8 place-items-center rounded hover:bg-chalk-2"
                        aria-label={`Remover ${i.name}`}
                      >
                        <Trash2 className="size-4 text-steel" />
                      </button>
                    </li>
                  ))}
                </ul>
                <button onClick={() => setAddTo(meal.uid)} className="flex w-full items-center gap-2 border-t border-rule px-4 py-2.5 text-sm font-semibold text-plate-blue-ink hover:bg-chalk">
                  <Plus className="size-4" /> Adicionar alimento
                </button>
              </div>
            );
          })}
          <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => change((d) => ({ ...d, meals: [...d.meals, { uid: uid(), name: "Nova refeição", items: [] }] }))}>
            Adicionar refeição
          </Button>
          {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
          {dirty ? (
            <div className="sticky bottom-20 z-10 flex items-center justify-end gap-3 lg:bottom-4">
              <span className="rounded bg-plate-yellow px-2 py-1 text-sm font-semibold">Alterações não salvas</span>
              <Button size="lg" onClick={save} loading={saving} className="shadow-lift">
                {mode === "coach" ? "Enviar dieta" : "Salvar dieta"}
              </Button>
            </div>
          ) : null}
        </section>
      ) : (
        <>
          {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
          <Empty
            title={mode === "coach" ? `${owner.name.split(" ")[0]} ainda não tem dieta` : "Monte seu cardápio"}
            body="Gere um cardápio com alimentos do dia a dia que bate as metas de calorias e proteína, ou monte refeição por refeição."
            action={
              <div className="flex flex-wrap gap-2">
                <Button icon={<Sparkles className="size-4" />} onClick={() => setGenOpen(true)} disabled={!targets}>
                  Gerar cardápio com IA
                </Button>
                <Button variant="secondary" onClick={startBlank} disabled={!targets}>
                  Montar do zero
                </Button>
              </div>
            }
          />
        </>
      )}

      <Dialog open={genOpen} onClose={() => setGenOpen(false)} title="Gerar cardápio">
        <Field label="Preferências e restrições (opcional)" hint="Ex.: “não como peixe”, “vegetariano”, “sem lactose”, “almoço no restaurante”, “orçamento apertado”.">
          <Textarea value={prefs} onChange={(e) => setPrefs(e.target.value)} rows={3} maxLength={500} />
        </Field>
        {diet ? <p className="mt-3 text-sm text-steel">O cardápio atual será substituído depois que você salvar.</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setGenOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={generate} loading={genBusy} icon={<Sparkles className="size-4" />}>
            Gerar
          </Button>
        </div>
      </Dialog>

      <FoodPicker
        open={Boolean(addTo)}
        onClose={() => setAddTo(null)}
        onAdd={(food, grams) => change((d) => ({ ...d, meals: d.meals.map((m) => (m.uid === addTo ? { ...m, items: [...m.items, itemFromFood(food, grams)] } : m)) }))}
      />
    </div>
  );
}

function FoodPicker({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (f: Food, g: number) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Food | null>(null);
  const [grams, setGrams] = useState("100");
  const list = useMemo(() => {
    const n = normalize(q);
    return FOODS.filter((f) => !n || normalize(f.name).includes(n) || f.aliases.some((a) => normalize(a).includes(n))).slice(0, 30);
  }, [q]);
  return (
    <Dialog
      open={open}
      onClose={() => {
        setSel(null);
        onClose();
      }}
      title="Adicionar alimento"
    >
      {!sel ? (
        <>
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: arroz, frango, ovo…" aria-label="Buscar alimento" />
          <ul className="ruled mt-3 max-h-80 overflow-y-auto rounded-[8px] border border-rule">
            {list.map((f) => (
              <li key={f.id}>
                <button
                  onClick={() => {
                    setSel(f);
                    setGrams(String(f.unit?.g ?? 100));
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-chalk"
                >
                  <span className="font-semibold">{f.name}</span>
                  <span className="num shrink-0 text-xs text-steel">{f.kcal} kcal/100 g</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="space-y-4">
          <p className="font-bold">{sel.name}</p>
          <Field label="Quantidade (g)" hint={sel.unit ? `1 ${sel.unit.label} ≈ ${sel.unit.g} g` : undefined}>
            <Input inputMode="numeric" value={grams} onChange={(e) => setGrams(e.target.value.replace(/\D/g, ""))} autoFocus />
          </Field>
          {(() => {
            const it = itemFromFood(sel, Number(grams) || 0);
            return (
              <p className="num text-sm text-steel">
                {it.kcal} kcal · P {it.proteinG} g · C {it.carbsG} g · G {it.fatG} g
              </p>
            );
          })()}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSel(null)}>
              Voltar
            </Button>
            <Button
              disabled={!Number(grams)}
              onClick={() => {
                onAdd(sel, Number(grams));
                setSel(null);
                setQ("");
                onClose();
              }}
            >
              Adicionar
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Analyzer({ owner, targets }: { owner: Profile; targets: MacroTargets }) {
  const { user, accessToken } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<(DietAnalysis & { source: string; notice?: string; quota?: boolean }) | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const r = await aiDietAnalyze({ text, targets, goal: owner.goal, weightKg: owner.weightKg, ownerId: owner.id, createdBy: user!.id }, await accessToken());
      setRes({ ...r.data, source: r.source, notice: r.notice, quota: r.quota });
      track("diet_analyzed", { source: r.source, score: r.data.score });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível analisar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="O que você comeu hoje?">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        maxLength={4000}
        placeholder={"Café: 2 ovos, 1 pão francês com requeijão\nAlmoço: arroz, feijão, 150g de frango e salada\nLanche: whey com banana"}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={run} loading={busy} disabled={text.trim().length < 3} icon={<Sparkles className="size-4" />}>
          Analisar
        </Button>
        <span className="text-xs text-steel">Escreva como mandaria no WhatsApp. Quantidades ajudam na precisão.</span>
      </div>
      {err ? (
        <Alert tone="error" className="mt-3">
          {err}
        </Alert>
      ) : null}
      {res ? (
        <div className="mt-4 space-y-3 border-t border-rule pt-4">
          {res.notice ? <Alert tone={res.quota ? "warn" : "info"}>{res.notice}</Alert> : null}
          <div className="flex flex-wrap items-center gap-4">
            <span className={cx("num plate-type grid size-16 place-items-center rounded-full text-2xl text-white", res.score >= 80 ? "bg-plate-green" : res.score >= 55 ? "bg-plate-yellow !text-iron" : "bg-plate-red")}>{res.score}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{res.summary}</p>
              <p className="num text-sm text-steel">
                {res.totals.kcal}/{targets.kcal} kcal · P {Math.round(res.totals.proteinG)}/{targets.proteinG} g · C {Math.round(res.totals.carbsG)} g · G {Math.round(res.totals.fatG)} g
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
          {res.unknown.length ? <p className="text-sm text-steel">Não reconheci: {res.unknown.join(", ")}.</p> : null}
        </div>
      ) : null}
    </Panel>
  );
}
