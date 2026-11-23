import { describe, expect, it } from "vitest";
import {
  calendarDaysSince,
  contactMessage,
  contactReason,
  daysWithoutNews,
  displayNames,
  expiringLabel,
  inactiveThreshold,
  isQuiet,
  namesList,
  newsLabel,
  reasonLabel,
  sessionsThisWeek,
  splitQueue,
  studentBand,
  weeklyGoal,
} from "./attention";
import { fmtDayMonth, programValidity, waLink } from "./format";

// Datas no fuso do aparelho (os testes não dependem do TZ da máquina). 22/11/2026 é um domingo.
const at = (day: number, hour = 10, month = 11) => new Date(2026, month - 1, day, hour);
const iso = (day: number, hour = 10, month = 11) => at(day, hour, month).toISOString();
const NOW = at(22, 15);

describe("inactiveThreshold", () => {
  it("2x por semana: 7 dias", () => expect(inactiveThreshold(2)).toBe(7));
  it("3x por semana: 5 dias", () => expect(inactiveThreshold(3)).toBe(5));
  it("5x por semana: nunca abaixo de 5", () => expect(inactiveThreshold(5)).toBe(5));
  it("1x por semana: 14 dias", () => expect(inactiveThreshold(1)).toBe(14));
  it("sem meta: 5", () => {
    expect(inactiveThreshold(undefined)).toBe(5);
    expect(inactiveThreshold(null)).toBe(5);
    expect(inactiveThreshold(0)).toBe(5);
    expect(inactiveThreshold(Number.NaN)).toBe(5);
    expect(inactiveThreshold(-2)).toBe(5);
  });
});

describe("calendarDaysSince", () => {
  it("conta dias de calendário, não blocos de 24 h", () => {
    // Ontem às 23h, visto hoje às 8h: 1 dia (são só 9 horas).
    expect(calendarDaysSince(iso(21, 23), at(22, 8))).toBe(1);
    expect(calendarDaysSince(iso(22, 7), at(22, 23))).toBe(0);
    expect(calendarDaysSince(iso(13, 19), NOW)).toBe(9);
  });
  it("aceita data sem hora e nunca fica negativo", () => {
    expect(calendarDaysSince("2026-11-20", NOW)).toBe(2);
    expect(calendarDaysSince(iso(25), NOW)).toBe(0);
  });
  it("atravessa a virada do mês", () => expect(calendarDaysSince(iso(28, 10, 10), at(2, 10, 11))).toBe(5));
});

describe("isQuiet (aluno parado)", () => {
  const linked = iso(1);
  it("meta 2x: 6 dias sem notícias não é parado; 7 dias é", () => {
    expect(isQuiet({ lastSessionAt: iso(16), linkedAt: linked }, 2, NOW)).toBe(false);
    expect(isQuiet({ lastSessionAt: iso(15), linkedAt: linked }, 2, NOW)).toBe(true);
  });
  it("meta 3x e 5x: parado com 5 dias", () => {
    expect(isQuiet({ lastSessionAt: iso(18), linkedAt: linked }, 3, NOW)).toBe(false);
    expect(isQuiet({ lastSessionAt: iso(17), linkedAt: linked }, 3, NOW)).toBe(true);
    expect(isQuiet({ lastSessionAt: iso(17), linkedAt: linked }, 5, NOW)).toBe(true);
    expect(isQuiet({ lastSessionAt: iso(18), linkedAt: linked }, 5, NOW)).toBe(false);
  });
  it("sem meta: parado com 5 dias", () => {
    expect(isQuiet({ lastSessionAt: iso(17), linkedAt: linked }, undefined, NOW)).toBe(true);
    expect(isQuiet({ lastSessionAt: iso(18), linkedAt: linked }, undefined, NOW)).toBe(false);
  });
  it("sem nenhum envio: conta desde o vínculo", () => {
    expect(daysWithoutNews({ lastSessionAt: null, linkedAt: iso(20) }, NOW)).toBe(2);
    expect(isQuiet({ lastSessionAt: null, linkedAt: iso(20) }, 3, NOW)).toBe(false);
    expect(isQuiet({ lastSessionAt: null, linkedAt: iso(10) }, 3, NOW)).toBe(true);
    expect(isQuiet({ lastSessionAt: null, linkedAt: iso(16) }, 2, NOW)).toBe(false);
    expect(isQuiet({ lastSessionAt: null, linkedAt: iso(15) }, 2, NOW)).toBe(true);
  });
});

