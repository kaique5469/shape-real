"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { CircleAlert, Lock, MessageCircle } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { StatusRegion } from "@/components/delivery-status";
import { Alert, Button, Dialog, Field, Input, Skeleton } from "@/components/ui";
import { reportError, track } from "@/lib/analytics";
import { evAnamneseRequested } from "@/lib/anamnese-events";
import { useApp } from "@/lib/app-context";
import { estimarMinutos } from "@/lib/domain/anamnese";
import { ehExemplo } from "@/lib/domain/anamnese-types";
import { maskPhone, waLink, waPhone } from "@/lib/domain/format";
import { pedidoPendente } from "@/lib/domain/next-steps";
import {
  comPedido,
  lembreteMessage,
  linkPedido,
  pedidoMessage,
  PEDIR_TEXTO,
  nomeDoPersonalOk,
  pedidoParaEnviar,
  readAnamnese,
  whatsappDoPersonalOk,
  type PedidoPacket,
} from "@/lib/domain/questionario-link";
import type { Profile } from "@/lib/domain/types";
import { packData } from "@/lib/share-link";

/** "…/questionario#d=1.Rc2xTsMwFE…": centenas de caracteres do pacote não ajudam a conferir a mensagem. */
function linkCurto(link: string): string {
  const i = link.indexOf("#d=");
  return i < 0 || link.length <= i + 15 ? link : `${link.slice(0, i + 15)}…`;
}

/** Pedido montado antes do toque: o link e a mensagem já prontos quando os botões aparecem. */
interface PedidoPronto {
  pedido: PedidoPacket;
  packed: string;
  texto: string;
  /** A mensagem com o link encurtado só na tela (o envio e a cópia levam o link inteiro). */
  previa: string;
  minutos: number;
  /** Mesmo `id` de um pedido pendente (pacote refeito com os dados de agora): o aluno continua o rascunho. */
  reenvio: boolean;
}

/**
 * Pedir o questionário pelo WhatsApp (spec §5.3), no molde de `SendToStudent`: o pedido (`buildPedido` + `packData`) é
 * montado ao abrir, e o WhatsApp abre no toque (âncora com o link pronto). Depois do toque em WhatsApp ou Copiar,
 * grava `anamnesePedido` (cada toque atualiza a data) e mostra "Pronto…". `anamnese_requested` dispara uma vez por
 * pedido, no primeiro toque desta abertura, com `reenvio` quando o pedido pendente é reaproveitado.
 *  - Sem o WhatsApp do personal: o diálogo começa por ele (sem o número, as respostas cairiam no seletor de contatos).
 *    Com o nome provisório "Personal" (o /testar começa assim), pede o nome junto: o aluno leria "Aqui é Personal".
 *  - "Lembrar {aluno}" (`de: "lembrete"`): mesmo `id`, pacote refeito (`pedidoParaEnviar`), com a mensagem de lembrete.
 *  - Aluno de exemplo ou da demonstração (`ehExemplo`): nenhum pedido real e nenhum evento.
 *  - Conta na nuvem: /receber não registra respostas, então o pedido por link não é oferecido.
 * Nenhum texto do diálogo nem da mensagem tem dado de saúde. Raiz com `ph-no-capture`.
 * [E2] chaves das partes extras, "Usar sempre assim", perguntas próprias, "Só a saúde" × "Tudo de novo" e prévia.
 */
