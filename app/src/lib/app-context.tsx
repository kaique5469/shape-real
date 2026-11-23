"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LocalRepository } from "@/lib/data/local";
import { cachedSelf, clearCloudCache, getSupabase, SupabaseRepository, supabaseConfigured } from "@/lib/data/supabase";
import { seedDemo, seedTester } from "@/lib/data/demo";
import type { Repository } from "@/lib/data/repository";
import { registerCustomExercises } from "@/lib/domain/exercises";
import { SOLO_TESTER_ID } from "@/lib/domain/ficha-context";
import { registerCustomFoods } from "@/lib/domain/foods";
import type { PlanId, Profile, Role } from "@/lib/domain/types";
import { uid } from "@/lib/domain/ids";
import { identify, resetIdentity, setContext, track } from "@/lib/analytics";

/**
 * Sessão do app. Dois tipos de sessão convivem:
 *  - "supabase": conta real (quando o projeto tem Supabase configurado);
 *  - "local": dados no aparelho — uso sem conta, demonstração e modo teste.
 *
 * O personal pode "ver como aluno": a sessão do app troca para o perfil do aluno e guarda
 * para onde voltar (RETURN_KEY no modo local; ACTING_KEY na nuvem, onde a conta logada
 * continua sendo a do personal e o banco confere o vínculo a cada gravação).
 */
const LOCAL_SESSION_KEY = "sr:session";
const RETURN_KEY = "sr:return";
const TESTER_KEY = "sr:tester";
/** Conta na nuvem: o personal está vendo como um aluno (vale só para a aba aberta). */
const ACTING_KEY = "sr:acting";

interface AppContextValue {
  ready: boolean;
  repo: Repository;
  mode: "local" | "supabase";
  cloudAvailable: boolean;
  user: Profile | null;
  isDemo: boolean;
  /** Entrou pelo link de teste: tudo liberado, sem cadastro. */
  isTester: boolean;
  /** Plano efetivo (no teste tudo é liberado; aluno de personal usa recursos Pro). */
  plan: PlanId;
  /** Quando o personal está vendo como aluno: o perfil para o qual voltar. */
  returnTo: { id: string; name: string } | null;
  /** Muda quando exercícios/alimentos personalizados são recarregados. */
  customVersion: number;
  setUser: (p: Profile) => void;
  updateProfile: (patch: Partial<Profile>) => Promise<Profile | null>;
  signOut: () => Promise<void>;
  startLocal: (name: string, role: Role) => Promise<Profile>;
  startDemo: (role: Role) => Promise<void>;
  /** Entra direto no ambiente de teste do personal (cria na primeira vez). */
  startTester: () => Promise<Profile>;
  /** No teste: cria um perfil de aluno que treina sozinho e entra nele (com volta para o personal). */
  startSolo: () => Promise<Profile>;
  /** Abre no aparelho um perfil local já gravado (ex.: aluno que recebeu a ficha por link). */
  enterLocalProfile: (p: Profile) => void;
  /** Personal passa a ver o app como um aluno seu (e registra o treino por ele, na aula presencial). */
  actAs: (profileId: string) => Promise<void>;
  returnToOwner: () => Promise<Profile | null>;
  refreshCustom: () => Promise<void>;
  signInPassword: (email: string, password: string) => Promise<void>;
  signUpPassword: (name: string, email: string, password: string, role: Role) => Promise<{ needsConfirmation: boolean }>;
  sendMagicLink: (email: string) => Promise<void>;
  accessToken: () => Promise<string | null>;
}

const Ctx = createContext<AppContextValue | null>(null);

const localRepo = new LocalRepository();
const cloudRepo = supabaseConfigured() ? new SupabaseRepository() : null;

