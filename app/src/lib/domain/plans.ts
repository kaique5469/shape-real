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
  /** Exportar planilha (CSV/Excel). */
  export: boolean;
  /** Cópia de segurança em 1 arquivo (JSON) para restaurar em outro celular: grátis em todos os planos, independente de `export`. */
  backup: boolean;
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
    backup: true,
    maxStudents: 0,
    features: ["Registro ilimitado de treinos e cargas", "2 fichas salvas", "Gráficos de evolução", "Cópia de segurança dos seus dados", "6 fotos de evolução"],
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
    backup: true,
    maxStudents: 0,
    features: ["Fichas ilimitadas, montadas por regras que você entende e edita", "Fotos ilimitadas com comparação", "Exportar planilha (Excel)", "Cópia de segurança dos seus dados"],
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
    backup: true,
    maxStudents: 20,
    features: ["Envie ficha e dieta pelo WhatsApp", "Painel de aderência dos alunos", "Ficha montada por regras que você entende e edita", "Alunos usam recursos Pro sem pagar", "Cópia de segurança dos seus dados"],
  },
};

/**
 * Limite de alunos do personal. No modo local (beta sem login, dados no aparelho) não há limite, como
 * prometem Conta e o FAQ: `max` é null e o painel nunca fica cheio. Alunos de exemplo nunca contam.
 */
export function studentQuota(students: readonly { profile: { sample?: boolean } }[], opts: { local: boolean; plan: PlanId }): { count: number; max: number | null; full: boolean } {
  const count = students.filter((s) => !s.profile.sample).length;
  if (opts.local) return { count, max: null, full: false };
  const max = PLANS[opts.plan].maxStudents || 3;
  return { count, max, full: count >= max };
}

export function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
