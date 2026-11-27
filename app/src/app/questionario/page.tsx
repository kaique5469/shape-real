"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { QuestionarioForm } from "@/components/anamnese/questionario-form";
import { Logo } from "@/components/brand";
import { Button, Skeleton } from "@/components/ui";
import { track } from "@/lib/analytics";
import { useApp } from "@/lib/app-context";
import { comNomes } from "@/lib/domain/anamnese";
import { PROBLEMA_TEXTO, packetProblem, parsePedido, type PedidoPacket, type ProblemaLink } from "@/lib/domain/questionario-link";
import type { Profile } from "@/lib/domain/types";
import { guardarPedidoDaAba, limparRascunhosVencidos, pedidoDaAba } from "@/lib/questionario-client";
import { QTEXTO, guardaDoJunto, guardaDoLink } from "@/lib/questionario-flow";
import { cameFromPaste, limparEndereco, packedFromHash, unpackData } from "@/lib/share-link";

/**
 * Questionário inicial no celular (spec §5.2 e §5.4; track D), fora do painel, como /abrir:
 * - `#d=` → pelo link: lê o pedido uma vez, limpa a barra de endereço e passa pelas guardas (pacote, aparelho do
 *   personal que pediu, outro personal, "Ver como aluno"). O pedido fica guardado na aba (sessionStorage) para quem
 *   recarrega no meio;
 * - `?aluno={id}` → junto, no aparelho do personal (perfil de personal e aluno dele neste aparelho).
 * Becos sem saída do link disparam `link_dead_end_shown`. A raiz leva `ph-no-capture` e `data-questionario` (letra de
 * 18 px, no layout). No CORE do service worker: abre sem sinal.
 */
type Entrada = { tipo: "link"; problema: ProblemaLink | null; pedido: PedidoPacket | null; viaPaste: boolean } | { tipo: "junto"; alunoId: string } | { tipo: "nada" };

type Junto = { estado: "carregando" } | { estado: "ok"; aluno: Profile; coach: Profile } | { estado: "nao_esta" } | { estado: "ver_como_aluno"; nome: string };

/** Lê o pedido do pacote. Nada do texto lido nem dos caminhos do esquema sai daqui (só o código do problema). */
async function lerPedido(packed: string): Promise<{ problema: ProblemaLink | null; pedido: PedidoPacket | null }> {
  let raw: unknown;
  try {
    raw = await unpackData(packed);
  } catch {
    return { problema: "invalido", pedido: null };
  }
  const problema = packetProblem(raw);
  if (problema) return { problema, pedido: null };
  const pedido = parsePedido(raw);
  return pedido ? { problema: null, pedido } : { problema: "invalido", pedido: null };
}

