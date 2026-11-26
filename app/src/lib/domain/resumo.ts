/**
 * Resumo do aluno a partir das respostas (spec §6.2). Puro; nenhum texto vem de modelo.
 * Entrega 1: blocos 0 a 3 (no bloco 3, só a linha de perfil: "Para a ficha" é do track B) e as respostas completas
 * (`respostasPorParte`, em anamnese.ts); `atencao`, `conferir.itens`, `disse`, `extras`, `falta` e `mudou` ficam
 * vazios até a Entrega 2 (blocos 4 a 9).
 */
import type { Anamnese, Resumo, WorkStyle } from "./anamnese-types";
import { fmtData, fmtDiaMes, idadeDe, PERGUNTAS, primeiroNome, respostaDe, rotuloOpcao } from "./anamnese";
import { readAnamnese } from "./questionario-link";
import { ALERTA_DEF, alertas, SINAIS_PARAR } from "./triagem";
import type { Profile } from "./types";

/** Frases de spec §6.1 quando `readAnamnese` não lê as respostas (o gerador trata como trava). */
export const PROBLEMA_RESUMO: Record<NonNullable<Resumo["problema"]>, string> = {
  versao_nova: "Respostas de uma versão mais nova do app. Atualize para ver.",
  invalida: "As respostas deste aluno estão danificadas. Peça o questionário de novo.",
};
/** Faixa do bloco 0 quando `velho` (os alertas continuam visíveis). */
export const VELHO_TEXTO = "Respostas de saúde com mais de 1 ano. Peça para atualizar.";

export function semAlertasFrase(answeredAt: string): string {
  return `Nenhum sinal de alerta nas respostas de ${fmtDiaMes(answeredAt)}. Isso não substitui a avaliação presencial.`;
}

const EXPERIENCIA_PERFIL: Record<string, string> = {
  nunca: "nunca treinou",
  m3: "treina há menos de 3 meses",
  m12: "treina há 3 a 12 meses",
  a3: "treina há 1 a 3 anos",
  mais3: "treina há mais de 3 anos",
};
const ONDE_PERFIL: Record<string, string> = { academia: "academia completa", condominio: "academia pequena ou de prédio", casa: "em casa", livre: "ao ar livre" };

/** "{Objetivo} · treina há {experiência} · {dias}×{min} min · {onde} · {idade} anos · {F/M}". Nunca mostra peso. */
function perfilTexto(an: Anamnese, hoje: Date): string {
  const a = an.a;
  const partes: string[] = [];
  const objetivo = rotuloOpcao("objetivo", a.objetivo);
  if (objetivo) partes.push(objetivo);
  if (a.experiencia && EXPERIENCIA_PERFIL[a.experiencia]) partes.push(EXPERIENCIA_PERFIL[a.experiencia] as string);
  if (a.dias && a.minutos) partes.push(`${a.dias}×${a.minutos} min`);
  else if (a.dias) partes.push(`${a.dias} ${a.dias === 1 ? "dia" : "dias"} por semana`);
  else if (a.minutos) partes.push(`${a.minutos} min por treino`);
  if (a.onde && ONDE_PERFIL[a.onde]) partes.push(ONDE_PERFIL[a.onde] as string);
  const idade = idadeDe(a, hoje);
  if (idade !== null) partes.push(`${idade} anos`);
  if (a.sexo === "F" || a.sexo === "M") partes.push(a.sexo);
  return partes.join(" · ");
}

function origemTexto(an: Anamnese, profile: Profile): string {
  const aluno = primeiroNome(profile.name) || primeiroNome(an.a.nome) || "o aluno";
  const como = an.via === "link" ? `${aluno} respondeu pelo link` : "feito com você";
  const saude = an.healthOmitted ? " · sem dados de saúde" : an.consent ? ` · autorização de saúde em ${fmtDiaMes(an.consent.at)}` : "";
  return `Questionário de ${fmtData(an.answeredAt)} · ${como}${saude}`;
}

/** Respostas com mais de 12 meses. */
function velho(answeredAt: string, hoje: Date): boolean {
  const limite = new Date(answeredAt);
  if (Number.isNaN(limite.getTime())) return false;
  limite.setMonth(limite.getMonth() + 12);
  return hoje.getTime() > limite.getTime();
}

