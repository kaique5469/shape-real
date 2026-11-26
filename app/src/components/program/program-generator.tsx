"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ListChecks, PenLine, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { LiberacaoDialog } from "@/components/anamnese/liberacao-dialog";
import { PortaDialog } from "@/components/anamnese/porta-dialog";
import { FichaDay } from "@/components/ficha";
import { GoalPicker, LimitsPicker, RoutinePicker, SystemChooser, withSuggestion, type TrainingPrefs } from "@/components/preferences";
import { Alert, Button, Dialog, Field, Panel, Segmented, Skeleton, Textarea, cx } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { OfflineError, aiAvailable, aiProgram, useAI } from "@/lib/ai/client";
import { veioDe } from "@/lib/domain/anamnese-perfil";
import { ajustesTexto, antesDeGerar, contarAjustes, entradaInicial, motivosLevados, pickAiInput, toGenerateInput, type AntesDeGerar } from "@/lib/domain/anamnese-ficha";
import type { FichaSugerida, MotivoFicha } from "@/lib/domain/anamnese-types";
import { firstName } from "@/lib/domain/format";
import { GOAL_LABEL, generateProgram, type GenerateInput } from "@/lib/domain/generator";
import { uid } from "@/lib/domain/ids";
import { readAnamnese } from "@/lib/domain/questionario-link";
import { PROBLEMA_RESUMO } from "@/lib/domain/resumo";
import { DAY_KEYS, getSystem } from "@/lib/domain/systems";
import { alertas as alertasDe, comOverride } from "@/lib/domain/triagem";
import { evProgramGeneratedExtra } from "@/lib/anamnese-events";
import { reportError, track } from "@/lib/analytics";
import type { Profile, Program } from "@/lib/domain/types";

const clampDays = (d: number | undefined) => Math.min(6, Math.max(2, d ?? 3));

type Dialogo = { tipo: "antes"; antes: Exclude<AntesDeGerar, { modo: "livre" }> } | { tipo: "liberacao" } | null;

/**
 * Cria uma ficha: base gerada (IA quando ligada; senão o motor de regras, no próprio aparelho), prévia e salvamento;
 * ou ficha em branco para montar exercício por exercício.
 * Usado pelo aluno (para si) e pelo personal (para um aluno).
 *
 * Com questionário (o personal gera para um aluno com respostas; spec §8.5): o estado inicial vem de `toGenerateInput`,
 * com o painel "O que a ficha vai considerar", "Não adaptado pelo gerador" e a caixa "Intensidade moderada". Antes de
 * gerar, a trava (vermelho ou respostas ilegíveis) e a porta (laranja) de §6.4: sem liberação, nenhum caminho daqui
 * gera a ficha com trava; "Montar do zero" continua. `auto` (vem de `?auto=1`): gera ao abrir quando não há trava nem
 * porta; senão abre o diálogo. Ao salvar, `program.sugerido` guarda o que veio pré-preenchido.
 * Para a IA vai só `pickAiInput` (nada do questionário além da limitação canônica).
 */
