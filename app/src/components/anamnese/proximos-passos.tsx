"use client";

import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Apple, CircleDot, ClipboardList, Dumbbell, FileText, MessageCircle, PenLine, Ruler, Salad, Smartphone, Stethoscope, type LucideIcon } from "lucide-react";
import { LiberacaoDialog } from "@/components/anamnese/liberacao-dialog";
import { PedirQuestionario } from "@/components/anamnese/pedir-questionario";
import { TermoDialog } from "@/components/anamnese/termo-dialog";
import { SendToStudent } from "@/components/transfer-share";
import { Alert, Button, LinkButton, Panel, cx } from "@/components/ui";
import { reportError, track } from "@/lib/analytics";
import { useApp } from "@/lib/app-context";
import { toGenerateInput } from "@/lib/domain/anamnese-ficha";
import { eventoDaAcao, marcarFeito, passosVisiveis } from "@/lib/domain/anamnese-perfil";
import { ehExemplo, type AcaoPasso, type Passo, type StepId, type WorkStyle } from "@/lib/domain/anamnese-types";
import { waLink } from "@/lib/domain/format";
import { nextSteps, type PassosInput } from "@/lib/domain/next-steps";
import { summarize } from "@/lib/domain/resumo";
import type { Profile } from "@/lib/domain/types";
import { useFichaDelivery } from "@/lib/use-ficha-link";

const ICONE: Partial<Record<StepId, LucideIcon>> = {
  liberacao: FileText,
  triagem_presencial: Stethoscope,
  questionario: ClipboardList,
  termo: PenLine,
  nutricionista_clinico: Apple,
  gerar_ficha: Dumbbell,
  enviar_ficha: Smartphone,
  avaliacao: Ruler,
  dieta: Salad,
};

type Aba = "ficha" | "dieta" | "evolucao";

/**
 * Próximos passos do aluno (spec §7), no lugar da lista de hoje: até 4 visíveis + "e mais N". Cada ação faz o que diz
 * (link, pedido pelo WhatsApp, liberação, WhatsApp aberto no toque, termo, envio da ficha, troca de aba, [Feito]).
 * `next_step_clicked` só pelo `eventoDaAcao` (null = não dispara: passo clínico, dieta, nutricionista e aluno de
 * exemplo). `questionario` = chave ligada: sem ela, o passo do questionário não aparece. Raiz com `ph-no-capture`.
 */
