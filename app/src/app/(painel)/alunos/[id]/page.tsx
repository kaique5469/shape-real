"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles, UserMinus } from "lucide-react";
import { ProgramList } from "@/components/program/program-list";
import { DietView } from "@/components/views/diet-view";
import { EvolutionView } from "@/components/views/evolution-view";
import { HistoryView } from "@/components/views/history-view";
import { Alert, Button, Dialog, LinkButton, Segmented, Skeleton } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { GOAL_LABEL, LEVEL_LABEL } from "@/lib/domain/generator";
import { useStudent } from "./student";

type Tab = "ficha" | "dieta" | "evolucao" | "historico";

export default function AlunoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, repo } = useApp();
  const router = useRouter();
  const { data: student, loading } = useStudent(id);
  const [tab, setTab] = useState<Tab>("ficha");
  const [confirm, setConfirm] = useState(false);

  if (loading) return <Skeleton className="h-96" />;
  if (!student) return <Alert tone="error">Aluno não encontrado ou não vinculado a você.</Alert>;

  return (
    <>
      <Link href="/alunos" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-steel hover:text-iron">
        <ArrowLeft className="size-4" /> Alunos
      </Link>
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <span className="plate-type grid size-14 place-items-center rounded-full bg-iron text-xl text-chalk">{student.name.slice(0, 1)}</span>
        <div className="min-w-0 flex-1">
          <h1 className="plate-type text-[1.9rem] leading-tight">{student.name}</h1>
          <p className="text-sm text-steel">
            {[student.goal && GOAL_LABEL[student.goal], student.level && LEVEL_LABEL[student.level], student.daysPerWeek && `${student.daysPerWeek}x/semana`, student.sessionMinutes && `${student.sessionMinutes} min`]
              .filter(Boolean)
              .join(" · ") || "Perfil ainda incompleto"}
          </p>
          {student.limitations ? <p className="mt-1 text-sm font-semibold text-plate-red-ink">Limitação: {student.limitations}</p> : null}
        </div>
        <Button variant="ghost" size="sm" icon={<UserMinus className="size-4" />} onClick={() => setConfirm(true)}>
          Desvincular
        </Button>
      </header>

      <Segmented
        label="Seção do aluno"
        value={tab}
        onChange={setTab}
        size="sm"
        className="mb-5"
        options={[
          { value: "ficha", label: "Ficha" },
          { value: "dieta", label: "Dieta" },
          { value: "evolucao", label: "Evolução" },
          { value: "historico", label: "Histórico" },
        ]}
      />

      {tab === "ficha" ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <LinkButton href={`/alunos/${id}/ficha/nova`} icon={<Sparkles className="size-4" />}>
              Nova ficha para {student.name.split(" ")[0]}
            </LinkButton>
          </div>
          <ProgramList ownerId={id} basePath={`/alunos/${id}/ficha`} newHref={`/alunos/${id}/ficha/nova`} canExport />
        </div>
      ) : null}
      {tab === "dieta" ? <DietView owner={student} mode="coach" /> : null}
      {tab === "evolucao" ? <EvolutionView userId={id} editable={false} /> : null}
      {tab === "historico" ? <HistoryView userId={id} editable={false} canExport /> : null}

      <Dialog open={confirm} onClose={() => setConfirm(false)} title={`Desvincular ${student.name.split(" ")[0]}?`}>
        <p className="text-[0.9375rem] text-steel">Você perde o acesso aos treinos, medidas e fotos. O aluno mantém a conta e os dados dele.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await repo.unlinkStudent(user!.id, id);
              router.replace("/alunos");
            }}
          >
            Desvincular
          </Button>
        </div>
      </Dialog>
    </>
  );
}
