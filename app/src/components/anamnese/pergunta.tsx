"use client";

import { useId, type ReactNode } from "react";
import { Check, CircleAlert, Square } from "lucide-react";
import { Alert, Input, Textarea, cx } from "@/components/ui";
import { AVISO_TEXTO, LADO_OPCOES, REGIAO_OUTRO_MAX, REGIAO_OUTRO_ROTULO, lerResposta, opcaoMarcada, type Opcao, type Pergunta as PerguntaDef } from "@/lib/domain/anamnese";
import { REGIOES_COM_LADO, type AnamneseAnswers, type DorRegiao, type Lado } from "@/lib/domain/anamnese-types";
import { QTEXTO } from "@/lib/questionario-flow";

/**
 * Uma pergunta do questionário (spec §4.1), pelo tipo do catálogo:
 * - SN, Sim/Não com terceira opção, escolha única e escala: grupo de rádio nativo (`input type="radio"` estilizado em
 *   cartão de 48 px). As setas mudam a opção, só uma fica marcada e nada avança sozinho (WCAG 3.2.2);
 * - múltipla escolha e regiões: botões com `aria-pressed` (opção "excl." limpa as outras; teto em `maxSel`);
 * - número (teclado numérico; o peso aceita vírgula), texto com contador e `maxLength`, mês.
 * O aviso imediato (SAMU, coluna) entra logo abaixo, com `role="alert"`. O id `q-{id}` serve para rolar e focar a
 * primeira pergunta que falta no "Continuar".
 */
export interface PerguntaProps {
  p: PerguntaDef;
  a: AnamneseAnswers;
  onResposta: (id: string, v: unknown) => void;
  /** Texto digitado nos campos numéricos (a resposta só existe quando o número é válido). */
  texto?: string;
  onTexto?: (id: string, t: string) => void;
  /** Erro desta pergunta no "Continuar" ("Falta responder." ou o erro do número). */
  erro?: string | null;
  /** Junto: "Pular por agora" nas obrigatórias sem resposta. */
  pular?: { pulada: boolean; onPular: () => void } | null;
  aviso?: "samu" | "coluna" | null;
}

/** Ids do DOM a partir do id da pergunta ("parq.3" → "q-parq-3"); o wrapper fica com `q-{id}` literal. */
const domId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "-");

/** Cartão de opção (48 px de altura). Largura e recuo ficam com quem usa (`cx` não resolve conflito de classes). */
const CARTAO =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-ficha)] border py-2.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-plate-blue";
/** Opção de largura total, texto à esquerda. */
const LINHA = "w-full px-3.5 text-left";
/** Opção curta e centralizada (escala, lado). */
const CENTRO = "w-full justify-center px-1 text-center";
const CARTAO_LIGADO = "border-iron bg-iron text-chalk";
const CARTAO_DESLIGADO = "border-rule-strong bg-paper text-iron hover:border-iron";

function Marcador({ ligado, redondo }: { ligado: boolean; redondo: boolean }) {
  if (redondo)
    return (
      <span aria-hidden className={cx("grid size-5 shrink-0 place-items-center rounded-full border-2", ligado ? "border-chalk" : "border-field")}>
        {ligado ? <span className="size-2.5 rounded-full bg-chalk" /> : null}
      </span>
    );
  return ligado ? <Check className="size-5 shrink-0" aria-hidden /> : <Square className="size-5 shrink-0 text-field" aria-hidden />;
}

/** Rótulos curtos cabem em grade (dias, minutos, Sim/Não); os longos ficam um por linha. */
function grade(ops: Opcao[]): string {
  if (ops.length === 2 && ops.every((o) => o.rotulo.length <= 4)) return "grid grid-cols-2 gap-2";
  if (ops.every((o) => o.rotulo.length <= 7)) return "grid grid-cols-4 gap-2";
  return "grid gap-2";
}