export function ProgramGenerator({
  owner,
  forName,
  onSaved,
  auto = false,
  onOwnerChange,
}: {
  owner: Profile;
  forName?: string;
  onSaved: (p: Program) => void;
  /** Gera ao abrir (passo "Gerar ficha com estas respostas"). */
  auto?: boolean;
  /** Perfil do aluno regravado aqui (liberação ou "Seguir mesmo assim"). */
  onOwnerChange?: (p: Profile) => void;
}) {
  const { user, repo, mode, accessToken } = useApp();
  const ai = useAI(mode === "supabase");
  const isCoach = user!.id !== owner.id;
  const template = user!.role === "coach" && !isCoach;
  const who = forName ? firstName(forName) : null;
  const [hoje] = useState(() => new Date());
  const [dono, setDono] = useState<Profile>(owner);
  useEffect(() => setDono(owner), [owner]);
  const ws = isCoach ? user!.workStyle : undefined;
  // Respostas do questionário só contam quando quem gera é o personal (readAnamnese é a única porta de leitura).
  const leitura = isCoach ? readAnamnese(dono) : null;
  const comQuestionario = leitura !== null;
  const ficha: FichaSugerida | null = useMemo(() => (isCoach ? toGenerateInput(dono, ws, hoje, { hoje, liberacoes: dono.liberacoes ?? [] }) : null), [isCoach, dono, ws, hoje]);
  const [inicial] = useState(() => entradaInicial(owner, ws, ficha, isCoach));
  const [prefs, setPrefs] = useState<TrainingPrefs>(() => ({
    goal: inicial.goal,
    level: inicial.level,
    daysPerWeek: inicial.daysPerWeek,
    sessionMinutes: inicial.sessionMinutes,
    equipment: inicial.equipment,
    system: inicial.system,
    limitations: inicial.limitations,
    emphasis: inicial.emphasis,
    systemTouched: inicial.sistemaEscolhido,
  }));
  // Caixa "Intensidade moderada": segue o motivo do questionário até o personal tocar nela.
  const [capEscolha, setCapEscolha] = useState<boolean | null>(null);
  const cap = capEscolha ?? Boolean(ficha?.tetoMotivo);
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<Program | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quota, setQuota] = useState(false);
  const [busy, setBusy] = useState<"generate" | "save" | "blank" | "porta" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blankOpen, setBlankOpen] = useState(false);
  const [blankDays, setBlankDays] = useState(clampDays(owner.daysPerWeek));
  const [blankKind, setBlankKind] = useState<"livre" | "sistema">("livre");
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const set = (p: Partial<TrainingPrefs>) => setPrefs((s) => withSuggestion(s, p));
  const ajustes = contarAjustes(inicial, prefs);
  const ajusteLinha = ajustesTexto(ajustes);
  const aluno = forName ?? owner.name;
  const tetoDica = useId();
  // Com questionário, nenhum clique desta tela vai para a autocaptura: "tocou em Gerar e não gerou" revelaria a trava.
  const semCaptura = comQuestionario ? "ph-no-capture" : undefined;

  /** Entrada do motor: as escolhas da tela, o "não quero fazer" e o teto, só quando existem (sem eles, a ficha de sempre). */
  function motorInput(): GenerateInput {
    const { systemTouched: _touched, ...input } = prefs;
    void _touched;
    return { ...input, ...(inicial.avoidIds.length ? { avoidIds: inicial.avoidIds } : {}), ...(cap ? { intensityCap: "moderada" as const } : {}) };
  }

  function mostrarPrevia(p: Program, source: Program["source"]) {
    setPreview({ ...p, source, ...(inicial.durationWeeks ? { durationWeeks: inicial.durationWeeks } : {}) });
    window.scrollTo({ top: 0 });
  }

  function medir(source: "local" | "offline" | "ia" | "motor") {
    track("program_generated", { where: isCoach ? "coach" : "athlete", source, system: prefs.system, ...evProgramGeneratedExtra(comQuestionario, contarAjustes(inicial, prefs)) });
  }

  async function generate() {
    setBusy("generate");
    setError(null);
    const input = motorInput();
    try {
      // IA desligada: o motor de regras roda no aparelho, sem nenhuma chamada a /api/ai/* (e funciona sem sinal).
      if (!(await aiAvailable(mode === "supabase"))) {
        const local = generateProgram({ ...input, seed: Math.floor(Math.random() * 1e6) }, { ownerId: owner.id, createdBy: user!.id });
        mostrarPrevia(local, isCoach ? "personal" : "modelo");
        setNotice(null);
        setQuota(false);
        medir("local");
        return;
      }
      // Só os campos que a IA aceita: avoidIds, intensityCap e as respostas do questionário ficam no aparelho.
      const r = await aiProgram(pickAiInput({ ...input, notes: ai.enabled && notes.trim() ? notes.trim() : undefined, seed: Math.floor(Math.random() * 1e6) }), { ownerId: owner.id, createdBy: user!.id }, await accessToken());
      mostrarPrevia(r.data, isCoach ? "personal" : r.source === "ia" ? "ia" : "modelo");
      setNotice(r.notice?.trim() ? r.notice : null);
      setQuota(Boolean(r.quota));
      medir(r.source);
    } catch (e) {
      // Sem internet (academia, elevador): o motor do app roda no aparelho e entrega a ficha do mesmo jeito.
      if (e instanceof OfflineError) {
        try {
          const local = generateProgram({ ...input, seed: Math.floor(Math.random() * 1e6) }, { ownerId: owner.id, createdBy: user!.id });
          mostrarPrevia(local, isCoach ? "personal" : "modelo");
          setNotice(ai.enabled ? "Sem conexão agora: esta base foi montada pelo motor do app, sem a IA." : null);
          setQuota(false);
          medir("offline");
          return;
        } catch (inner) {
          reportError(inner, "ficha:gerar-offline");
        }
      }
      if (!(e instanceof OfflineError)) reportError(e, "ficha:gerar");
      setError(e instanceof Error ? e.message : "Não foi possível gerar a ficha. Tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  /** "Gerar ficha": com trava ou porta pendentes, abre o diálogo (spec §6.4); senão, gera. */
  function tentarGerar(perfil: Profile = dono) {
    const antes = isCoach ? antesDeGerar(perfil, new Date()) : ({ modo: "livre" } as const);
    if (antes.modo !== "livre") {
      setDialogo({ tipo: "antes", antes });
      return;
    }
    setDialogo(null);
    void generate();
  }

  function atualizarDono(p: Profile) {
    setDono(p);
    onOwnerChange?.(p);
  }

  /** "Seguir mesmo assim" com "Conversei" marcado: grava o override datado dos laranjas abertos e gera. */
  async function seguirMesmoAssim() {
    if (dialogo?.tipo !== "antes" || dialogo.antes.modo !== "porta") return;
    setBusy("porta");
    setError(null);
    try {
      const saved = await repo.saveProfile(comOverride(dono, dialogo.antes.alertas.map((a) => a.id), new Date().toISOString()));
      atualizarDono(saved);
      setBusy(null);
      tentarGerar(saved);
    } catch (e) {
      reportError(e, "ficha:seguir-mesmo-assim");
      setBusy(null);
      setDialogo(null);
      setError("Não foi possível registrar neste aparelho. Tente de novo.");
    }
  }

  // ?auto=1: gera ao abrir (uma vez) ou abre o diálogo da trava/porta.
  const autoFeito = useRef(false);
  useEffect(() => {
    if (!auto || autoFeito.current) return;
    autoFeito.current = true;
    tentarGerar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  async function createBlank() {
    setBusy("blank");
    setError(null);
    try {
      const now = new Date().toISOString();
      const sys = getSystem(prefs.system);
      // Ficha em branco não derruba a ficha que já está valendo: fica inativa até ser montada e ativada.
      const hasActive = template ? false : (await repo.listPrograms(owner.id)).some((p) => p.active);
      const fromSystem = blankKind === "sistema";
      const program: Program = {
        id: uid(),
        ownerId: owner.id,
        createdBy: user!.id,
        name: fromSystem ? `${sys.short} · ${GOAL_LABEL[prefs.goal]}` : `Ficha ${GOAL_LABEL[prefs.goal].toLowerCase()}`,
        system: fromSystem ? prefs.system : "livre",
        goal: prefs.goal,
        level: prefs.level,
        daysPerWeek: fromSystem ? prefs.daysPerWeek : blankDays,
        days: fromSystem
          ? sys.templates.map((t) => ({ key: t.key, title: t.title, focus: t.focus, exercises: [] }))
          : Array.from({ length: blankDays }, (_, i) => ({ key: DAY_KEYS[i] ?? `D${i + 1}`, title: "", focus: [], exercises: [] })),
        active: !hasActive,
        source: isCoach ? "personal" : "manual",
        createdAt: now,
        updatedAt: now,
      };
      const saved = await repo.saveProgram(program);
      track(isCoach ? "program_assigned" : "program_saved", { source: "blank" });
      onSaved(saved);
    } catch (e) {
      reportError(e, "ficha:criar-em-branco");
      setError(e instanceof Error ? e.message : "Não foi possível criar a ficha.");
      setBusy(null);
      setBlankOpen(false);
    }
  }

  async function save() {
    if (!preview) return;
    setBusy("save");
    setError(null);
    try {
      // `sugerido`: o que veio pré-preenchido (base do padrão aprendido, que só conta escolhas do personal).
      const sugerido = isCoach ? { sugerido: { system: inicial.system, ...(inicial.durationWeeks ? { durationWeeks: inicial.durationWeeks } : {}) } } : {};
      const saved = await repo.saveProgram({ ...preview, active: true, ...sugerido });
      track(isCoach ? "program_assigned" : "program_saved", { source: preview.source });
      onSaved(saved);
    } catch (e) {
      reportError(e, "ficha:salvar-nova");
      setError(e instanceof Error ? e.message : "Não foi possível salvar a ficha.");
      setBusy(null);
    }
  }

  const todosAlertas = leitura && typeof leitura === "object" ? alertasDe(leitura, { hoje: new Date(), liberacoes: dono.liberacoes ?? [] }) : [];
  const dialogos = (
    <>
      {dialogo?.tipo === "antes" ? (
        <PortaDialog
          open
          antes={dialogo.antes}
          aluno={aluno}
          busy={busy === "porta"}
          onClose={() => setDialogo(null)}
          onRegistrar={() => setDialogo({ tipo: "liberacao" })}
          onSeguir={() => void seguirMesmoAssim()}
        />
      ) : null}
      <LiberacaoDialog
        open={dialogo?.tipo === "liberacao"}
        onClose={() => setDialogo((d) => (d?.tipo === "liberacao" ? null : d))}
        student={dono}
        alertas={todosAlertas}
        onSaved={(p) => {
          atualizarDono(p);
          // Liberação registrada: confere de novo (pode sobrar um laranja) e gera.
          tentarGerar(p);
        }}
      />
    </>
  );

  if (preview) {
    const levou = ficha ? motivosLevados(ficha, cap) : [];
    return (
      <div className={cx("space-y-4", semCaptura)}>
        {notice ? <Alert tone={quota ? "warn" : "info"}>{notice}</Alert> : null}
        <div>
          <h2 className="plate-type break-words text-2xl">{preview.name}</h2>
          <p className="text-sm text-steel">
            {forName ? `Para ${forName} · ` : ""}
            {getSystem(preview.system).name} · {preview.days.length} treinos
            {preview.durationWeeks ? ` · validade de ${preview.durationWeeks} semanas` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => tentarGerar()} loading={busy === "generate"} disabled={busy === "save"} icon={<RefreshCw className="size-4" />}>
            Outra versão
          </Button>
          <Button variant="ghost" onClick={() => setPreview(null)} disabled={busy !== null}>
            Ajustar respostas
          </Button>
        </div>
        {levou.length ? (
          <details className="ph-no-capture rounded-[var(--radius-ficha)] border border-rule bg-paper" open>
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-2.5 text-[0.9375rem] font-bold">
              <ListChecks className="size-4 shrink-0" aria-hidden /> O que a ficha levou em conta
            </summary>
            <div className="border-t border-rule px-4 py-3">
              <Motivos lista={levou} />
              {ajusteLinha ? <p className="mt-2 text-sm text-steel">{ajusteLinha}</p> : null}
            </div>
          </details>
        ) : null}
        {ficha?.naoAdaptado.length ? <NaoAdaptado itens={ficha.naoAdaptado} /> : null}
        <p className="text-sm text-steel">Esta é uma base. Depois de salvar você troca exercícios, ajusta séries, cargas e observações no editor.</p>
        {preview.notes ? <p className="max-w-[70ch] whitespace-pre-wrap rounded-[8px] border border-rule bg-paper px-4 py-3 text-[0.9375rem]">{preview.notes}</p> : null}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {preview.days.map((d) => (
            <FichaDay key={d.key} day={d} />
          ))}
        </div>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
          <Button size="lg" onClick={save} loading={busy === "save"} disabled={busy === "generate"} className="shadow-lift">
            {isCoach ? `Salvar ficha de ${who ?? "aluno"}` : template ? "Salvar modelo" : "Salvar e ativar ficha"}
          </Button>
        </div>
        {dialogos}
      </div>
    );
  }

  if (busy === "generate") {
    return (
      <div className="space-y-4" aria-busy="true">
        <p className="font-semibold" role="status">
          {ai.enabled ? "A IA está montando a ficha. Costuma levar de 20 a 40 segundos." : "Montando a ficha…"}
        </p>
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  return (
    <div className={cx("space-y-5", semCaptura)}>
      {typeof leitura === "string" ? <Alert tone="warn">{PROBLEMA_RESUMO[leitura]} Você ainda pode montar a ficha do zero.</Alert> : null}
      {ficha ? (
        <Panel title="O que a ficha vai considerar" className="ph-no-capture">
          <Motivos lista={motivosLevados(ficha, cap)} />
          {ajusteLinha ? <p className="mt-2 text-sm text-steel">{ajusteLinha}</p> : null}
          {ficha.avisos.length ? (
            <Alert tone="info" className="mt-3">
              <ul className="space-y-1">
                {ficha.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {ficha.naoAdaptado.length ? <NaoAdaptado itens={ficha.naoAdaptado} className="mt-3" /> : null}
          <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius-ficha)] border border-rule-strong px-3 py-2.5">
            <input type="checkbox" checked={cap} onChange={(e) => setCapEscolha(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-iron)]" aria-describedby={tetoDica} />
            <span className="min-w-0">
              <span className="block text-[0.9375rem] font-semibold">Intensidade moderada</span>
              <span id={tetoDica} className="mt-0.5 block text-sm text-steel">
                {ficha.tetoMotivo ? `Recomendado: ${ficha.tetoMotivo}.` : "Repetições a partir de 10, sem drop-set e sem tiros."} Vale para esta ficha.
              </span>
            </span>
          </label>
        </Panel>
      ) : null}
      <Panel title="Objetivo">
        <GoalPicker value={prefs.goal} onChange={(goal) => set({ goal })} />
      </Panel>
      <Panel title="Rotina">
        <RoutinePicker prefs={prefs} set={set} />
      </Panel>
      <Panel title="Prioridades e limitações">
        <LimitsPicker prefs={prefs} set={set} />
        {ai.enabled ? (
          <Field label="Pedido livre para a IA" className="mt-5" hint="Opcional. Ex.: “quero agachamento livre e terra”, “sem leg press”, “terminar com cardio”.">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="min-h-20" maxLength={500} />
          </Field>
        ) : null}
      </Panel>
      <Panel title="Sistema de divisão">
        <SystemChooser prefs={prefs} set={set} />
      </Panel>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={() => tentarGerar()} icon={ai.enabled ? <Sparkles className="size-4" /> : <Wand2 className="size-4" />}>
          {ai.enabled ? "Gerar ficha com IA" : comQuestionario ? "Gerar ficha com estas respostas" : "Gerar ficha"}
        </Button>
        <Button size="lg" variant="secondary" onClick={() => setBlankOpen(true)} icon={<PenLine className="size-4" />}>
          Montar do zero
        </Button>
      </div>
      <p className="text-sm text-steel">
        {comQuestionario
          ? `“Gerar ficha com estas respostas” monta uma base pelo questionário e pelo cadastro${who ? ` de ${who}` : ""} para você revisar. “Montar do zero” abre o editor em branco.`
          : `“Gerar ficha” monta uma base completa pelo perfil ${who ? `de ${who}` : "informado"} para você revisar. “Montar do zero” abre o editor em branco.`}
      </p>

      <Dialog open={blankOpen} onClose={() => setBlankOpen(false)} title="Montar do zero">
        <div className="space-y-5">
          <Field group label="Como você quer começar?">
            <Segmented
              label="Ponto de partida"
              value={blankKind}
              onChange={setBlankKind}
              className="grid grid-cols-1"
              options={[
                { value: "livre", label: "Divisão livre", hint: "Treinos A, B, C… com os nomes e exercícios que você quiser" },
                { value: "sistema", label: `Dias do ${getSystem(prefs.system).short}`, hint: "Os treinos já vêm com os títulos do sistema escolhido, sem exercícios" },
              ]}
            />
          </Field>
          {blankKind === "livre" ? (
            <Field group label="Quantos treinos diferentes?" hint="Você pode adicionar ou remover treinos depois.">
              <Segmented label="Número de treinos" value={blankDays} onChange={setBlankDays} options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: d, label: String(d) }))} />
            </Field>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setBlankOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={createBlank} loading={busy === "blank"}>
              Criar e abrir o editor
            </Button>
          </div>
        </div>
      </Dialog>
      {dialogos}
    </div>
  );
}

/** Uma linha por motivo, com "Veio de: {pergunta} → {resposta}" em letra pequena. */
function Motivos({ lista }: { lista: MotivoFicha[] }) {
  return (
    <ul className="space-y-2">
      {lista.map((m, i) => (
        <li key={`${i}-${m.texto}`} className="text-[0.9375rem]">
          <span className="block">{m.texto}</span>
          {m.porque.map((o) => (
            <span key={`${o.pergunta}-${o.resposta}`} className="block text-[0.8125rem] text-steel">
              {veioDe(o)}
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

/** Regiões e textos que o motor não adapta (spec §8.3) e as restrições da liberação. */
function NaoAdaptado({ itens, className }: { itens: string[]; className?: string }) {
  return (
    <Alert tone="warn" className={cx("ph-no-capture", className)}>
      <p className="font-semibold">Não adaptado pelo gerador</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {itens.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </Alert>
  );
}
