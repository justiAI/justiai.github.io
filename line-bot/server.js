import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const channelSecret = process.env.LINE_CHANNEL_SECRET;
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-3.5-flash";
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
    aiUnavailable: "目前 AI 回覆暫時無法使用。你可以先使用下方選項進行法律程序導航。",
    vagueInput: "請簡短描述你遇到的狀況，例如薪資、工時、職災、文件或要找哪個機關。我會依照你的描述提供程序導航。",
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
    aiUnavailable: "AI replies are temporarily unavailable. You can still use the options below for procedural navigation.",
    vagueInput: "Please briefly describe your situation, such as wages, working hours, work injury, documents, or which agency you need. I will provide procedural navigation based on your description.",
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
    keywords: [
      "wage", "salary", "pay", "unpaid", "deduction", "薪資", "薪水", "工資",
      "工錢", "未付", "欠薪", "扣薪", "沒給錢", "沒有給錢", "不給錢", "沒拿到錢"
    ],
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
    keywords: [
      "overtime", "hours", "shift", "working time", "rest day", "加班", "加班費",
      "工時", "超時", "班表", "排班", "休息日", "沒有休息"
    ],
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
    keywords: [
      "injury", "accident", "medical", "work injury", "職災", "職業災害",
      "職業傷害", "工傷", "受傷", "工作受傷", "事故", "醫療", "診斷證明"
    ],
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

function inferLanguage(text) {
  return /[\u3400-\u9fff]/.test(text || "") ? "zh" : "en";
}

function messageLanguage(text) {
  return languageFromText(text) || inferLanguage(text);
}

function matchRoute(text) {
  const normalized = (text || "").toLowerCase();
  return Object.entries(routes).find(([, route]) =>
    route.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
  )?.[0] || null;
}

function optionFromText(text) {
  const normalized = (text || "").toLowerCase();
  if ([
    "程序", "步驟", "流程", "下一步", "怎麼做", "怎麼辦", "怎辦", "該怎麼辦", "該怎麼做",
    "如何做", "如何處理", "申請", "調解",
    "steps", "procedure", "process", "next step", "what should i do", "what can i do", "how should i handle"
  ].some((keyword) => normalized.includes(keyword))) return "steps";
  if ([
    "文件", "資料", "證據", "需要準備", "準備什麼", "要帶什麼", "清單",
    "documents", "document", "docs", "checklist", "evidence", "prepare"
  ].some((keyword) => normalized.includes(keyword))) return "documents";
  if ([
    "機構", "機關", "單位", "找誰", "去哪", "哪裡", "網站", "連結", "電話",
    "agency", "agencies", "1955", "hotline", "website", "link", "where"
  ].some((keyword) => normalized.includes(keyword))) return "agencies";
  if (["重選", "重新", "change", "restart"].some((keyword) => normalized.includes(keyword))) return "restart";
  if (["語言", "language"].some((keyword) => normalized.includes(keyword))) return "language";
  return null;
}

