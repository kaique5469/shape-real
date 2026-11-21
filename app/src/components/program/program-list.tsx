"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookmarkPlus, CheckCircle2, Copy, Download, MessageCircle, MoreHorizontal, Pencil, Plus, Printer, Send, Trash2, Users } from "lucide-react";
import { fileSlug, shareNames } from "@/components/program/program-share";
import { ActionSheet, Alert, Badge, Button, Dialog, Empty, IconButton, LinkButton, Skeleton, cx, type SheetAction } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { useLoad, fmtDate } from "@/lib/hooks";
import { downloadText, programToCsv } from "@/lib/domain/export";
import { firstName, programValidity, waLink } from "@/lib/domain/format";
import { GOAL_LABEL } from "@/lib/domain/generator";
import { PLANS } from "@/lib/domain/plans";
import { cloneProgram, programToText } from "@/lib/domain/program-share";
import { getSystem } from "@/lib/domain/systems";
import { track } from "@/lib/analytics";
import type { Profile, Program, StudentSummary } from "@/lib/domain/types";

const SOURCE: Record<Program["source"], string> = { ia: "IA", manual: "Manual", modelo: "Gerada", personal: "Personal" };

interface Props {
  ownerId: string;
  basePath: string;
  newHref: string;
  canExport: boolean;
  /** Aluno dono das fichas, quando quem vê é o personal. */
  student?: Profile;
}