describe("weeklyGoal", () => {
  it("a meta da ficha ativa vem antes da do perfil", () => {
    expect(weeklyGoal(4, 3)).toBe(4);
    expect(weeklyGoal(undefined, 3)).toBe(3);
    expect(weeklyGoal(0, 2)).toBe(2);
  });
  it("sem meta: null", () => {
    expect(weeklyGoal(undefined, undefined)).toBeNull();
    expect(weeklyGoal(null, 0)).toBeNull();
  });
});

describe("sessionsThisWeek (segunda a domingo, como no Hoje do aluno)", () => {
  it("conta de segunda 00h até domingo, ignorando a semana anterior", () => {
    const sessions = [iso(16, 6), iso(18, 22), iso(22, 9), iso(15, 20), iso(9)];
    expect(sessionsThisWeek(sessions, NOW)).toBe(3);
  });
  it("na segunda-feira a conta recomeça (diferente dos últimos 7 dias)", () => {
    const monday = at(23, 8);
    expect(sessionsThisWeek([iso(20), iso(21), iso(22)], monday)).toBe(0);
    expect(sessionsThisWeek([iso(20), iso(23, 7)], monday)).toBe(1);
  });
  it("treino às 22h fica no dia (e na semana) do aparelho", () => {
    expect(sessionsThisWeek([iso(15, 22)], at(16, 9))).toBe(0);
  });
});

describe("newsLabel", () => {
  it("modo local: sem notícias, com a data do último treino recebido", () => {
    expect(newsLabel(iso(13, 19), "local", NOW)).toBe("Sem notícias há 9 dias · último treino recebido em 13/11");
    expect(newsLabel(null, "local", NOW)).toBe("Nada recebido ainda");
  });
  it("'sem treinar' só na nuvem", () => {
    expect(newsLabel(iso(13, 19), "supabase", NOW)).toBe("Sem treinar há 9 dias · último treino em 13/11");
    expect(newsLabel(null, "supabase", NOW)).toBe("Nenhum treino ainda");
    expect(newsLabel(iso(13), "local", NOW).toLowerCase()).not.toContain("sem treinar");
    expect(newsLabel(null, "local", NOW).toLowerCase()).not.toContain("sem treinar");
  });
  it("singular em 1 dia", () => expect(newsLabel(iso(21), "local", NOW)).toBe("Sem notícias há 1 dia · último treino recebido em 21/11"));
});

describe("fmtDayMonth", () => {
  it("dd/mm com zero à esquerda", () => {
    expect(fmtDayMonth(iso(3, 10, 2))).toBe("03/02");
    expect(fmtDayMonth("2026-11-13")).toBe("13/11");
  });
});

describe("contactReason", () => {
  const soon = programValidity(iso(28, 10, 10), 4, NOW); // 28/10 + 4 semanas: vence em 3 dias
  it("sem notícias tem prioridade sobre ficha vencendo", () => {
    expect(soon?.state).toBe("soon");
    expect(contactReason(true, soon)).toBe("sem_noticias");
    expect(contactReason(false, soon)).toBe("ficha_vencendo");
  });
  it("ficha em dia, vencida ou ausente não pede mensagem", () => {
    expect(contactReason(false, { state: "ok" })).toBeNull();
    expect(contactReason(false, { state: "expired" })).toBeNull();
    expect(contactReason(false, null)).toBeNull();
  });
});

