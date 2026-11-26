"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, MessageCircle, Pencil, Printer } from "lucide-react";
import { ConferirDiferencas } from "@/components/anamnese/conferir-diferencas";
import { DeuCerto } from "@/components/anamnese/deu-certo";
import { Pergunta } from "@/components/anamnese/pergunta";
import { ResumoAluno } from "@/components/anamnese/resumo-aluno";
import { isIosBrowser } from "@/components/pwa";
import { Alert, Button, LinkButton, cx } from "@/components/ui";
import { reportError, track } from "@/lib/analytics";
import { evAnamneseOpened, evAnamneseSent, evPartDone, evSendConfirmed } from "@/lib/anamnese-events";
import { useApp } from "@/lib/app-context";
import {
  FAIXA_MENOR_12,
  PARQ_INTRO,
  PARQ_POR_QUE,
  PARQ_SIM_TEXTO,
  TERMO_CAIXA,
  TERMO_TEXTO,
  algumSimParq,
  avisoAbaixoDe,
  comNomes,
  estimarMinutos,
  faltando,
  fmtDiaMes,
  gravarResposta,
  lerResposta,
  mostraFaixaMenor12,
  perguntasVisiveis,
  precisaResponsavel,
  respostasPorParte,
  secoesDoPedido,
  secoesDoQuestionario,
  type Pergunta as PerguntaDef,
} from "@/lib/domain/anamnese";
import { applyAnamnese, conflicts, diffLimitacoes } from "@/lib/domain/anamnese-ficha";
import type { Anamnese, DiffLimitacoes, Diferenca, Escolhas, SecaoId } from "@/lib/domain/anamnese-types";
import { coachSignature } from "@/lib/domain/cref";
import { waLink } from "@/lib/domain/format";
import { uid } from "@/lib/domain/ids";
import { buildRespostas, linkRespostas, respostasMessage, type PedidoPacket } from "@/lib/domain/questionario-link";
import type { Profile } from "@/lib/domain/types";
import { resolveDefaults } from "@/lib/domain/work-style";
import { apagarRascunho, chaveRascunho, enviadoEm, lerRascunho, marcarEnviado, salvarRascunho, type Rascunho } from "@/lib/questionario-client";
import {
  QTEXTO,
  chaveDoEnvio,
  ctxDoJunto,
  ctxDoPedido,
  ctxEfetivo,
  erroDoNumero,
  eventosLigados,
  faltandoNoJunto,
  horaMinuto,
  linhaSalvo,
  montarAnamnese,
  novoRascunho,
  pedidoVelho,
  pendenciasDoEnvio,
  preMarcacaoJunto,
  proximaParte,
  rascunhoParaGravar,
  rotuloDoEnvio,
  rotuloParte,
  saudeAutorizada,
  secaoDoHistorico,
  secaoDoRascunho,
  textoDoNumero,
  textoFalta,
} from "@/lib/questionario-flow";
import { CONFERIR_TEXTO, escolhasIniciais } from "@/lib/questionario-receber";
import { packData } from "@/lib/share-link";

/**
 * Questionário no celular (spec §4 e §5.2 a §5.4; track D): boas-vindas, uma parte por tela, rascunho a cada resposta,
 * voltar do Android por parte, avisos imediatos, conferir e enviar. Pelo link, o toque em Enviar abre o WhatsApp com o
 * pacote já montado e "Deu certo?" confirma. No junto, grava no aparelho do personal (com "Conferir antes de salvar"
 * quando o cadastro diverge) e, sem rede, fecha numa tela final aqui mesmo (`/alunos/[id]` não fica guardada offline).
 *
 * Privacidade: nada daqui vai para a medição além das funções `ev*` (categorias e contagens); nada de resposta em
 * `reportError`. Sem a autorização do junto, o rascunho não grava saúde (`rascunhoParaGravar`).
 */
export type QuestionarioFormProps =
  | { modo: "link"; pedido: PedidoPacket; aparelho: "aluno" | "outro" }
  | { modo: "junto"; aluno: Profile; coach: Profile };

type Tela =
  | { t: "velho" }
  | { t: "inicio" }
  | { t: "parte"; secao: SecaoId; voltarConferir?: boolean }
  | { t: "conferir" }
  | { t: "fimLink" }
  | { t: "fimJunto" };

interface Conferencia {
  an: Anamnese;
  atual: Profile;
  difs: Diferenca[];
  lim: DiffLimitacoes;
  escolhas: Escolhas;
}

/** Online/offline do navegador (o evento `online` mostra "Abrir a página de {aluno}" no fim do junto sem rede). */
function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

