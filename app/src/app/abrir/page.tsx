"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, ClipboardList, Salad } from "lucide-react";
import { Logo } from "@/components/brand";
import { Alert, Button, LinkButton, Skeleton } from "@/components/ui";
import { reportError, track } from "@/lib/analytics";
import { useApp, localRepo } from "@/lib/app-context";
import { firstName } from "@/lib/domain/format";
import { parsePacket, type FichaPacket } from "@/lib/domain/transfer";
import { packedFromHash, unpackData } from "@/lib/share-link";
import { importFicha } from "@/lib/transfer-client";

/**
 * Link que o personal manda ao aluno: abre a ficha e a dieta no celular do aluno, sem cadastro.
 * Os dados vêm depois do "#" do endereço (nunca passam pelo servidor).
 */
export default function AbrirPage() {
  const { ready, user, mode, returnTo, enterLocalProfile, actAs } = useApp();
  const router = useRouter();
  const [packet, setPacket] = useState<FichaPacket | null>(null);
  const [state, setState] = useState<"lendo" | "pronto" | "invalido">("lendo");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ownStudent, setOwnStudent] = useState(false);
  const read = useRef(false);

  useEffect(() => {
    if (read.current) return;
    read.current = true;
    const packed = packedFromHash(window.location.hash);
    // O conteúdo sai da barra de endereço assim que é lido.
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    if (!packed) return setState("invalido");
    unpackData(packed)
      .then((raw) => {
        const p = parsePacket(raw);
        if (p?.kind !== "ficha") return setState("invalido");
        setPacket(p);
        setState("pronto");
      })
      .catch(() => setState("invalido"));
  }, []);

  useEffect(() => {
    if (!packet || !user || user.role !== "coach") return;
    localRepo.getProfile(packet.student.ref).then((p) => setOwnStudent(Boolean(p && p.managedBy === user.id)));
  }, [packet, user]);

  async function save() {
    if (!packet) return;
    setBusy(true);
    setErr(null);
    try {
      const profile = await importFicha(packet, user && user.role === "athlete" && !returnTo ? user : null);
      enterLocalProfile(profile);
      track("ficha_link_opened", { had_profile: Boolean(user), has_program: Boolean(packet.program), has_diet: Boolean(packet.diet) });
      router.replace("/hoje?ficha=1");
    } catch (e) {
      reportError(e, "link:abrir-ficha");
      setErr(e instanceof Error ? e.message : "Não foi possível salvar neste aparelho. Tente de novo.");
      setBusy(false);
    }
  }

  const coachFirst = packet ? firstName(packet.coach.name) : "";
  const studentFirst = packet ? firstName(packet.student.name) : "";
  const days = packet?.program?.days.length ?? 0;
  const meals = packet?.diet?.meals.filter((m) => m.items.length).length ?? 0;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
      <Link href="/" aria-label="Shape Real">
        <Logo />
      </Link>
      <main className="flex flex-1 flex-col justify-center py-8">
        {state === "lendo" || !ready ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-40" />
          </div>
        ) : state === "invalido" || !packet ? (
          <div className="space-y-4">
            <h1 className="plate-type text-[1.9rem] leading-tight">Este link não abriu</h1>
            <p className="text-steel">Ele pode ter sido cortado ao copiar. Peça ao seu personal para enviar de novo pelo botão “Enviar para o celular do aluno”.</p>
            <LinkButton href="/" variant="secondary">
              Conhecer o Shape Real
            </LinkButton>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-steel">Enviado por {packet.coach.name}</p>
              <h1 className="plate-type mt-1 text-[2rem] leading-[1.05]">{studentFirst}, sua ficha chegou.</h1>
            </div>
            <ul className="ruled rounded-[var(--radius-ficha)] border border-rule bg-paper">
              {packet.program ? (
                <li className="flex items-start gap-3 px-4 py-3">
                  <ClipboardList className="mt-0.5 size-5 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-bold">{packet.program.name}</span>
                    <span className="block text-sm text-steel">
                      {days} {days === 1 ? "treino" : "treinos"}: {packet.program.days.map((d) => d.key).join(", ")}
                    </span>
                  </span>
                </li>
              ) : null}
              {packet.diet ? (
                <li className="flex items-start gap-3 px-4 py-3">
                  <Salad className="mt-0.5 size-5 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-bold">{packet.diet.name}</span>
                    <span className="block text-sm text-steel">
                      {meals} {meals === 1 ? "refeição" : "refeições"} · {Math.round(packet.diet.targets.kcal)} kcal por dia
                    </span>
                  </span>
                </li>
              ) : null}
              <li className="flex items-start gap-3 px-4 py-3">
                <CalendarCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
                <span className="min-w-0 text-sm">
                  <span className="block font-bold">Registre cada treino</span>
                  <span className="block text-steel">O app lembra a carga da última vez e avisa quando subir. No fim, você manda o treino para {coachFirst} com um toque.</span>
                </span>
              </li>
            </ul>

            {mode === "supabase" ? (
              <Alert tone="info">Com conta no Shape Real, a ficha enviada pelo seu personal já aparece no app. Este link é para quem usa sem conta.</Alert>
            ) : user?.role === "coach" && !returnTo ? (
              <div className="space-y-3">
                <Alert tone="warn">
                  Este aparelho está com o painel de personal. O link é para abrir no celular {ownStudent ? `de ${studentFirst}` : "do aluno"}: envie pelo WhatsApp.
                </Alert>
                {ownStudent ? (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={async () => {
                      await actAs(packet.student.ref);
                      router.replace("/hoje");
                    }}
                  >
                    Ver como {studentFirst} vê, neste aparelho
                  </Button>
                ) : null}
                <LinkButton href="/alunos" variant="ghost" className="w-full">
                  Voltar ao painel
                </LinkButton>
              </div>
            ) : (
              <div className="space-y-3">
                {err ? <Alert tone="error">{err}</Alert> : null}
                <Button size="lg" className="w-full" loading={busy} onClick={save}>
                  {user?.role === "athlete" && !returnTo ? "Atualizar minha ficha" : "Salvar no meu celular"}
                </Button>
                <p className="text-sm text-steel">
                  Sem cadastro: a ficha, a dieta e os seus treinos ficam guardados neste celular.{" "}
                  {user?.role === "athlete" && !returnTo ? "Seus treinos já registrados continuam aqui." : "Na próxima vez, é só abrir o app."}
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
