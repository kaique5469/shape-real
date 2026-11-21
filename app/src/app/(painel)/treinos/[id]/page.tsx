"use client";

import { use } from "react";
import { ProgramEditor } from "@/components/program/program-editor";
import { useApp } from "@/lib/app-context";

export default function EditarFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useApp();
  return <ProgramEditor programId={id} back={{ href: "/treinos", label: user?.role === "coach" ? "Modelos" : "Fichas" }} />;
}
