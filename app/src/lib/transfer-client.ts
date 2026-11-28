"use client";

import { localRepo } from "@/lib/app-context";
import { track } from "@/lib/analytics";
import { comFotoDoArmazenamento, lastBackupAt, markBackupDone, TEXTO_COTA_LOCAL } from "@/lib/data/local";
import { DataError, type Repository } from "@/lib/data/repository";
import { mesclarChaveDeEnvio, sameSession } from "@/lib/domain/delivery";
import { backupAgeBucket, backupFileName, buildBackup, downloadText, SENT_KEY_RE, SENT_SUFFIXES, sentKeyOf, type Backup, type BackupBundle } from "@/lib/domain/export";
import {
  chaveDoRegistro,
  copiaDeVersaoNova,
  CopiaRecusada,
  lerCopia as lerCopiaFile,
  mesclarRestauracao,
  parseBackup as parseBackupFile,
  planoRestauracao,
  rodadasQueNaoVoltaram,
  semSaudeDasRodadasOmitidas,
  type AparelhoParaRestaurar,
  type PlanoRestauracao,
} from "@/lib/domain/restauracao";
import { CONTATOS_KEY } from "@/lib/domain/perfis-de-entrada";
import { contatoDoPersonal } from "@/lib/domain/link-identity";
import type { BodyMetric, DietPlan, Profile, Program, Session } from "@/lib/domain/types";
import { APAGADO_PREFIXO, apagadoEm, idsDasRodadas, marcarApagado } from "@/lib/questionario-client";
import { contatosNesteAparelho, criadoresNesteAparelho, gravarContatos } from "@/lib/link-client";

/**
 * Cópia de segurança (montar, entregar) e restauração (plano, mescla, R3-6 A e R3-13). O que os links gravam e o registro
 * de envio moram em link-client.ts desde a correção da revisão da rodada 3 e são reexportados aqui: os importadores e os
 * testes de antes continuam iguais. As rotas de link importam de link-client.ts (sem a restauração).
 */
export * from "@/lib/link-client";

/** Chaves "sr:sent:*" destes perfis, para a cópia de segurança (`@desde` fica de fora). */
function readSentKeys(ids: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const id of ids) {
      for (const suffix of SENT_SUFFIXES) {
        const k = sentKeyOf(id, suffix);
        const v = localStorage.getItem(k);
        if (v !== null && SENT_KEY_RE.test(k)) out[k] = v;
      }
    }
  } catch {}
  return out;
}

/** Marcas `sr:v1:qapagado:{id}` deste aparelho (id da rodada → data), para a cópia de segurança. Só ids e datas. */
function readApagadas(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(APAGADO_PREFIXO)) continue;
      const id = k.slice(APAGADO_PREFIXO.length);
      const at = apagadoEm(id);
      if (id && at) out[id] = at;
    }
  } catch {}
  return out;
}

/**
 * Grava as marcas de rodadas apagadas da cópia, sem trocar uma marca mais nova que já esteja no aparelho. Dentro da foto
 * da restauração: `marcarApagado` não avisa quando falha, então a marca é conferida e a falta dela vira erro de cota
 * (volta tudo ao que era, em vez de terminar "ok" sem as marcas).
 */
function restoreApagadas(apagadas: Record<string, string> | undefined): void {
  for (const [id, at] of Object.entries(apagadas ?? {})) {
    const ja = apagadoEm(id);
    if (!ja || Date.parse(at) > Date.parse(ja)) {
      marcarApagado(id, at);
      if (apagadoEm(id) !== at) throw new DataError(TEXTO_COTA_LOCAL, "limit");
    }
  }
}

/**
 * Rodadas deste perfil na cópia que foram apagadas (ou tiveram a saúde revogada) neste aparelho DEPOIS da cópia:
 * restaurar não traz essas respostas de volta (`mesclarRestauracao`). Sem a data do arquivo, qualquer marca conta.
 */
