import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const channelSecret = process.env.LINE_CHANNEL_SECRET;
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const port = Number(process.env.PORT || 3000);
const defaultSessionTtlMs = 30 * 60 * 1000;
const configuredSessionTtlMs = Number(process.env.SESSION_TTL_MS);
const sessionTtlMs = Number.isFinite(configuredSessionTtlMs) && configuredSessionTtlMs > 0
  ? configuredSessionTtlMs
  : defaultSessionTtlMs;

const copy = {
  zh: {
    welcome: [
      "歡迎使用 JustiAI。",
      "我提供程序導航，不提供法律意見，也不判斷誰對誰錯。",
      "",
      "Welcome to JustiAI.",
      "I provide procedural navigation only, not legal advice.",
      "",
      "請先選擇語言 / Please choose a language."
    ].join("\n"),
    chooseIssue: "請選擇你遇到的問題類型。",
    chooseAction: "你想查看哪一項？",
    selected: "已選擇",
    sessionExpired: "你已閒置一段時間。為了避免使用到舊選項，請重新選擇問題類型。",
    issueFirst: "請先選擇問題類型，再選擇程序、文件或機構。",
    stepsTitle: "程序步驟",
    docsTitle: "所需文件",
    agenciesTitle: "相關機構與網站",
    agencyInstruction: "請點擊下方選項前往相關網站。",
    safety: "安全提醒：採取行動前，請向官方機關確認期限、送件方式與最新規定。",
    urgent: "若有人身安全、住宿或雇主控制等急迫問題，請優先聯繫公共專線或緊急服務。",
    language: "語言",
    changeIssue: "重選問題",
    steps: "程序",
    documents: "文件",
    agencies: "機構"
  },
  en: {
    welcome: [
      "歡迎使用 JustiAI。",
      "我提供程序導航，不提供法律意見，也不判斷誰對誰錯。",
      "",
      "Welcome to JustiAI.",
      "I provide procedural navigation only, not legal advice.",
      "",
      "請先選擇語言 / Please choose a language."
    ].join("\n"),
    chooseIssue: "Please choose the issue you are facing.",
    chooseAction: "What would you like to view?",
    selected: "Selected",
    sessionExpired: "You have been idle for a while. To avoid using old options, please choose the issue again.",
    issueFirst: "Please choose an issue first, then choose steps, documents, or agencies.",
    stepsTitle: "Procedure steps",
    docsTitle: "Required documents",
    agenciesTitle: "Related agencies and websites",
    agencyInstruction: "Tap an option below to open the related website.",
    safety: "Safety note: verify deadlines, filing methods, and latest rules with official agencies before taking action.",
    urgent: "For urgent safety, housing, or employer-control concerns, contact public hotlines or emergency services first.",
    language: "Language",
    changeIssue: "Change issue",
    steps: "Steps",
    documents: "Documents",
    agencies: "Agencies"
  }
};

