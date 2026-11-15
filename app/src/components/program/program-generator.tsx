"use client";

import { useState } from "react";
import { PenLine, RefreshCw, Sparkles } from "lucide-react";
import { FichaDay } from "@/components/ficha";
import { GoalPicker, LimitsPicker, RoutinePicker, SystemChooser, type TrainingPrefs } from "@/components/preferences";
import { Alert, Button, Field, Panel, Textarea } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { aiProgram } from "@/lib/ai/client";
import { getSystem, suggestSystem } from "@/lib/domain/systems";
import { GOAL_LABEL } from "@/lib/domain/generator";
import { uid } from "@/lib/domain/ids";
import { track } from "@/lib/analytics";
import type { Profile, Program } from "@/lib/domain/types";

/**
 * Gera uma ficha (IA com fallback do motor), mostra a prévia e salva.
 * Usado pelo aluno (para si) e pelo personal (para um aluno).
 */
export function ProgramGenerator({ owner, forName, onSaved }: { owner: Profile; forName?: string; onSaved: (p: Program) => void }) {
  const { user, repo, accessToken } = useApp();
  const [prefs, setPrefs] = useState<TrainingPrefs>({
    goal: owner.goal ?? "hipertrofia",
    level: owner.level ?? "intermediario",
    daysPerWeek: owner.daysPerWeek ?? 3,
    sessionMinutes: owner.sessionMinutes ?? 60,
    equipment: owner.equipment ?? "academia",
    system: owner.preferredSystem ?? suggestSystem(owner.daysPerWeek ?? 3, owner.level ?? "intermediario"),
    limitations: owner.limitations ?? "",
    emphasis: [],
  });
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<Program | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quota, setQuota] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<TrainingPrefs>) => setPrefs((s) => ({ ...s, ...p }));
  const isCoach = user!.id !== owner.id;

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const r = await aiProgram({ ...prefs, notes: notes || undefined, seed: Math.floor(Math.random() * 1e6) }, { ownerId: owner.id, createdBy: user!.id }, await accessToken());
      setPreview({ ...r.data, source: isCoach ? "personal" : r.source === "ia" ? "ia" : "modelo" });
      setNotice(r.notice ?? null);
      setQuota(Boolean(r.quota));
      track("program_generated", { where: isCoach ? "coach" : "athlete", source: r.source, system: prefs.system });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível gerar.");
    } finally {
      setBusy(false);
    }
  }

  function blank() {
    const sys = getSystem(prefs.system);
    const now = new Date().toISOString();
    setPreview({
      id: uid(),
      ownerId: owner.id,
      createdBy: user!.id,
      name: `${sys.short} · ${GOAL_LABEL[prefs.goal]}`,
      system: prefs.system,
      goal: prefs.goal,
      level: prefs.level,
      daysPerWeek: prefs.daysPerWeek,
      days: sys.templates.map((t) => ({ key: t.key, title: t.title, focus: t.focus, exercises: [] })),
      active: true,
      source: isCoach ? "personal" : "manual",
      createdAt: now,
      updatedAt: now,
    });
  }

  async function save() {
    if (!preview) return;
    setBusy(true);
    try {
      const saved = await repo.saveProgram({ ...preview, active: true });
      track(isCoach ? "program_assigned" : "program_saved", { source: preview.source });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      setBusy(false);
    }
  }

  if (preview) {
    const empty = preview.days.every((d) => !d.exercises.length);
    return (
      <div className="space-y-4">
        {notice ? <Alert tone={quota ? "warn" : "info"}>{notice}</Alert> : null}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="plate-type text-2xl">{preview.name}</h2>
            <p className="text-sm text-steel">{forName ? `Para ${forName} · ` : ""}{getSystem(preview.system).name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!empty ? (
              <Button variant="secondary" onClick={generate} loading={busy} icon={<RefreshCw className="size-4" />}>
                Outra versão
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setPreview(null)}>
              Ajustar respostas
            </Button>
          </div>
        </div>
        {preview.notes ? <p className="max-w-[70ch] text-[0.9375rem] text-steel">{preview.notes}</p> : null}
        {empty ? (
          <Alert tone="info">Ficha em branco criada com os dias do sistema {getSystem(preview.system).short}. Salve e adicione os exercícios no editor.</Alert>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {preview.days.map((d) => (
              <FichaDay key={d.key} day={d} />
            ))}
          </div>
        )}
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
          <Button size="lg" onClick={save} loading={busy} className="shadow-lift">
            {isCoach ? `Enviar ficha para ${forName?.split(" ")[0] ?? "o aluno"}` : "Salvar e ativar ficha"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Panel title="Objetivo">
        <GoalPicker value={prefs.goal} onChange={(goal) => set({ goal })} />
      </Panel>
      <Panel title="Rotina">
        <RoutinePicker prefs={prefs} set={set} />
      </Panel>
      <Panel title="Sistema de divisão">
        <SystemChooser prefs={prefs} set={set} />
      </Panel>
      <Panel title="Prioridades e limitações">
        <LimitsPicker prefs={prefs} set={set} />
        <Field label="Pedido livre para a IA (opcional)" className="mt-5" hint="Ex.: “quero agachamento livre e terra”, “sem máquina de leg press”, “foco em glúteo”.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="min-h-20" maxLength={500} />
        </Field>
      </Panel>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex flex-wrap gap-3">
        <Button size="lg" onClick={generate} loading={busy} icon={<Sparkles className="size-4" />}>
          Gerar ficha com IA
        </Button>
        <Button size="lg" variant="secondary" onClick={blank} icon={<PenLine className="size-4" />}>
          Montar do zero
        </Button>
      </div>
      {busy ? <p className="text-sm text-steel">Montando a ficha… leva alguns segundos.</p> : null}
    </div>
  );
}