function apagadasDepoisDaCopia(profile: Profile, exportedAt: string | undefined): Map<string, string> {
  const desde = exportedAt ? Date.parse(exportedAt) : Number.NaN;
  const out = new Map<string, string>();
  for (const id of idsDasRodadas(profile)) {
    const em = apagadoEm(id);
    if (em && (!Number.isFinite(desde) || Date.parse(em) > desde)) out.set(id, em);
  }
  return out;
}

// ---- cópia de segurança ------------------------------------------------------------
/** Lê do armazenamento tudo o que entra na cópia deste perfil (fotos ficam de fora). */
export async function collectBackup(repo: Repository, user: Profile, now = new Date()): Promise<Backup> {
  const bundle = async (p: Profile): Promise<BackupBundle> => {
    const [programs, sessions, metrics, diet, customExercises, customFoods] = await Promise.all([
      repo.listPrograms(p.id),
      repo.listSessions(p.id),
      repo.listMetrics(p.id),
      repo.getDiet(p.id),
      repo.listCustomExercises(p.id).catch(() => []),
      repo.listCustomFoods(p.id).catch(() => []),
    ]);
    return { profile: p, programs, sessions, metrics, diet, customExercises, customFoods };
  };
  const main = await bundle(user);
  // Personal: os alunos vão junto, cada um com fichas, treinos, medidas, dieta e o que for próprio dele.
  const students = user.role === "coach" ? await Promise.all((await repo.listStudents(user.id)).map(({ profile }) => bundle(profile))) : undefined;
  // Aluno que recebe a ficha por link: o personal guardado aqui e os exercícios/alimentos dele (a ficha aponta para eles).
  let remoteCoach: BackupBundle | undefined;
  if (repo.mode === "local" && user.remoteCoach) {
    const coach = await localRepo.getProfile(user.remoteCoach.id);
    if (coach) {
      const [customExercises, customFoods] = await Promise.all([localRepo.listCustomExercises(coach.id), localRepo.listCustomFoods(coach.id)]);
      remoteCoach = { profile: coach, customExercises, customFoods };
    }
  }
  const sent = readSentKeys([user.id, ...(students ?? []).map((s) => s.profile.id)]);
  const apagadas = repo.mode === "local" ? readApagadas() : {};
  return buildBackup({ ...main, students, remoteCoach, sent, apagadas }, now);
}

/**
 * Entrega o arquivo: compartilhar nativo quando o aparelho aceita arquivos (iPhone: "Salvar em Arquivos");
 * senão, download (o Chrome do Android recusa compartilhar .json). null quando a pessoa fecha o compartilhar.
 */
export async function deliverBackup(backup: Backup, now = new Date()): Promise<{ via: "share" | "download"; fileName: string } | null> {
  const fileName = backupFileName(now);
  const json = JSON.stringify(backup);
  if (typeof File !== "undefined" && typeof navigator !== "undefined" && typeof navigator.share === "function") {
    const file = new File([json], fileName, { type: "application/json" });
    let shareable = false;
    try {
      shareable = navigator.canShare?.({ files: [file] }) ?? false;
    } catch {}
    if (shareable) {
      try {
        await navigator.share({ files: [file] });
        return { via: "share", fileName };
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return null;
        // Sem permissão (o toque expirou) ou erro do aparelho: cai para o download.
      }
    }
  }
  downloadText(fileName, json, "application/json");
  return { via: "download", fileName };
}

/**
 * Botão "Fazer cópia de segurança" / "Fazer agora": monta, entrega e guarda a data da cópia.
 * A medição leva só a faixa de dias desde a cópia anterior e o caminho (nunca dados do arquivo).
 */
export async function makeBackup(repo: Repository, user: Profile, where: "conta" | "hoje" | "alunos" | "instalar"): Promise<{ via: "share" | "download"; fileName: string; students: number } | null> {
  const now = new Date();
  const previous = lastBackupAt();
  const backup = await collectBackup(repo, user, now);
  const done = await deliverBackup(backup, now);
  if (!done) return null;
  markBackupDone(now.toISOString());
  track("backup_shared", { dias_desde_ultima: backupAgeBucket(previous, now), via: done.via, onde: where, alunos: backup.students?.length ?? 0 });
  return { ...done, students: backup.students?.length ?? 0 };
}

