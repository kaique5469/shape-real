"use client";

import { useCallback, useEffect, useState } from "react";
import { reportError, track, type FichaLinkWhere } from "@/lib/analytics";
import { useApp } from "@/lib/app-context";
import { extraDoEnvioDaFicha } from "@/lib/domain/anamnese-perfil";
import { coachSignature } from "@/lib/domain/cref";
import { fichaSendSituation, type FichaDelivery, type PrepVia } from "@/lib/domain/delivery";
import { firstName, waPhone } from "@/lib/domain/format";
import { avisoDoLink, oQueVaiNaFicha } from "@/lib/domain/link-aviso";
import { buildFichaPacket, fichaLinkItems, fichaLinkMessage } from "@/lib/domain/transfer";
import type { DietPlan, Profile, Program } from "@/lib/domain/types";
import { packData } from "@/lib/share-link";
import { fichaSendRecord, markFichaPrepared, readFichaDelivery } from "@/lib/transfer-client";

/**
 * Envio da ficha e da dieta por link (`/abrir#d=`) — a peça da anamnese §8.6 na forma mínima que a U2b usa, com o
 * mesmo nome e a mesma assinatura (`useFichaLink(student, enabled)`), para a próxima rodada reaproveitar.
 * Diferença decidida pelo dono: o toque NÃO grava nada na ficha (sem `program.sharedAt`); grava o registro único
 * `sr:sent:{aluno}:ficha` com as versões que foram no pacote (`markFichaPrepared`).
 * Só no aparelho: o pacote vai no fragmento do link e nunca passa pelo servidor.
 */

export interface FichaLinkEstado {
  link: string;
  /** Mensagem pronta para o WhatsApp: o link leva o conteúdo (o texto da ficha não vai na mensagem). */
  texto: string;
  /** O que foi no pacote; null = não foi (sem ficha ativa; dieta sem itens, orientações nem metas). */
  programa: Program | null;
  dieta: DietPlan | null;
  /**
   * R3-17: o que o link leva e o aviso de que quem tiver o link consegue ler ("O link leva a ficha e a dieta e o peso,
   * a altura e as limitações de Marina. Quem tiver o link consegue ler: mande só para Marina."). Montado do pacote.
   */
  aviso: string;
}

export interface FichaLinkToque {
  via: PrepVia;
  at: string;
}

export interface FichaLink {
  estado: FichaLinkEstado | null;
  erro: string | null;
  /**
   * Situação do envio do conteúdo deste link, lida ao montá-lo (ANTES do toque): as linhas M/D do diálogo e a
   * `situacao` da medição. null fora do modo local, com aluno de exemplo ou antes de o link existir.
   */
  entrega: FichaDelivery | null;
  /** Último toque desde que o link foi montado (texto do `role="status"`); volta a null quando o link é refeito. */
  toque: FichaLinkToque | null;
  /** Toque em "Enviar no WhatsApp" ou "Copiar mensagem" (cópia já concluída): grava o registro e mede. */
  aoEnviar: (via: PrepVia) => FichaLinkToque | null;
}

const origin = () => (typeof window !== "undefined" ? window.location.origin : "");

/** Registro de envio só existe no modo local e com aluno real (U2 F3). */
const tracks = (mode: string, student: Profile) => mode === "local" && !student.sample;

/**
 * Monta o link e a mensagem ANTES do toque (o toque precisa abrir o WhatsApp na hora) sempre que `enabled` liga,
 * o aluno muda ou `opts.version` muda (ex.: depois de salvar a ficha, para o link levar a versão nova).
 * `opts.where` vai na medição (`ficha_link_sent.where`).
 */
