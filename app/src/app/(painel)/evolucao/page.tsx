"use client";

import Link from "next/link";
import { EvolutionView } from "@/components/views/evolution-view";
import { PageHeader } from "@/components/ui";
import { useApp } from "@/lib/app-context";

export default function EvolucaoPage() {
  const { user } = useApp();
  return (
    <>
      <PageHeader
        title="Evolução"
        sub="Força, corpo e constância ao longo do tempo."
        actions={
          <Link href="/historico" className="inline-flex h-11 items-center rounded-[6px] border border-rule-strong bg-paper px-4 font-semibold hover:border-iron">
            Histórico de treinos
          </Link>
        }
      />
      <EvolutionView userId={user!.id} editable />
    </>
  );
}