function tituloConferir(ws: WorkStyle | undefined): Resumo["conferir"]["titulo"] {
  return ws?.atendimento === "online" || ws?.atendimento === "turmas" ? "Na primeira conversa, perguntar" : "Na primeira aula, conferir";
}

function soProblema(problema: NonNullable<Resumo["problema"]>, ws: WorkStyle | undefined): Resumo {
  return {
    origem: "",
    velho: false,
    alertas: [],
    semAlertasTexto: null,
    perfil: "",
    atencao: [],
    conferir: { titulo: tituloConferir(ws), itens: [] },
    disse: [],
    extras: [],
    falta: [],
    mudou: null,
    sinaisParar: null,
    escondePeso: false,
    problema,
  };
}

/** null sem questionário. Lê as respostas só por `readAnamnese`; "versao_nova"/"invalida" viram `problema`. */
export function summarize(i: { profile: Profile; ws?: WorkStyle; hoje: Date }): Resumo | null {
  const r = readAnamnese(i.profile);
  if (r === null) return null;
  if (r === "versao_nova" || r === "invalida") return soProblema(r, i.ws);
  const an = r;
  const lista = alertas(an, { hoje: i.hoje, liberacoes: i.profile.liberacoes ?? [] });
  const temSinal = lista.some((x) => x.nivel === "vermelho" || x.nivel === "laranja" || x.nivel === "amarelo");
  return {
    origem: origemTexto(an, i.profile),
    velho: velho(an.answeredAt, i.hoje),
    alertas: lista,
    semAlertasTexto: temSinal ? null : semAlertasFrase(an.answeredAt),
    perfil: perfilTexto(an, i.hoje),
    atencao: [],
    conferir: { titulo: tituloConferir(i.ws), itens: [] },
    disse: [],
    extras: [],
    falta: [],
    mudou: null,
    sinaisParar: lista.some((x) => x.id === "A-GESTANTE" || x.id === "A-GESTANTE-OK") ? SINAIS_PARAR : null,
    escondePeso: lista.some((x) => x.id === "A-ALIMENTAR"),
  };
}

/** [E2] Caixa "Incluir estes cuidados na ficha". Não implementar na Entrega 1. */
export function cuidadosNaFicha(an: Anamnese, hoje: Date): string[] {
  return [];
}

/** Números de um texto, normalizados ("05" → "5"; "72,5" → "72.5"): a forma comparada pela guarda. */
export function numerosDoTexto(texto: string): string[] {
  return (texto.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => String(Number(n.replace(",", "."))));
}

/** Constantes com fonte que podem aparecer num texto do resumo (spec §6.5, "Guarda de números"). */
const CONSTANTES_GUARDA = ["7", "150", "3", "12", "30", "14", "9", "16", "6", "0", "10", "45", "65", "70", "15", "18", "192"];
/** Constantes e números das bases (a própria fonte: "Lei SP 16.724/2018", "ACSM 2015"). */
const NUMEROS_FIXOS = new Set<string>([...CONSTANTES_GUARDA, ...Object.values(ALERTA_DEF).flatMap((d) => numerosDoTexto(d.base))]);

/** Guarda de números: todo número que pode aparecer no resumo sai das respostas, das datas ou de constante com fonte. */
export function numerosPermitidos(an: Anamnese, hoje: Date): Set<string> {
  const out = new Set(NUMEROS_FIXOS);
  const add = (texto: string | null | undefined) => {
    if (texto) for (const n of numerosDoTexto(texto)) out.add(n);
  };
  const a = an.a;
  // O número da pergunta do PAR-Q ("PAR-Q 5", "na pergunta 5") vem da posição respondida.
  for (let i = 0; i < 7; i++) if (respostaDe(a, `parq.${i}`) !== null) add(String(i + 1));
  for (const p of PERGUNTAS) {
    add(respostaDe(a, p.id));
    const v = (a as Record<string, unknown>)[p.id];
    if (typeof v === "number") add(String(v));
  }
  const idade = idadeDe(a, hoje);
  if (idade !== null) add(String(idade));
  const datas = [an.answeredAt, an.receivedAt, an.declaredAt, an.consent?.at, an.consent?.responsavel?.at, an.termo?.at, an.conversei?.at, an.vistoEm, ...(an.overrides ?? []).map((o) => o.at)];
  for (const d of datas) if (d) add(fmtData(d));
  return out;
}