export function useFichaLink(student: Profile, enabled: boolean, opts: { where?: FichaLinkWhere; version?: number } = {}): FichaLink {
  const { user, repo, mode } = useApp();
  const { where, version = 0 } = opts;
  const tracking = tracks(mode, student);
  const [built, setBuilt] = useState<{ estado: FichaLinkEstado; entrega: FichaDelivery | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [toque, setToque] = useState<FichaLinkToque | null>(null);

  useEffect(() => {
    if (!enabled || !user) return;
    let alive = true;
    setBuilt(null);
    setErro(null);
    setToque(null);
    (async () => {
      const [programs, savedDiet, exercises, foods] = await Promise.all([repo.listPrograms(student.id), repo.getDiet(student.id), repo.listCustomExercises(user.id), repo.listCustomFoods(user.id)]);
      const { program, diet } = fichaLinkItems(programs, savedDiet);
      const packet = buildFichaPacket({ coach: user, student, program, diet, customExercises: exercises, customFoods: foods });
      const link = `${origin()}/abrir#d=${await packData(packet)}`;
      const first = firstName(student.name);
      // Assinatura única do personal ("Nome · CREF …"), a mesma da ficha impressa, da dieta e do relatório.
      const coachName = user.name.trim() && user.name !== "Personal" ? coachSignature({ name: user.name, cref: user.cref }) : undefined;
      const texto = fichaLinkMessage({ studentFirstName: first, coachSignature: coachName, hasProgram: Boolean(program), hasDiet: Boolean(diet), link });
      const entrega = tracking ? readFichaDelivery(student.id, { programAt: program?.updatedAt ?? null, dietAt: diet?.updatedAt ?? null }) : null;
      const aviso = avisoDoLink({ ...oQueVaiNaFicha(packet), aluno: student.name });
      if (alive) setBuilt({ estado: { link, texto, programa: program, dieta: diet, aviso }, entrega });
    })().catch((e) => {
      reportError(e, "link:montar-ficha");
      if (alive) setErro("Não foi possível montar o link. Tente de novo.");
    });
    return () => {
      alive = false;
    };
  }, [enabled, user, repo, student, tracking, version]);

  const aoEnviar = useCallback(
    (via: PrepVia): FichaLinkToque | null => {
      if (!built) return null;
      const { estado, entrega } = built;
      const at = new Date().toISOString();
      // Antes de gravar o toque: havia registro de envio deste aluno? Só existe no modo local, com aluno real; fora
      // dele, `primeira` não teria evidência e as chaves do questionário não vão.
      const extra = tracking ? extraDoEnvioDaFicha(student, fichaSendRecord(student.id) === null, at) : null;
      if (tracking) markFichaPrepared(student.id, { at, via, programAt: estado.programa?.updatedAt ?? null, dietAt: estado.dieta?.updatedAt ?? null });
      track("ficha_link_sent", {
        via,
        has_program: Boolean(estado.programa),
        has_diet: Boolean(estado.dieta),
        direct: Boolean(waPhone(student.phone)),
        ...(where ? { where } : {}),
        situacao: entrega ? fichaSendSituation(entrega) : "sem_info",
        ...extra,
      });
      const t = { via, at };
      setToque(t);
      return t;
    },
    [built, tracking, student.id, student.phone, where],
  );

  return { estado: built?.estado ?? null, erro, entrega: built?.entrega ?? null, toque, aoEnviar };
}

/**
 * Situação do envio da ficha e da dieta de um aluno no aparelho do personal (U2 §3.3), para as linhas de estado
 * (`fichaDeliveryLines`). null fora do modo local, com aluno de exemplo ou enquanto carrega. `version` relê o
 * aparelho (depois de um toque de envio, de salvar a ficha ou a dieta).
 */
export function useFichaDelivery(student: Profile, version = 0): FichaDelivery | null {
  const { repo, mode } = useApp();
  const on = tracks(mode, student);
  const [read, setRead] = useState<{ id: string; d: FichaDelivery | null } | null>(null);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    (async () => {
      const [programs, savedDiet] = await Promise.all([repo.listPrograms(student.id), repo.getDiet(student.id)]);
      const { program, diet } = fichaLinkItems(programs, savedDiet);
      const d = readFichaDelivery(student.id, { programAt: program?.updatedAt ?? null, dietAt: diet?.updatedAt ?? null });
      if (alive) setRead({ id: student.id, d });
    })().catch((e) => {
      reportError(e, "envio:situacao-ficha");
      // Sem leitura, nada é afirmado.
      if (alive) setRead({ id: student.id, d: null });
    });
    return () => {
      alive = false;
    };
  }, [on, repo, student.id, version]);
  return on && read?.id === student.id ? read.d : null;
}
