import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const channelSecret = process.env.LINE_CHANNEL_SECRET;
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const port = Number(process.env.PORT || 3000);

const routes = {
  wage: {
    keywords: ["wage", "salary", "pay", "薪資", "工資", "未付"],
    title: "Unpaid wages / 薪資未付",
    steps: [
      "Create a wage timeline / 建立薪資時間軸",
      "Collect salary slips, transfer records, attendance, and messages / 蒐集薪資單、轉帳、出勤與訊息",
      "Ask for written payment clarification / 要求書面確認付款",
      "Contact the local labor authority for mediation / 向地方勞政主管機關申請調解"
    ]
  },
  overtime: {
    keywords: ["overtime", "hours", "shift", "加班", "工時", "班表"],
    title: "Overtime or working hours / 加班或工時",
    steps: [
      "Reconstruct the work schedule / 重建工作排班",
      "Match attendance with payroll / 比對出勤與薪資",
      "Prepare a short issue summary / 準備爭點摘要",
      "Ask the local labor authority about mediation or inspection / 詢問調解或檢查管道"
    ]
  },
  injury: {
    keywords: ["injury", "accident", "medical", "職災", "受傷", "事故"],
    title: "Work injury / 職業災害",
    steps: [
      "Secure medical records / 保存醫療紀錄",
      "Document incident date, location, task, and witnesses / 記錄事故日期、地點、工作內容與目擊者",
      "Ask employer for written reporting status / 要求雇主書面說明通報狀態",
      "Contact labor authority, 1955, or legal aid / 聯絡勞政機關、1955 或法律扶助"
    ]
  }
};

function verifySignature(body, signature) {
  if (!channelSecret || !signature) return false;
  const digest = createHmac("sha256", channelSecret).update(body).digest("base64");
  const expected = Buffer.from(digest);
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function matchRoute(text) {
  const normalized = text.toLowerCase();
  return Object.values(routes).find((route) =>
    route.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
  );
}

function buildReply(text) {
  const route = matchRoute(text || "");
  if (!route) {
    return [
      "JustiAI provides procedural navigation only, not legal advice.",
      "Please type one issue: wage / overtime / injury",
      "請輸入問題類型：薪資 / 加班 / 職災"
    ].join("\n");
  }

  return [
    `JustiAI route: ${route.title}`,
    "",
    ...route.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "Safety note: verify deadlines and filing details with official agencies before action.",
    "安全提醒：行動前請向官方機關確認期限與送件方式。"
  ].join("\n");
}

async function replyMessage(replyToken, text) {
  if (!channelAccessToken) {
    throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");
  }

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${channelAccessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }]
    })
  });

  if (!response.ok) {
    throw new Error(`LINE reply failed: ${response.status} ${await response.text()}`);
  }
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

    await Promise.all(events.map(async (event) => {
      if (event.type !== "message" || event.message?.type !== "text") return;
      await replyMessage(event.replyToken, buildReply(event.message.text));
    }));

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
  } catch (error) {
    console.error(error);
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "server error" }));
  }
});

server.listen(port, () => {
  console.log(`JustiAI LINE bot webhook listening on :${port}`);
});
