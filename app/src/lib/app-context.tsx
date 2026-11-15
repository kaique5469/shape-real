"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LocalRepository } from "@/lib/data/local";
import { getSupabase, SupabaseRepository, supabaseConfigured } from "@/lib/data/supabase";
import { seedDemo } from "@/lib/data/demo";
import type { Repository } from "@/lib/data/repository";
import type { Profile, Role } from "@/lib/domain/types";
import { uid } from "@/lib/domain/ids";
import { identify, track } from "@/lib/analytics";

/**
 * Sessão do app. Dois tipos de sessão convivem:
 *  - "supabase": conta real (quando o projeto tem Supabase configurado);
 *  - "local": dados no aparelho — uso sem conta e modo demonstração.
 */
const LOCAL_SESSION_KEY = "sr:session";

interface AppContextValue {
  ready: boolean;
  repo: Repository;
  mode: "local" | "supabase";
  cloudAvailable: boolean;
  user: Profile | null;
  isDemo: boolean;
  setUser: (p: Profile) => void;
  updateProfile: (patch: Partial<Profile>) => Promise<Profile | null>;
  signOut: () => Promise<void>;
  startLocal: (name: string, role: Role) => Promise<Profile>;
  startDemo: (role: Role) => Promise<void>;
  signInPassword: (email: string, password: string) => Promise<void>;
  signUpPassword: (name: string, email: string, password: string, role: Role) => Promise<{ needsConfirmation: boolean }>;
  sendMagicLink: (email: string) => Promise<void>;
  accessToken: () => Promise<string | null>;
}

const Ctx = createContext<AppContextValue | null>(null);

const localRepo = new LocalRepository();
const cloudRepo = supabaseConfigured() ? new SupabaseRepository() : null;

function readLocalSession(): string | null {
  try {
    return localStorage.getItem(LOCAL_SESSION_KEY);
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"local" | "supabase">("local");
  const [user, setUserState] = useState<Profile | null>(null);
  const loadingRef = useRef(false);

  const repo: Repository = mode === "supabase" && cloudRepo ? cloudRepo : localRepo;

  const loadLocal = useCallback(async () => {
    const id = readLocalSession();
    if (!id) return false;
    const p = await localRepo.getProfile(id);
    if (!p) return false;
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
          const { data } = await sb.auth.getSession();
          if (data.session) {
            const p = await cloudRepo.getProfile(data.session.user.id).catch(() => null);
            if (p) {
              setMode("supabase");
              setUserState(p);
              identify(p.id);
            }
          } else {
            await loadLocal();
          }
          const sub = sb.auth.onAuthStateChange(async (event, session) => {
            if (event === "SIGNED_IN" && session) {
              const p = await cloudRepo.getProfile(session.user.id).catch(() => null);
              if (p) {
                try {
                  localStorage.removeItem(LOCAL_SESSION_KEY);
                } catch {}
                setMode("supabase");
                setUserState(p);
                identify(p.id);
              }
            }
            if (event === "SIGNED_OUT") {
              setUserState(null);
              setMode("local");
            }
          });
          unsub = () => sub.data.subscription.unsubscribe();
        } else {
          await loadLocal();
        }
      } finally {
        setReady(true);
      }
    })();
    return () => unsub?.();
  }, [loadLocal]);

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

  const signOut = useCallback(async () => {
    try {
      localStorage.removeItem(LOCAL_SESSION_KEY);
    } catch {}
    if (mode === "supabase" && cloudRepo) await getSupabase().auth.signOut();
    setUserState(null);
    setMode("local");
  }, [mode]);

  const startLocal = useCallback(async (name: string, role: Role) => {
    const p: Profile = { id: uid(), name: name.trim() || "Atleta", role, plan: role === "coach" ? "coach" : "free", onboarded: false, createdAt: new Date().toISOString() };
    await localRepo.saveProfile(p);
    localStorage.setItem(LOCAL_SESSION_KEY, p.id);
    setMode("local");
    setUserState(p);
    track("signup_completed", { mode: "local", role });
    return p;
  }, []);

  const startDemo = useCallback(async (role: Role) => {
    const id = await seedDemo(localRepo, role);
    localStorage.setItem(LOCAL_SESSION_KEY, id);
    const p = await localRepo.getProfile(id);
    setMode("local");
    setUserState(p);
    track("demo_started", { role });
  }, []);

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

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      repo,
      mode,
      cloudAvailable: Boolean(cloudRepo),
      user,
      isDemo: Boolean(user?.id.startsWith("demo-")),
      setUser,
      updateProfile,
      signOut,
      startLocal,
      startDemo,
      signInPassword,
      signUpPassword,
      sendMagicLink,
      accessToken,
    }),
    [ready, repo, mode, user, setUser, updateProfile, signOut, startLocal, startDemo, signInPassword, signUpPassword, sendMagicLink, accessToken],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp fora do AppProvider");
  return v;
}

export { localRepo };