export function PedirQuestionario(props: { open: boolean; onClose: () => void; student: Profile; de: "cadastro" | "aluno" | "passos" | "lembrete"; reavaliacao?: "saude" | "tudo"; onPedido?: (p: Profile) => void }): ReactElement | null {
  const { open, onClose, student, de, reavaliacao, onPedido } = props;
  const { user, repo, mode, updateProfile } = useApp();
  const exemplo = ehExemplo(student);
  const nuvem = mode === "supabase";
  const lembrete = de === "lembrete";
  const temWhatsapp = whatsappDoPersonalOk(user);
  const temNome = nomeDoPersonalOk(user);
  const temDados = temWhatsapp && temNome;
  const aluno = student.name;

  const [pronto, setPronto] = useState<PedidoPronto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [toque, setToque] = useState<"whatsapp" | "copiar" | null>(null);
  const [fone, setFone] = useState("");
  const [erroFone, setErroFone] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [erroNome, setErroNome] = useState<string | null>(null);
  const [salvandoFone, setSalvandoFone] = useState(false);
  const evento = useRef(false);
  // O pedido é montado uma vez por abertura, com o aluno e o personal daquele momento: gravar o pedido muda o aluno
  // (onPedido), e remontar trocaria `reenvio` e piscaria os botões.
  const atual = useRef({ student, user });
  atual.current = { student, user };
  const hintId = useId();
  const erroId = useId();
  /** Depois de "Salvar e continuar": leva o foco para a introdução da etapa da mensagem quando ela aparece. */
  const focarEtapa = useRef(false);
  const introRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!focarEtapa.current || !temDados) return;
    focarEtapa.current = false;
    requestAnimationFrame(() => introRef.current?.focus());
  }, [temDados]);
  const nomeHintId = useId();
  const nomeErroId = useId();

  useEffect(() => {
    if (!open) return;
    setPronto(null);
    setErro(null);
    setToque(null);
    setFone("");
    setErroFone(null);
    setNome("");
    setErroNome(null);
    evento.current = false;
  }, [open]);

  useEffect(() => {
    if (!open || exemplo || nuvem || !temDados) return;
    let vivo = true;
    (async () => {
      const { student: s, user: coach } = atual.current;
      if (!coach) return;
      const lida = readAnamnese(s);
      // Mesmo id do pedido pendente, pacote refeito com o personal de agora (WhatsApp, nome, CREF) e `sentAt` novo.
      const { pedido, reenvio } = pedidoParaEnviar({ coach, student: s, pendente: pedidoPendente(s, lida && typeof lida === "object" ? lida : null), ...(reavaliacao ? { reavaliacao } : {}), agora: new Date().toISOString() });
      const packed = await packData(pedido);
      if (!vivo) return;
      const link = linkPedido(window.location.origin, packed);
      const minutos = estimarMinutos({ modulos: pedido.modulos, extras: pedido.extras ?? [], ...(reavaliacao ? { reavaliacao } : {}) });
      const texto = lembrete && reenvio ? lembreteMessage(s.name, link) : pedidoMessage(pedido, link, minutos);
      setPronto({ pedido, packed, texto, previa: texto.replace(link, linkCurto(link)), minutos, reenvio });
    })().catch(() => {
      // Sem reportError: o pacote só tem nomes e o id do pedido, e o erro não ajudaria a corrigir nada.
      if (vivo) setErro(PEDIR_TEXTO.naoSalvou);
    });
    return () => {
      vivo = false;
    };
  }, [open, exemplo, nuvem, temDados, reavaliacao, lembrete]);

  async function gravar(p: PedidoPronto) {
    try {
      const s = (await repo.getProfile(student.id).catch(() => null)) ?? atual.current.student;
      const salvo = await repo.saveProfile(comPedido(s, p.pedido, p.packed, new Date().toISOString()));
      onPedido?.(salvo);
    } catch (e) {
      reportError(e, "questionario:pedido-gravar");
      setErro(PEDIR_TEXTO.naoSalvou);
    }
  }

  /** Depois do toque (o WhatsApp já abriu pela âncora, ou a mensagem já foi copiada). */
  function tocou(via: "whatsapp" | "copiar") {
    if (!pronto) return;
    if (!evento.current) {
      evento.current = true;
      track("anamnese_requested", evAnamneseRequested({ via, ...(reavaliacao ? { reavaliacao } : {}), modulos: pronto.pedido.modulos, extras: pronto.pedido.extras?.length ?? 0, de, reenvio: pronto.reenvio }));
    }
    setToque(via);
    void gravar(pronto);
  }

  async function salvarFone(e: React.FormEvent) {
    e.preventDefault();
    const nomeLimpo = nome.trim().replace(/\s+/g, " ");
    const semNome = !temNome && !nomeDoPersonalOk({ name: nomeLimpo });
    const semFone = !temWhatsapp && !whatsappDoPersonalOk({ phone: fone });
    setErroNome(semNome ? PEDIR_TEXTO.erroNome : null);
    setErroFone(semFone ? PEDIR_TEXTO.erroWhatsapp : null);
    if (semNome || semFone) return;
    setSalvandoFone(true);
    // O formulário dá lugar à prévia: o foco vai para o começo da etapa nova (senão cai no <body> com o diálogo aberto).
    // Marcado antes de gravar: o perfil do personal pode mudar (e a etapa trocar) antes de a gravação terminar.
    focarEtapa.current = true;
    try {
      await updateProfile({ ...(temNome ? {} : { name: nomeLimpo }), ...(temWhatsapp ? {} : { phone: fone }) });
    } catch (err) {
      focarEtapa.current = false;
      reportError(err, "questionario:pedido-whatsapp");
      setErroFone(PEDIR_TEXTO.naoSalvou);
    } finally {
      setSalvandoFone(false);
    }
  }

  const minutos = pronto?.minutos ?? estimarMinutos({ modulos: [], extras: [], ...(reavaliacao ? { reavaliacao } : {}) });

  return (
    <Dialog open={open} onClose={onClose} title={lembrete ? PEDIR_TEXTO.tituloLembrete(aluno) : PEDIR_TEXTO.titulo(aluno)}>
      <div className="ph-no-capture space-y-4">
        {nuvem ? (
          <Alert tone="info">{PEDIR_TEXTO.nuvem(aluno)}</Alert>
        ) : !exemplo && !temDados ? (
          <form onSubmit={salvarFone} noValidate className="space-y-3">
            {temNome ? null : (
              <Field label={PEDIR_TEXTO.seuNome} hint={PEDIR_TEXTO.seuNomeDica(aluno)} noteId={nomeHintId}>
                <Input
                  value={nome}
                  onChange={(e) => {
                    setNome(e.target.value);
                    if (erroNome) setErroNome(null);
                  }}
                  autoComplete="name"
                  maxLength={120}
                  aria-invalid={erroNome ? true : undefined}
                  aria-describedby={erroNome ? `${nomeHintId} ${nomeErroId}` : nomeHintId}
                />
              </Field>
            )}
            {temWhatsapp ? null : (
              <Field label={PEDIR_TEXTO.seuWhatsapp} hint={PEDIR_TEXTO.seuWhatsappDica(aluno)} noteId={hintId}>
                <Input
                  value={maskPhone(fone)}
                  onChange={(e) => {
                    setFone(e.target.value.replace(/\D/g, "").slice(-13));
                    if (erroFone) setErroFone(null);
                  }}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="Ex.: (11) 91234-5678"
                  aria-invalid={erroFone ? true : undefined}
                  aria-describedby={erroFone ? `${hintId} ${erroId}` : hintId}
                />
              </Field>
            )}
            {/* Sempre montada: leitor de tela pode não anunciar uma região viva que já nasce com texto. */}
            <div aria-live="assertive" className="space-y-1">
              {erroNome ? (
                <p id={nomeErroId} className="flex items-start gap-1.5 text-sm text-danger">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0">{erroNome}</span>
                </p>
              ) : null}
              {erroFone ? (
                <p id={erroId} className="flex items-start gap-1.5 text-sm text-danger">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0">{erroFone}</span>
                </p>
              ) : null}
            </div>
            <Button type="submit" className="w-full" loading={salvandoFone}>
              {PEDIR_TEXTO.salvarEContinuar}
            </Button>
            <Link href="/conta" className="inline-flex min-h-11 items-center text-sm font-semibold text-plate-blue-ink underline underline-offset-2 hover:text-iron">
              {PEDIR_TEXTO.editarEmConta}
            </Link>
          </form>
        ) : (
          <>
            <p ref={introRef} tabIndex={-1} className="text-[0.9375rem] text-steel outline-none">
              {PEDIR_TEXTO.comoResponde(aluno, minutos)}
            </p>
            <p className="flex items-start gap-2 text-[0.9375rem] text-iron">
              <Lock className="mt-[0.2em] size-4 shrink-0 text-steel" aria-hidden />
              <span className="min-w-0">{PEDIR_TEXTO.sempreVao}</span>
            </p>
            {exemplo ? (
              <Alert tone="info">{PEDIR_TEXTO.exemplo}</Alert>
            ) : (
              <>
                {erro ? <Alert tone="error">{erro}</Alert> : null}
                {!pronto && !erro ? <Skeleton className="h-28" /> : null}
                {pronto ? (
                  <>
                    <figure>
                      <figcaption className="mb-1.5 text-sm font-semibold text-iron">
                        Prévia da mensagem
                      </figcaption>
                      <p className="rounded-[var(--radius-ficha)] border border-rule bg-chalk px-3 py-2.5 text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-iron [overflow-wrap:anywhere]">
                        {pronto.previa}
                      </p>
                    </figure>
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={waLink(pronto.texto, student.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => tocou("whatsapp")}
                          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[6px] bg-plate-green px-4 py-2 text-center font-semibold text-white hover:bg-plate-green-ink"
                        >
                          <MessageCircle className="size-4 shrink-0" aria-hidden />
                          {waPhone(student.phone) ? PEDIR_TEXTO.abrirWhatsapp(aluno) : PEDIR_TEXTO.escolherContato}
                        </a>
                        <CopyButton text={pronto.texto} label={PEDIR_TEXTO.copiar} onCopied={() => tocou("copiar")} />
                      </div>
                      {/* Montada junto com os botões, antes de qualquer toque; só o texto muda. */}
                      <StatusRegion className="mt-2" text={toque ? PEDIR_TEXTO.pronto(aluno) : null} icon={toque === "copiar" ? "copia" : "whatsapp"} />
                    </div>
                  </>
                ) : null}
              </>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