const routes = {
  wage: {
    keywords: ["wage", "salary", "pay", "薪資", "工資", "未付"],
    label: { zh: "薪資未付", en: "Unpaid wages" },
    buttonLabel: { zh: "薪資未付", en: "Wages" },
    steps: {
      zh: [
        "建立薪資時間軸，記錄期間、約定薪資、發薪日與未付金額。",
        "蒐集薪資單、轉帳紀錄、出勤紀錄與雇主訊息。",
        "要求雇主以書面確認付款狀態。",
        "向地方勞政主管機關申請勞資爭議調解。",
        "若仍未解決，向法律扶助詢問後續程序。"
      ],
      en: [
        "Create a wage timeline with pay period, agreed wage, payday, and missing amount.",
        "Collect salary slips, transfer records, attendance records, and employer messages.",
        "Ask the employer for written payment clarification.",
        "Apply for labor dispute mediation through the local labor authority.",
        "If unresolved, ask legal aid about next procedural channels."
      ]
    },
    documents: {
      zh: [
        "身分或居留文件",
        "勞動契約或錄用紀錄",
        "薪資單或薪資明細",
        "轉帳或付款紀錄",
        "與雇主或主管的訊息",
        "一頁式時間軸摘要"
      ],
      en: [
        "ID or residence document",
        "Employment contract or offer record",
        "Salary slip or wage statement",
        "Bank transfer or payment record",
        "Messages with employer or supervisor",
        "One-page timeline summary"
      ]
    }
  },
  overtime: {
    keywords: ["overtime", "hours", "shift", "加班", "工時", "班表"],
    label: { zh: "加班或工時問題", en: "Overtime or working hours" },
    buttonLabel: { zh: "加班工時", en: "Overtime" },
    steps: {
      zh: [
        "重建實際工作時間，包含上班、下班、休息與休假日。",
        "比對出勤紀錄、班表與薪資明細。",
        "準備簡短爭點摘要，說明期間與爭議時數。",
        "向地方勞政主管機關詢問調解或勞動檢查管道。",
        "送件後保存所有官方通知與回覆。"
      ],
      en: [
        "Reconstruct actual work time, including start, end, breaks, and rest days.",
        "Match attendance records, shift rosters, and payroll statements.",
        "Prepare a short issue summary with period and disputed hours.",
        "Ask the local labor authority about mediation or labor inspection.",
        "Keep every official notice and response after filing."
      ]
    },
    documents: {
      zh: [
        "出勤或打卡紀錄",
        "班表或排班紀錄",
        "薪資單或薪資明細",
        "與雇主或主管的訊息",
        "一頁式爭點摘要"
      ],
      en: [
        "Attendance or punch record",
        "Shift roster or schedule",
        "Salary slip or wage statement",
        "Messages with employer or supervisor",
        "One-page issue summary"
      ]
    }
  },
  injury: {
    keywords: ["injury", "accident", "medical", "職災", "受傷", "事故"],
    label: { zh: "職業災害", en: "Work injury" },
    buttonLabel: { zh: "職業災害", en: "Work injury" },
    steps: {
      zh: [
        "優先就醫並保存醫療紀錄。",
        "記錄事故日期、地點、工作內容、目擊者與照片。",
        "要求雇主以書面說明通報與處理狀態。",
        "聯絡地方勞政主管機關或 1955 專線確認程序方向。",
        "若補償、保險或身分認定有爭議，尋求法律扶助。"
      ],
      en: [
        "Prioritize medical care and preserve medical records.",
        "Document incident date, location, task, witnesses, and photos.",
        "Ask the employer for written reporting and handling status.",
        "Contact the local labor authority or 1955 hotline for procedural direction.",
        "Seek legal aid if compensation, insurance, or employment status is disputed."
      ]
    },
    documents: {
      zh: [
        "診斷證明與醫療收據",
        "事故紀錄或報告",
        "照片或工作場所證據",
        "與雇主或主管的訊息",
        "勞動契約或工作紀錄"
      ],
      en: [
        "Medical certificate and receipts",
        "Incident note or report",
        "Photos or workplace evidence",
        "Messages with employer or supervisor",
        "Employment contract or work record"
      ]
    }
  }
};

const agencies = [
  {
    label: { zh: "勞動部", en: "Ministry of Labor" },
    buttonLabel: { zh: "勞動部", en: "MOL" },
    url: "https://www.mol.gov.tw/"
  },
  {
    label: { zh: "地方勞政主管機關", en: "Local labor authority" },
    buttonLabel: { zh: "地方勞政機關", en: "Labor authority" },
    url: "https://www.mol.gov.tw/1607/28690/89680/"
  },
  {
    label: { zh: "1955 移工諮詢保護專線", en: "1955 migrant worker hotline" },
    buttonLabel: { zh: "1955 專線", en: "1955 Hotline" },
    url: "https://www.wda.gov.tw/en/News_Content.aspx?n=278&s=18966"
  },
  {
    label: { zh: "法律扶助基金會", en: "Legal Aid Foundation" },
    buttonLabel: { zh: "法律扶助", en: "Legal Aid" },
    url: "https://www.laf.org.tw/en/"
  }
];

const userSessions = new Map();

