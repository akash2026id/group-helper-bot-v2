const express = require("express");
const fetch = require("node-fetch");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "CyberAkashBot2026";
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GROQ_KEYS = [process.env.GROQ_API_KEY_1, process.env.GROQ_API_KEY_2].filter(Boolean);
const ADMINS = [{ id: "100052951819398", name: "Cyber Akash Admin" }];
const userCounts = new Map();
const LIMIT = 5;
let groqIdx = 0;

function isAdmin(id) { return ADMINS.some(a => a.id === String(id)); }

function rateCheck(userId) {
  const now = Date.now(), H = 3600000;
  const d = userCounts.get(userId);
  if (!d || now >= d.r) { userCounts.set(userId, { c: 1, r: now + H }); return { ok: true, left: LIMIT - 1 }; }
  if (d.c >= LIMIT) return { ok: false, min: Math.ceil((d.r - now) / 60000) };
  d.c++;
  return { ok: true, left: LIMIT - d.c };
}

async function send(to, text) {
  try {
    await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: to }, message: { text }, messaging_type: "RESPONSE" })
    });
  } catch(e) { console.error("Send error:", e.message); }
}

async function groq(msg) {
  for (let i = 0; i < GROQ_KEYS.length; i++) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${GROQ_KEYS[groqIdx % GROQ_KEYS.length]}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "llama3-8b-8192", messages: [{ role: "system", content: "সবসময় বাংলায় উত্তর দাও। বন্ধুত্বপূর্ণ থাকো।" }, { role: "user", content: msg }], max_tokens: 500 })
      });
      const d = await r.json();
      if (d.error) { groqIdx++; continue; }
      return d.choices[0].message.content;
    } catch(e) { groqIdx++; }
  }
  throw new Error("AI কাজ করছে না");
}

async function handleCmd(from, thread, text) {
  if (!text || !text.startsWith("/")) return;
  const p = text.trim().split(/\s+/), c = p[0].toLowerCase(), a = p.slice(1);
  if (c === "/help") {
    await send(thread, "📜 বট কমান্ড তালিকা\n\n/help - সব কমান্ড\n/kickuser [ID] - কিক (এডমিন)\n/adminstatus - এডমিন তালিকা\n/chatbot [বার্তা] - AI (ঘণ্টায় ৫টি)\n/lovepartner - লাভ পার্টনার\n/support - সাপোর্ট\n\n🤖 Group Helper Bot");
  } else if (c === "/kickuser") {
    if (!isAdmin(from)) { await send(thread, "❌ দুঃখিত, এই কমান্ড শুধু এডমিন ব্যবহার করতে পারে।"); return; }
    if (!a[0]) { await send(thread, "⚠️ সঠিকভাবে লিখুন:\n/kickuser [ইউজার ID]"); return; }
    await send(thread, `✅ ইউজার (ID: ${a[0]}) কে গ্রুপ থেকে বের করা হয়েছে।`);
  } else if (c === "/adminstatus") {
    await send(thread, "👑 গ্রুপ এডমিন তালিকা:\n\n1. Cyber Akash Admin");
  } else if (c === "/chatbot") {
    const m = a.join(" ").trim();
    if (!m) { await send(thread, "🤖 ব্যবহার: /chatbot [প্রশ্ন]\nউদাহরণ: /chatbot বাংলাদেশের রাজধানী?"); return; }
    const r = rateCheck(from);
    if (!r.ok) { await send(thread, `⏳ সীমা শেষ! ${r.min} মিনিট পরে চেষ্টা করুন।`); return; }
    try { await send(thread, `🤖 AI চ্যাটবট\n\n${await groq(m)}\n\n⏰ বাকি: ${r.left}/${LIMIT}টি`); }
    catch(e) { await send(thread, "❌ AI সমস্যা। পরে চেষ্টা করুন।"); }
  } else if (c === "/lovepartner") {
    await send(thread, "❤️ Love Partner:\nhttps://singel-c-bot.page.gd");
  } else if (c === "/support") {
    await send(thread, "📞 WhatsApp:\nhttps://wa.me/8801966061084");
  } else {
    await send(thread, `❓ "${c}" অজানা। /help লিখুন।`);
  }
}

// Routes
app.get("/", (req, res) => res.json({ status: "✅ চালু আছে", bot: "Group Helper Bot" }));

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  console.log(`Webhook verify → token: ${token}, expected: ${VERIFY_TOKEN}`);
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.status(403).send("Forbidden");
  }
});

app.post("/webhook", async (req, res) => {
  if (req.body.object !== "page") return res.sendStatus(404);
  res.sendStatus(200);
  for (const e of (req.body.entry || []))
    for (const ev of (e.messaging || []))
      if (ev.message && !ev.message.is_echo && ev.message.text)
        await handleCmd(ev.sender?.id, ev.recipient?.id, ev.message.text).catch(console.error);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Bot running on port ${PORT}`));