const reduzMovimento = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export function QuestionarioForm(props: QuestionarioFormProps) {
  const { repo } = useApp();
  const router = useRouter();
  const online = useOnline();
  const modo = props.modo;
  const pedido = props.modo === "link" ? props.pedido : null;
  const aluno = props.modo === "junto" ? props.aluno : null;
  const coach = props.modo === "junto" ? props.coach : null;
  const nomeAluno = pedido ? pedido.student.name : aluno!.name;
  const nomePersonal = pedido ? pedido.coach.name : coach!.name;
  const [hoje] = useState(() => new Date());
  const chave = pedido ? chaveRascunho({ pedidoId: pedido.id }) : chaveRascunho({ studentId: aluno!.id });
  const ctxBase = useMemo(
    () => (pedido ? ctxDoPedido(pedido, hoje) : ctxDoJunto({ hoje, personal: coach!.name, aluno: aluno!.name, atendimento: coach!.workStyle?.atendimento })),
    [pedido, aluno, coach, hoje],
  );
  const eventos = pedido ? eventosLigados({ id: pedido.student.ref }) : eventosLigados(aluno!);

  // ---- Estado inicial (só no navegador: a página monta este componente depois de ler o endereço) -------------------
  const [inicial] = useState(() => ({ rascunho: lerRascunho(chave), enviado: pedido ? enviadoEm(pedido.id) : null }));
  const [restaurada] = useState<SecaoId | null>(() => {
    const r = inicial.rascunho;
    if (!r || typeof window === "undefined") return null;
    return secaoDoHistorico(window.history.state, secoesDoQuestionario(ctxEfetivo(ctxBase, r, modo), r.a));
  });
  const [rascunho, setRascunho] = useState<Rascunho | null>(restaurada ? inicial.rascunho : null);
  const rRef = useRef<Rascunho | null>(rascunho);
  const [tela, setTela] = useState<Tela>(() => {
    if (restaurada) return { t: "parte", secao: restaurada };
    if (pedido && pedidoVelho(pedido.sentAt, hoje)) return { t: "velho" };
    return { t: "inicio" };
  });
  const [autorizouInicio, setAutorizouInicio] = useState(inicial.rascunho?.autorizouJunto === true);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState("");
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [falhouSalvar, setFalhouSalvar] = useState(false);
  const [envio, setEnvio] = useState<{ chave: string; href: string; texto: string } | null>(null);
  const [erroEnvio, setErroEnvio] = useState(false);
  const [tocou, setTocou] = useState(Boolean(restaurada && inicial.rascunho?.enviarTocadoEm));
  const [deuCerto, setDeuCerto] = useState(false);
  const [conferencia, setConferencia] = useState<Conferencia | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState(false);
  const [salvo, setSalvo] = useState<Profile | null>(null);
  const [verRespostas, setVerRespostas] = useState(false);
  const [abertas, setAbertas] = useState<Set<SecaoId>>(new Set());
  const titulo = useRef<HTMLHeadingElement>(null);
  const focarTitulo = useRef(false);
  const feitas = useRef(new Set<SecaoId>());
  const enviouEvento = useRef(false);
  const idJunto = useRef<string | null>(null);
  const abriu = useRef(false);
  const ultimoRecado = useRef<string | undefined>(undefined);

  const a = rascunho?.a ?? {};
  const ctx = ctxEfetivo(ctxBase, rascunho ?? { autorizouJunto: autorizouInicio }, modo);
  const secoes = secoesDoQuestionario(ctx, a);
  const secoesRef = useRef(secoes);
  secoesRef.current = secoes;
  const telaRef = useRef(tela);
  telaRef.current = tela;

  // ---- Rascunho: debounce de 400 ms, gravação imediata ao trocar de parte e ao sair -----------------------------------
  const pendente = useRef<number | null>(null);
  const ultimo = useRef<Rascunho | null>(null);
  const gravarJa = useCallback(
    (r: Rascunho) => {
      if (pendente.current !== null) window.clearTimeout(pendente.current);
      pendente.current = null;
      ultimo.current = null;
      const agora = new Date().toISOString();
      const ok = salvarRascunho(chave, rascunhoParaGravar({ rascunho: r, ctx: ctxBase, modo, agora }));
      setSalvoEm(ok ? agora : null);
      setFalhouSalvar(!ok);
    },
    [chave, ctxBase, modo],
  );
  const agendar = useCallback(
    (r: Rascunho) => {
      ultimo.current = r;
      if (pendente.current !== null) window.clearTimeout(pendente.current);
      pendente.current = window.setTimeout(() => {
        pendente.current = null;
        if (ultimo.current) gravarJa(ultimo.current);
      }, 400);
    },
    [gravarJa],
  );
  const cancelarGravacao = useCallback(() => {
    if (pendente.current !== null) window.clearTimeout(pendente.current);
    pendente.current = null;
    ultimo.current = null;
  }, []);
  const atualizar = useCallback(
    (n: Rascunho, imediato = false) => {
      rRef.current = n;
      setRascunho(n);
      if (imediato) gravarJa(n);
      else agendar(n);
    },
    [agendar, gravarJa],
  );
  const mudar = useCallback(
    (f: (r: Rascunho) => Rascunho) => {
      const cur = rRef.current;
      if (cur) atualizar(f(cur));
    },
    [atualizar],
  );

  // Sair da página, trocar de aba ou ir para o WhatsApp: grava o que estava esperando o debounce.
  useEffect(() => {
    const flush = () => {
      if (pendente.current !== null && ultimo.current) gravarJa(ultimo.current);
    };
    const vis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", vis);
      flush();
    };
  }, [gravarJa]);

  // ---- Medição: abertura (uma vez) ------------------------------------------------------------------------------------
  useEffect(() => {
    if (abriu.current || !eventos) return;
    abriu.current = true;
    track(
      "anamnese_opened",
      evAnamneseOpened({ modo, iosBrowser: isIosBrowser(), retomou: inicial.rascunho !== null, aparelho: props.modo === "link" ? props.aparelho : "personal_dono" }),
    );
  }, [eventos, inicial.rascunho, modo, props]);

  // ---- Navegação entre partes (voltar do Android = uma parte) ----------------------------------------------------------
  const irPara = useCallback(
    (secao: SecaoId, opts: { voltarConferir?: boolean; empilhar?: boolean } = {}) => {
      setTela({ t: "parte", secao, voltarConferir: opts.voltarConferir });
      setErros({});
      setAviso("");
      const cur = rRef.current;
      if (cur) {
        const lista = secoesDoQuestionario(ctxEfetivo(ctxBase, cur, modo), cur.a);
        atualizar({ ...cur, parte: Math.max(0, lista.indexOf(secao)) }, true);
      }
      if (opts.empilhar !== false) window.history.pushState({ qSecao: secao }, "");
      window.scrollTo({ top: 0 });
      focarTitulo.current = true;
    },
    [atualizar, ctxBase, modo],
  );

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const t = telaRef.current.t;
      if (t === "fimLink" || t === "fimJunto") return;
      const s = rRef.current ? secaoDoHistorico(e.state, secoesRef.current) : null;
      setErros({});
      setAviso("");
      setDeuCerto(false);
      if (s) {
        setTela({ t: "parte", secao: s });
        const cur = rRef.current;
        if (cur) atualizar({ ...cur, parte: Math.max(0, secoesRef.current.indexOf(s)) }, true);
      } else setTela({ t: "inicio" });
      window.scrollTo({ top: 0 });
      focarTitulo.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [atualizar]);

  // Ao trocar de tela, o foco vai para o título (o leitor de tela anuncia a parte nova).
  const chaveTela = tela.t === "parte" ? `parte:${tela.secao}` : tela.t;
  useEffect(() => {
    if (!focarTitulo.current) return;
    focarTitulo.current = false;
    titulo.current?.focus({ preventScroll: true });
  }, [chaveTela]);

  const anunciar = useCallback((msg: string) => {
    setAviso("");
    window.setTimeout(() => setAviso(msg), 60);
  }, []);

  /** Rola até a pergunta e põe o foco no primeiro controle dela (padrão de student-form.tsx). */
  const focarPergunta = useCallback((id: string) => {
    const el = document.getElementById(`q-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: reduzMovimento() ? "auto" : "smooth" });
    const alvo = el.querySelector<HTMLElement>("input:checked, input, textarea, button");
    alvo?.focus({ preventScroll: true });
  }, []);

  const focarDeclaro = () => {
    const el = document.getElementById("q-declaro");
    el?.scrollIntoView({ block: "center", behavior: reduzMovimento() ? "auto" : "smooth" });
    el?.focus({ preventScroll: true });
  };
  const focarPendencias = () => {
    const el = document.getElementById("q-pendencias");
    el?.scrollIntoView({ block: "center", behavior: reduzMovimento() ? "auto" : "smooth" });
    el?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  };

  // ---- Respostas ------------------------------------------------------------------------------------------------------
  const limparErro = (id: string) =>
    setErros((e) => {
      if (!(id in e)) return e;
      const n = { ...e };
      delete n[id];
      return n;
    });
  const onResposta = (id: string, v: unknown) => {
    mudar((r) => ({ ...r, a: gravarResposta(r.a, id, v) }));
    limparErro(id);
  };
  const onTexto = (id: string, t: string) => {
    setTextos((x) => ({ ...x, [id]: t }));
    mudar((r) => ({ ...r, a: gravarResposta(r.a, id, t) }));
    limparErro(id);
  };
  const textoDe = (id: string) => textos[id] ?? textoDoNumero(id, lerResposta(a, id));
  const pularPorAgora = (id: string) => {
    mudar((r) => ({ ...r, pulouPorAgora: [...new Set([...(r.pulouPorAgora ?? []), id])] }));
    limparErro(id);
  };

  // ---- Boas-vindas ----------------------------------------------------------------------------------------------------
  const comecar = (base: Rascunho | null) => {
    const agora = new Date().toISOString();
    let r: Rascunho;
    if (base) {
      r = coach ? { ...base, autorizouJunto: autorizouInicio } : base;
    } else {
      r = novoRascunho({ agora, nome: nomeAluno });
      if (coach) {
        r.autorizouJunto = autorizouInicio;
        // Pré-marcação pelo jeito de trabalhar (nunca no link): só o que está vazio.
        r.a = preMarcacaoJunto(r.a, resolveDefaults(coach.workStyle, { hasPhone: Boolean(aluno?.phone), hasCref: Boolean(coach.cref) }), !autorizouInicio);
      }
    }
    setTextos({});
    rRef.current = r;
    setRascunho(r);
    setTocou(Boolean(r.enviarTocadoEm));
    const secao = base ? secaoDoRascunho(r, ctxBase, modo) : "voce";
    irPara(secao);
  };
  const comecarDeNovo = () => {
    if (!window.confirm(QTEXTO.confirmaApagar)) return;
    cancelarGravacao();
    apagarRascunho(chave);
    comecar(null);
  };

  // ---- Continuar ------------------------------------------------------------------------------------------------------
  const continuar = () => {
    const r = rRef.current;
    if (!r || tela.t !== "parte") return;
    const s = tela.secao;
    const vis = perguntasVisiveis(s, r.a, ctx);
    const pulou = new Set(modo === "junto" ? (r.pulouPorAgora ?? []) : []);
    const novos: Record<string, string> = {};
    let faltam = 0;
    let confira = 0;
    const semResposta = new Set(faltando(s, r.a, ctx).filter((p) => !pulou.has(p.id)).map((p) => p.id));
    for (const p of vis) {
      const eNum = erroDoNumero(p, textoDe(p.id), hoje);
      if (eNum) {
        novos[p.id] = eNum;
        if (semResposta.has(p.id)) faltam++;
        else confira++;
      } else if (semResposta.has(p.id)) {
        novos[p.id] = QTEXTO.faltaAqui;
        faltam++;
      }
    }
    const primeira = vis.find((p) => novos[p.id]);
    if (primeira) {
      setErros(novos);
      anunciar(faltam > 0 ? textoFalta(faltam + confira) : QTEXTO.confira(confira));
      focarPergunta(primeira.id);
      return;
    }
    if (eventos && !feitas.current.has(s)) {
      feitas.current.add(s);
      const ev = evPartDone(s, secoesDoPedido(ctxBase), modo);
      if (ev) track("anamnese_part_done", ev);
    }
    if (tela.voltarConferir) return irPara("enviar");
    const lista = secoesDoQuestionario(ctxEfetivo(ctxBase, r, modo), r.a);
    irPara(lista[proximaParte(lista, lista.indexOf(s), 1)] ?? "enviar");
  };

  // ---- Envio pelo link: pacote pronto antes do toque ------------------------------------------------------------------
  const naTelaDeEnvio = tela.t === "parte" && tela.secao === "enviar";
  const chaveEnvio = rascunho ? chaveDoEnvio(rascunho) : "";
  useEffect(() => {
    if (!pedido || !naTelaDeEnvio || !rRef.current) return;
    const r = rRef.current;
    let vivo = true;
    // Recado digitado: debounce de 400 ms. Caixas: na hora (o botão só vale para o pacote da chave atual).
    const atraso = ultimoRecado.current === undefined || ultimoRecado.current === (r.a.recado ?? "") ? 0 : 400;
    ultimoRecado.current = r.a.recado ?? "";
    const chaveAtual = chaveDoEnvio(r);
    const t = window.setTimeout(async () => {
      try {
        const agora = new Date().toISOString();
        const an = montarAnamnese({ rascunho: r, modo: "link", id: pedido.id, ctx: ctxBase, agora });
        const packed = await packData(buildRespostas({ pedido, anamnese: an, agora }));
        if (!vivo) return;
        const texto = respostasMessage(pedido.coach.name, linkRespostas(window.location.origin, packed));
        setEnvio({ chave: chaveAtual, texto, href: waLink(texto, pedido.coach.phone) });
        setErroEnvio(false);
      } catch {
        if (!vivo) return;
        setErroEnvio(true);
        reportError(new Error("respostas_nao_montadas"), "questionario:envio");
      }
    }, atraso);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [pedido, naTelaDeEnvio, chaveEnvio, ctxBase]);
  const envioPronto = envio && envio.chave === chaveEnvio ? envio : null;

  // "Deu certo?" ao voltar do WhatsApp (a página fica visível de novo depois do toque em Enviar).
  useEffect(() => {
    if (!tocou || !pedido) return;
    const on = () => {
      if (document.visibilityState === "visible" && telaRef.current.t === "parte") setDeuCerto(true);
    };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [tocou, pedido]);

  const aoTocarEnviar = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!navigator.onLine) {
      e.preventDefault();
      anunciar(QTEXTO.semInternet);
      return;
    }
    // O WhatsApp abre pela própria âncora (ação padrão do toque); daqui em diante, só registros no aparelho.
    try {
      const cur = rRef.current;
      if (!cur || !pedido) return;
      const agora = new Date().toISOString();
      const reenvio = enviadoEm(pedido.id) !== null;
      atualizar({ ...cur, enviarTocadoEm: agora }, true);
      setTocou(true);
      if (eventos && !enviouEvento.current) {
        enviouEvento.current = true;
        const ev = evPartDone("enviar", secoesDoPedido(ctxBase), "link");
        if (ev) track("anamnese_part_done", ev);
        track(
          "anamnese_sent",
          evAnamneseSent({
            modo: "link",
            inicio: cur.iniciadoEm,
            fim: agora,
            modulosPedidos: pedido.modulos,
            pulados: cur.pulados ?? [],
            extras: pedido.extras?.length ?? 0,
            reenvio,
            incompleto: false,
            reavaliacao: pedido.reavaliacao,
          }),
        );
      }
    } catch {
      /* o WhatsApp já abriu; o registro do toque é só conveniência */
    }
  };

  const confirmarEnvio = () => {
    if (!pedido) return;
    cancelarGravacao();
    apagarRascunho(chave);
    marcarEnviado(pedido.id, new Date().toISOString());
    if (eventos) track("anamnese_send_confirmed", evSendConfirmed("sim"));
    setDeuCerto(false);
    setTocou(false);
    rRef.current = null;
    setRascunho(null);
    setTela({ t: "fimLink" });
    window.scrollTo({ top: 0 });
    focarTitulo.current = true;
  };

  // ---- Junto: salvar ----------------------------------------------------------------------------------------------------
  const gravarJunto = async (atual: Profile, an: Anamnese, escolhas: Escolhas) => {
    const r = rRef.current;
    const agora = new Date().toISOString();
    const salvoAgora = await repo.saveProfile(applyAnamnese(atual, an, escolhas, agora));
    cancelarGravacao();
    apagarRascunho(chave);
    if (eventos && r) {
      const ev = evPartDone("enviar", secoesDoPedido(ctxBase), "junto");
      if (ev) track("anamnese_part_done", ev);
      track(
        "anamnese_sent",
        evAnamneseSent({ modo: "junto", inicio: r.iniciadoEm, fim: agora, modulosPedidos: [], pulados: [], extras: 0, reenvio: false, incompleto: (an.incompleto?.length ?? 0) > 0 }),
      );
    }
    rRef.current = null;
    if (navigator.onLine) {
      router.push(`/alunos/${encodeURIComponent(atual.id)}?aba=resumo&questionario=novo`);
      return;
    }
    setSalvo(salvoAgora);
    setRascunho(null);
    setTela({ t: "fimJunto" });
    window.scrollTo({ top: 0 });
    focarTitulo.current = true;
  };

  const salvarJunto = async (incompleto: boolean) => {
    const r = rRef.current;
    if (!r || !aluno) return;
    if (!incompleto) {
      const faltam = faltandoNoJunto(r, ctxBase);
      if (faltam.length) {
        anunciar(textoFalta(faltam.length));
        return focarPendencias();
      }
      if (r.declaro !== true) {
        anunciar(QTEXTO.faltaDeclaro);
        return focarDeclaro();
      }
    }
    setSalvando(true);
    setErroSalvar(false);
    try {
      if (pendente.current !== null) gravarJa(r);
      const agora = new Date().toISOString();
      idJunto.current ??= uid();
      const an = montarAnamnese({ rascunho: r, modo: "junto", id: idJunto.current, ctx: ctxBase, agora, salvarIncompleto: incompleto });
      const atual = (await repo.getProfile(aluno.id)) ?? aluno;
      const difs = conflicts(atual, an, hoje);
      const lim = diffLimitacoes(atual, an, hoje);
      if (difs.length || lim.sai.length || lim.entra.length || lim.excede) {
        setConferencia({ an, atual, difs, lim, escolhas: escolhasIniciais(difs, lim) });
        setTela({ t: "conferir" });
        window.history.pushState({ qSecao: "enviar" }, "");
        window.scrollTo({ top: 0 });
        focarTitulo.current = true;
        return;
      }
      await gravarJunto(atual, an, {});
    } catch {
      setErroSalvar(true);
      reportError(new Error("junto_nao_salvo"), "questionario:junto");
    } finally {
      setSalvando(false);
    }
  };

  const salvarConferido = async () => {
    if (!conferencia) return;
    setSalvando(true);
    setErroSalvar(false);
    try {
      await gravarJunto(conferencia.atual, conferencia.an, conferencia.escolhas);
    } catch {
      setErroSalvar(true);
      reportError(new Error("junto_nao_salvo"), "questionario:junto");
    } finally {
      setSalvando(false);
    }
  };

  const salvarDepois = () => {
    const r = rRef.current;
    if (r) gravarJa(r);
    router.push(navigator.onLine && aluno ? `/alunos/${encodeURIComponent(aluno.id)}` : "/alunos");
  };

  // ---- Peças de tela ----------------------------------------------------------------------------------------------------
  const rodapeLink = pedido ? (
    <p className="mt-10 text-[0.875rem] text-steel print:hidden">
      {QTEXTO.medicao}{" "}
      <Link href="/privacidade" className="font-semibold text-iron underline">
        {QTEXTO.saibaMais}
      </Link>
    </p>
  ) : null;

  const barra = (children: ReactNode, linha?: ReactNode) => (
    <div className="sticky bottom-0 z-10 -mx-4 mt-8 border-t border-rule bg-chalk px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] print:hidden">
      <p aria-live="assertive" className={cx("text-[0.9375rem] font-semibold text-danger", aviso ? "mb-2" : "sr-only")}>
        {aviso}
      </p>
      {children}
      {linha}
    </div>
  );

  const salvoLinha = rascunho ? (
    falhouSalvar ? (
      <p className="mt-2 text-[0.875rem] text-steel">{QTEXTO.semSalvar}</p>
    ) : salvoEm ? (
      <p className="mt-2 text-[0.875rem] text-steel">{linhaSalvo(salvoEm, modo)}</p>
    ) : null
  ) : null;

  const cabecalhoJunto =
    aluno && (tela.t === "parte" || tela.t === "conferir") ? (
      <header className="sticky top-0 z-10 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-rule bg-chalk px-4 py-2 print:hidden">
        <p className="min-w-0 flex-1 font-semibold">{QTEXTO.juntoCabecalho(aluno.name)}</p>
        <Button variant="secondary" size="sm" onClick={salvarDepois}>
          {QTEXTO.salvarDepois}
        </Button>
      </header>
    ) : null;

  const faixaMenor = mostraFaixaMenor12(a, hoje) ? (
    <Alert tone="warn" className="mb-4">
      {FAIXA_MENOR_12}
    </Alert>
  ) : null;

  const caixa = (checked: boolean, onChange: (v: boolean) => void, texto: ReactNode, id?: string) => (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-6 shrink-0 accent-iron" />
      <span className="min-w-0">{texto}</span>
    </label>
  );

  const respostas = rascunho ? respostasPorParte({ a: rascunho.a, pulados: rascunho.pulados }, ctx).filter((p) => p.secao !== "enviar") : [];
  const impressao = rascunho ? (
    <section className="hidden print:block">
      <h1 className="text-xl font-bold">{QTEXTO.juntoCabecalho(nomeAluno)}</h1>
      <p className="mb-4 text-sm">{fmtDiaMes(new Date().toISOString())}</p>
      {respostas.map((p) => (
        <div key={p.secao} className="mb-4 break-inside-avoid">
          <h2 className="font-bold">{p.titulo}</h2>
          <dl className="text-sm">
            {p.itens.map((it, i) => (
              <div key={i} className="mt-1">
                <dt className="text-steel">{it.pergunta}</dt>
                <dd className="font-semibold">{it.resposta}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      {rascunho.a.recado ? (
        <p className="text-sm">
          {QTEXTO.recado(nomePersonal)} {rascunho.a.recado}
        </p>
      ) : null}
    </section>
  ) : null;

  // ---- Telas ------------------------------------------------------------------------------------------------------------
  if (tela.t === "velho" && pedido) {
    return (
      <div className="space-y-5">
        <h1 ref={titulo} tabIndex={-1} className="plate-type text-[1.75rem] leading-tight outline-none">
          {QTEXTO.oi(pedido.student.name)}
        </h1>
        <p>{QTEXTO.velho(fmtDiaMes(pedido.sentAt), pedido.coach.name)}</p>
        <Button
          size="lg"
          className="w-full"
          onClick={() => {
            setTela({ t: "inicio" });
            focarTitulo.current = true;
          }}
        >
          {QTEXTO.continuarMesmoAssim}
        </Button>
        {rodapeLink}
      </div>
    );
  }

  if (tela.t === "inicio") {
    const r0 = rascunho ?? inicial.rascunho;
    const minutos = estimarMinutos(ctx);
    const retomar = r0 ? (
      <div className="space-y-3">
        <p className="font-semibold">{QTEXTO.parou(rotuloParte(secoesDoQuestionario(ctxEfetivo(ctxBase, r0, modo), r0.a), secaoDoRascunho(r0, ctxBase, modo), ctx).titulo)}</p>
        <Button size="lg" className="w-full" onClick={() => comecar(r0)}>
          {QTEXTO.continuarDeOndeParei}
        </Button>
        <Button variant="secondary" className="w-full" onClick={comecarDeNovo}>
          {QTEXTO.comecarDeNovo}
        </Button>
      </div>
    ) : null;

    if (pedido) {
      const enviado = !r0 && inicial.enviado;
      const assinatura = coachSignature(pedido.coach);
      return (
        <div className="space-y-5">
          {props.modo === "link" && props.aparelho === "outro" ? <Alert tone="info">{QTEXTO.outroPersonal(pedido.coach.name, pedido.student.name)}</Alert> : null}
          <h1 ref={titulo} tabIndex={-1} className="plate-type text-[2rem] leading-[1.05] outline-none">
            {QTEXTO.oi(pedido.student.name)}
          </h1>
          <p>{QTEXTO.quer(pedido.coach.name)}</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>{QTEXTO.partes(secoes.length, minutos)}</li>
            <li>{QTEXTO.parar}</li>
            <li>{QTEXTO.semBaixar}</li>
          </ul>
          <p>{QTEXTO.temSaude}</p>
          {enviado ? (
            <div className="space-y-3">
              <p className="font-semibold">{QTEXTO.jaEnviou(fmtDiaMes(enviado), horaMinuto(enviado), pedido.coach.name)}</p>
              <Button size="lg" className="w-full" onClick={() => comecar(null)}>
                {QTEXTO.responderDeNovo}
              </Button>
            </div>
          ) : (
            (retomar ?? (
              <Button size="lg" className="w-full" onClick={() => comecar(null)}>
                {QTEXTO.comecar}
              </Button>
            ))
          )}
          <p className="text-[0.9375rem] text-steel">{QTEXTO.naoE(pedido.student.name, pedido.coach.name)}</p>
          {assinatura ? <p className="border-t border-rule pt-4 text-[0.9375rem] text-steel">{assinatura}</p> : null}
          {rodapeLink}
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <h1 ref={titulo} tabIndex={-1} className="plate-type text-[2rem] leading-[1.05] outline-none">
          {QTEXTO.juntoTitulo(nomeAluno)}
        </h1>
        <p>{QTEXTO.juntoTexto(nomeAluno, minutos)}</p>
        <div className="rounded-[var(--radius-ficha)] border border-rule bg-paper px-4 py-3">
          {caixa(autorizouInicio, setAutorizouInicio, QTEXTO.juntoAutorizou(nomeAluno))}
          {!autorizouInicio ? <p className="mt-1 text-[0.9375rem] text-steel">{QTEXTO.juntoSemAutorizacao}</p> : null}
        </div>
        {retomar ?? (
          <Button size="lg" className="w-full" onClick={() => comecar(null)}>
            {QTEXTO.comecar}
          </Button>
        )}
      </div>
    );
  }

  if (tela.t === "fimLink" && pedido) {
    return (
      <div className="space-y-5">
        <h1 ref={titulo} tabIndex={-1} className="plate-type text-[1.75rem] leading-tight outline-none">
          {QTEXTO.fimLink(pedido.student.name, pedido.coach.name)}
        </h1>
        {rodapeLink}
      </div>
    );
  }

  if (tela.t === "fimJunto" && aluno) {
    return (
      <div className="space-y-5">
        <h1 ref={titulo} tabIndex={-1} className="plate-type text-[1.75rem] leading-tight outline-none">
          {QTEXTO.juntoSalvo(aluno.name)}
        </h1>
        {online ? (
          <LinkButton href={`/alunos/${encodeURIComponent(aluno.id)}?aba=resumo&questionario=novo`} size="lg" className="w-full">
            {QTEXTO.abrirPagina(aluno.name)}
          </LinkButton>
        ) : null}
        {salvo ? <ResumoAluno student={salvo} ws={coach?.workStyle} hoje={hoje} somenteLeitura /> : null}
      </div>
    );
  }

  if (tela.t === "conferir" && conferencia && aluno) {
    return (
      <div>
        {cabecalhoJunto}
        <h1 ref={titulo} tabIndex={-1} className="plate-type mb-4 text-[1.625rem] leading-tight outline-none">
          {CONFERIR_TEXTO.titulo}
        </h1>
        <ConferirDiferencas diferencas={conferencia.difs} limitacoes={conferencia.lim} value={conferencia.escolhas} onChange={(v) => setConferencia({ ...conferencia, escolhas: v })} />
        {erroSalvar ? (
          <Alert tone="error" className="mt-4">
            {QTEXTO.erroSalvar}
          </Alert>
        ) : null}
        {barra(
          <div className="grid gap-2">
            <Button size="lg" className="w-full" loading={salvando} onClick={() => void salvarConferido()}>
              {QTEXTO.salvarResumo}
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => window.history.back()}>
              {QTEXTO.voltar}
            </Button>
          </div>,
        )}
      </div>
    );
  }

  if (tela.t !== "parte" || !rascunho) return null;

  const secao = tela.secao;
  const rot = rotuloParte(secoes, secao, ctx);
  const cabecalhoParte = (
    <div className="mb-6">
      <h1 ref={titulo} tabIndex={-1} className="outline-none">
        <span className="block text-[0.9375rem] font-semibold text-steel">{rot.texto} ·</span>
        <span className="plate-type mt-0.5 block text-[1.625rem] leading-tight">{rot.titulo}</span>
      </h1>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-chalk-2" aria-hidden>
        <div className="h-full rounded-full bg-iron" style={{ width: `${Math.round((rot.n / rot.m) * 100)}%` }} />
      </div>
    </div>
  );

  // ---- Conferir e enviar ------------------------------------------------------------------------------------------------
  if (secao === "enviar") {
    const autorizada = saudeAutorizada(rascunho, modo, hoje);
    const menor = precisaResponsavel(rascunho.a, hoje);
    const nomeResp = typeof rascunho.a.responsavel === "string" ? rascunho.a.responsavel.trim() : "";
    const pend = pendenciasDoEnvio({ rascunho, ctx: ctxBase, modo });
    const faltamJunto = modo === "junto" ? faltandoNoJunto(rascunho, ctxBase) : [];
    const recado = perguntasVisiveis("enviar", rascunho.a, ctx).find((p) => p.id === "recado");
    const semAutorizacaoAgora = modo === "link" ? rascunho.consent !== true : rascunho.autorizouJunto !== true;
    const faltamPorParte = (lista: PerguntaDef[]) => {
      const m = new Map<SecaoId, number>();
      for (const p of lista) m.set(p.secao, (m.get(p.secao) ?? 0) + 1);
      return [...m.entries()];
    };
    const pendLista = modo === "junto" ? faltamJunto : pend.faltam;

    const blocoPendencias = pendLista.length ? (
      <Alert tone="warn" className="scroll-mt-28">
        <p className="font-semibold">{textoFalta(pendLista.length)}</p>
        <ul id="q-pendencias" className="mt-2 space-y-1">
          {faltamPorParte(pendLista).map(([s, n]) => (
            <li key={s} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {rotuloParte(secoes, s, ctx).titulo}: {n}
              </span>
              <Button variant="secondary" size="sm" icon={<Pencil className="size-4" aria-hidden />} onClick={() => irPara(s, { voltarConferir: true })}>
                {QTEXTO.editar}
              </Button>
            </li>
          ))}
        </ul>
      </Alert>
    ) : null;

    const listaRespostas = (
      <div className="rounded-[var(--radius-ficha)] border border-rule bg-paper">
        <button
          type="button"
          aria-expanded={verRespostas}
          onClick={() => setVerRespostas((v) => !v)}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left font-semibold"
        >
          {QTEXTO.verRespostas}
          <ChevronDown className={cx("size-5 shrink-0 transition-transform", verRespostas && "rotate-180")} aria-hidden />
        </button>
        {verRespostas ? (
          <ul className="ruled border-t border-rule">
            {respostas.map((p) => {
              const aberta = abertas.has(p.secao);
              return (
                <li key={p.secao} className="px-4 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      aria-expanded={aberta}
                      onClick={() =>
                        setAbertas((x) => {
                          const n = new Set(x);
                          if (n.has(p.secao)) n.delete(p.secao);
                          else n.add(p.secao);
                          return n;
                        })
                      }
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <ChevronDown className={cx("size-4 shrink-0 transition-transform", aberta && "rotate-180")} aria-hidden />
                      <span className="min-w-0">{p.titulo}</span>
                    </button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="min-w-11"
                      aria-label={`${QTEXTO.editar}: ${p.titulo}`}
                      icon={<Pencil className="size-4" aria-hidden />}
                      onClick={() => irPara(p.secao, { voltarConferir: true })}
                    >
                      {QTEXTO.editar}
                    </Button>
                  </div>
                  {aberta ? (
                    <dl className="mb-1 space-y-2 pl-6 text-[0.9375rem]">
                      {p.itens.map((it, i) => (
                        <div key={i}>
                          <dt className="text-steel">{it.pergunta}</dt>
                          <dd className="font-semibold">{it.resposta}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    );

    const recadoBloco = recado ? (
      <div>
        {semAutorizacaoAgora ? <p className="mb-2 font-semibold">{QTEXTO.recadoSemSaude}</p> : null}
        <Pergunta p={recado} a={rascunho.a} onResposta={onResposta} />
      </div>
    ) : null;

    const declaro = caixa(rascunho.declaro === true, (v) => mudar((r) => ({ ...r, declaro: v })), QTEXTO.declaro(nomePersonal), "q-declaro");

    if (modo === "junto") {
      const podeCompleto = faltamJunto.length === 0;
      return (
        <div>
          {cabecalhoJunto}
          <div className="print:hidden">{faixaMenor}</div>
          <div className="print:hidden">{cabecalhoParte}</div>
          <div className="space-y-6 print:hidden">
            {blocoPendencias}
            {recadoBloco}
            {listaRespostas}
            <Button variant="secondary" icon={<Printer className="size-4" aria-hidden />} onClick={() => window.print()} className="print:hidden">
              {QTEXTO.imprimir}
            </Button>
            {declaro}
            <div className="rounded-[var(--radius-ficha)] border border-rule-strong bg-paper px-4 py-3">
              {caixa(rascunho.autorizouJunto === true, (v) => mudar((r) => ({ ...r, autorizouJunto: v })), QTEXTO.juntoAutorizouConferir(nomeAluno))}
              {menor ? (
                <div className="mt-3 border-t border-rule pt-3">
                  <p>{QTEXTO.juntoMenorIntro(nomeAluno)}</p>
                  {nomeResp ? (
                    caixa(rascunho.responsavelOk === true, (v) => mudar((r) => ({ ...r, responsavelOk: v })), QTEXTO.juntoResponsavel(nomeResp))
                  ) : (
                    <p className="mt-2 text-steel">{QTEXTO.menorSemNome}</p>
                  )}
                </div>
              ) : null}
            </div>
            {erroSalvar ? <Alert tone="error">{QTEXTO.erroSalvar}</Alert> : null}
          </div>
          {impressao}
          {barra(
            <div className="grid gap-2">
              <Button size="lg" className="w-full" loading={salvando} onClick={() => void salvarJunto(false)}>
                {QTEXTO.salvarResumo}
              </Button>
              {!podeCompleto ? (
                <>
                  <Button variant="secondary" className="w-full" disabled={salvando} onClick={() => void salvarJunto(true)} aria-describedby="q-salvar-o-que-tem">
                    {QTEXTO.salvarOQueTem}
                  </Button>
                  <p id="q-salvar-o-que-tem" className="text-[0.875rem] text-steel">
                    {QTEXTO.salvarOQueTemLinha(faltamJunto.length)}
                  </p>
                </>
              ) : null}
            </div>,
            salvoLinha,
          )}
        </div>
      );
    }

    // Link
    const p = pedido!;
    const rotulo = rotuloDoEnvio({ autorizada, telefone: Boolean(p.coach.phone), personal: p.coach.name });
    const assinatura = coachSignature(p.coach) ?? p.coach.name;
    const podeEnviar = pend.faltam.length === 0 && pend.declaro;
    const tentarEnviar = () => {
      if (pend.faltam.length) {
        anunciar(textoFalta(pend.faltam.length));
        focarPendencias();
        return;
      }
      if (!pend.declaro) {
        anunciar(QTEXTO.faltaDeclaro);
        focarDeclaro();
      }
    };
    const descr = "q-autorizacao q-envio-linha";
    return (
      <div>
        <div className="print:hidden">{faixaMenor}</div>
        <div className="print:hidden">{cabecalhoParte}</div>
        <div className="space-y-6 print:hidden">
          {blocoPendencias}
          {recadoBloco}
          {listaRespostas}
          <Button variant="secondary" icon={<Printer className="size-4" aria-hidden />} onClick={() => window.print()} className="print:hidden">
            {QTEXTO.imprimir}
          </Button>
          {declaro}
          <section id="q-autorizacao" aria-labelledby="q-autorizacao-titulo" className="rounded-[var(--radius-ficha)] border-2 border-iron bg-paper px-4 py-4">
            <h2 id="q-autorizacao-titulo" className="text-[1.125rem] font-bold leading-snug">
              {QTEXTO.autorizacaoTitulo}
            </h2>
            <p className="mt-2">{QTEXTO.autorizacaoIntro}</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>
                <strong>Quem recebe:</strong> {QTEXTO.quemRecebe(assinatura)}
              </li>
              <li>
                <strong>Para quê:</strong> {QTEXTO.paraQue}
              </li>
              <li>
                <strong>Como:</strong> {QTEXTO.como(p.coach.name)}
              </li>
              <li>
                <strong>Seus direitos:</strong> {QTEXTO.direitos(p.coach.name)}
              </li>
            </ul>
            <div className="mt-3 border-t border-rule pt-2">
              {caixa(rascunho.consent === true, (v) => mudar((r) => ({ ...r, consent: v })), <strong>{QTEXTO.autorizo(p.coach.name)}</strong>)}
            </div>
            <p className="mt-2 text-[0.9375rem] italic text-steel">{QTEXTO.semAutorizacao(p.coach.name)}</p>
          </section>
          {menor ? (
            <section className="rounded-[var(--radius-ficha)] border-2 border-iron bg-paper px-4 py-4">
              <p>{QTEXTO.menorIntro}</p>
              {nomeResp ? (
                <div className="mt-2">
                  {caixa(rascunho.responsavelOk === true, (v) => mudar((r) => ({ ...r, responsavelOk: v })), <strong>{QTEXTO.menorCaixa(rascunho.a.nome ?? p.student.name, nomeResp, p.coach.name)}</strong>)}
                </div>
              ) : (
                <p className="mt-2 text-steel">{QTEXTO.menorSemNome}</p>
              )}
            </section>
          ) : null}
          {erroEnvio ? <Alert tone="error">{QTEXTO.erroSalvar}</Alert> : null}
        </div>
        {impressao}
        {rodapeLink}
        {barra(
          <div className="grid gap-2">
            {!podeEnviar ? (
              <Button size="lg" className="w-full" onClick={tentarEnviar} aria-describedby={descr}>
                <MessageCircle className="size-5" aria-hidden />
                {rotulo.botao}
              </Button>
            ) : envioPronto ? (
              <a
                href={envioPronto.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={aoTocarEnviar}
                aria-describedby={descr}
                className="inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-[var(--radius-ficha)] bg-plate-green px-4 text-center text-base font-semibold text-white shadow-press hover:bg-plate-green-ink"
              >
                <MessageCircle className="size-5 shrink-0" aria-hidden />
                {rotulo.botao}
              </a>
            ) : (
              <Button size="lg" className="w-full" disabled aria-describedby={descr}>
                {QTEXTO.preparando}
              </Button>
            )}
            <p id="q-envio-linha" className="text-[0.875rem] text-steel">
              {rotulo.linha}
            </p>
            {!online ? <p className="text-[0.9375rem] font-semibold">{QTEXTO.semInternet}</p> : null}
            {tocou ? (
              <Button variant="secondary" className="w-full" onClick={() => setDeuCerto(true)}>
                {QTEXTO.jaEnviei}
              </Button>
            ) : null}
          </div>,
          salvoLinha,
        )}
        <DeuCerto
          open={deuCerto}
          personal={p.coach.name}
          href={envioPronto?.href ?? null}
          texto={envioPronto?.texto ?? null}
          offline={!online}
          onSim={confirmarEnvio}
          onTentar={() => {
            if (eventos) track("anamnese_send_confirmed", evSendConfirmed("tentar"));
            setDeuCerto(false);
          }}
          onCopiar={() => {
            if (eventos) track("anamnese_send_confirmed", evSendConfirmed("copiar"));
          }}
          onFechar={() => {
            if (eventos) track("anamnese_send_confirmed", evSendConfirmed("tentar"));
            setDeuCerto(false);
          }}
        />
      </div>
    );
  }

  // ---- Partes 1 a 5 -------------------------------------------------------------------------------------------------------
  const vis = perguntasVisiveis(secao, rascunho.a, ctx);
  const pulou = new Set(modo === "junto" ? (rascunho.pulouPorAgora ?? []) : []);
  const ehParq = secao === "parq";
  const simParq = ehParq && algumSimParq(rascunho.a);
  return (
    <div>
      {cabecalhoJunto}
      {faixaMenor}
      {cabecalhoParte}
      {ehParq ? (
        <div className="mb-6 space-y-2 rounded-[var(--radius-ficha)] border border-rule bg-paper px-4 py-3 text-[0.9375rem]">
          {PARQ_INTRO.map((t) => (
            <p key={t}>{t}</p>
          ))}
          <details>
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-info-ink underline underline-offset-4">{QTEXTO.porQue}</summary>
            <p className="text-steel">{PARQ_POR_QUE}</p>
          </details>
        </div>
      ) : null}
      <div className="space-y-8">
        {vis.map((p) => (
          <Fragment key={p.id}>
            <Pergunta
              p={p}
              a={rascunho.a}
              onResposta={onResposta}
              texto={p.tipo === "num" ? textoDe(p.id) : undefined}
              onTexto={onTexto}
              erro={erros[p.id] ?? null}
              pular={modo === "junto" ? { pulada: pulou.has(p.id), onPular: () => pularPorAgora(p.id) } : null}
              aviso={avisoAbaixoDe(p.id, rascunho.a)}
            />
            {p.id === "parq.6" && simParq ? <p className="rounded-[var(--radius-ficha)] border border-rule bg-info-surface px-4 py-3">{comNomes(PARQ_SIM_TEXTO, ctx)}</p> : null}
          </Fragment>
        ))}
        {simParq ? (
          <div className="rounded-[var(--radius-ficha)] border-2 border-iron bg-paper px-4 py-4">
            {TERMO_TEXTO.map((t) => (
              <p key={t} className="mb-2">
                {t}
              </p>
            ))}
            <div className="border-t border-rule pt-2">{caixa(rascunho.termo === true, (v) => mudar((r) => ({ ...r, termo: v })), comNomes(TERMO_CAIXA[modo], ctx))}</div>
          </div>
        ) : null}
      </div>
      {rodapeLink}
      {barra(
        <Button size="lg" className="w-full" onClick={continuar}>
          {tela.voltarConferir ? QTEXTO.voltarConferir : QTEXTO.continuar}
        </Button>,
        salvoLinha,
      )}
    </div>
  );
}