export default function QuestionarioPage() {
  const { ready, user, repo, returnTo, returnToOwner } = useApp();
  const router = useRouter();
  const [entrada, setEntrada] = useState<Entrada | null>(null);
  const [junto, setJunto] = useState<Junto>({ estado: "carregando" });
  const lido = useRef(false);
  const beco = useRef(false);

  // Lê o endereço uma vez (padrão de /abrir): o conteúdo sai da barra assim que é lido.
  useEffect(() => {
    if (lido.current) return;
    lido.current = true;
    limparRascunhosVencidos(new Date());
    const { hash, search, pathname } = window.location;
    const viaPaste = cameFromPaste(hash);
    const doHash = packedFromHash(hash);
    if (hash) limparEndereco(pathname + search);
    const alunoId = new URLSearchParams(search).get("aluno");
    if (doHash) guardarPedidoDaAba(doHash);
    const packed = doHash ?? (alunoId ? null : pedidoDaAba());
    if (packed) {
      void lerPedido(packed).then((r) => setEntrada({ tipo: "link", ...r, viaPaste }));
      return;
    }
    setEntrada(alunoId ? { tipo: "junto", alunoId } : { tipo: "nada" });
  }, []);

  // Outro link aberto na mesma aba (o navegador só troca o "#"): lê de novo do zero.
  useEffect(() => {
    const onHash = () => {
      if (packedFromHash(window.location.hash)) window.location.reload();
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const guarda = entrada?.tipo === "link" && ready ? guardaDoLink({ problema: entrada.problema, pedido: entrada.pedido, usuario: user, vendoComoAluno: Boolean(returnTo) }) : null;

  // Junto: perfil de personal neste aparelho e aluno dele. Resolve uma vez (salvar o aluno não reabre a tela).
  useEffect(() => {
    if (entrada?.tipo !== "junto" || !ready || junto.estado !== "carregando") return;
    let vivo = true;
    void (async () => {
      const vendo = Boolean(returnTo);
      const aluno = !vendo && user?.role === "coach" ? await repo.getProfile(entrada.alunoId).catch(() => null) : null;
      if (!vivo) return;
      const g = guardaDoJunto({ usuario: user, vendoComoAluno: vendo, aluno });
      if (g === "ok" && aluno && user) setJunto({ estado: "ok", aluno, coach: user });
      else if (g === "ver_como_aluno") setJunto({ estado: "ver_como_aluno", nome: user?.name ?? "" });
      else setJunto({ estado: "nao_esta" });
    })();
    return () => {
      vivo = false;
    };
  }, [entrada, ready, user, returnTo, repo, junto.estado]);

  // Beco sem saída do link: uma vez por abertura.
  useEffect(() => {
    if (beco.current || !ready || !entrada || entrada.tipo === "junto") return;
    const motivo = entrada.tipo === "nada" ? "invalido" : guarda?.tipo === "beco" ? guarda.motivo : null;
    if (!motivo) return;
    beco.current = true;
    track("link_dead_end_shown", { tela: "questionario", motivo, via_paste: entrada.tipo === "link" ? entrada.viaPaste : false });
  }, [ready, entrada, guarda]);

  const voltarAoPainel = async () => {
    await returnToOwner().catch(() => null);
    router.push("/alunos");
  };

  let conteudo: ReactNode;
  if (!entrada || !ready || (entrada.tipo === "junto" && junto.estado === "carregando")) {
    conteudo = (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-40" />
      </div>
    );
  } else if (entrada.tipo === "nada") {
    conteudo = <Beco titulo={QTEXTO.linkNaoAbriu} texto={comNomes(PROBLEMA_TEXTO.invalido, { personal: "", aluno: "" })} />;
  } else if (entrada.tipo === "link") {
    const pedido = entrada.pedido;
    if (!guarda) conteudo = null;
    else if (guarda.tipo === "segue") conteudo = <QuestionarioForm modo="link" pedido={guarda.pedido} aparelho={guarda.aparelho} />;
    else if (guarda.tela === "versao_nova" || guarda.tela === "invalido")
      conteudo = <Beco titulo={QTEXTO.linkNaoAbriu} texto={comNomes(PROBLEMA_TEXTO[guarda.tela], { personal: pedido?.coach.name ?? "", aluno: "" })} />;
    else if (guarda.tela === "dono" && pedido)
      conteudo = (
        <Beco titulo={QTEXTO.dono(pedido.student.name)}>
          <Button size="lg" className="w-full" onClick={() => window.location.assign(`/questionario?aluno=${encodeURIComponent(pedido.student.ref)}`)}>
            {QTEXTO.preencherAqui(pedido.student.name)}
          </Button>
        </Beco>
      );
    else
      conteudo = (
        <Beco titulo={QTEXTO.verComoAlunoLink}>
          <Button size="lg" className="w-full" onClick={() => void voltarAoPainel()}>
            {QTEXTO.voltarPainel}
          </Button>
        </Beco>
      );
  } else if (junto.estado === "ok") {
    conteudo = <QuestionarioForm modo="junto" aluno={junto.aluno} coach={junto.coach} />;
  } else if (junto.estado === "ver_como_aluno") {
    conteudo = (
      <Beco titulo={QTEXTO.verComoAlunoJunto(junto.nome)}>
        <Button size="lg" className="w-full" onClick={() => void voltarAoPainel()}>
          {QTEXTO.voltarPainel}
        </Button>
      </Beco>
    );
  } else {
    conteudo = (
      <Beco titulo={QTEXTO.naoEsta}>
        <Button variant="secondary" size="lg" className="w-full" onClick={() => (window.history.length > 1 ? window.history.back() : router.push("/"))}>
          {QTEXTO.voltar}
        </Button>
      </Beco>
    );
  }

  return (
    <div data-questionario className="ph-no-capture mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-4">
      <div className="flex min-h-11 items-center print:hidden">
        <Logo />
      </div>
      <main className="flex-1 pt-4 pb-6">{conteudo}</main>
    </div>
  );
}

function Beco({ titulo, texto, children }: { titulo: string; texto?: string; children?: ReactNode }) {
  return (
    <div className="space-y-4">
      <h1 className="plate-type text-[1.5rem] leading-tight break-words">{titulo}</h1>
      {texto ? <p className="text-steel">{texto}</p> : null}
      {children}
    </div>
  );
}
