import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fichaDelivery, fichaDeliveryLines, fichaEchoOf, type FichaAck, type FichaSendRecord } from "./delivery";
import { buildTreinosPacket, echoFor, parsePacket, type TreinosPacket } from "./transfer";
import type { Profile } from "./types";

/**
 * U2c com ajuste no celular do aluno (U5a/U3b): o eco prova a versão recebida, não o conteúdo em uso. Ficha ou dieta
 * ajustadas aqui (ou que não são do personal) ficam fora do eco, e o personal nunca lê "está com a ficha atual".
 */
const tz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Sao_Paulo";
});
afterAll(() => {
  if (tz === undefined) delete process.env.TZ;
  else process.env.TZ = tz;
});

const P = "2026-11-23T14:04:18.803Z"; // updatedAt da ficha no aparelho do personal
const D = "2026-11-23T14:04:18.806Z"; // updatedAt da dieta
const recebido = { programAt: P, dietAt: D };
const doPersonal = { createdBy: "c1" };
const ajustada = { createdBy: "c1", adjustedAt: "2026-11-23T14:05:00.000Z" };

describe("echoFor (eco só do que continua igual ao recebido)", () => {
  it("ficha e dieta do personal, sem ajuste: as duas versões", () => {
    expect(echoFor(recebido, "c1", doPersonal, doPersonal)).toEqual(recebido);
  });
  it("ficha ajustada aqui: só a dieta; dieta ajustada: só a ficha; as duas: nada", () => {
    expect(echoFor(recebido, "c1", ajustada, doPersonal)).toEqual({ dietAt: D });
    expect(echoFor(recebido, "c1", doPersonal, ajustada)).toEqual({ programAt: P });
    expect(echoFor(recebido, "c1", ajustada, ajustada)).toBeNull();
  });
  it("ficha ativa que não é do personal (própria ou de outro), sem ficha ativa ou sem dieta: o item sai", () => {
    expect(echoFor(recebido, "c1", { createdBy: "aluno" }, doPersonal)).toEqual({ dietAt: D });
    expect(echoFor(recebido, "c1", { createdBy: "c9" }, null)).toBeNull();
    expect(echoFor(recebido, "c1", undefined, doPersonal)).toEqual({ dietAt: D });
  });
  it("sem nada recebido: nada vai (o pacote não leva o bloco)", () => {
    expect(echoFor(undefined, "c1", doPersonal, doPersonal)).toBeNull();
    expect(echoFor({ dietAt: D }, "c1", doPersonal, doPersonal)).toEqual({ dietAt: D });
  });
});

describe("no aparelho do personal: ajuste nunca vira 'confirmado'", () => {
  const SINCE = "2026-11-01T12:00:00.000Z";
  const record: FichaSendRecord = { at: "2026-11-23T14:04:20.000Z", via: "copy", programAt: P, dietAt: D };
  const student: Profile = { id: "aluna-local", name: "Juliana", role: "athlete", plan: "free", onboarded: true, createdAt: "2026-11-01T00:00:00Z" };

  /** O caminho inteiro: eco do aluno → pacote → validação → eco que vale → registro → situação do envio. */
  function personalVe(ficha: ReturnType<typeof echoFor>) {
    const packet = parsePacket(JSON.parse(JSON.stringify(buildTreinosPacket({ student, coachId: "c1", studentRef: "s1", sessions: [], ficha, now: new Date("2026-11-23T18:40:00.000Z") })))) as TreinosPacket;
    const echo = fichaEchoOf(packet, "s1", "c1");
    const ack: FichaAck | null = echo ? { ...echo, treinosSentAt: packet.sentAt, registeredAt: "2026-11-23T19:00:00.000Z" } : null;
    return fichaDelivery({ current: { programAt: P, dietAt: D }, record, ack, trackingSince: SINCE });
  }

  it("sem ajuste: confirmado (como antes)", () => {
    const d = personalVe(echoFor(recebido, "c1", doPersonal, doPersonal));
    expect(d.program.kind).toBe("confirmado");
    expect(d.diet.kind).toBe("confirmado");
  });

  it("ficha e dieta ajustadas: nenhum item confirmado; fica 'enviado'", () => {
    const d = personalVe(echoFor(recebido, "c1", ajustada, ajustada));
    expect(d.program.kind).toBe("enviado");
    expect(d.diet.kind).toBe("enviado");
    expect(fichaDeliveryLines(d, "Juliana").page).toBe("Mensagem com a ficha atual copiada em 23/11 às 11:04.");
  });

  it("só a ficha ajustada: a dieta confirma, a ficha não; e a promessa da confirmação sai (já veio um treino)", () => {
    const d = personalVe(echoFor(recebido, "c1", ajustada, doPersonal));
    expect(d.program.kind).toBe("enviado");
    expect(d.diet.kind).toBe("confirmado");
    expect(d.headMissingFromEcho).toBe(true);
    const l = fichaDeliveryLines(d, "Juliana");
    expect(l.dialog).toEqual(["Mensagem com a ficha atual copiada em 23/11 às 11:04."]);
    expect(l.dialog.join(" ")).not.toMatch(/está com a ficha|A confirmação aparece/);
  });

  it("só a dieta ajustada: a ficha confirma, e a linha nunca diz 'a ficha e a dieta atuais'", () => {
    const d = personalVe(echoFor(recebido, "c1", doPersonal, ajustada));
    expect(d.program.kind).toBe("confirmado");
    expect(d.diet.kind).toBe("enviado");
    expect(fichaDeliveryLines(d, "Juliana").page).toBe("Juliana está com a ficha atual. Confirmado pelo treino recebido em 23/11.");
  });

  it("a promessa continua quando o treino foi registrado antes do envio", () => {
    const d = fichaDelivery({
      current: { programAt: P, dietAt: D },
      record,
      ack: { dietAt: D, treinosSentAt: "2026-11-22T10:00:00.000Z", registeredAt: "2026-11-22T11:00:00.000Z" },
      trackingSince: SINCE,
    });
    expect(d.headMissingFromEcho).toBeUndefined();
    expect(fichaDeliveryLines(d, "Juliana").dialog[1]).toBe("A confirmação aparece quando Juliana mandar o próximo treino.");
  });
});
