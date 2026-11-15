/** Junta classes condicionalmente (seguro para Server e Client Components). */
export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
