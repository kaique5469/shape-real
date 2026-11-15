"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import type { Role } from "@/lib/domain/types";

/** Abre a demonstração completa (dados sintéticos no aparelho), sem cadastro. */
export function DemoButton({ role, children, ...rest }: { role: Role } & ButtonProps) {
  const { startDemo } = useApp();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      {...rest}
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await startDemo(role);
          router.push(role === "coach" ? "/alunos" : "/hoje");
        } finally {
          setLoading(false);
        }
      }}
    >
      {children}
    </Button>
  );
}