export function ProximosPassos({
  student,
  ws,
  activeProgram,
  metricsCount,
  hasDiet,
  hoje,
  questionario,
  version = 0,
  onChange,
  onTab,
  onFichaSent,
}: {
  student: Profile;
  ws?: WorkStyle;
  activeProgram: PassosInput["activeProgram"];
  metricsCount: number;
  hasDiet: boolean;
  hoje: Date;
  questionario: boolean;
  /** Sobe quando a ficha ou a dieta podem ter mudado fora daqui (relê o envio da ficha). */
  version?: number;
  onChange: (p: Profile) => void;
  onTab: (aba: Aba) => void;
  /** Depois do toque em enviar a ficha (para a página reler a linha de situação). */
  onFichaSent?: () => void;
}): ReactElement | null {
  const { repo, mode } = useApp();
  const [tick, setTick] = useState(0);
  const envioFicha = useFichaDelivery(student, version + tick);
  const [todos, setTodos] = useState(false);
  // "e mais N" some ao abrir a lista: o foco vai para o primeiro passo que apareceu (não se perde no topo da página).
  const primeiroNovo = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (todos) primeiroNovo.current?.focus();
  }, [todos]);
  const [pedir, setPedir] = useState<{ de: "passos" | "lembrete"; reavaliacao?: "saude" | "tudo" } | null>(null);
  const [liberar, setLiberar] = useState(false);
  const [termo, setTermo] = useState(false);
  const [enviar, setEnviar] = useState(false);
  const [busy, setBusy] = useState<StepId | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const alertasAtuais = useMemo(() => summarize({ profile: student, ws, hoje })?.alertas ?? [], [student, ws, hoje]);
  const resumoCurto = useMemo(() => toGenerateInput(student, ws, hoje, { hoje, liberacoes: student.liberacoes ?? [] })?.resumoCurto, [student, ws, hoje]);
  const passos = useMemo(
    () =>
      nextSteps({ profile: student, ws, activeProgram, envioFicha, metricsCount, hasDiet, mode, hoje, fichaSugeridaResumo: resumoCurto, conferirN: 0 })
        .filter((p) => questionario || p.id !== "questionario")
        // Na nuvem o /receber não registra respostas: sem pedido por link ("Mandar pelo WhatsApp", "Lembrar").
        .map((p) => (mode === "local" ? p : { ...p, acoes: p.acoes.filter((a) => a.tipo !== "pedir") })),
    [student, ws, activeProgram, envioFicha, metricsCount, hasDiet, mode, hoje, resumoCurto, questionario],
  );
  const { visiveis, mais } = passosVisiveis(passos, todos ? passos.length : 4);
  const podeEnviar = mode === "local" && !ehExemplo(student);
  const algumAberto = pedir !== null || liberar || termo || enviar;

  if (!passos.length && !algumAberto) return null;

  const medir = (p: Passo, a: AcaoPasso) => {
    const ev = eventoDaAcao(student, p, a);
    if (ev) track("next_step_clicked", ev);
  };

  async function feito(p: Passo) {
    setBusy(p.id);
    setErro(null);
    try {
      onChange(await repo.saveProfile(marcarFeito(student, p.id, new Date().toISOString())));
    } catch (e) {
      reportError(e, "passos:feito");
      setErro("Não foi possível salvar neste aparelho. Tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  function acao(p: Passo, a: AcaoPasso, principal: boolean): ReactNode {
    const variant = principal ? "primary" : "secondary";
    const base = "w-full sm:w-auto";
    switch (a.tipo) {
      case "href":
        return (
          <LinkButton href={a.href} variant={variant} className={base} onClick={() => medir(p, a)}>
            {a.rotulo}
          </LinkButton>
        );
      case "avisar":
      case "whatsapp":
        // WhatsApp abre no toque, com a mensagem já montada (âncora); a medição vem depois.
        return (
          <a
            href={waLink(a.texto, student.phone)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => medir(p, a)}
            className={cx(
              "inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-ficha)] px-4 text-[0.9375rem] font-semibold transition-colors",
              principal ? "bg-iron text-chalk hover:bg-iron-2" : "border border-rule-strong bg-paper text-iron hover:border-iron",
              base,
            )}
          >
            <MessageCircle className="size-4 shrink-0" aria-hidden /> {a.rotulo}
          </a>
        );
      case "pedir":
        return (
          <Button
            variant={variant}
            className={base}
            onClick={() => {
              medir(p, a);
              setPedir({ de: a.lembrete ? "lembrete" : "passos", ...(a.reavaliacao ? { reavaliacao: a.reavaliacao } : {}) });
            }}
          >
            {a.rotulo}
          </Button>
        );
      case "liberacao":
        return (
          <Button variant={variant} className={base} onClick={() => setLiberar(true)}>
            {a.rotulo}
          </Button>
        );
      case "termo":
        return (
          <Button variant={variant} className={base} onClick={() => setTermo(true)}>
            {a.rotulo}
          </Button>
        );
      case "enviar_ficha":
        return podeEnviar ? (
          <Button
            variant={variant}
            className={base}
            icon={<Smartphone className="size-4" aria-hidden />}
            onClick={() => {
              medir(p, a);
              setEnviar(true);
            }}
          >
            {a.rotulo}
          </Button>
        ) : null;
      case "aba":
        return (
          <Button
            variant={variant}
            className={base}
            onClick={() => {
              medir(p, a);
              onTab(a.aba);
            }}
          >
            {a.rotulo}
          </Button>
        );
      case "feito":
        return (
          <Button
            variant={variant}
            className={base}
            loading={busy === p.id}
            onClick={() => {
              medir(p, a);
              void feito(p);
            }}
          >
            {a.rotulo}
          </Button>
        );
    }
  }

  return (
    <>
      {passos.length ? (
        <Panel title="Próximos passos" pad={false} className="ph-no-capture no-print">
          <ul className="ruled">
            {visiveis.map((p, i) => {
              const Icon = ICONE[p.id] ?? CircleDot;
              return (
                <li key={p.id} data-passo={p.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full border border-rule-strong" aria-hidden>
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 ref={todos && i === 4 ? primeiroNovo : undefined} tabIndex={todos && i === 4 ? -1 : undefined} className="font-semibold leading-snug focus:outline-none focus-visible:outline-2 focus-visible:outline-plate-blue">
                      {p.titulo}
                    </h3>
                    {p.sub ? <p className="num mt-0.5 text-sm text-steel">{p.sub}</p> : null}
                    {p.acoes.length ? (
                      <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        {p.acoes.map((a, k) => (
                          <span key={`${a.tipo}-${k}`} className="contents">
                            {acao(p, a, i === 0 && k === 0)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {mais > 0 ? (
            <div className="border-t border-rule px-4 py-2">
              <button type="button" onClick={() => setTodos(true)} className="inline-flex min-h-11 items-center text-sm font-semibold text-plate-blue-ink underline underline-offset-2 hover:text-iron">
                e mais {mais}
              </button>
            </div>
          ) : null}
          {erro ? (
            <div className="px-4 pb-3">
              <Alert tone="error">{erro}</Alert>
            </div>
          ) : null}
        </Panel>
      ) : null}

      <PedirQuestionario open={pedir !== null} onClose={() => setPedir(null)} student={student} de={pedir?.de ?? "passos"} reavaliacao={pedir?.reavaliacao} onPedido={onChange} />
      <LiberacaoDialog open={liberar} onClose={() => setLiberar(false)} student={student} alertas={alertasAtuais} onSaved={onChange} />
      <TermoDialog open={termo} onClose={() => setTermo(false)} student={student} onSaved={onChange} />
      {podeEnviar ? (
        <SendToStudent
          student={student}
          where="pagina_aluno"
          hideTrigger
          open={enviar}
          onOpenChange={setEnviar}
          version={version + tick}
          onSent={() => {
            setTick((n) => n + 1);
            onFichaSent?.();
          }}
        />
      ) : null}
    </>
  );
}