function verifySignature(body, signature) {
  if (!channelSecret || !signature) return false;
  const digest = createHmac("sha256", channelSecret).update(body).digest("base64");
  const expected = Buffer.from(digest);
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function localize(value, lang) {
  return value[lang] || value.en || value.zh || "";
}

function bulletList(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function createSession(overrides = {}) {
  return {
    lang: null,
    issue: null,
    lastOption: null,
    updatedAt: Date.now(),
    expired: false,
    ...overrides
  };
}

function getSession(sourceId) {
  const existing = userSessions.get(sourceId);

  if (!existing) {
    const newSession = createSession();
    userSessions.set(sourceId, newSession);
    return newSession;
  }

  const now = Date.now();
  const isExpired = now - (existing.updatedAt || 0) > sessionTtlMs;
  if (isExpired) {
    const expiredSession = createSession({
      lang: existing.lang,
      issue: null,
      lastOption: null,
      updatedAt: now,
      expired: true
    });
    userSessions.set(sourceId, expiredSession);
    return expiredSession;
  }

  const session = {
    ...existing,
    updatedAt: now,
    expired: false
  };
  userSessions.set(sourceId, session);
  return session;
}

function getSourceId(event) {
  return event.source?.userId || event.source?.groupId || event.source?.roomId || "anonymous";
}

function languageFromText(text) {
  const normalized = (text || "").trim().toLowerCase();
  if (["中文", "chinese", "zh"].includes(normalized)) return "zh";
  if (["english", "英文", "en"].includes(normalized)) return "en";
  return null;
}

function matchRoute(text) {
  const normalized = (text || "").toLowerCase();
  return Object.entries(routes).find(([, route]) =>
    route.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
  )?.[0] || null;
}

function optionFromText(text) {
  const normalized = (text || "").toLowerCase();
  if (["程序", "步驟", "steps", "procedure"].some((keyword) => normalized.includes(keyword))) return "steps";
  if (["文件", "documents", "document", "docs", "checklist"].some((keyword) => normalized.includes(keyword))) return "documents";
  if (["機構", "agency", "agencies", "1955", "hotline", "website", "網站"].some((keyword) => normalized.includes(keyword))) return "agencies";
  if (["重選", "重新", "change", "restart"].some((keyword) => normalized.includes(keyword))) return "restart";
  if (["語言", "language"].some((keyword) => normalized.includes(keyword))) return "language";
  return null;
}

function messageAction(label, text) {
  return { type: "action", action: { type: "message", label, text } };
}

function uriAction(label, uri) {
  return { type: "action", action: { type: "uri", label, uri } };
}

function quickReply(items) {
  return { items };
}

function languageQuickReply() {
  return quickReply([
    messageAction("中文", "中文"),
    messageAction("English", "English")
  ]);
}

function issueQuickReply(lang) {
  return quickReply([
    messageAction(localize(routes.wage.buttonLabel, lang), localize(routes.wage.label, lang)),
    messageAction(localize(routes.overtime.buttonLabel, lang), localize(routes.overtime.label, lang)),
    messageAction(localize(routes.injury.buttonLabel, lang), localize(routes.injury.label, lang))
  ]);
}

function actionQuickReply(lang, exclude = null) {
  const actions = [
    ["steps", copy[lang].steps],
    ["documents", copy[lang].documents],
    ["agencies", copy[lang].agencies],
    ["restart", copy[lang].changeIssue]
  ];

  return quickReply(
    actions
      .filter(([key]) => key !== exclude)
      .map(([, label]) => messageAction(label, label))
  );
}

function agencyQuickReply(lang) {
  return quickReply([messageAction(copy[lang].changeIssue, copy[lang].changeIssue)]);
}

function textMessage(text, reply) {
  const message = { type: "text", text };
  if (reply) message.quickReply = reply;
  return message;
}

function welcomeMessage() {
  return textMessage(copy.zh.welcome, languageQuickReply());
}

function expiredWelcomeMessage() {
  return textMessage([
    "你已閒置一段時間，系統需要重新開始。",
    "請先選擇語言，再重新選擇問題類型。",
    "",
    "You have been idle for a while, so JustiAI needs to restart.",
    "Please choose a language, then choose the issue again."
  ].join("\n"), languageQuickReply());
}

function issuePrompt(lang) {
  return [
    copy[lang].chooseIssue,
    "",
    copy[lang].safety
  ].join("\n");
}

function expiredIssuePrompt(lang) {
  return [
    copy[lang].sessionExpired,
    "",
    issuePrompt(lang)
  ].join("\n");
}

function actionPrompt(route, lang) {
  return [
    `${copy[lang].selected}: ${localize(route.label, lang)}`,
    copy[lang].chooseAction
  ].join("\n");
}

function buildContent(route, option, lang) {
  if (option === "documents") {
    return [
      `${copy[lang].docsTitle}: ${localize(route.label, lang)}`,
      "",
      bulletList(route.documents[lang]),
      "",
      copy[lang].safety
    ].join("\n");
  }

  if (option === "agencies") {
    return [
      `${copy[lang].agenciesTitle}: ${localize(route.label, lang)}`,
      "",
      ...agencies.map((agency, index) => `${index + 1}. ${localize(agency.label, lang)}\n${agency.url}`),
      "",
      copy[lang].urgent
    ].join("\n");
  }

  return [
    `${copy[lang].stepsTitle}: ${localize(route.label, lang)}`,
    "",
    bulletList(route.steps[lang]),
    "",
    copy[lang].safety
  ].join("\n");
}

function buildReply(text, sourceId) {
  const session = getSession(sourceId);
  const langChoice = languageFromText(text);
  const option = optionFromText(text);
  const routeKey = matchRoute(text);

  if (langChoice) {
    session.lang = langChoice;
    session.issue = null;
    session.lastOption = null;
    session.updatedAt = Date.now();
    session.expired = false;
    return textMessage(issuePrompt(session.lang), issueQuickReply(session.lang));
  }

  if (session.expired) {
    session.expired = false;
    if (session.lang && option !== "language") {
      return textMessage(expiredIssuePrompt(session.lang), issueQuickReply(session.lang));
    }
    session.lang = null;
    session.issue = null;
    session.lastOption = null;
    return expiredWelcomeMessage();
  }

  if (!session.lang) {
    if (option === "language") {
      return welcomeMessage();
    }
    if (option || routeKey) {
      return expiredWelcomeMessage();
    }
    return welcomeMessage();
  }

  const lang = session.lang;

  if (option === "language") {
    session.lang = null;
    session.issue = null;
    session.lastOption = null;
    return welcomeMessage();
  }

  if (option === "restart") {
    session.issue = null;
    session.lastOption = null;
    return textMessage(issuePrompt(lang), issueQuickReply(lang));
  }

  if (routeKey) {
    session.issue = routeKey;
    session.lastOption = null;
    return textMessage(actionPrompt(routes[routeKey], lang), actionQuickReply(lang));
  }

  if (!session.issue) {
    return textMessage(copy[lang].issueFirst, issueQuickReply(lang));
  }

  if (option === "agencies") {
    session.lastOption = option;
    return textMessage(buildContent(routes[session.issue], option, lang), agencyQuickReply(lang));
  }

  if (option === "documents" || option === "steps") {
    session.lastOption = option;
    return textMessage(buildContent(routes[session.issue], option, lang), actionQuickReply(lang, option));
  }

  return textMessage(actionPrompt(routes[session.issue], lang), actionQuickReply(lang, session.lastOption));
}

async function sendLineApi(path, body) {
  if (!channelAccessToken) {
    throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");
  }

  const response = await fetch(`https://api.line.me${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${channelAccessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`LINE API failed: ${path} ${response.status} ${await response.text()}`);
  }
}

async function replyMessages(replyToken, messages) {
  if (!replyToken) {
    throw new Error("Missing LINE replyToken");
  }
  await sendLineApi("/v2/bot/message/reply", { replyToken, messages });
}

async function pushMessages(to, messages) {
  if (!to || to === "anonymous") {
    throw new Error("Missing LINE push target");
  }
  await sendLineApi("/v2/bot/message/push", { to, messages });
}

async function deliverMessages(event, messages) {
  const target = getSourceId(event);

  try {
    await replyMessages(event.replyToken, messages);
  } catch (replyError) {
    console.error("LINE reply failed; trying push fallback.", replyError);
    await pushMessages(target, messages);
  }
}

async function handleLineEvent(event) {
  if (event.type === "follow") {
    await deliverMessages(event, [welcomeMessage()]);
    return;
  }

  if (event.type !== "message" || event.message?.type !== "text") return;

  const sourceId = getSourceId(event);
  await deliverMessages(event, [buildReply(event.message.text, sourceId)]);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        ok: true,
        service: "JustiAI LINE bot",
        health: "/health",
        webhook: "POST /webhook"
      }));
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (request.method === "GET" && request.url === "/webhook") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        ok: true,
        message: "LINE will call this endpoint with POST requests. Set this URL in LINE Developers as your webhook URL."
      }));
      return;
    }

    if (request.method !== "POST" || request.url !== "/webhook") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
      return;
    }

    const bodyBuffer = await readBody(request);
    const signature = request.headers["x-line-signature"];
    if (!verifySignature(bodyBuffer, signature)) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "invalid signature" }));
      return;
    }

    const payload = JSON.parse(bodyBuffer.toString("utf8"));
    const events = payload.events || [];

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));

    Promise.all(events.map(handleLineEvent)).catch((error) => {
      console.error("LINE event handling failed after webhook ack.", error);
    });
  } catch (error) {
    console.error(error);
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "server error" }));
  }
});

server.listen(port, () => {
  console.log(`JustiAI LINE bot webhook listening on :${port}`);
});