export function Pergunta({ p, a, onResposta, texto, onTexto, erro, pular, aviso }: PerguntaProps) {
  const base = `q-${domId(p.id)}-${useId().replace(/:/g, "")}`;
  const dicaId = p.dica ? `${base}-dica` : undefined;
  const erroId = erro ? `${base}-erro` : undefined;
  const descr = [dicaId, erroId].filter(Boolean).join(" ") || undefined;
  const valor = lerResposta(a, p.id);
  const semResposta = valor === undefined || valor === null || valor === "" || (Array.isArray(valor) && valor.length === 0 && !p.opcoes?.some((o) => o.exclusiva));

  const titulo = (
    <>
      {p.texto}
      {p.obrig === "O" ? <span className="ml-1.5 text-[0.875rem] font-normal text-steel">({QTEXTO.opcional})</span> : null}
    </>
  );
  const dica = p.dica ? (
    <p id={dicaId} className="mt-1 text-[0.9375rem] text-steel">
      {p.dica}
    </p>
  ) : null;
  const detalhes = (
    <>
      {p.ajuda ? <Detalhe rotulo={p.ajuda.rotulo}>{p.ajuda.texto}</Detalhe> : null}
      {p.porQue ? <Detalhe rotulo={QTEXTO.porQue}>{p.porQue}</Detalhe> : null}
    </>
  );
  const rodape = (
    <>
      {erro ? (
        <p id={erroId} className="mt-2 flex items-start gap-1.5 text-[0.9375rem] text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{erro}</span>
        </p>
      ) : null}
      {pular && p.obrig !== "O" && semResposta ? (
        pular.pulada ? (
          <p className="mt-2 text-[0.9375rem] text-steel">{QTEXTO.pulada}</p>
        ) : (
          <button type="button" onClick={pular.onPular} className="mt-1 inline-flex min-h-11 items-center text-[0.9375rem] font-semibold text-iron underline">
            {QTEXTO.pularPorAgora}
          </button>
        )
      ) : null}
      {aviso ? (
        <Alert tone="error" className="mt-3">
          {AVISO_TEXTO[aviso]}
        </Alert>
      ) : null}
    </>
  );

  let corpo: ReactNode;
  switch (p.tipo) {
    case "sn":
    case "sn3":
    case "eu":
    case "esc": {
      const ops = p.opcoes ?? (p.tipo === "esc" ? Array.from({ length: (p.max ?? 10) - (p.min ?? 0) + 1 }, (_, i) => ({ v: (p.min ?? 0) + i, rotulo: String((p.min ?? 0) + i) })) : []);
      const radio = (o: Opcao) => {
        const ligado = opcaoMarcada(p, a, o.v);
        return (
          <label key={String(o.v)} className={cx(CARTAO, p.tipo === "esc" ? cx(CENTRO, "font-semibold num") : LINHA, ligado ? CARTAO_LIGADO : CARTAO_DESLIGADO)}>
            <input type="radio" className="sr-only" name={base} value={String(o.v)} checked={ligado} onChange={() => onResposta(p.id, o.v)} aria-invalid={erro ? true : undefined} />
            {p.tipo === "esc" ? null : <Marcador ligado={ligado} redondo />}
            <span className="min-w-0">{o.rotulo}</span>
          </label>
        );
      };
      corpo = (
        <fieldset aria-describedby={descr}>
          <legend className="text-[1.0625rem] font-semibold leading-snug text-iron">{titulo}</legend>
          {dica}
          {detalhes}
          {p.tipo === "esc" ? (
            // Escala em duas fileiras (0 a 5 e 6 a 10), sem slider (spec §4.1).
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-6 gap-1.5">{ops.filter((o) => Number(o.v) <= 5).map(radio)}</div>
              <div className="grid grid-cols-5 gap-1.5">{ops.filter((o) => Number(o.v) > 5).map(radio)}</div>
            </div>
          ) : (
            <div className={cx("mt-3", grade(ops))}>{ops.map(radio)}</div>
          )}
        </fieldset>
      );
      break;
    }
    case "em": {
      const ops = p.opcoes ?? [];
      const atual = Array.isArray(valor) ? valor.length : 0;
      const cheio = !!p.maxSel && atual >= p.maxSel;
      const chips = ops.every((o) => o.rotulo.length <= 16);
      corpo = (
        <fieldset aria-describedby={descr}>
          <legend className="text-[1.0625rem] font-semibold leading-snug text-iron">{titulo}</legend>
          {dica}
          {detalhes}
          <div className={cx("mt-3", chips ? "flex flex-wrap gap-2" : "grid gap-2")}>
            {ops.map((o) => {
              const ligado = opcaoMarcada(p, a, o.v);
              const travado = cheio && !ligado && !o.exclusiva;
              return (
                <button
                  key={String(o.v)}
                  type="button"
                  aria-pressed={ligado}
                  aria-disabled={travado || undefined}
                  onClick={() => {
                    if (!travado) onResposta(p.id, o.v);
                  }}
                  className={cx(CARTAO, chips ? "pl-3.5 pr-4 text-left" : LINHA, ligado ? CARTAO_LIGADO : CARTAO_DESLIGADO, travado && "cursor-not-allowed opacity-50")}
                >
                  <Marcador ligado={ligado} redondo={false} />
                  <span className="min-w-0">{o.rotulo}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      );
      break;
    }
    case "regioes":
      corpo = <Regioes p={p} valor={valor} descr={descr} titulo={titulo} dica={dica} detalhes={detalhes} onResposta={onResposta} />;
      break;
    case "num": {
      const decimal = p.id === "peso";
      const unidade = p.id === "altura" ? "cm" : p.id === "peso" ? "kg" : p.id === "semanas" ? "semanas" : null;
      corpo = (
        <div>
          <label htmlFor={base} className="block text-[1.0625rem] font-semibold leading-snug text-iron">
            {titulo}
          </label>
          {dica}
          {detalhes}
          <div className="mt-2 flex items-center gap-2">
            <Input
              id={base}
              inputMode={decimal ? "decimal" : "numeric"}
              autoComplete={p.id === "ano" ? "bday-year" : "off"}
              maxLength={p.id === "ano" ? 4 : 6}
              value={texto ?? ""}
              onChange={(e) => onTexto?.(p.id, e.target.value)}
              aria-invalid={erro ? true : undefined}
              aria-describedby={descr}
              className="h-12 w-32 text-[1.0625rem] num"
            />
            {unidade ? (
              <span className="text-steel" aria-hidden>
                {unidade}
              </span>
            ) : null}
          </div>
        </div>
      );
      break;
    }
    case "txt": {
      const v = typeof valor === "string" ? valor : "";
      const max = p.max ?? 300;
      const contadorId = `${base}-cont`;
      const props = {
        id: base,
        value: v,
        maxLength: max,
        "aria-invalid": erro ? true : undefined,
        "aria-describedby": [descr, contadorId].filter(Boolean).join(" "),
        autoComplete: p.id === "nome" || p.id === "responsavel" ? "name" : "off",
      } as const;
      corpo = (
        <div>
          <label htmlFor={base} className="block text-[1.0625rem] font-semibold leading-snug text-iron">
            {titulo}
          </label>
          {dica}
          {detalhes}
          {max > 120 ? (
            <Textarea {...props} rows={3} onChange={(e) => onResposta(p.id, e.target.value)} className="mt-2 min-h-24 text-[1.0625rem]" />
          ) : (
            <Input {...props} onChange={(e) => onResposta(p.id, e.target.value)} className="mt-2 h-12 text-[1.0625rem]" />
          )}
          <p id={contadorId} className="mt-1 text-right text-[0.875rem] text-steel num">
            {v.length} de {max} caracteres
          </p>
        </div>
      );
      break;
    }
    case "mes": {
      // [E2] data e prova (partes extras). Na Entrega 1 nenhuma pergunta do núcleo usa mês.
      const v = typeof valor === "string" ? valor : valor && typeof valor === "object" ? ((valor as { quando?: string }).quando ?? "") : "";
      corpo = (
        <div>
          <label htmlFor={base} className="block text-[1.0625rem] font-semibold leading-snug text-iron">
            {titulo}
          </label>
          {dica}
          <Input id={base} type="month" value={v} onChange={(e) => onResposta(p.id, p.id === "data" ? { quando: e.target.value } : e.target.value)} aria-describedby={descr} className="mt-2 h-12 w-48" />
        </div>
      );
      break;
    }
  }

  return (
    <div id={`q-${p.id}`} data-pergunta={p.id} className="scroll-mt-28">
      {corpo}
      {rodape}
    </div>
  );
}

function Detalhe({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <details className="mt-1.5 text-[0.9375rem]">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-info-ink underline underline-offset-4">{rotulo}</summary>
      <p className="mb-1 text-steel">{children}</p>
    </details>
  );
}

/** Onde dói: regiões com `aria-pressed`, lado opcional (toque de novo desmarca) e "Onde?" em "Outro lugar". */
function Regioes({
  p,
  valor,
  descr,
  titulo,
  dica,
  detalhes,
  onResposta,
}: {
  p: PerguntaDef;
  valor: unknown;
  descr?: string;
  titulo: ReactNode;
  dica: ReactNode;
  detalhes: ReactNode;
  onResposta: (id: string, v: unknown) => void;
}) {
  const lista = Array.isArray(valor) ? (valor as DorRegiao[]) : [];
  const ops = p.opcoes ?? [];
  const rotulo = (r: string) => ops.find((o) => o.v === r)?.rotulo ?? r;
  const comLado = lista.filter((d) => (REGIOES_COM_LADO as readonly string[]).includes(d.r));
  const outro = lista.find((d) => d.r === "outro");
  const outroId = useId();
  const mudar = (r: DorRegiao["r"], patch: Partial<DorRegiao>) =>
    onResposta(
      p.id,
      lista.map((d) => {
        if (d.r !== r) return d;
        const n: DorRegiao = { ...d, ...patch };
        if (patch.l === undefined && "l" in patch) delete n.l;
        if (patch.t === undefined && "t" in patch) delete n.t;
        return n;
      }),
    );
  return (
    <fieldset aria-describedby={descr}>
      <legend className="text-[1.0625rem] font-semibold leading-snug text-iron">{titulo}</legend>
      {dica}
      {detalhes}
      <div className="mt-3 grid gap-2">
        {ops.map((o) => {
          const ligado = lista.some((d) => d.r === o.v);
          return (
            <button key={String(o.v)} type="button" aria-pressed={ligado} onClick={() => onResposta(p.id, o.v)} className={cx(CARTAO, LINHA, ligado ? CARTAO_LIGADO : CARTAO_DESLIGADO)}>
              <Marcador ligado={ligado} redondo={false} />
              <span className="min-w-0">{o.rotulo}</span>
            </button>
          );
        })}
      </div>
      {comLado.map((d) => (
        <div key={d.r} role="group" aria-label={`Lado: ${rotulo(d.r)} (opcional)`} className="mt-3">
          <p className="text-[0.9375rem] font-semibold text-iron" aria-hidden>
            Lado: {rotulo(d.r)} <span className="font-normal text-steel">({QTEXTO.opcional})</span>
          </p>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {LADO_OPCOES.map((l) => {
              const ligado = d.l === l.v;
              return (
                <button
                  key={l.v}
                  type="button"
                  aria-pressed={ligado}
                  onClick={() => mudar(d.r, { l: ligado ? undefined : (l.v as Lado) })}
                  className={cx(CARTAO, CENTRO, ligado ? CARTAO_LIGADO : CARTAO_DESLIGADO)}
                >
                  {l.rotulo}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {outro ? (
        <div className="mt-3">
          <label htmlFor={outroId} className="block text-[0.9375rem] font-semibold text-iron">
            {REGIAO_OUTRO_ROTULO} <span className="font-normal text-steel">({QTEXTO.opcional})</span>
          </label>
          <Input id={outroId} value={outro.t ?? ""} maxLength={REGIAO_OUTRO_MAX} onChange={(e) => mudar("outro", { t: e.target.value || undefined })} className="mt-1.5 h-12 text-[1.0625rem]" />
        </div>
      ) : null}
    </fieldset>
  );
}
