import type { PlanId } from "./types";

/**
 * Planos e limites. Preços são HIPÓTESES de lançamento (validar com teste de demanda):
 * referência de mercado — apps de personal no Brasil cobram ~R$ 50–150/mês do profissional;
 * apps de registro para o aluno ficam em ~R$ 15–30/mês.
 */
export interface PlanDef {
  id: PlanId;
  name: string;
  priceMonthly: number;
  priceYearly?: number;
  tagline: string;
  aiPerMonth: number;
  maxPrograms: number;
  maxPhotos: number;
  export: boolean;
  maxStudents: number;
  features: string[];
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: "free",
    name: "Grátis",
    priceMonthly: 0,
    tagline: "Para começar a registrar hoje.",
    aiPerMonth: 3,
    maxPrograms: 2,
    maxPhotos: 6,
    export: false,
    maxStudents: 0,
    features: ["Registro ilimitado de treinos e cargas", "2 fichas salvas", "3 gerações com IA por mês", "Gráficos de evolução", "6 fotos de evolução"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 19.9,
    priceYearly: 149,
    tagline: "Para quem treina sozinho e leva a sério.",
    aiPerMonth: 60,
    maxPrograms: 99,
    maxPhotos: 999,
    export: true,
    maxStudents: 0,
    features: ["Fichas ilimitadas", "IA para fichas e dieta (uso justo)", "Análise da dieta por IA", "Fotos ilimitadas com comparação", "Exportar planilha (Excel)"],
  },
  coach: {
    id: "coach",
    name: "Personal",
    priceMonthly: 59.9,
    priceYearly: 599,
    tagline: "Para personais que acompanham alunos.",
    aiPerMonth: 300,
    maxPrograms: 999,
    maxPhotos: 999,
    export: true,
    maxStudents: 20,
    features: ["Até 20 alunos (R$ 2,99/aluno extra)", "Envie ficha e dieta pelo app", "Painel de aderência dos alunos", "IA para montar fichas em segundos", "Alunos usam recursos Pro sem pagar"],
  },
};

export function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