const ls = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* modo privado */
    }
  },
  del(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* modo privado */
    }
  },
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"local" | "supabase">("local");
  const [user, setUserState] = useState<Profile | null>(null);
  const [isTester, setIsTester] = useState(false);
  const [returnTo, setReturnTo] = useState<{ id: string; name: string } | null>(null);
  const [customVersion, setCustomVersion] = useState(0);
  const loadingRef = useRef(false);

  const repo: Repository = mode === "supabase" && cloudRepo ? cloudRepo : localRepo;

  const loadLocal = useCallback(async () => {
    setIsTester(ls.get(TESTER_KEY) === "1");
    const id = ls.get(LOCAL_SESSION_KEY);
    if (!id) return false;
    const p = await localRepo.getProfile(id);
    if (!p) return false;
    const backId = ls.get(RETURN_KEY);
    const back = backId && backId !== id ? await localRepo.getProfile(backId) : null;
    if (backId && !back) ls.del(RETURN_KEY);
    setReturnTo(back ? { id: back.id, name: back.name } : null);
    setMode("local");
    setUserState(p);
    return true;
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      try {
        if (cloudRepo) {
          const sb = getSupabase();
          const enterCloud = async (p: Profile) => {
            ls.del(LOCAL_SESSION_KEY);
            ls.del(RETURN_KEY);
            setMode("supabase");
            identify(p.id, { role: p.role });
            // O personal estava vendo como um aluno nesta aba: volta para onde estava.
            let acting: { owner: string; target: string } | null = null;
            try {
              acting = JSON.parse(sessionStorage.getItem(ACTING_KEY) ?? "null");
            } catch {}
            const target = acting?.owner === p.id ? await cloudRepo.getProfile(acting.target).catch(() => null) : null;
            if (target) {
              setReturnTo({ id: p.id, name: p.name });
              setUserState(target);
            } else {
              setReturnTo(null);
              setUserState(p);
            }
            // Treinos finalizados sem sinal sobem assim que houver rede.
            if (navigator.onLine) void cloudRepo.flushPending().catch(() => {});
          };
          const { data } = await sb.auth.getSession().catch(() => ({ data: { session: null } }));
          if (data.session) {
            // getProfile devolve a cópia guardada no aparelho quando não há rede.
            const p = (await cloudRepo.getProfile(data.session.user.id).catch(() => null)) ?? cachedSelf();
            if (p) await enterCloud(p);
          } else if (!navigator.onLine && cachedSelf()) {
            // Sem rede e com o acesso vencido: abre com quem estava logado; a sessão se renova quando a rede voltar.
            await enterCloud(cachedSelf()!);
          } else {
            await loadLocal();
          }
          const sub = sb.auth.onAuthStateChange(async (event, session) => {
            if (event === "SIGNED_IN" && session) {
              const p = await cloudRepo.getProfile(session.user.id).catch(() => null);
              if (p) await enterCloud(p);
            }
            if (event === "SIGNED_OUT") {
              clearCloudCache();
              try {
                sessionStorage.removeItem(ACTING_KEY);
              } catch {}
              setReturnTo(null);
              setUserState(null);
              setMode("local");
            }
          });
          const online = () => void cloudRepo.flushPending().catch(() => {});
          window.addEventListener("online", online);
          unsub = () => {
            sub.data.subscription.unsubscribe();
            window.removeEventListener("online", online);
          };
        } else {
          await loadLocal();
        }
      } finally {
        setReady(true);
      }
    })();
    return () => unsub?.();
  }, [loadLocal]);

  // Exercícios e alimentos personalizados do usuário (e do personal que o cadastrou).
  const userId = user?.id;
  const managedBy = user?.managedBy;
  const role = user?.role;
  const remoteCoachId = user?.remoteCoach?.id;
  const refreshCustom = useCallback(async () => {
    if (!userId) {
      registerCustomExercises([]);
      registerCustomFoods([]);
      setCustomVersion((v) => v + 1);
      return;
    }
    // O aluno também enxerga o que o personal dele criou (aparece na ficha e na dieta).
    const coachId = managedBy ?? remoteCoachId ?? (repo.mode === "supabase" && role !== "coach" ? ((await repo.getCoach(userId).catch(() => null))?.id ?? null) : null);
    const owners = coachId && coachId !== userId ? [userId, coachId] : [userId];
    const [exercises, foods] = await Promise.all([
      Promise.all(owners.map((o) => repo.listCustomExercises(o).catch(() => []))),
      Promise.all(owners.map((o) => repo.listCustomFoods(o).catch(() => []))),
    ]);
    registerCustomExercises(exercises.flat());
    registerCustomFoods(foods.flat());
    setCustomVersion((v) => v + 1);
  }, [repo, userId, managedBy, role, remoteCoachId]);

  useEffect(() => {
    void refreshCustom();
  }, [refreshCustom]);

  const setUser = useCallback((p: Profile) => setUserState(p), []);

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      if (!user) return null;
      const saved = await repo.saveProfile({ ...user, ...patch });
      setUserState(saved);
      return saved;
    },
    [repo, user],
  );

  const enterLocal = useCallback((p: Profile) => {
    ls.set(LOCAL_SESSION_KEY, p.id);
    setMode("local");
    setUserState(p);
  }, []);

  const signOut = useCallback(async () => {
    ls.del(LOCAL_SESSION_KEY);
    ls.del(RETURN_KEY);
    setReturnTo(null);
    if (mode === "supabase" && cloudRepo) {
      try {
        sessionStorage.removeItem(ACTING_KEY);
      } catch {}
      clearCloudCache();
      await getSupabase().auth.signOut();
      // Saída de uma conta identificada: os próximos eventos voltam a ser anônimos.
      resetIdentity();
    }
    setUserState(null);
    setMode("local");
  }, [mode]);

  const startLocal = useCallback(
    async (name: string, role: Role) => {
      const p: Profile = { id: uid(), name: name.trim() || "Atleta", role, plan: role === "coach" ? "coach" : "free", onboarded: false, createdAt: new Date().toISOString() };
      await localRepo.saveProfile(p);
      ls.del(RETURN_KEY);
      setReturnTo(null);
      enterLocal(p);
      track("signup_completed", { mode: "local", role });
      return p;
    },
    [enterLocal],
  );

  const startDemo = useCallback(
    async (role: Role) => {
      const id = await seedDemo(localRepo, role);
      const p = await localRepo.getProfile(id);
      ls.del(RETURN_KEY);
      setReturnTo(null);
      if (p) enterLocal(p);
      track("demo_started", { role });
    },
    [enterLocal],
  );

  const startTester = useCallback(async () => {
    const first = !(await localRepo.getProfile("teste-personal"));
    const id = await seedTester(localRepo);
    const p = (await localRepo.getProfile(id))!;
    ls.set(TESTER_KEY, "1");
    ls.del(RETURN_KEY);
    setIsTester(true);
    setReturnTo(null);
    enterLocal(p);
    if (first) track("tester_started", {});
    return p;
  }, [enterLocal]);

  const startSolo = useCallback(async () => {
    const owner = user;
    const soloId = SOLO_TESTER_ID;
    let p = await localRepo.getProfile(soloId);
    if (!p) {
      p = { id: soloId, name: owner && owner.name !== "Personal" ? owner.name : "Atleta", role: "athlete", plan: "free", onboarded: false, createdAt: new Date().toISOString() };
      await localRepo.saveProfile(p);
      track("tester_solo_started", {});
    }
    if (owner && owner.id !== soloId && !ls.get(RETURN_KEY)) {
      ls.set(RETURN_KEY, owner.id);
      setReturnTo({ id: owner.id, name: owner.name });
    }
    enterLocal(p);
    return p;
  }, [enterLocal, user]);

  const actAs = useCallback(
    async (profileId: string) => {
      if (!user) throw new Error("Entre na sua conta para continuar.");
      if (mode === "supabase" && cloudRepo) {
        // A conta logada continua sendo a do personal; o banco só entrega e aceita dados de alunos dele.
        const target = await cloudRepo.getProfile(profileId);
        if (!target || target.id === user.id) throw new Error("Aluno não encontrado.");
        try {
          sessionStorage.setItem(ACTING_KEY, JSON.stringify({ owner: user.id, target: target.id }));
        } catch {}
        setReturnTo({ id: user.id, name: user.name });
        setUserState(target);
        track("view_as_student", {});
        return;
      }
      const target = await localRepo.getProfile(profileId);
      const coach = target ? await localRepo.getCoach(target.id) : null;
      if (!target || (coach?.id !== user.id && target.managedBy !== user.id)) throw new Error("Aluno não encontrado.");
      if (!ls.get(RETURN_KEY)) ls.set(RETURN_KEY, user.id);
      setReturnTo((cur) => cur ?? { id: user.id, name: user.name });
      enterLocal(target);
      track("view_as_student", {});
    },
    [enterLocal, mode, user],
  );

  const returnToOwner = useCallback(async () => {
    if (mode === "supabase" && cloudRepo) {
      try {
        sessionStorage.removeItem(ACTING_KEY);
      } catch {}
      const back = returnTo ? ((await cloudRepo.getProfile(returnTo.id).catch(() => null)) ?? cachedSelf()) : null;
      setReturnTo(null);
      if (back) setUserState(back);
      return back;
    }
    const backId = ls.get(RETURN_KEY);
    const back = backId ? await localRepo.getProfile(backId) : null;
    ls.del(RETURN_KEY);
    setReturnTo(null);
    if (back) enterLocal(back);
    return back;
  }, [enterLocal, mode, returnTo]);

  const signInPassword = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) throw new Error(/invalid/i.test(error.message) ? "E-mail ou senha incorretos." : "Não foi possível entrar. Tente de novo.");
  }, []);

  const signUpPassword = useCallback(async (name: string, email: string, password: string, role: Role) => {
    const { data, error } = await getSupabase().auth.signUp({
      email,
      password,
      options: { data: { name, role }, emailRedirectTo: `${location.origin}/onboarding` },
    });
    if (error) {
      if (/registered|exists/i.test(error.message)) throw new Error("Este e-mail já tem conta. Entre com sua senha.");
      if (/password/i.test(error.message)) throw new Error("Senha fraca: use pelo menos 8 caracteres.");
      throw new Error("Não foi possível criar a conta. Tente de novo.");
    }
    track("signup_completed", { mode: "cloud", role });
    return { needsConfirmation: !data.session };
  }, []);

  const sendMagicLink = useCallback(async (email: string) => {
    const { error } = await getSupabase().auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/hoje` } });
    if (error) throw new Error("Não foi possível enviar o link. Confira o e-mail.");
  }, []);

  const accessToken = useCallback(async () => {
    if (mode !== "supabase" || !cloudRepo) return null;
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  }, [mode]);

  // Contexto que acompanha todos os eventos: em que modo o app está e quem está usando (sem identificar a pessoa).
  const demo = Boolean(user?.id.startsWith("demo-"));
  const viewingAsStudent = Boolean(returnTo);
  useEffect(() => {
    if (!ready) return;
    setContext({
      app_mode: !role ? "visitante" : mode === "supabase" ? "conta" : isTester ? "teste" : demo ? "demo" : "local",
      app_role: role ?? null,
      viewing_as_student: viewingAsStudent,
    });
  }, [ready, role, mode, isTester, demo, viewingAsStudent]);

  // Beta: sem conta na nuvem, tudo fica liberado para personal e aluno.
  const plan: PlanId = !user
    ? "free"
    : mode === "local"
      ? user.role === "coach"
        ? "coach"
        : "pro"
      : user.plan !== "free"
        ? user.plan
        : user.managedBy || (returnTo && mode === "supabase")
          ? // Aluno acompanhado por personal usa os recursos Pro; o mesmo vale enquanto o personal vê como aluno.
            "pro"
          : "free";

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      repo,
      mode,
      cloudAvailable: Boolean(cloudRepo),
      user,
      isDemo: Boolean(user?.id.startsWith("demo-")),
      isTester: isTester && mode === "local",
      plan,
      returnTo,
      customVersion,
      setUser,
      updateProfile,
      signOut,
      startLocal,
      startDemo,
      startTester,
      startSolo,
      enterLocalProfile: enterLocal,
      actAs,
      returnToOwner,
      refreshCustom,
      signInPassword,
      signUpPassword,
      sendMagicLink,
      accessToken,
    }),
    [ready, repo, mode, user, isTester, plan, returnTo, customVersion, setUser, updateProfile, signOut, startLocal, startDemo, startTester, startSolo, enterLocal, actAs, returnToOwner, refreshCustom, signInPassword, signUpPassword, sendMagicLink, accessToken],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp fora do AppProvider");
  return v;
}

export { localRepo };
