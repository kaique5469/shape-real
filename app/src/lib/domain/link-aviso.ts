import type { FichaPacket, TreinosPacket } from "./transfer";

/**
 * Rodada 3 (R3-17): o envio diz o que vai no link. PURO (só tipos importados). O link é compactado, sem senha
 * (share-link.ts): quem tiver o link consegue ler. Nenhum texto daqui chama o link de "seguro", "protegido" ou
 * "criptografado" (há teste). Nada daqui vai para a medição de uso.
 *
 * Usado no envio da ficha e da dieta (use-ficha-link.ts → transfer-share.tsx e, pela costura, o SendDietPanel) e no
 * envio dos treinos ao personal (send-to-coach.tsx).
 */

export type ItemDoLink = "ficha" | "dieta" | "treinos" | "medidas";
/** Dados do cadastro do aluno que viajam no link da ficha (STUDENT_FIELDS em transfer.ts) e que o aviso cita. */
export type DadoDoCadastro = "peso" | "altura" | "limitacoes";

export interface AvisoDoLinkInput {
  /** O que vai no link (a ordem do texto é sempre a mesma). */
  leva: readonly ItemDoLink[];
  /** Dados do cadastro que vão junto. Vazio: o aviso não cita dado de saúde. */
  saude: readonly DadoDoCadastro[];
  /** De quem são os dados: o nome do aluno (envio do personal); null = de quem está mandando ("seus treinos"). */
  aluno: string | null;
  /** Para quem mandar; sem ele, o próprio aluno. */
  para?: string;
}

const ORDEM_ITENS: readonly ItemDoLink[] = ["ficha", "dieta", "treinos", "medidas"];
const ORDEM_SAUDE: readonly DadoDoCadastro[] = ["peso", "altura", "limitacoes"];
const TERCEIRA: Record<ItemDoLink | DadoDoCadastro, string> = {
  ficha: "a ficha",
  dieta: "a dieta",
  treinos: "os treinos",
  medidas: "as medidas",
  peso: "o peso",
  altura: "a altura",
  limitacoes: "as limitações",
};
const SEGUNDA: Record<ItemDoLink | DadoDoCadastro, string> = {
  ficha: "sua ficha",
  dieta: "sua dieta",
  treinos: "seus treinos",
  medidas: "suas medidas",
  peso: "seu peso",
  altura: "sua altura",
  limitacoes: "suas limitações",
};

const primeiro = (nome: string) => nome.trim().split(/\s+/)[0] || nome.trim();

/** "a", "a e b", "a, b e c". */
function juntar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

/**
 * "O link leva a ficha e a dieta e o peso, a altura e as limitações de Marina. Quem tiver o link consegue ler: mande
 * só para Marina." Sem dado de saúde: "O link leva a ficha e a dieta de Marina. …". Do aluno para o personal: "O link
 * leva seus treinos e suas medidas. Quem tiver o link consegue ler: mande só para Rafael."
 */
export function avisoDoLink(input: AvisoDoLinkInput): string {
  const nomes = input.aluno === null ? SEGUNDA : TERCEIRA;
  const itens = ORDEM_ITENS.filter((i) => input.leva.includes(i)).map((i) => nomes[i]);
  const saude = ORDEM_SAUDE.filter((d) => input.saude.includes(d)).map((d) => nomes[d]);
  const para = primeiro(input.para ?? input.aluno ?? "");
  const fim = para ? `Quem tiver o link consegue ler: mande só para ${para}.` : "Quem tiver o link consegue ler: não encaminhe.";
  const partes = [juntar(itens), juntar(saude)].filter(Boolean);
  if (!partes.length) return fim;
  const de = input.aluno === null ? "" : ` de ${primeiro(input.aluno)}`;
  return `O link leva ${partes.join(" e ")}${de}. ${fim}`;
}

const tem = (v: unknown) => v !== undefined && v !== null && !(typeof v === "string" && !v.trim());

/** O que o link da ficha leva: a ficha e a dieta que foram, e peso, altura e limitações do cadastro, se foram. */
export function oQueVaiNaFicha(packet: Pick<FichaPacket, "program" | "diet" | "student">): Pick<AvisoDoLinkInput, "leva" | "saude"> {
  const leva: ItemDoLink[] = [];
  if (packet.program) leva.push("ficha");
  if (packet.diet) leva.push("dieta");
  const s = packet.student as Partial<Record<"weightKg" | "heightCm" | "limitations", unknown>>;
  const saude: DadoDoCadastro[] = [];
  if (tem(s.weightKg)) saude.push("peso");
  if (tem(s.heightCm)) saude.push("altura");
  if (tem(s.limitations)) saude.push("limitacoes");
  return { leva, saude };
}

/** O que o link de treinos leva: os treinos e, se houver, as medidas. O cadastro não vai nele. */
export function oQueVaiNosTreinos(packet: Pick<TreinosPacket, "sessions" | "metrics">): Pick<AvisoDoLinkInput, "leva" | "saude"> {
  const leva: ItemDoLink[] = [];
  if (packet.sessions.length) leva.push("treinos");
  if (packet.metrics.length) leva.push("medidas");
  return { leva, saude: [] };
}
