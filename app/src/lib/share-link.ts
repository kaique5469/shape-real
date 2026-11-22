/**
 * Dados que viajam dentro de um link (depois do "#", que o navegador nunca manda ao servidor).
 * JSON compactado (deflate) em base64 de URL. Sem suporte a compressão, vai sem compactar.
 *   "1." + deflate-raw    "0." + texto puro
 */
const MAX_BYTES = 600_000;

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const body = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) throw new Error("too_large");
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

const canCompress = () => typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

export async function packData(value: unknown): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(value));
  if (canCompress()) {
    try {
      return "1." + toBase64Url(await pipe(raw, new CompressionStream("deflate-raw")));
    } catch {
      /* segue sem compactar */
    }
  }
  return "0." + toBase64Url(raw);
}

export async function unpackData(text: string): Promise<unknown> {
  const clean = text.trim().replace(/\s+/g, "");
  const [kind, body] = [clean.slice(0, 2), clean.slice(2)];
  if (!body || (kind !== "1." && kind !== "0.")) throw new Error("invalid_link");
  const bytes = fromBase64Url(body);
  const raw = kind === "1." ? await pipe(bytes, new DecompressionStream("deflate-raw")) : bytes;
  if (raw.length > MAX_BYTES) throw new Error("too_large");
  return JSON.parse(new TextDecoder().decode(raw));
}

/** Lê o pacote do "#d=" do endereço atual. */
export function packedFromHash(hash: string): string | null {
  const m = /[#&]d=([A-Za-z0-9._-]+)/.exec(hash);
  return m?.[1] ?? null;
}