function isVagueFallbackText(text) {
  const normalized = (text || "").trim().toLowerCase();
  return ["其他", "其它", "other", "others", "else", "something else"].includes(normalized);
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

function languagePromptMessage() {
  return textMessage("請選擇語言 / Please choose a language.", languageQuickReply());
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

function fallbackQuickReply(session, lang) {
  if (!session.issue) return issueQuickReply(lang);
  return actionQuickReply(lang, session.lastOption);
}

function geminiModelPath() {
  return geminiModel.startsWith("models/") ? geminiModel : `models/${geminiModel}`;
}

function extractGeminiText(data) {
  return (data?.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function cleanAiAnswer(text) {
  return (text || "")
    .split("\n")
    .filter((line) => {
      const normalized = line.trim().toLowerCase();
      if (!normalized) return true;
      return ![
        "refining to fit line style",
        "line style and character limit",
        "drafting",
        "thinking",
        "analysis",
        "final answer"
      ].some((phrase) => normalized.includes(phrase));
    })
    .join("\n")
    .replace(/\*\*/g, "")
    .replace(/^[\s　]*(您好|你好)[，,！!。\s]*(我是\s*)?JustiAI[，,。.\s]*/i, "")
    .replace(/^[\s　]*(hello|hi)[,!.\s]*(i am|i'm)\s+JustiAI[,.!\s]*/i, "")
    .replace(/可能已違反[^，。！？!?\n]*(規定|法律|法規)[！!。]?/g, "可能涉及權益或安全風險。")
    .replace(/可能違反[^，。！？!?\n]*(規定|法律|法規)[！!。]?/g, "可能涉及權益或安全風險。")
    .replace(/已違反[^，。！？!?\n]*(規定|法律|法規)[！!。]?/g, "可能涉及權益或安全風險。")
    .replace(/違反[^，。！？!?\n]*(規定|法律|法規)[！!。]?/g, "可能涉及權益或安全風險。")
    .replace(/是違法行為/g, "可能涉及權益或安全風險")
    .replace(/是違法的/g, "可能涉及權益或安全風險")
    .replace(/違法行為/g, "權益或安全風險")
    .replace(/違法/g, "可能涉及權益或安全風險")
    .replace(/\bis illegal\b/gi, "may involve rights or safety risks")
    .replace(/\bunlawful\b/gi, "may involve rights or safety risks")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function aiInstructions(lang, route) {
  const language = lang === "zh" ? "Traditional Chinese" : "English";
  const routeContext = route
    ? `The user is currently in this route: ${localize(route.label, lang)}.`
    : "The user has not selected a route yet.";

  return [
    `Reply in ${language}.`,
    "You are JustiAI, a Taiwan-focused procedural legal navigation assistant.",
    routeContext,
    "Return only the final user-facing answer. Do not include drafts, analysis, labels, hidden reasoning, formatting notes, or meta commentary.",
    "Start directly with the useful answer. Do not greet the user and do not introduce yourself.",
    "Use a clear LINE chat style and answer in complete sentences.",
    "Do not use Markdown, emoji, bold text, or internal headings.",
    "If the user's message is too vague, ask one short clarifying question instead of inventing categories or a menu.",
    "Only provide procedural navigation, document preparation, safety reminders, and official-resource direction.",
    "Do not provide legal advice, decide who is right or wrong, label conduct as legal or illegal, predict compensation or court outcomes, write legal arguments, or replace a lawyer.",
    "If the user asks for legal judgment, merits analysis, or blame, politely redirect to procedural next steps and official or legal-aid resources.",
    "If the question is outside procedural navigation, briefly say you can only help with procedural navigation.",
    "If the user seems to need wage, overtime, or work-injury help, tell them they can continue with the buttons below."
  ].join("\n");
}

async function showLoadingAnimation(chatId, loadingSeconds = 20) {
  if (!channelAccessToken || !chatId?.startsWith("U")) return;

  try {
    await sendLineApi("/v2/bot/chat/loading/start", {
      chatId,
      loadingSeconds
    });
  } catch (error) {
    console.error("LINE loading animation failed.", error);
  }
}

async function aiFallbackMessage(text, lang, session, sourceId) {
  if (!geminiApiKey) {
    return textMessage(copy[lang].aiUnavailable, fallbackQuickReply(session, lang));
  }

  await showLoadingAnimation(sourceId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const route = session.issue ? routes[session.issue] : null;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${geminiModelPath()}:generateContent`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-goog-api-key": geminiApiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: aiInstructions(lang, route) }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text }]
          }
        ],
        generationConfig: {
          temperature: 0.3
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const answer = cleanAiAnswer(extractGeminiText(data));
    if (!answer) throw new Error("Gemini API returned no text");
    return textMessage(answer, fallbackQuickReply(session, lang));
  } catch (error) {
    console.error("AI fallback failed.", error);
    return textMessage(copy[lang].aiUnavailable, fallbackQuickReply(session, lang));
  } finally {
    clearTimeout(timeout);
  }
}

async function buildReply(text, sourceId) {
  const session = getSession(sourceId);
  const langChoice = languageFromText(text);
  const option = optionFromText(text);
  const routeKey = matchRoute(text);
  const currentLang = messageLanguage(text);

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
      session.lang = currentLang;
      return textMessage(expiredIssuePrompt(currentLang), issueQuickReply(currentLang));
    }
    session.lang = null;
    session.issue = null;
    session.lastOption = null;
    return expiredWelcomeMessage();
  }

  if (!session.lang) {
    if (option === "language") {
      return languagePromptMessage();
    }
    if (routeKey) {
      session.lang = currentLang;
      session.issue = routeKey;
      session.lastOption = option === "steps" ? "steps" : null;
      session.updatedAt = Date.now();
      session.expired = false;
      if (option === "steps") {
        return textMessage(buildContent(routes[routeKey], "steps", currentLang), actionQuickReply(currentLang, "steps"));
      }
      return textMessage(actionPrompt(routes[routeKey], currentLang), actionQuickReply(currentLang));
    }
    if (option) {
      session.lang = currentLang;
      session.issue = null;
      session.lastOption = null;
      return textMessage(copy[currentLang].issueFirst, issueQuickReply(currentLang));
    }
    session.lang = currentLang;
    if (isVagueFallbackText(text)) {
      return textMessage(copy[currentLang].vagueInput, issueQuickReply(currentLang));
    }
    return aiFallbackMessage(text, currentLang, session, sourceId);
  }

  const lang = currentLang;
  session.lang = lang;

  if (option === "language") {
    session.lang = null;
    session.issue = null;
    session.lastOption = null;
    return languagePromptMessage();
  }

  if (option === "restart") {
    session.issue = null;
    session.lastOption = null;
    return textMessage(issuePrompt(lang), issueQuickReply(lang));
  }

  if (routeKey) {
    session.issue = routeKey;
    session.lastOption = option === "steps" ? "steps" : null;
    if (option === "steps") {
      return textMessage(buildContent(routes[routeKey], "steps", lang), actionQuickReply(lang, "steps"));
    }
    return textMessage(actionPrompt(routes[routeKey], lang), actionQuickReply(lang));
  }

  if (!session.issue) {
    if (option) {
      return textMessage(copy[lang].issueFirst, issueQuickReply(lang));
    }
    if (isVagueFallbackText(text)) {
      return textMessage(copy[lang].vagueInput, issueQuickReply(lang));
    }
    return aiFallbackMessage(text, lang, session, sourceId);
  }

  if (option === "agencies") {
    session.lastOption = option;
    return textMessage(buildContent(routes[session.issue], option, lang), agencyQuickReply(lang));
  }

  if (option === "documents" || option === "steps") {
    session.lastOption = option;
    return textMessage(buildContent(routes[session.issue], option, lang), actionQuickReply(lang, option));
  }

  if (isVagueFallbackText(text)) {
    return textMessage(copy[lang].vagueInput, actionQuickReply(lang, session.lastOption));
  }

  return aiFallbackMessage(text, lang, session, sourceId);
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
    const userId = getSourceId(event);
    await pushMessages(userId, [welcomeMessage()]);
    return;
  }

  if (event.type !== "message" || event.message?.type !== "text") return;

  const sourceId = getSourceId(event);
  await deliverMessages(event, [await buildReply(event.message.text, sourceId)]);
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
