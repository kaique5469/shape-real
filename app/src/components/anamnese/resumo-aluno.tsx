"use client";

import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { CircleCheck, Dumbbell, FileText, Gauge, Info, MessageCircle, OctagonX, Printer, Scale, Trash2, TriangleAlert, type LucideIcon } from "lucide-react";
import { ApagarRespostasDialog } from "@/components/anamnese/apagar-respostas-dialog";
import { LiberacaoDialog } from "@/components/anamnese/liberacao-dialog";
import { Alert, Button, LinkButton, Panel, cx } from "@/components/ui";
import { reportError, track } from "@/lib/analytics";
import { evSummaryViewed } from "@/lib/anamnese-events";
import { useApp } from "@/lib/app-context";
import { PERGUNTAS, RESPOSTA_PULOU, RESPOSTA_PULOU_PARTE, ctxDe, respostasPorParte } from "@/lib/domain/anamnese";
import { antesDeGerar, toGenerateInput } from "@/lib/domain/anamnese-ficha";
import { ROTULO_EXEMPLO, acoesDoAlerta, registroDoQuestionario, textoCoberto, textoLiberacaoAnterior, veioDe, type AcaoAlerta } from "@/lib/domain/anamnese-perfil";
import { ehExemplo, type Alerta, type NivelAlerta, type WorkStyle } from "@/lib/domain/anamnese-types";
import { waLink } from "@/lib/domain/format";
import { readAnamnese } from "@/lib/domain/questionario-link";
import { PROBLEMA_RESUMO, VELHO_TEXTO, summarize } from "@/lib/domain/resumo";
import { NIVEL_ROTULO, comConversei } from "@/lib/domain/triagem";
import type { Profile } from "@/lib/domain/types";

/** Ícone e cores de cada nível. O nível está sempre no ícone e no rótulo escrito, nunca só na cor. */
const NIVEL: Record<NivelAlerta, { Icon: LucideIcon; box: string; icon: string }> = {
  vermelho: { Icon: OctagonX, box: "border-danger-line bg-danger-surface", icon: "text-danger" },
  laranja: { Icon: FileText, box: "border-warn-line bg-warn-surface", icon: "text-warn-ink" },
  amarelo: { Icon: Gauge, box: "border-rule-strong bg-paper", icon: "text-warn-ink" },
  azul: { Icon: Info, box: "border-plate-blue/30 bg-info-surface", icon: "text-info-ink" },
  lembrete: { Icon: Scale, box: "border-rule bg-chalk", icon: "text-steel" },
};

/** Respostas marcadas em "Respostas completas" (texto em itálico; a palavra já diz o que é). */
const MARCADAS = new Set([RESPOSTA_PULOU, RESPOSTA_PULOU_PARTE, "Prefiro falar pessoalmente"]);
const PERGUNTA_PESO = PERGUNTAS.find((p) => p.id === "peso")?.texto;
/** Partes abertas antes do "Ver tudo" (bloco 10, recolhido). */
const PARTES_VISIVEIS = 3;

const liberadoPorProfissional = (al: Alerta) => !!al.coberto && al.coberto.por !== "override" && al.coberto.por !== "conversei";

/**
 * Resumo do aluno (spec §6.1 e §6.2). Entrega 1: blocos 0 (origem), 1 (antes de começar), 2 (próximos passos, pelo
 * `passos` de quem chama), 3 (perfil e "Para a ficha") e 10 (respostas completas, imprimir e apagar). Respostas só por
 * `readAnamnese`; "versao_nova"/"invalida" mostram só a frase de §6.1. Nenhum texto nomeia condição que o aluno não
 * marcou (os textos vêm da triagem e do resumo). `somenteLeitura` (tela final do junto sem rede): só props, sem
 * repositório, navegação, diálogos nem botão de gerar. `summary_viewed` ao montar (uma vez por aluno; nunca em
 * exemplo). Raiz `#resumo-aluno` com `ph-no-capture`.
 */
