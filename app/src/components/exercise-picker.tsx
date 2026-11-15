"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { GROUP_LABEL, searchExercises } from "@/lib/domain/exercises";
import type { Exercise, MuscleGroup } from "@/lib/domain/types";
import { Dialog, Input, cx } from "./ui";

export function ExercisePicker({ open, onClose, onPick, title = "Adicionar exercício" }: { open: boolean; onClose: () => void; onPick: (e: Exercise) => void; title?: string }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<MuscleGroup | null>(null);
  const list = useMemo(() => searchExercises(q, group), [q, group]);
  return (
    <Dialog open={open} onClose={onClose} title={title} wide>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel" aria-hidden />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: supino, remada, agachamento…" className="pl-9" aria-label="Buscar exercício" />
      </div>
      <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {[null, ...(Object.keys(GROUP_LABEL) as MuscleGroup[])].map((g) => (
          <button
            key={g ?? "all"}
            type="button"
            onClick={() => setGroup(g)}
            aria-pressed={group === g}
            className={cx("shrink-0 rounded-full border px-3 py-1 text-sm font-semibold", group === g ? "border-iron bg-iron text-chalk" : "border-rule-strong bg-paper")}
          >
            {g ? GROUP_LABEL[g] : "Todos"}
          </button>
        ))}
      </div>
      <ul className="ruled mt-3 rounded-[8px] border border-rule">
        {list.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => {
                onPick(e);
                onClose();
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-chalk"
            >
              <span className="font-semibold">{e.name}</span>
              <span className="shrink-0 text-xs text-steel">{GROUP_LABEL[e.group]}</span>
            </button>
          </li>
        ))}
        {!list.length ? <li className="px-3 py-4 text-sm text-steel">Nenhum exercício encontrado.</li> : null}
      </ul>
    </Dialog>
  );
}