/** Lê o arquivo da cópia (v1 "shape-real-backup.json" ou v2). null se não for uma cópia do app. */
export const parseBackup = parseBackupFile;
/** Lê o arquivo da cópia e diz o motivo quando não serve ("invalido" ou "versao_nova", R3-6 A). */
export const lerCopia = lerCopiaFile;

/**
 * Coleção do repositório local lida direto (mesmo formato de data/local.ts: `sr:v1:{nome}`, JSON), UMA vez por
 * restauração. O repositório não tem leitura por id de treinos e medidas de todos os perfis, e ler perfil por perfil
 * (`listSessions` de cada um) relê a coleção inteira a cada chamada. Ilegível = vazia.
 */
function colecaoLocal<T>(nome: string): T[] {
  try {
    const raw = localStorage.getItem(`sr:v1:${nome}`);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

/** O que o aparelho tem agora, para o plano de restauração (R3-6 A.4). Só leitura. */
function fotoDoAparelho(perfis: readonly Profile[]): AparelhoParaRestaurar {
  const porId = <T extends { id: string }>(rows: T[]) => new Map(rows.filter((r) => r && typeof r.id === "string").map((r) => [r.id, r] as const));
  return {
    fichas: porId(colecaoLocal<Program>("programs")),
    dietas: new Map(colecaoLocal<DietPlan>("diets").filter((d) => d && typeof d.ownerId === "string").map((d) => [d.ownerId, d] as const)),
    treinos: porId(colecaoLocal<Session>("sessions")),
    medidas: porId(colecaoLocal<BodyMetric>("metrics")),
    perfis: new Set(perfis.map((p) => p.id)),
  };
}

/**
 * Plano da restauração para o diálogo, ANTES de confirmar (R3-6 A.4): quantos registros deste aparelho ficam (mais
 * novos que a cópia, ou de outro perfil) e quantos entram. Só leitura (`textoDoPlano` em domain/restauracao.ts monta o texto).
 */
export function planejarRestauracao(b: Backup): PlanoRestauracao {
  return planoRestauracao(b, fotoDoAparelho(localRepo.listLocalProfiles()), sameSession);
}

/** Aluno cujas respostas de saúde não voltaram com a cópia (R3-13): o diálogo avisa depois de restaurar. */
export interface RodadaOmitida {
  alunoId: string;
  nome: string;
  /** Data da marca de apagado neste aparelho (a mais nova). */
  em: string;
}

export interface ResultadoDaRestauracao {
  profile: Profile;
  students: number;
  /** O plano aplicado (mesmas contagens do diálogo, recalculadas na hora de gravar). */
  plano: PlanoRestauracao;
  rodadasOmitidas: RodadaOmitida[];
}

async function restoreBundle(b: BackupBundle, exportedAt: string | undefined, plano: PlanoRestauracao, omitidas: RodadaOmitida[], ownerOverride?: Partial<Profile>) {
  const dono = b.profile.id;
  const decisao = (tipo: Parameters<typeof chaveDoRegistro>[0], id: string) => plano.decisoes.get(chaveDoRegistro(tipo, id)) ?? "entra";
  // Exercícios e alimentos próprios antes das fichas e dietas que apontam para eles.
  for (const e of b.customExercises ?? []) await localRepo.saveCustomExercise(dono, { ...e, custom: true });
  for (const f of b.customFoods ?? []) await localRepo.saveCustomFood(dono, f);
  // Perfil que já existe no aparelho: as respostas do questionário mais novas e as liberações dos dois lados ficam
  // (D-32), e o que foi revogado ou apagado aqui depois da cópia não volta. O resto vem da cópia, como antes. Perfil que
  // não está aqui (ex.: removido depois da cópia): vem da cópia sem as rodadas apagadas aqui depois dela (R3-13).
  const atual = await localRepo.getProfile(dono).catch(() => null);
  const apagadas = apagadasDepoisDaCopia(b.profile, exportedAt);
  const daCopia = { ...b.profile, ...ownerOverride };
  const mesclado = mesclarRestauracao(atual, daCopia, apagadas);
  const em = rodadasQueNaoVoltaram(daCopia, mesclado, apagadas);
  // Perfil que não estava aqui e cujas rodadas não voltaram: a saúde tirada delas (limitações, tokens, peso e altura
  // copiados, passos clínicos) também não volta com o cadastro, e o aviso "não voltaram" continua verdadeiro.
  const restaurado = !atual && em ? semSaudeDasRodadasOmitidas(mesclado, daCopia) : mesclado;
  await localRepo.saveProfile(restaurado);
  if (em) omitidas.push({ alunoId: dono, nome: restaurado.name, em });

  // Plano (R3-6 A.4): só entra o que não deixa para trás uma edição mais nova deste aparelho nem muda o dono de nada.
  // A ficha ativa fica a do aparelho quando ele tem uma para este perfil.
  const ativa = plano.ativas.get(dono);
  for (const p of b.programs ?? []) {
    if (decisao("ficha", p.id) !== "entra") continue;
    await localRepo.saveProgram({ ...p, ownerId: dono, active: ativa !== undefined ? ativa === p.id : p.active }, { keepUpdatedAt: true });
  }
  const sessions = (b.sessions ?? []).filter((s) => decisao("treino", s.id) === "entra");
  if (sessions.length) localRepo.saveSessionsBulk(sessions.map((s) => ({ ...s, userId: dono })));
  const metrics = (b.metrics ?? []).filter((m) => decisao("medida", m.id) === "entra");
  if (metrics.length) localRepo.saveMetricsBulk(metrics.map((m) => ({ ...m, userId: dono })));
  // A data da dieta é a da edição, não a da restauração (senão o registro de envio diria que ela "mudou").
  if (b.diet && decisao("dieta", dono) === "entra") await localRepo.saveDiet({ ...b.diet, ownerId: dono }, { keepUpdatedAt: true });
}

/**
 * Restaura a cópia neste aparelho (fotos não vão no arquivo). Devolve o perfil a abrir, o plano aplicado e os alunos
 * cujas respostas de saúde não voltaram. R3-6 A:
 *  - cópia de versão mais nova: `CopiaRecusada`, antes de qualquer gravação (a leitura do arquivo já recusa);
 *  - tudo é lido antes da primeira gravação (o plano, o contato do personal, as marcas de apagado);
 *  - todas as gravações rodam com a foto do armazenamento: cota no meio volta tudo ao que era e a mensagem é a de cota
 *    ("Nada foi alterado"); se a volta também falhar, `ArmazenamentoIncompleto` ("Restaure de novo o mesmo arquivo").
 *    Nada de erro engolido lá dentro: treinos enviados (`sent`), marcas de apagado e a data da cópia entram na foto;
 *  - R3-1: o personal da cópia de um aluno só é criado como contato quando não existe aqui; quando ele é perfil de
 *    entrada (a cópia do aluno restaurada no aparelho do próprio personal), nada dele é regravado e o aluno restaurado
 *    não entra no painel dele.
 */
export async function restoreBackup(b: Backup): Promise<ResultadoDaRestauracao> {
  if (copiaDeVersaoNova(b)) throw new CopiaRecusada("versao_nova");
  const now = new Date().toISOString();
  // ---- leituras, antes da primeira gravação ----
  const perfis = localRepo.listLocalProfiles();
  const plano = planoRestauracao(b, fotoDoAparelho(perfis), sameSession);
  // Personal de quem recebe a ficha por link.
  const rc = b.remoteCoach && b.remoteCoach.profile.id !== b.profile.id ? b.remoteCoach : undefined;
  const contato = rc ? contatoDoPersonal(rc.profile.id, perfis, await criadoresNesteAparelho(perfis)) : null;
  const exercicosDoContato = rc && contato === "atualizar" ? new Set((await localRepo.listCustomExercises(rc.profile.id)).map((e) => e.id)) : new Set<string>();
  const alimentosDoContato = rc && contato === "atualizar" ? new Set((await localRepo.listCustomFoods(rc.profile.id)).map((f) => f.id)) : new Set<string>();
  // As rodadas comparadas são as deste aparelho antes de gravar as marcas do arquivo (que são de antes da cópia).
  const exportedAt = b.exportedAt;

  return comFotoDoArmazenamento(async () => {
    if (rc && contato === "criar") {
      // Contato que não existe: exercícios e alimentos dele primeiro (as fichas apontam para eles), depois o perfil.
      for (const e of rc.customExercises ?? []) await localRepo.saveCustomExercise(rc.profile.id, { ...e, custom: true });
      for (const f of rc.customFoods ?? []) await localRepo.saveCustomFood(rc.profile.id, f);
      await localRepo.saveProfile({ ...rc.profile, role: "coach" });
      gravarContatos([rc.profile.id]);
    } else if (rc && contato === "atualizar") {
      // Contato que já existe: o perfil dele fica como está (pode ser mais novo que a cópia); só entra o exercício ou
      // alimento que falta aqui, para as fichas restauradas acharem o nome.
      for (const e of rc.customExercises ?? []) if (!exercicosDoContato.has(e.id)) await localRepo.saveCustomExercise(rc.profile.id, { ...e, custom: true });
      for (const f of rc.customFoods ?? []) if (!alimentosDoContato.has(f.id)) await localRepo.saveCustomFood(rc.profile.id, f);
    }
    // A cópia de um personal é de quem a restaura: ele deixa de ser só contato aqui (se já foi, por um link antigo).
    if (b.profile.role === "coach") {
      const lista = contatosNesteAparelho();
      if (lista.includes(b.profile.id)) localStorage.setItem(CONTATOS_KEY, JSON.stringify(lista.filter((id) => id !== b.profile.id)));
    }
    const rodadasOmitidas: RodadaOmitida[] = [];
    // O perfil principal primeiro: as fichas dos alunos usam os exercícios próprios do personal.
    await restoreBundle(b, exportedAt, plano, rodadasOmitidas);
    for (const s of b.students ?? []) {
      await restoreBundle(s, exportedAt, plano, rodadasOmitidas, { managedBy: b.profile.id });
      localRepo.linkDirect(b.profile.id, s.profile.id, now);
    }
    if (rc && contato !== "manter" && b.profile.remoteCoach?.id === rc.profile.id) localRepo.linkDirect(rc.profile.id, b.profile.id, now);
    // Mescla com o registro de envio do aparelho (`mesclarChaveDeEnvio`): uma cópia mais antiga nunca desfaz um "Já enviei",
    // um toque de envio ou o envio da ficha feitos aqui depois dela (o plano diz que o aparelho "fica como está").
    for (const [k, v] of Object.entries(b.sent ?? {})) if (SENT_KEY_RE.test(k)) localStorage.setItem(k, mesclarChaveDeEnvio(k, localStorage.getItem(k), v));
    // Rodadas apagadas no aparelho de onde a cópia saiu: o link antigo do WhatsApp avisa também aqui.
    restoreApagadas(b.apagadas);
    // O conteúdo restaurado já tem cópia: o lembrete conta a partir da data do arquivo (conferido: só avança).
    if (b.exportedAt && Number.isFinite(Date.parse(b.exportedAt))) {
      const alvo = new Date(Math.min(Date.parse(b.exportedAt), Date.now())).toISOString();
      markBackupDone(alvo);
      const gravada = lastBackupAt();
      if (!gravada || Date.parse(gravada) < Date.parse(alvo)) throw new DataError(TEXTO_COTA_LOCAL, "limit");
    }
    return { profile: b.profile, students: b.students?.length ?? 0, plano, rodadasOmitidas };
  });
}