export function ProgramList({ ownerId, basePath, newHref, canExport, student }: Props) {
  const { repo, user, plan, isTester } = useApp();
  const router = useRouter();
  const { data, loading, error, reload } = useLoad(() => repo.listPrograms(ownerId), [ownerId, repo]);
  const [menu, setMenu] = useState<Program | null>(null);
  const [confirm, setConfirm] = useState<Program | null>(null);
  const [assign, setAssign] = useState<Program | null>(null);
  const [students, setStudents] = useState<StudentSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "done" | "error"; text: string; href?: string; hrefLabel?: string } | null>(null);

  if (loading) return <Skeleton className="h-48" />;
  if (error) return <Alert tone="error">{error}</Alert>;

  const programs = [...(data ?? [])].sort((a, b) => Number(b.active) - Number(a.active) || b.updatedAt.localeCompare(a.updatedAt));
  const isCoach = user?.role === "coach";
  const templates = isCoach && ownerId === user?.id; // lista de modelos do personal
  const limit = isCoach || isTester ? Infinity : PLANS[plan].maxPrograms;
  const atLimit = programs.length >= limit;

  const fail = (e: unknown, fallback: string) => setMsg({ tone: "error", text: e instanceof Error ? e.message : fallback });

  async function activate(p: Program) {
    setBusy(p.id);
    try {
      await repo.setActiveProgram(ownerId, p.id);
      setMsg({ tone: "done", text: `“${p.name}” agora é a ficha ativa.` });
      await reload();
    } catch (e) {
      fail(e, "Não foi possível ativar a ficha.");
    } finally {
      setBusy(null);
    }
  }

  async function duplicate(p: Program) {
    try {
      await repo.saveProgram(cloneProgram(p, { name: `${p.name} (cópia)`.slice(0, 60), active: false, createdBy: user!.id }));
      setMsg({ tone: "done", text: "Cópia criada. Ela começa inativa." });
      await reload();
    } catch (e) {
      fail(e, "Não foi possível duplicar a ficha.");
    }
  }

  async function saveAsTemplate(p: Program) {
    try {
      await repo.saveProgram(cloneProgram(p, { ownerId: user!.id, createdBy: user!.id, active: false, source: "personal", name: p.name }));
      track("program_copied", { to: "template" });
      setMsg({ tone: "done", text: "Salva nos seus modelos.", href: "/treinos", hrefLabel: "Ver modelos" });
    } catch (e) {
      fail(e, "Não foi possível salvar como modelo.");
    }
  }

  async function openAssign(p: Program) {
    setAssign(p);
    setStudents(null);
    try {
      setStudents((await repo.listStudents(user!.id)).filter((s) => s.profile.id !== ownerId));
    } catch (e) {
      setAssign(null);
      fail(e, "Não foi possível carregar seus alunos.");
    }
  }

  async function assignTo(target: StudentSummary) {
    if (!assign) return;
    setBusy(target.profile.id);
    try {
      const copy = await repo.saveProgram(cloneProgram(assign, { ownerId: target.profile.id, createdBy: user!.id, source: "personal", active: true }));
      await repo.setActiveProgram(target.profile.id, copy.id);
      track("program_copied", { to: "student" });
      setAssign(null);
      setMsg({
        tone: "done",
        text: `Ficha aplicada a ${firstName(target.profile.name)} e definida como ativa.`,
        href: `/alunos/${target.profile.id}/ficha/${copy.id}`,
        hrefLabel: "Abrir para ajustar e enviar",
      });
    } catch (e) {
      fail(e, "Não foi possível aplicar a ficha.");
    } finally {
      setBusy(null);
    }
  }

  async function copyText(p: Program) {
    try {
      await navigator.clipboard.writeText(programToText(p, shareNames(user, student)));
      track("program_shared", { via: "copy" });
      setMsg({ tone: "done", text: "Texto da ficha copiado. Cole onde quiser." });
    } catch {
      setMsg({ tone: "error", text: "Não consegui copiar automaticamente. Abra a ficha e use “Enviar pelo WhatsApp”." });
    }
  }

  function actionsFor(p: Program): SheetAction[] {
    const hasWork = p.days.some((d) => d.exercises.length);
    return [
      {
        label: "Enviar pelo WhatsApp",
        icon: <MessageCircle className="size-5" />,
        disabled: !hasWork,
        hint: !hasWork ? "Adicione exercícios antes de enviar." : undefined,
        onSelect: () => {
          track("program_shared", { via: "whatsapp" });
          window.open(waLink(programToText(p, shareNames(user, student)), student?.phone), "_blank", "noopener");
        },
      },
      { label: "Copiar texto da ficha", icon: <Copy className="size-5" />, disabled: !hasWork, onSelect: () => void copyText(p) },
      { label: "Imprimir ou salvar em PDF", icon: <Printer className="size-5" />, disabled: !hasWork, onSelect: () => router.push(`${basePath}/${p.id}?imprimir=1`) },
      ...(templates ? [{ label: "Aplicar a um aluno", icon: <Send className="size-5" />, hint: "Cria uma cópia na ficha do aluno.", onSelect: () => void openAssign(p) }] : []),
      ...(isCoach && student
        ? [
            { label: "Copiar para outro aluno", icon: <Users className="size-5" />, onSelect: () => void openAssign(p) },
            { label: "Salvar como modelo", icon: <BookmarkPlus className="size-5" />, hint: "Fica em Modelos para reutilizar.", onSelect: () => void saveAsTemplate(p) },
          ]
        : []),
      { label: "Duplicar", icon: <Copy className="size-5" />, disabled: atLimit, hint: atLimit ? "Limite de fichas do plano Grátis." : undefined, onSelect: () => void duplicate(p) },
      ...(canExport
        ? [
            {
              label: "Baixar planilha (Excel)",
              icon: <Download className="size-5" />,
              onSelect: () => {
                downloadText(`ficha-${fileSlug(p.name)}.csv`, programToCsv(p));
                track("export_downloaded", { kind: "program" });
              },
            },
          ]
        : []),
      { label: "Excluir ficha", icon: <Trash2 className="size-5" />, tone: "danger" as const, onSelect: () => setConfirm(p) },
    ];
  }

  if (!programs.length) {
    return (
      <Empty
        title={templates ? "Nenhum modelo ainda" : student ? `${firstName(student.name)} ainda não tem ficha` : "Nenhuma ficha ainda"}
        body={
          templates
            ? "Modelos são fichas suas para reutilizar. Monte uma vez e aplique a quantos alunos quiser, ajustando cargas e detalhes em cada um."
            : student
              ? "Gere uma base a partir do perfil do aluno e ajuste, ou monte exercício por exercício."
              : "Gere uma ficha no sistema que preferir (ABC, Upper/Lower, PPL, 5×5…) ou monte exercício por exercício."
        }
        action={
          <LinkButton href={newHref} icon={<Plus className="size-4" />}>
            {templates ? "Criar modelo" : "Criar ficha"}
          </LinkButton>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {msg ? (
        <Alert tone={msg.tone}>
          {msg.text}{" "}
          {msg.href ? (
            <Link href={msg.href} className="font-semibold underline">
              {msg.hrefLabel}
            </Link>
          ) : null}
        </Alert>
      ) : null}
      <ul className="space-y-3">
        {programs.map((p) => {
          const validity = programValidity(p.createdAt, p.durationWeeks);
          const count = p.days.reduce((n, d) => n + d.exercises.length, 0);
          return (
            <li key={p.id} className="rounded-[8px] border border-rule bg-paper">
              <Link href={`${basePath}/${p.id}`} className="block px-4 pb-2 pt-3.5">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 break-words text-lg font-bold leading-snug">{p.name}</span>
                  {p.active && !templates ? (
                    <Badge tone="done">
                      <CheckCircle2 className="size-3" /> Ativa
                    </Badge>
                  ) : null}
                  {!templates ? <Badge>{SOURCE[p.source]}</Badge> : null}
                </span>
                <span className="num mt-1 block text-sm text-steel">
                  {getSystem(p.system).name} · {GOAL_LABEL[p.goal]} · {p.days.length} {p.days.length === 1 ? "treino" : "treinos"} · {count} {count === 1 ? "exercício" : "exercícios"}
                </span>
                <span className="num block text-sm text-steel">
                  Atualizada em {fmtDate(p.updatedAt)}
                  {validity ? <span className={cx("font-semibold", validity.state === "expired" ? "text-plate-red-ink" : validity.state === "soon" ? "text-iron" : "")}> · {validity.label}</span> : null}
                </span>
              </Link>
              <div className="flex items-center gap-2 px-3 pb-3 pt-1">
                <LinkButton href={`${basePath}/${p.id}`} size="sm" variant="secondary" icon={<Pencil className="size-4" />}>
                  Abrir
                </LinkButton>
                {templates ? (
                  <Button size="sm" variant="secondary" icon={<Send className="size-4" />} onClick={() => void openAssign(p)}>
                    Aplicar a um aluno
                  </Button>
                ) : !p.active ? (
                  <Button size="sm" variant="secondary" loading={busy === p.id} onClick={() => void activate(p)}>
                    Ativar
                  </Button>
                ) : null}
                <IconButton label={`Mais opções de ${p.name}`} onClick={() => setMenu(p)} className="ml-auto">
                  <MoreHorizontal className="size-5" />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ul>

      {atLimit ? (
        <Alert tone="warn">
          Você atingiu {limit} fichas do plano Grátis.{" "}
          <Link href="/conta#planos" className="font-semibold underline" onClick={() => track("paywall_viewed", { where: "programs_limit" })}>
            Conheça o Pro
          </Link>{" "}
          para fichas ilimitadas.
        </Alert>
      ) : null}

      <ActionSheet open={Boolean(menu)} onClose={() => setMenu(null)} title={menu?.name ?? "Ficha"} actions={menu ? actionsFor(menu) : []} />

      <Dialog open={Boolean(assign)} onClose={() => setAssign(null)} title={templates ? "Aplicar a qual aluno?" : "Copiar para qual aluno?"}>
        {students === null ? (
          <Skeleton className="h-32" />
        ) : students.length ? (
          <>
            <p className="mb-3 text-sm text-steel">O aluno recebe uma cópia de “{assign?.name}” como ficha ativa. A ficha atual dele continua salva, inativa.</p>
            <ul className="ruled -mx-2">
              {students.map((s) => (
                <li key={s.profile.id}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void assignTo(s)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-[6px] px-2 py-2 text-left hover:bg-chalk disabled:opacity-50"
                  >
                    <span className="plate-type grid size-10 shrink-0 place-items-center rounded-full bg-iron text-chalk">{s.profile.name.slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{s.profile.name}</span>
                      <span className="block truncate text-sm text-steel">{s.activeProgramName ? `Ficha atual: ${s.activeProgramName}` : "Sem ficha"}</span>
                    </span>
                    {busy === s.profile.id ? <span className="text-sm text-steel">Aplicando…</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-[0.9375rem] text-steel">{student ? "Você ainda não tem outro aluno cadastrado." : "Você ainda não tem alunos cadastrados."}</p>
            <LinkButton href="/alunos" variant="secondary">
              Ir para alunos
            </LinkButton>
          </div>
        )}
      </Dialog>

      <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)} title="Excluir ficha?">
        <p className="text-[0.9375rem] text-steel">
          “{confirm?.name}” será apagada. Os treinos já registrados continuam no histórico.
          {confirm?.active && !templates ? " Como ela é a ficha ativa, ative outra em seguida." : ""}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setConfirm(null)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              try {
                if (confirm) await repo.deleteProgram(confirm.id);
                setMsg(null);
              } catch (e) {
                fail(e, "Não foi possível excluir a ficha.");
              }
              setConfirm(null);
              void reload();
            }}
          >
            Excluir
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
