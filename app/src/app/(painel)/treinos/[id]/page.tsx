"use client";

import Link from "next/link";
import { use } from "react";
import { ArrowLeft } from "lucide-react";
import { ProgramEditor } from "@/components/program/program-editor";

export default function EditarFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <>
      <Link href="/treinos" className="no-print mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-steel hover:text-iron">
        <ArrowLeft className="size-4" /> Fichas
      </Link>
      <ProgramEditor programId={id} />
    </>
  );
}