describe("contactMessage", () => {
  it("sem notícias: mensagem fixa com o primeiro nome", () => {
    expect(contactMessage("sem_noticias", "Ana Paula Souza")).toBe(
      "Oi, Ana! Tudo certo por aí? Faz uns dias que não chega treino seu. Se treinou, me manda pelo app; se travou, me conta que a gente ajusta.",
    );
  });
  it("ficha vencendo: dias que faltam, com hoje e amanhã por extenso", () => {
    expect(contactMessage("ficha_vencendo", "Bruno Lima", 4)).toBe("Oi, Bruno! Sua ficha vence em 4 dias. Já estou preparando a próxima. Quer mudar alguma coisa?");
    expect(contactMessage("ficha_vencendo", "Bruno", 1)).toBe("Oi, Bruno! Sua ficha vence amanhã. Já estou preparando a próxima. Quer mudar alguma coisa?");
    expect(contactMessage("ficha_vencendo", "Bruno", 0)).toBe("Oi, Bruno! Sua ficha vence hoje. Já estou preparando a próxima. Quer mudar alguma coisa?");
  });
  it("sem dados de saúde (peso, medidas, kg, %)", () => {
    for (const m of [contactMessage("sem_noticias", "Carla"), contactMessage("ficha_vencendo", "Carla", 3)]) {
      expect(m).not.toMatch(/kg|peso|medida|gordura|%|cm\b/i);
    }
  });
  it("abre no wa.me com o nome certo", () => {
    const href = waLink(contactMessage("sem_noticias", "Diego Alves"), "11912345678");
    expect(href.startsWith("https://wa.me/5511912345678?text=")).toBe(true);
    expect(decodeURIComponent(href.split("text=")[1]!)).toContain("Oi, Diego!");
  });
  it("rótulo da ficha vencendo no alerta", () => {
    expect(expiringLabel(3)).toBe("Ficha vence em 3 dias");
    expect(expiringLabel(1)).toBe("Ficha vence amanhã");
    expect(expiringLabel(0)).toBe("Ficha vence hoje");
  });
});

describe("splitQueue", () => {
  it("5 alunos: 3 nomes e mais 2", () => {
    const { shown, rest } = splitQueue(["a", "b", "c", "d", "e"]);
    expect(shown).toEqual(["a", "b", "c"]);
    expect(rest).toBe(2);
  });
  it("até 3: todos, sem resto", () => {
    expect(splitQueue(["a", "b"])).toEqual({ shown: ["a", "b"], rest: 0 });
    expect(splitQueue([])).toEqual({ shown: [], rest: 0 });
  });
});

describe("namesList", () => {
  it("até 3 nomes e 'e mais N'", () => {
    expect(namesList(["Ana"])).toBe("Ana");
    expect(namesList(["Ana", "Bruno"])).toBe("Ana e Bruno");
    expect(namesList(["Ana", "Bruno", "Carla"])).toBe("Ana, Bruno e Carla");
    expect(namesList(["Ana", "Bruno", "Carla"], 2)).toBe("Ana, Bruno, Carla e mais 2");
    expect(namesList(["Ana", "Bruno", "Carla"], 1)).toBe("Ana, Bruno, Carla e mais 1");
  });
  it("com 5 na fila: 3 nomes e mais 2", () => {
    const { shown, rest } = splitQueue(["Ana Souza", "Bruno Lima", "Carla Dias", "Diego Alves", "Eva Reis"]);
    expect(namesList(displayNames(shown), rest)).toBe("Ana, Bruno, Carla e mais 2");
  });
  it("vazio", () => expect(namesList([])).toBe(""));
});

describe("reasonLabel", () => {
  it("sem notícias: o mesmo texto da linha do aluno, honesto no modo local", () => {
    expect(reasonLabel("sem_noticias", { lastSessionAt: iso(13, 19) }, "local", NOW)).toBe("Sem notícias há 9 dias · último treino recebido em 13/11");
    expect(reasonLabel("sem_noticias", { lastSessionAt: null }, "local", NOW)).toBe("Nada recebido ainda");
    expect(reasonLabel("sem_noticias", { lastSessionAt: iso(13, 19) }, "supabase", NOW)).toBe("Sem treinar há 9 dias · último treino em 13/11");
  });
  it("ficha vencendo: dias que faltam", () => {
    expect(reasonLabel("ficha_vencendo", { lastSessionAt: iso(21), daysLeft: 3 }, "local", NOW)).toBe("Ficha vence em 3 dias");
  });
});

describe("displayNames", () => {
  it("primeiro nome; nome inteiro quando dois primeiros nomes coincidem", () => {
    expect(displayNames(["Ana Paula", "Bruno Lima", "ana Souza"])).toEqual(["Ana Paula", "Bruno", "ana Souza"]);
    expect(displayNames(["  Carla  Dias "])).toEqual(["Carla"]);
  });
});

describe("studentBand", () => {
  it("faixas da medição", () => {
    expect(studentBand(0)).toBeNull();
    expect(studentBand(1)).toBe("1-3");
    expect(studentBand(3)).toBe("1-3");
    expect(studentBand(4)).toBe("4-10");
    expect(studentBand(10)).toBe("4-10");
    expect(studentBand(11)).toBe("11+");
  });
});