export function ResumoAluno(props: { student: Profile; ws?: WorkStyle; hoje: Date; somenteLeitura?: boolean; onChange?: (p: Profile) => void; passos?: ReactNode }): ReactElement | null {
  const { student, ws, hoje, somenteLeitura = false, onChange, passos } = props;
  const { user, repo } = useApp();
  const resumo = useMemo(() => summarize({ profile: student, ws, hoje }), [student, ws, hoje]);
  const ficha = useMemo(() => (resumo && !resumo.problema ? toGenerateInput(student, ws, hoje, { hoje, liberacoes: student.liberacoes ?? [] }) : null), [resumo, student, ws, hoje]);
  const [liberar, setLiberar] = useState(false);
  const [apagar, setApagar] = useState(false);
  const [todasPartes, setTodasPartes] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const primeiraNova = useRef<HTMLElement>(null);

  // Uma vez por aluno, ao montar. Só o booleano e a origem; exemplo não mede.
  const medido = useRef<string | null>(null);
  const temQuestionario = resumo !== null;
  useEffect(() => {
    if (medido.current === student.id) return;
    medido.current = student.id;
    if (ehExemplo(student)) return;
    track("summary_viewed", evSummaryViewed(temQuestionario, somenteLeitura ? "junto" : "aba"));
  }, [student, temQuestionario, somenteLeitura]);

  // [Imprimir]: abre todas as partes, imprime e volta como estava.
  useEffect(() => {
    if (!imprimindo) return;
    const fim = () => setImprimindo(false);
    window.addEventListener("afterprint", fim);
    const t = window.setTimeout(() => window.print(), 60);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", fim);
    };
  }, [imprimindo]);

  useEffect(() => {
    if (todasPartes) primeiraNova.current?.focus();
  }, [todasPartes]);

  if (!resumo) return null;
  if (resumo.problema)
    return (
      <section id="resumo-aluno" aria-label="Resumo do questionário" className="ph-no-capture scroll-mt-20">
        <Alert tone="warn">{PROBLEMA_RESUMO[resumo.problema]}</Alert>
      </section>
    );
  const lida = readAnamnese(student);
  const an = lida && typeof lida === "object" ? lida : null;
  if (!an) return null;

  const id = encodeURIComponent(student.id);
  const fortes = resumo.alertas.filter((x) => x.nivel === "vermelho" || x.nivel === "laranja" || x.nivel === "amarelo");
  const outros = resumo.alertas.filter((x) => x.nivel === "azul" || x.nivel === "lembrete");
  const antes = antesDeGerar(student, hoje);
  const partes = respostasPorParte(an, ctxDe(an, { hoje, personal: user?.name ?? "", aluno: student.name, atendimento: ws?.atendimento }))
    .map((pt) => (resumo.escondePeso ? { ...pt, itens: pt.itens.filter((it) => it.pergunta !== PERGUNTA_PESO) } : pt))
    .filter((pt) => pt.itens.length);
  const mostradas = imprimindo || todasPartes ? partes : partes.slice(0, PARTES_VISIVEIS);
  const registro = registroDoQuestionario(student, resumo.alertas);

  async function conversei() {
    setBusy(true);
    setErro(null);
    try {
      onChange?.(await repo.saveProfile(comConversei(student, ["A-PESSOAL"], new Date().toISOString())));
    } catch (e) {
      reportError(e, "resumo:conversei");
      setErro("Não foi possível salvar neste aparelho. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  const botao = (a: AcaoAlerta): ReactNode => {
    const largura = "w-full sm:w-auto";
    switch (a.tipo) {
      case "liberacao":
        return (
          <Button variant="secondary" className={largura} onClick={() => setLiberar(true)}>
            {a.rotulo}
          </Button>
        );
      case "avisar":
        // Abre o WhatsApp no toque, com a mensagem fixa (não nomeia condição).
        return (
          <a
            href={waLink(a.texto, student.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className={cx("inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-ficha)] border border-rule-strong bg-paper px-4 text-[0.9375rem] font-semibold text-iron hover:border-iron", largura)}
          >
            <MessageCircle className="size-4 shrink-0" aria-hidden /> {a.rotulo}
          </a>
        );
      case "conversei":
        return (
          <Button variant="secondary" className={largura} loading={busy} onClick={() => void conversei()}>
            {a.rotulo}
          </Button>
        );
      case "preencher":
        return (
          <LinkButton href={a.href} variant="secondary" className={largura}>
            {a.rotulo}
          </LinkButton>
        );
    }
  };

  const card = (al: Alerta) => {
    const n = NIVEL[al.nivel];
    const resolvido = liberadoPorProfissional(al);
    const coberto = textoCoberto(al, student.name);
    const anterior = textoLiberacaoAnterior(al);
    const acoes = somenteLeitura ? [] : acoesDoAlerta(al, student);
    return (
      <li key={al.id} data-alerta={al.id} data-nivel={al.nivel} className={cx("rounded-[var(--radius-ficha)] border px-3.5 py-3", resolvido ? "border-rule bg-paper" : n.box)}>
        <p className="flex items-center gap-2 text-sm font-bold text-iron">
          <n.Icon className={cx("size-[18px] shrink-0", n.icon)} aria-hidden />
          <span>{NIVEL_ROTULO[al.nivel]}</span>
        </p>
        <h3 className="mt-1 text-base font-bold leading-snug">{al.titulo}</h3>
        {coberto ? (
          <p className="mt-1 flex items-start gap-1.5 text-sm font-semibold text-iron">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-done" aria-hidden />
            <span className="min-w-0">{coberto}</span>
          </p>
        ) : null}
        <dl className="mt-2 space-y-1.5 text-[0.9375rem]">
          {al.porque.length ? (
            <div>
              <dt className="text-xs font-semibold text-steel">Por quê</dt>
              <dd>
                {al.porque.map((o) => (
                  <span key={`${o.pergunta}-${o.resposta}`} className="block">
                    {o.pergunta} → {o.resposta}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-semibold text-steel">Recomendado</dt>
            <dd>{al.recomendado}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-steel">Base</dt>
            <dd className="text-sm text-steel">{al.base}</dd>
          </div>
        </dl>
        {anterior ? <p className="mt-2 text-sm font-semibold">{anterior}</p> : null}
        {acoes.length ? (
          <div className="no-print mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {acoes.map((a) => (
              <span key={a.tipo} className="contents">
                {botao(a)}
              </span>
            ))}
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <section id="resumo-aluno" aria-label="Resumo do questionário" className="ph-no-capture scroll-mt-20 space-y-4">
      {/* Bloco 0: origem. O nome do aluno só vai no papel (o cabeçalho da página não imprime). */}
      <div className="space-y-2">
        <p className="hidden text-lg font-bold print:block">Questionário inicial · {student.name}</p>
        <p className="num text-sm text-steel">{resumo.origem}</p>
        {ehExemplo(student) ? <p className="text-sm font-semibold text-iron">{ROTULO_EXEMPLO}</p> : null}
        {resumo.velho ? <Alert tone="warn">{VELHO_TEXTO}</Alert> : null}
      </div>

      {/* Bloco 1: antes de começar. */}
      <Panel title="Antes de começar">
        {fortes.length ? <ul className="space-y-2.5">{fortes.map(card)}</ul> : null}
        {resumo.semAlertasTexto ? (
          <p className="flex items-start gap-2 text-[0.9375rem]">
            <CircleCheck className="mt-0.5 size-[18px] shrink-0 text-done" aria-hidden />
            <span className="min-w-0">{resumo.semAlertasTexto}</span>
          </p>
        ) : null}
        {outros.length ? <ul className={cx("space-y-2.5", fortes.length || resumo.semAlertasTexto ? "mt-3" : "")}>{outros.map(card)}</ul> : null}
        {erro ? (
          <Alert tone="error" className="mt-3">
            {erro}
          </Alert>
        ) : null}
      </Panel>

      {/* Bloco 2: próximos passos (de quem chama; não imprime). */}
      {passos}

      {/* Bloco 3: perfil e "Para a ficha". */}
      <Panel title="Para a ficha">
        {resumo.perfil ? <p className="num text-[0.9375rem] font-semibold">{resumo.perfil}</p> : null}
        {ficha?.motivos.length ? (
          <ul className={cx("space-y-2", resumo.perfil ? "mt-3" : "")}>
            {ficha.motivos.map((m) => (
              <li key={m.texto} className="text-[0.9375rem]">
                <span className="num">{m.texto}</span>
                {m.porque.map((o) => (
                  <span key={`${o.pergunta}-${o.resposta}`} className="block text-xs text-steel">
                    {veioDe(o)}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        ) : null}
        {ficha && (ficha.naoAdaptado.length || ficha.avisos.length) ? (
          <ul className="mt-3 space-y-1.5 text-sm">
            {[...ficha.naoAdaptado, ...ficha.avisos].map((t) => (
              <li key={t} className="flex items-start gap-1.5">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn-ink" aria-hidden />
                <span className="min-w-0">{t}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {somenteLeitura ? null : antes.modo === "trava" ? (
          // Vermelho aberto: gerar com as respostas fica bloqueado até a liberação (a ficha do zero continua).
          <div className="no-print mt-4 rounded-[var(--radius-ficha)] border border-danger-line bg-danger-surface px-3.5 py-3">
            <p className="flex items-start gap-2 text-[0.9375rem]">
              <OctagonX className="mt-0.5 size-[18px] shrink-0 text-danger" aria-hidden />
              <span className="min-w-0">Registre a liberação para gerar a ficha com estas respostas. Você ainda pode montar a ficha do zero.</span>
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setLiberar(true)}>
                Registrar liberação
              </Button>
              <LinkButton href={`/alunos/${id}/ficha/nova`} variant="ghost" className="w-full sm:w-auto">
                Montar a ficha do zero
              </LinkButton>
            </div>
          </div>
        ) : (
          <LinkButton href={`/alunos/${id}/ficha/nova?auto=1`} icon={<Dumbbell className="size-4" aria-hidden />} className="no-print mt-4 w-full sm:w-auto">
            Gerar ficha com estas respostas
          </LinkButton>
        )}
      </Panel>

      {resumo.sinaisParar ? (
        <Panel title="Sinais para parar">
          <p className="text-[0.9375rem]">{resumo.sinaisParar}</p>
        </Panel>
      ) : null}

      {/* Bloco 10: respostas completas (recolhido: 3 partes e "Ver tudo"). */}
      <Panel title="Respostas completas">
        {partes.length ? (
          <div className="space-y-2">
            {mostradas.map((pt, i) => (
              <details key={pt.secao} open={imprimindo || undefined} className="group rounded-[var(--radius-ficha)] border border-rule bg-paper">
                <summary
                  ref={i === PARTES_VISIVEIS && todasPartes ? primeiraNova : undefined}
                  className="flex min-h-11 cursor-pointer items-center px-3 py-2 font-semibold marker:text-steel"
                >
                  {pt.titulo}
                </summary>
                <dl className="divide-y divide-rule border-t border-rule px-3">
                  {pt.itens.map((it, k) => {
                    const marcada = MARCADAS.has(it.resposta);
                    return (
                      <div key={`${pt.secao}-${k}`} className="py-2">
                        <dt className="text-sm text-steel">{it.pergunta}</dt>
                        <dd className={cx("mt-0.5 text-[0.9375rem]", marcada ? "italic text-steel" : "font-semibold text-iron")} data-marcada={marcada || undefined}>
                          {it.resposta}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </details>
            ))}
            {!todasPartes && !imprimindo && partes.length > PARTES_VISIVEIS ? (
              <button type="button" onClick={() => setTodasPartes(true)} className="no-print inline-flex min-h-11 items-center text-sm font-semibold text-plate-blue-ink underline underline-offset-2 hover:text-iron">
                Ver tudo
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-steel">Nenhuma resposta para mostrar.</p>
        )}

        {/* Registro de autorização, termo e liberações: só no papel (spec §6.1, CONFEF 542, art. 7º). */}
        {registro.length ? (
          <div className="mt-4 hidden border-t border-rule pt-3 print:block">
            <h3 className="font-bold">Registro</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {registro.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {somenteLeitura ? null : (
          <div className="no-print mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button variant="secondary" className="w-full sm:w-auto" icon={<Printer className="size-4" aria-hidden />} onClick={() => setImprimindo(true)}>
              Imprimir
            </Button>
            <Button variant="danger" className="w-full sm:w-auto" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setApagar(true)}>
              Apagar respostas
            </Button>
          </div>
        )}
      </Panel>

      {somenteLeitura ? null : (
        <>
          <LiberacaoDialog open={liberar} onClose={() => setLiberar(false)} student={student} alertas={resumo.alertas} onSaved={(p) => onChange?.(p)} />
          <ApagarRespostasDialog open={apagar} onClose={() => setApagar(false)} student={student} onSaved={(p) => onChange?.(p)} />
        </>
      )}
    </section>
  );
}
