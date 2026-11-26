import { describe, expect, it } from "vitest";
import {
  ATTENTION_ORDER,
  LIST_TOOLS_MIN,
  calendarDaysSince,
  contactMessage,
  contactReason,
  daysWithoutNews,
  displayNames,
  expiringLabel,
  fichaStateText,
  inactiveThreshold,
  isQuiet,
  matchesQuery,
  namesList,
  newsLabel,
  newsSince,
  pendingText,
  programLine,
  reasonLabel,
  resultsStatus,
  sessionsThisWeek,
  splitQueue,
  studentBand,
  topReason,
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

// ───────────────────────── U4a: correções com dado confiável ─────────────────────────

describe("contactReason sem ficha (U4a)", () => {
  const soon = programValidity(iso(28, 10, 10), 4, NOW);
  it("aluno sem ficha nunca vira 'Chamar', nem parado nem com validade", () => {
    expect(contactReason(true, null, false)).toBeNull();
    expect(contactReason(false, null, false)).toBeNull();
    expect(contactReason(true, soon, false)).toBeNull();
  });
  it("com ficha (ou sem informar), o resultado de antes", () => {
    expect(contactReason(true, null, true)).toBe("sem_noticias");
    expect(contactReason(false, soon, true)).toBe("ficha_vencendo");
    expect(contactReason(true, null)).toBe("sem_noticias");
  });
});

describe("newsSince e programCreatedAt (U4a)", () => {
  // Vínculo há 20 dias, nenhum treino recebido, meta 3x (limiar 5 dias).
  const linked = iso(2);
  it("ficha criada há 2 dias: conta da ficha, não está parado", () => {
    const s = { lastSessionAt: null, linkedAt: linked, programCreatedAt: iso(20) };
    expect(newsSince(s)).toBe(iso(20));
    expect(daysWithoutNews(s, NOW)).toBe(2);
    expect(isQuiet(s, 3, NOW)).toBe(false);
  });
  it("ficha criada há 5 dias: parado", () => {
    const s = { lastSessionAt: null, linkedAt: linked, programCreatedAt: iso(17) };
    expect(daysWithoutNews(s, NOW)).toBe(5);
    expect(isQuiet(s, 3, NOW)).toBe(true);
  });
  it("com treino recebido, a data da ficha é ignorada", () => {
    const s = { lastSessionAt: iso(10), linkedAt: linked, programCreatedAt: iso(21) };
    expect(newsSince(s)).toBe(iso(10));
    expect(daysWithoutNews(s, NOW)).toBe(12);
    expect(isQuiet(s, 3, NOW)).toBe(true);
  });
  it("ficha mais antiga que o vínculo: conta do vínculo", () => {
    const s = { lastSessionAt: null, linkedAt: iso(20), programCreatedAt: iso(1) };
    expect(newsSince(s)).toBe(iso(20));
    expect(daysWithoutNews(s, NOW)).toBe(2);
  });
  it("sem programCreatedAt (ausente, null ou inválida): o resultado de hoje, desde o vínculo", () => {
    for (const programCreatedAt of [undefined, null, "", "versão 2"]) {
      const s = { lastSessionAt: null, linkedAt: linked, programCreatedAt };
      expect(newsSince(s)).toBe(linked);
      expect(daysWithoutNews(s, NOW)).toBe(daysWithoutNews({ lastSessionAt: null, linkedAt: linked }, NOW));
      expect(isQuiet(s, 3, NOW)).toBe(true);
    }
  });
});

describe("topReason: pendência do cartão (U4a)", () => {
  const soon = { state: "soon" as const };
  const expired = { state: "expired" as const };
  it("ordem: sem ficha → sem notícias → vencida → vencendo", () => {
    expect(ATTENTION_ORDER).toEqual(["sem_ficha", "sem_noticias", "ficha_vencida", "ficha_vencendo"]);
    expect(topReason({ hasProgram: false, quiet: true, validity: null })).toBe("sem_ficha");
    expect(topReason({ hasProgram: true, quiet: true, validity: expired })).toBe("sem_noticias");
    expect(topReason({ hasProgram: true, quiet: false, validity: expired })).toBe("ficha_vencida");
    expect(topReason({ hasProgram: true, quiet: false, validity: soon })).toBe("ficha_vencendo");
  });
  it("em dia ou sem validade: sem pendência", () => {
    expect(topReason({ hasProgram: true, quiet: false, validity: { state: "ok" } })).toBeNull();
    expect(topReason({ hasProgram: true, quiet: false, validity: null })).toBeNull();
  });
  it("Henrique (sem ficha, vínculo há 30 dias, nada recebido, meta 2x): pendência 'sem ficha', sem 'Chamar'", () => {
    const quiet = isQuiet({ lastSessionAt: null, linkedAt: iso(23, 10, 10) }, 2, NOW);
    expect(quiet).toBe(true);
    expect(topReason({ hasProgram: false, quiet, validity: null })).toBe("sem_ficha");
    expect(contactReason(quiet, null, false)).toBeNull();
  });
  it("ficha nova não dispara alarme: vínculo há 20 dias, sem treino, ficha de hoje, meta 3x", () => {
    const quiet = isQuiet({ lastSessionAt: null, linkedAt: iso(2), programCreatedAt: iso(22, 9) }, 3, NOW);
    expect(quiet).toBe(false);
    expect(topReason({ hasProgram: true, quiet, validity: null })).toBeNull();
    expect(contactReason(quiet, null, true)).toBeNull();
  });
});

describe("textos de pendência (U4a)", () => {
  it("newsLabel com os dias sem notícias, quando nada chegou", () => {
    expect(newsLabel(null, "local", NOW, { daysWithoutNews: 6 })).toBe("Sem notícias há 6 dias · nada recebido ainda");
    expect(newsLabel(null, "supabase", NOW, { daysWithoutNews: 6 })).toBe("Sem treinar há 6 dias · nenhum treino ainda");
    expect(newsLabel(null, "local", NOW, { daysWithoutNews: 1 })).toBe("Sem notícias há 1 dia · nada recebido ainda");
  });
  it("newsLabel sem opts (ou com 0 dias) é o texto de sempre; com treino recebido, os dias vêm do treino", () => {
    expect(newsLabel(null, "local", NOW, { daysWithoutNews: 0 })).toBe("Nada recebido ainda");
    expect(newsLabel(null, "local", NOW, {})).toBe("Nada recebido ainda");
    expect(newsLabel(iso(13, 19), "local", NOW, { daysWithoutNews: 3 })).toBe("Sem notícias há 9 dias · último treino recebido em 13/11");
  });
  it("reasonLabel da fila usa o mesmo texto do cartão", () => {
    expect(reasonLabel("sem_noticias", { lastSessionAt: null, daysWithoutNews: 6 }, "local", NOW)).toBe("Sem notícias há 6 dias · nada recebido ainda");
  });
  it("pendingText por motivo", () => {
    const vencida = programValidity(iso(13, 10, 10), 5, NOW)!; // 13/10 + 5 semanas = 17/11: vencida há 5 dias
    const vence = programValidity(iso(29, 14, 10), 4, NOW)!; // 29/10 14h + 4 semanas = 26/11 14h: vence em 4 dias
    expect(vencida.state).toBe("expired");
    expect(vence.state).toBe("soon");
    expect(pendingText("sem_ficha", { lastSessionAt: null }, "local", NOW)).toBe("Sem ficha ativa");
    expect(pendingText("sem_noticias", { lastSessionAt: iso(10, 19) }, "local", NOW)).toBe("Sem notícias há 12 dias · último treino recebido em 10/11");
    expect(pendingText("sem_noticias", { lastSessionAt: null, daysWithoutNews: 6 }, "local", NOW)).toBe("Sem notícias há 6 dias · nada recebido ainda");
    expect(pendingText("sem_noticias", { lastSessionAt: null, daysWithoutNews: 6 }, "supabase", NOW)).toBe("Sem treinar há 6 dias · nenhum treino ainda");
    expect(pendingText("ficha_vencida", { lastSessionAt: null, validity: vencida }, "local", NOW)).toBe("Ficha vencida há 5 dias");
    expect(pendingText("ficha_vencendo", { lastSessionAt: null, validity: vence }, "local", NOW)).toBe("Ficha vence em 4 dias");
    expect(fichaStateText({ label: "vencida ontem" })).toBe("Ficha vencida ontem");
    expect(fichaStateText({ label: "vence hoje" })).toBe("Ficha vence hoje");
  });
  it("nenhum texto afirma o que o app não viu", () => {
    const texts = [
      pendingText("sem_ficha", { lastSessionAt: null }, "local", NOW),
      pendingText("sem_noticias", { lastSessionAt: null, daysWithoutNews: 6 }, "local", NOW),
      pendingText("sem_noticias", { lastSessionAt: iso(10) }, "local", NOW),
      pendingText("ficha_vencida", { lastSessionAt: null, validity: { label: "vencida há 5 dias" } }, "local", NOW),
      pendingText("ficha_vencendo", { lastSessionAt: null, validity: { label: "vence em 2 dias" } }, "local", NOW),
      resultsStatus(2),
    ];
    for (const t of texts) expect(t).not.toMatch(/aberto|enviad|chegou|conferid/i);
    for (const t of texts) expect(t.toLowerCase()).not.toContain("sem treinar");
  });
});

describe("programLine: estado da ficha antes do nome (U4a)", () => {
  const soon = { state: "soon" as const, label: "vence em 2 dias" };
  const expired = { state: "expired" as const, label: "vencida há 5 dias" };
  const ok = { state: "ok" as const, label: "vence em 3 semanas" };
  it("pendência de outro motivo: o estado vem antes do nome", () => {
    expect(programLine({ programName: "ABCD Glúteos · Emagrecimento", validity: soon, top: "sem_noticias" })).toEqual({ state: "Ficha vence em 2 dias", name: "ABCD Glúteos · Emagrecimento" });
    expect(programLine({ programName: "ABC", validity: expired, top: "sem_noticias" })).toEqual({ state: "Ficha vencida há 5 dias", name: "ABC" });
  });
  it("a pendência já fala da ficha: só o nome", () => {
    expect(programLine({ programName: "ABC", validity: soon, top: "ficha_vencendo" })).toEqual({ state: null, name: "ABC" });
    expect(programLine({ programName: "ABC", validity: expired, top: "ficha_vencida" })).toEqual({ state: null, name: "ABC" });
  });
  it("validade em dia ou nenhuma: só o nome", () => {
    expect(programLine({ programName: "ABC", validity: ok, top: null })).toEqual({ state: null, name: "ABC" });
    expect(programLine({ programName: "ABC", validity: null, top: "sem_noticias" })).toEqual({ state: null, name: "ABC" });
  });
  it("sem ficha: o objetivo, ou nada sem objetivo", () => {
    expect(programLine({ programName: null, goalLabel: "Hipertrofia", validity: null, top: "sem_ficha" })).toEqual({ state: null, name: "Hipertrofia" });
    expect(programLine({ programName: null, goalLabel: null, validity: null, top: "sem_ficha" })).toBeNull();
    expect(programLine({ validity: null, top: "sem_ficha" })).toBeNull();
  });
});

describe("matchesQuery: busca pelo início de cada palavra (U4a)", () => {
  const names = ["Ana Souza", "Ana Beatriz Souza", "Juliana Prado", "Mariana Costa", "João Ferreira", "Maria-Clara Dias"];
  const find = (q: string) => names.filter((n) => matchesQuery(n, q));
  it("'ana' acha as Anas, não Juliana nem Mariana", () => expect(find("ana")).toEqual(["Ana Souza", "Ana Beatriz Souza"]));
  it("'sou' acha os dois Souza", () => expect(find("sou")).toEqual(["Ana Souza", "Ana Beatriz Souza"]));
  it("várias palavras, em qualquer ordem, sem diferença de maiúscula", () => {
    expect(find("ANA bea")).toEqual(["Ana Beatriz Souza"]);
    expect(find("bea ana")).toEqual(["Ana Beatriz Souza"]);
    expect(find("ana xyz")).toEqual([]);
  });
  it("sem acento nos dois sentidos", () => {
    expect(find("joao")).toEqual(["João Ferreira"]);
    expect(matchesQuery("Joao Ferreira", "joão")).toBe(true);
  });
  it("hífen separa palavras", () => {
    expect(find("clara")).toEqual(["Maria-Clara Dias"]);
    expect(find("maria-cl")).toEqual(["Maria-Clara Dias"]);
  });
  it("busca vazia (ou só espaços) acha todos", () => {
    expect(find("")).toEqual(names);
    expect(find("   ")).toEqual(names);
  });
  it("trecho no meio da palavra não conta", () => {
    expect(find("liana")).toEqual([]);
    expect(find("zz")).toEqual([]);
  });
});

describe("resultsStatus e LIST_TOOLS_MIN (U4a)", () => {
  it("'11 alunos', '1 aluno', 'Nenhum aluno'", () => {
    expect(resultsStatus(11)).toBe("11 alunos");
    expect(resultsStatus(2)).toBe("2 alunos");
    expect(resultsStatus(1)).toBe("1 aluno");
    expect(resultsStatus(0)).toBe("Nenhum aluno");
    expect(resultsStatus(-1)).toBe("Nenhum aluno");
    expect(resultsStatus(Number.NaN)).toBe("Nenhum aluno");
  });
  it("a busca aparece a partir de 7 linhas, como antes", () => expect(LIST_TOOLS_MIN).toBe(7));
});
