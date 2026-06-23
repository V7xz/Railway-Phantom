require("./server.js");
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionsBitField,
  ChannelType,
  ActivityType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Collection,
  AttachmentBuilder
} = require("discord.js");

/* =====================================================
   ENV
===================================================== */

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const BANNER_URL = process.env.BANNER_URL || "";
const QRIS_IMAGE = process.env.QRIS_IMAGE || "https://media.discordapp.net/attachments/1517559352209313943/1518601689089970226/Qris.jpg?ex=6a3a8388&is=6a393208&hm=e5f1d7e049b35eac017fa41de0acd505990e73b70018fec636a28d02d8d05891&=&format=webp";
const PAYPAL_EMAIL = process.env.PAYPAL_EMAIL || "acex.master0701@gmail.com";
const LTC_TEXT = process.env.LTC_TEXT || "Unavailable";

// ── Per‑product loader URLs ─────────────────────────────────────────────
const SCRIPT_LOADERS = {
  killaura: process.env.LOADER_KILLAURA || "https://vss.pandauth.com/kv/aac058ad34f97422",
  combat:   process.env.LOADER_COMBAT   || "https://vss.pandauth.com/kv/aac058ad34f97422",
  autofarm: process.env.LOADER_AUTOFARM || "https://vss.pandauth.com/kv/aac058ad34f97422",
  fps:      process.env.LOADER_FPS      || "https://vss.pandauth.com/kv/aac058ad34f97422"
};

// ── Product prefixes for paid keys ──────────────────────────────────────
const PRODUCT_PREFIXES = {
  killaura: "KA",
  combat:   "CB",
  autofarm: "AF",
  fps:      "FP"
};

// ── Free prefixes for trial keys ────────────────────────────────────────
const FREE_PREFIXES = {
  killaura: "KAFREE",
  combat:   "CBFREE",
  autofarm: "AFFREE",
  fps:      "FPFREE"
};

/* =====================================================
   STATIC CONFIG
===================================================== */

const CONFIG = {
  BOT_NAME: "Phantom.wtf",
  OWNER_ID: "961847981684973569",
  ADMIN_ROLE_NAME: "dev",
  RESELLER_ROLE_ID: "1517159248012906607",
  AUTO_CLOSE_HOURS: 24,
  CURRENCY_RATE: 17000,
  BUYER_ROLE_NAME: "Subscriptions",
  COOLDOWN_MS: 3000,
  MAX_OPEN_TICKETS_PER_USER: 10,
  TRANSCRIPT_CHANNEL_NAME: "transcript",
  UNBOUND_KEY_TTL_DAYS: 7
};

const COLORS = {
  main: 0x7b2cff,
  dark: 0x111111,
  green: 0x57f287,
  red: 0xed4245,
  yellow: 0xfee75c,
  gray: 0x2b2d31
};

const COLOR_MAIN = COLORS.main;
const COLOR_RED = COLORS.red;
const COLOR_GREEN = COLORS.green;
const COLOR_YELLOW = COLORS.yellow;
const COLOR_GRAY = COLORS.gray;

// ── Pricing data (IDR) ──────────────────────────────────────────────────
const PRICES = {
  killaura: { "1d": 15000, "3d": 30000, "7d": 60000, "30d": 120000 },
  combat:   { "1d": 12000, "3d": 25000, "7d": 50000, "30d": 80000, "perm": 100000 },
  autofarm: { "1d": 10000, "3d": 20000, "7d": 40000, "30d": 80000, "perm": 100000 },
  fps:      { "perm": 35000 },
  external: { "perm": 110000 }
};

// ── USD approximations ──────────────────────────────────────────────────
const USD_APPROX = {
  10000: "0.63", 12000: "0.75", 15000: "0.94", 20000: "1.25", 25000: "1.56",
  30000: "1.88", 35000: "2.19", 40000: "2.50", 50000: "3.13", 60000: "3.75",
  80000: "5.00", 100000: "6.25", 110000: "6.88", 120000: "7.50"
};

function getUSDApprox(idr) {
  const usd = USD_APPROX[idr];
  return usd ? `~$${usd} USD` : `~$${(idr / 16000).toFixed(2)} USD`;
}

function formatPriceIDRUSD(idr) {
  return `IDR ${idr.toLocaleString("id-ID")} / ${getUSDApprox(idr)}`;
}

function getProductKey(productName) {
  if (productName === "Kill Aura") return "killaura";
  if (productName === "Combat (Silent Aim)") return "combat";
  if (productName === "Auto Farm") return "autofarm";
  if (productName === "FPS") return "fps";
  if (productName === "Roblox External") return "external";
  return null;
}

/* =====================================================
   CLIENT
===================================================== */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

/* =====================================================
   STORAGE & CACHE
===================================================== */

const DATA_DIR = path.join(__dirname, "data");

const FILES = {
  orders: path.join(DATA_DIR, "orders.json"),
  keys: path.join(DATA_DIR, "keys.json"),
  reviews: path.join(DATA_DIR, "reviews.json"),
  logs: path.join(DATA_DIR, "logs.json"),
  transcript: path.join(DATA_DIR, "transcripts.json"),
  trials: path.join(DATA_DIR, "trials.json"),
  genlog: path.join(DATA_DIR, "genlog.json")
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

for (const file of Object.values(FILES)) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, file.endsWith("genlog.json") ? "{}" : (file.endsWith("trials.json") ? "[]" : "[]"));
}

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return []; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let orders = readJSON(FILES.orders);
let keys = readJSON(FILES.keys);
let reviews = readJSON(FILES.reviews);
let logs = readJSON(FILES.logs);
let transcripts = readJSON(FILES.transcript);
let trials = readJSON(FILES.trials);
let genlogChannelId = (() => {
    try {
        const data = JSON.parse(fs.readFileSync(FILES.genlog, "utf8"));
        return data.channelId || null;
    } catch { return null; }
})();

// ── IN‑MEMORY TRIAL KEYS (never written to disk) ──────────────────────
global.trialKeys = [];

let logChannelId = null;
let reviewChannelId = null;
let transcriptChannelId = null;

const ticketMessages = new Map();
const activityMap = new Map();
const commandCooldown = new Collection();

/* =====================================================
   UTILITIES
===================================================== */

function refreshKeys() {
  keys = readJSON(FILES.keys);
}

function isAdmin(member) {
  return (
    member.id === CONFIG.OWNER_ID ||
    member.roles.cache.some(r => r.name === CONFIG.ADMIN_ROLE_NAME)
  );
}
function isReseller(member) { return member.roles.cache.has(CONFIG.RESELLER_ROLE_ID); }
function canGenkey(member, interaction) { 
  return isAdmin(member) || isAdminByRole(interaction) || isReseller(member); 
}

function isAdminByRole(interaction) {
  const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
  if (!ADMIN_ROLE_ID) return false;
  if (!interaction || !interaction.member) return false;
  return interaction.member.roles.cache.has(ADMIN_ROLE_ID);
}

function parseDuration(val) {
  if (!val || val === "perm") return 0;
  const unit = val.slice(-1);
  const num  = parseInt(val.slice(0, -1));
  if (unit === "h") return num * 3600;
  if (unit === "d") return num * 86400;
  return 86400;
}

function durationLabel(val) {
  if (val === "1h")  return "1 Hour";
  if (val === "3h")  return "3 Hours";
  if (val === "6h")  return "6 Hours";
  if (val === "12h") return "12 Hours";
  if (val === "1d")  return "1 Day";
  if (val === "3d")  return "3 Days";
  if (val === "7d")  return "7 Days";
  if (val === "30d") return "1 Month";
  if (val === "perm") return "Lifetime";
  return "Unknown";
}

function formatDurasi(detik) {
  if (!detik) return "Permanent";
  const jam  = Math.floor(detik / 3600);
  const hari = Math.floor(jam / 24);
  if (hari >= 1) return `${hari} days`;
  return `${jam} hours`;
}

function randomID(len = 10) {
  return crypto.randomBytes(len).toString("hex").slice(0, len);
}

// ── Regular key generation (stored on disk) ─────────────────────────────
function generateKey(productKey) {
  const prefix = PRODUCT_PREFIXES[productKey] || "XX";
  return (
    prefix + "-" +
    randomID(4).toUpperCase() + "-" +
    randomID(4).toUpperCase() + "-" +
    randomID(4).toUpperCase() + "-" +
    randomID(4).toUpperCase()
  );
}

// ── Trial key generation (in‑memory, uses free prefix) ──────────────────
function generateTrialKey(productKey) {
  const prefix = FREE_PREFIXES[productKey] || "XXFREE";
  return (
    prefix + "-" +
    randomID(4).toUpperCase() + "-" +
    randomID(4).toUpperCase() + "-" +
    randomID(4).toUpperCase() + "-" +
    randomID(4).toUpperCase()
  );
}

// ── Centralised key creation (always includes userId) ─────────────────
function createKey(productKey, durationMs, userId, isTrial = false) {
  const key = isTrial ? generateTrialKey(productKey) : generateKey(productKey);
  const entry = {
    key,
    product: productKey,
    duration: durationMs,
    expires: 0,
    hwid: null,
    userId: userId,
    created: Date.now(),
    trial: isTrial || false
  };

  if (isTrial) {
    global.trialKeys.push(entry);
  } else {
    keys.push(entry);
    saveAll();
  }
  return key;
}

function saveAll() {
  writeJSON(FILES.orders, orders);
  writeJSON(FILES.keys, keys);
  writeJSON(FILES.reviews, reviews);
  writeJSON(FILES.logs, logs);
  writeJSON(FILES.transcript, transcripts);
  writeJSON(FILES.trials, trials);
  writeJSON(FILES.genlog, { channelId: genlogChannelId });
}

function findOrder(channelId) {
  return orders.find(o => o.channelId === channelId);
}

function moneyIDR(n) {
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}

function moneyUSD(n) {
  return `$${Number(n).toFixed(2)}`;
}

function statusBadge(s) {
  return {
    payment:  "💳 Awaiting Payment",
    waiting:  "⏳ Payment Submitted",
    approved: "✅ Approved",
    rejected: "❌ Rejected",
    closed:   "🚫 Closed",
    cancelled:"🚫 Cancelled"
  }[s] || s;
}

function onCooldown(userId) {
  const now = Date.now();
  const last = commandCooldown.get(userId) || 0;
  if (now - last < CONFIG.COOLDOWN_MS) return true;
  commandCooldown.set(userId, now);
  return false;
}

async function safeReply(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      return await interaction.followUp({ ...payload, flags: 64 });
    }
    return await interaction.reply({ ...payload, flags: 64 });
  } catch (e) {
    console.error("[safeReply]", e.message);
  }
}

function trackMessage(channelId, author, content) {
  if (!ticketMessages.has(channelId)) ticketMessages.set(channelId, []);
  ticketMessages.get(channelId).push({ author, content, timestamp: new Date().toISOString() });
}

function buildTranscriptText(channelId, channelName, order) {
  const messages = ticketMessages.get(channelId) || [];
  const lines = [
    `══════════════════════════════════════`,
    `  ${CONFIG.BOT_NAME} — TICKET TRANSCRIPT`,
    `══════════════════════════════════════`,
    `Channel   : #${channelName}`,
    `Channel ID: ${channelId}`,
    order
      ? [`Order ID  : #${order.orderId}`, `Product   : ${order.product} (${order.variant || "N/A"})`,
         `Price     : ${moneyIDR(order.price)} (${getUSDApprox(order.price)})`, `Customer  : ${order.userId}`,
         `Status    : ${statusBadge(order.status)}`, `Payment   : ${order.paymentMethod || "N/A"}`,
         `Opened    : ${new Date(order.created).toUTCString()}`].join("\n")
      : `Type      : Support Ticket`,
    `══════════════════════════════════════`,
    `MESSAGES (${messages.length} total)`,
    `══════════════════════════════════════`,
    ...messages.map(m => `[${m.timestamp}] ${m.author}\n  ${m.content}`),
    `══════════════════════════════════════`,
    `  END OF TRANSCRIPT`,
    `══════════════════════════════════════`
  ];
  return lines.join("\n");
}

async function sendTranscript(guild, channelId, channelName, closedBy) {
  const transcriptCh = transcriptChannelId
    ? guild.channels.cache.get(transcriptChannelId) || guild.channels.cache.find(c => c.name === CONFIG.TRANSCRIPT_CHANNEL_NAME)
    : guild.channels.cache.find(c => c.name === CONFIG.TRANSCRIPT_CHANNEL_NAME);
  if (!transcriptCh) return;

  const order = findOrder(channelId) || null;
  const text = buildTranscriptText(channelId, channelName, order);
  const buffer = Buffer.from(text, "utf-8");
  const attachment = new AttachmentBuilder(buffer, { name: `transcript-${channelName}.txt` });

  const embed = new EmbedBuilder()
    .setTitle("📄 Ticket Transcript")
    .setColor(COLOR_MAIN)
    .addFields(
      { name: "Channel", value: `#${channelName}`, inline: true },
      { name: "Closed By", value: closedBy ? `<@${closedBy}>` : "Auto", inline: true },
      { name: "Messages", value: `${(ticketMessages.get(channelId) || []).length}`, inline: true }
    );
  if (order) {
    embed.addFields(
      { name: "Order", value: `#${order.orderId}`, inline: true },
      { name: "Product", value: `${order.product} (${order.variant || ""})`, inline: true },
      { name: "Status", value: statusBadge(order.status), inline: true }
    );
  }
  embed.setTimestamp();
  await transcriptCh.send({ embeds: [embed], files: [attachment] }).catch(() => {});
  ticketMessages.delete(channelId);
}

/* =====================================================
   EMBED BUILDERS
===================================================== */

function setupPanel() {
  return new EmbedBuilder()
    .setColor(COLOR_MAIN)
    .setTitle("🎫 Phantom.wtf — Support & Info")
    .setDescription(`
**Ticket Support / Dukungan Tiket**
Select the category that best fits your issue from the dropdown menu below. /
Silakan pilih kategori yang paling sesuai dengan masalah Anda dari menu dropdown di bawah ini.

❓ **Help with issues / Bantuan dengan Masalah**
People who are experiencing problems with using the software or have other questions /
Orang yang mengalami masalah dalam menggunakan perangkat lunak atau memiliki pertanyaan lain.

💳 **Payment Inquiries / Pertanyaan Pembayaran**
Inquiries regarding payments through other channels or general payment issues /
Pertanyaan mengenai pembayaran melalui jalur lain atau masalah pembayaran umum.

🎁 **Gift Card (PayPal by Rewarble)**
Purchase a $6 PayPal gift card by Rewarble and send it to us /
Beli PayPal gift card senilai $6 melalui Rewarble lalu kirimkan kepada kami.

🛒 **Purchase / Beli (Script/External)**
Buy scripts or external products directly. /
Beli script atau produk eksternal secara langsung.

💰 **Pricing / Harga**
View our product prices directly. / Lihat daftar harga produk kami secara langsung.
    `)
    .setImage(BANNER_URL || null)
    .setFooter({ text: "phantomexternal.mysellauth.com" });
}

function supportPanel() {
  return new EmbedBuilder()
    .setColor(COLOR_MAIN)
    .setTitle("🎫 Phantom Support")
    .setDescription("Need help? Open a private support ticket below.");
}

function dashboardEmbed(guild) {
  refreshKeys();
  const now = Date.now();
  const totalKeys = keys.length + global.trialKeys.length;
  const activeKeys = keys.filter(k => k.expires === 0 ? k.duration === 0 : k.expires > now).length +
                     global.trialKeys.filter(k => k.expires === 0 ? k.duration === 0 : k.expires > now).length;

  const totalOrders = orders.length;
  const pendingOrders = orders.filter(o => o.status === "waiting").length;
  const paymentOrders = orders.filter(o => o.status === "payment").length;
  const approvedOrders = orders.filter(o => o.status === "approved").length;
  const rejectedOrders = orders.filter(o => o.status === "rejected").length;
  const closedOrders = orders.filter(o => o.status === "closed" || o.status === "cancelled").length;

  return new EmbedBuilder()
    .setColor(COLOR_MAIN)
    .setTitle("📊 Phantom Dashboard")
    .addFields(
      { name: "Keys", value: `🔑 Total: ${totalKeys}\n🟢 Active: ${activeKeys}\n🔴 Expired: ${totalKeys - activeKeys}`, inline: true },
      { name: "Orders", value: `📦 Total: ${totalOrders}\n💳 Pending Payment: ${paymentOrders}\n⏳ Awaiting Approval: ${pendingOrders}`, inline: true },
      { name: "Completed", value: `✅ Approved: ${approvedOrders}\n❌ Rejected: ${rejectedOrders}\n🚫 Closed: ${closedOrders}`, inline: true }
    )
    .setTimestamp();
}

function pricingDetailEmbed() {
  return new EmbedBuilder()
    .setColor(COLOR_MAIN)
    .setTitle("💰 Product Pricing")
    .setDescription("All prices are listed in **IDR** with approximate **USD** equivalents.\n")
    .addFields(
      { name: "Kill Aura", value: `
• 1 Day: ${formatPriceIDRUSD(PRICES.killaura["1d"])}
• 3 Days: ${formatPriceIDRUSD(PRICES.killaura["3d"])}
• 7 Days: ${formatPriceIDRUSD(PRICES.killaura["7d"])}
• 1 Month: ${formatPriceIDRUSD(PRICES.killaura["30d"])}
      `, inline: true },
      { name: "Combat (Silent Aim)", value: `
• 1 Day: ${formatPriceIDRUSD(PRICES.combat["1d"])}
• 3 Days: ${formatPriceIDRUSD(PRICES.combat["3d"])}
• 7 Days: ${formatPriceIDRUSD(PRICES.combat["7d"])}
• 1 Month: ${formatPriceIDRUSD(PRICES.combat["30d"])}
• Lifetime: ${formatPriceIDRUSD(PRICES.combat["perm"])}
      `, inline: true },
      { name: "Auto Farm", value: `
• 1 Day: ${formatPriceIDRUSD(PRICES.autofarm["1d"])}
• 3 Days: ${formatPriceIDRUSD(PRICES.autofarm["3d"])}
• 7 Days: ${formatPriceIDRUSD(PRICES.autofarm["7d"])}
• 1 Month: ${formatPriceIDRUSD(PRICES.autofarm["30d"])}
• Lifetime: ${formatPriceIDRUSD(PRICES.autofarm["perm"])}
      `, inline: true },
      { name: "FPS (Lifetime Only)", value: `
• Lifetime: ${formatPriceIDRUSD(PRICES.fps["perm"])}
      `, inline: true },
      { name: "External — Roblox External", value: `
• Lifetime: ${formatPriceIDRUSD(PRICES.external["perm"])}
      `, inline: false }
    )
    .setFooter({ text: "Prices are subject to change. Confirm final amount before paying." })
    .setTimestamp();
}

/* =====================================================
   COMMANDS
===================================================== */

const commands = [
  new SlashCommandBuilder().setName("setup").setDescription("Send main shop panel"),
  new SlashCommandBuilder().setName("setupsupport").setDescription("Send support panel"),
  new SlashCommandBuilder().setName("setuplogs").setDescription("Set current channel as log channel"),
  new SlashCommandBuilder().setName("setupreviews").setDescription("Set current channel as review channel"),
  new SlashCommandBuilder().setName("setuptranscript").setDescription("Set current channel as transcript destination"),
  new SlashCommandBuilder().setName("setupgenlog").setDescription("Set current channel as genkey log channel"),
  new SlashCommandBuilder().setName("dashboard").setDescription("View live stats"),
  new SlashCommandBuilder().setName("claim").setDescription("Claim this ticket"),
  new SlashCommandBuilder().setName("close").setDescription("Close current ticket (generates transcript)"),
  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Bot send custom message (advanced)")
    .addStringOption(o => o.setName("message").setDescription("Message content").setRequired(true))
    .addChannelOption(o => o.setName("channel").setDescription("Channel to send to (default: current)").setRequired(false))
    .addBooleanOption(o => o.setName("embed").setDescription("Send as embed?").setRequired(false))
    .addStringOption(o => o.setName("title").setDescription("Embed title (if embed=true)").setRequired(false))
    .addStringOption(o => o.setName("color").setDescription("Embed color hex (e.g., #57f287)").setRequired(false)),
  new SlashCommandBuilder().setName("accept").setDescription("Approve payment in this ticket"),
  new SlashCommandBuilder().setName("reject").setDescription("Reject payment in this ticket")
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)),
  new SlashCommandBuilder()
    .setName("genkey").setDescription("Generate script key")
    .addStringOption(o => o.setName("product").setDescription("Select script type").setRequired(true)
      .addChoices({ name:"Kill Aura", value:"killaura" }, { name:"Combat (Silent Aim)", value:"combat" }, { name:"Auto Farm", value:"autofarm" }, { name:"FPS", value:"fps" }))
    .addStringOption(o => o.setName("duration").setDescription("Key duration").setRequired(true)
      .addChoices({ name:"1 Hour", value:"1h" }, { name:"3 Hours", value:"3h" }, { name:"6 Hours", value:"6h" }, { name:"12 Hours", value:"12h" }, { name:"1 Day", value:"1d" }, { name:"3 Days", value:"3d" }, { name:"7 Days", value:"7d" }, { name:"30 Days", value:"30d" }, { name:"Lifetime", value:"perm" })),
  new SlashCommandBuilder()
    .setName("extendkey").setDescription("Extend key duration")
    .addStringOption(o => o.setName("key").setDescription("Key to extend").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("Duration to add").setRequired(true)
      .addChoices({ name:"1 Hour", value:"1h" }, { name:"3 Hours", value:"3h" }, { name:"6 Hours", value:"6h" }, { name:"12 Hours", value:"12h" }, { name:"1 Day", value:"1d" }, { name:"3 Days", value:"3d" }, { name:"7 Days", value:"7d" }, { name:"30 Days", value:"30d" })),
  new SlashCommandBuilder().setName("revokekey").setDescription("Delete key").addStringOption(o => o.setName("key").setDescription("Key").setRequired(true)),
  new SlashCommandBuilder().setName("checkkey").setDescription("Check key (admin)").addStringOption(o => o.setName("key").setDescription("Key").setRequired(true)),
  new SlashCommandBuilder().setName("resethwid").setDescription("Reset HWID (admin)").addStringOption(o => o.setName("key").setDescription("Key").setRequired(true)),
  new SlashCommandBuilder()
    .setName("keylist")
    .setDescription("List all keys (admin)")
    .addStringOption(o => o.setName("type").setDescription("Filter by key type").setRequired(false)
      .addChoices({ name:"Paid Keys", value:"paid" }, { name:"Trial Keys", value:"trial" })),
  new SlashCommandBuilder()
    .setName("checkmykey")
    .setDescription("Check any key")
    .addStringOption(o => o.setName("key").setDescription("Key").setRequired(true)),
  new SlashCommandBuilder()
    .setName("setuptrials").setDescription("Send a trial claim panel")
    .addStringOption(o => o.setName("product").setDescription("Which script to give as trial").setRequired(true)
      .addChoices({ name:"Kill Aura", value:"killaura" }, { name:"Combat (Silent Aim)", value:"combat" }, { name:"Auto Farm", value:"autofarm" }, { name:"FPS", value:"fps" }))
    .addStringOption(o => o.setName("duration").setDescription("Trial duration").setRequired(true)
      .addChoices({ name:"1 Hour", value:"1h" }, { name:"3 Hours", value:"3h" }, { name:"6 Hours", value:"6h" }, { name:"12 Hours", value:"12h" }, { name:"1 Day", value:"1d" }, { name:"3 Days", value:"3d" }, { name:"7 Days", value:"7d" }))
    .addStringOption(o => o.setName("expires").setDescription("How long the claim button stays active").setRequired(true)
      .addChoices({ name:"1 Hour", value:"1h" }, { name:"3 Hours", value:"3h" }, { name:"6 Hours", value:"6h" }, { name:"12 Hours", value:"12h" }, { name:"1 Day", value:"1d" }, { name:"2 Days", value:"2d" }, { name:"3 Days", value:"3d" }, { name:"7 Days", value:"7d" }))
].map(x => x.toJSON());

/* =====================================================
   READY
===================================================== */

client.once("ready", async () => {
  console.log(`${client.user.tag} online.`);

  client.user.setPresence({
    activities: [{ name: "phantomexternal.mysellauth.com", type: ActivityType.Watching }],
    status: "online"
  });

  await new Promise(resolve => setTimeout(resolve, 5000));

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  console.log("TOKEN:", TOKEN ? "Set" : "MISSING");
  console.log("CLIENT_ID:", CLIENT_ID);
  console.log("GUILD_ID:", GUILD_ID);

  // Register commands globally
  try {
    const result = await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    console.log(`✅ ${result.length} slash commands registered globally!`);
  } catch (err) {
    console.error("Registration failed:", err.message);
  }
  
  // ── Ticket auto-close interval ──────────────────────────────────────────
  setInterval(async () => {
    const now = Date.now();
    for (const data of orders) {
      if (["approved", "closed", "rejected", "cancelled"].includes(data.status)) continue;
      const last = activityMap.get(data.channelId) || data.created;
      if (now - last < CONFIG.AUTO_CLOSE_HOURS * 3600000) continue;
      const ch = client.channels.cache.get(data.channelId);
      if (!ch) continue;
      data.status = "cancelled";
      saveAll();
      trackMessage(data.channelId, "SYSTEM", `[AUTO-CLOSE] Ticket closed after ${CONFIG.AUTO_CLOSE_HOURS}h of inactivity.`);
      await ch.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_RED)
            .setTitle("⏰ Auto Closed")
            .setDescription(`Ticket closed due to **${CONFIG.AUTO_CLOSE_HOURS}h** of inactivity.`)
        ]
      }).catch(() => {});
      await sendTranscript(ch.guild, data.channelId, ch.name, null);
      try {
        await ch.delete();
      } catch (err) {
        console.error(`[AUTO-CLOSE] Could not delete channel ${ch.name}:`, err.message);
      }
    }
  }, 30 * 60 * 1000);

  // ── Auto-cleanup of unbound keys (7 days) AND expired bound keys ─────
  setInterval(() => {
    const now = Date.now();
    const ttl = CONFIG.UNBOUND_KEY_TTL_DAYS * 86400 * 1000;
    const beforeCount = keys.length;

    keys = keys.filter(k => {
      if (k.expires !== 0 && k.duration > 0 && now > k.expires) {
        console.log(`[CLEANUP] Removing expired key ${k.key}`);
        return false;
      }
      if (k.expires === 0 && k.duration > 0 && now - (k.created || 0) > ttl) {
        console.log(`[CLEANUP] Removing unbound key ${k.key} – older than 7 days`);
        return false;
      }
      return true;
    });

    if (keys.length < beforeCount) {
      saveAll();
      console.log(`[CLEANUP] Removed ${beforeCount - keys.length} keys (expired/unbound)`);
    }
  }, 24 * 60 * 60 * 1000);

  // ── Cleanup expired trial keys from memory ────────────────────────────
  setInterval(() => {
    const now = Date.now();
    const before = global.trialKeys.length;
    global.trialKeys = global.trialKeys.filter(k => {
      if (k.expires !== 0 && now > k.expires) return false;
      return true;
    });
    if (global.trialKeys.length < before) {
      console.log(`[TRIAL CLEANUP] Removed ${before - global.trialKeys.length} expired trial keys`);
    }
  }, 60 * 60 * 1000);
});

/* =====================================================
   INTERACTION HANDLER
===================================================== */

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) return await handleSlash(interaction);
    if (interaction.isButton()) {
      if (onCooldown(interaction.user.id)) return safeReply(interaction, { content: "⏳ Slow down a bit." });
      return await handleButton(interaction);
    }
    if (interaction.isStringSelectMenu()) {
      return await handleSelect(interaction);
    }
    if (interaction.isModalSubmit()) return await handleModal(interaction);
  } catch (err) {
    console.error(err);
    const payload = { content: "❌ Something went wrong.", flags: 64 };
    if (interaction.replied || interaction.deferred) {
      interaction.followUp(payload).catch(() => {});
    } else {
      interaction.reply(payload).catch(() => {});
    }
  }
});

/* =====================================================
   SLASH HANDLER
===================================================== */

async function handleSlash(interaction) {
  const { commandName, member, channel, guild, options } = interaction;

  if (commandName === "setup") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "No permission." });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("shop_category_select")
      .setPlaceholder("📂 Choose a category... / Pilih kategori...")
      .addOptions([
        { label: "Help with issues / Bantuan", description: "Problems with the software / Masalah dengan software", emoji: "❓", value: "support_help" },
        { label: "Payment Inquiries / Pembayaran", description: "Payment questions / Pertanyaan pembayaran", emoji: "💳", value: "support_payment" },
        { label: "Gift Card (PayPal Rewarble)", description: "Purchase a gift card / Beli gift card", emoji: "🎁", value: "support_gift" },
        { label: "Purchase / Beli (Script/External)", description: "Buy scripts or external products / Beli script atau produk eksternal", emoji: "🛒", value: "product" },
        { label: "Pricing / Harga", description: "View product prices / Lihat harga produk", emoji: "💰", value: "pricing" }
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await channel.send({ embeds: [setupPanel()], components: [row] });
    return safeReply(interaction, { content: "✅ Setup panel sent." });
  }

  if (commandName === "setupsupport") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "No permission." });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("open_support").setLabel("Open Support").setStyle(ButtonStyle.Primary).setEmoji("🎫")
    );
    await channel.send({ embeds: [supportPanel()], components: [row] });
    return safeReply(interaction, { content: "✅ Support panel sent." });
  }

  if (commandName === "setuplogs") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "No permission." });
    logChannelId = channel.id;
    saveAll();
    return safeReply(interaction, { content: "✅ Logs channel set." });
  }

  if (commandName === "setupreviews") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "No permission." });
    reviewChannelId = channel.id;
    saveAll();
    return safeReply(interaction, { content: "✅ Review channel set." });
  }

  if (commandName === "setuptranscript") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "No permission." });
    transcriptChannelId = channel.id;
    saveAll();
    return safeReply(interaction, { content: "✅ Transcript channel set." });
  }
    if (commandName === "setupgenlog") {
    if (!isAdmin(member)) return safeReply(interaction, { content:"No permission." });
    genlogChannelId = channel.id;
    saveAll();
    return safeReply(interaction, { content:"✅ Genkey log channel set." });
  }

  if (commandName === "dashboard") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "No permission." });
    return interaction.reply({ embeds: [dashboardEmbed(guild)], flags: 64 });
  }

  if (commandName === "claim") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "No permission." });
    const data = findOrder(channel.id);
    if (data) data.claimedBy = interaction.user.id;
    trackMessage(channel.id, "SYSTEM", `[CLAIMED] Ticket claimed by ${interaction.user.tag}`);
    await channel.setName(`claimed-${interaction.user.username.slice(0, 20).toLowerCase()}`).catch(() => {});
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(COLOR_MAIN).setDescription(`📌 Claimed by <@${interaction.user.id}>`)],
      flags: 64
    });
  }

  if (commandName === "close") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "No permission." });
    const data = findOrder(channel.id);
    if (data) data.status = "closed";
    saveAll();
    trackMessage(channel.id, "SYSTEM", `[CLOSED] Ticket closed by ${interaction.user.tag}`);
    await sendTranscript(guild, channel.id, channel.name, interaction.user.id);

    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(COLOR_GRAY).setDescription("🚫 Ticket closed. Transcript saved. Deleting in 5 seconds...")],
      flags: 64
    });

    const ch = guild.channels.cache.get(channel.id);
    if (ch) {
      setTimeout(async () => {
        try {
          await ch.delete();
        } catch (err) {
          console.error(`[CLOSE] Failed to delete channel ${ch.name}:`, err.message);
          try {
            await interaction.followUp({
              content: `⚠️ Could not delete the channel automatically. Please delete it manually. (${err.message})`,
              flags: 64
            });
          } catch {}
        }
      }, 5000);
    }
    return;
  }

  if (commandName === "say") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "No permission." });
    const msg = options.getString("message");
    const targetChannel = options.getChannel("channel") || channel;
    const asEmbed = options.getBoolean("embed") || false;
    const embedTitle = options.getString("title") || null;
    const colorHex = options.getString("color") || null;

    if (asEmbed) {
      const embed = new EmbedBuilder()
        .setDescription(msg)
        .setColor(colorHex ? parseInt(colorHex.replace("#", ""), 16) : COLOR_MAIN);
      if (embedTitle) embed.setTitle(embedTitle);
      embed.setTimestamp();
      await targetChannel.send({ embeds: [embed] });
    } else {
      await targetChannel.send({ content: msg });
    }
    return safeReply(interaction, { content: `✅ Message sent to ${targetChannel}.` });
  }

  if (commandName === "accept") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "No permission." });
    const data = findOrder(channel.id);
    if (!data) return safeReply(interaction, { content: "No order in this channel." });
    if (data.status === "approved") return safeReply(interaction, { content: "Already approved." });

    data.status = "approved";
    data.approvedAt = Date.now();
    data.approvedBy = interaction.user.id;
    saveAll();
    trackMessage(channel.id, "SYSTEM", `[APPROVED] Payment approved by ${interaction.user.tag}`);

    let approveEmbed;
    const productKey = getProductKey(data.product);
    if (["killaura", "combat", "autofarm", "fps"].includes(productKey)) {
      const seconds = parseDuration(data.duration);
      const durationMs = seconds ? seconds * 1000 : 0;
      const key = createKey(productKey, durationMs, data.userId);
      const loaderUrl = SCRIPT_LOADERS[productKey];
      const scriptReady = `loadstring(game:HttpGet("${loaderUrl}"))()`;
      const expireText = seconds ? `Starts when first used` : "Lifetime";

      approveEmbed = new EmbedBuilder()
        .setColor(COLOR_GREEN)
        .setTitle("✅ Payment Approved")
        .addFields(
          { name: "Product", value: data.product, inline: true },
          { name: "Duration", value: formatDurasi(seconds), inline: true },
          { name: "Key", value: "```" + key + "```" },
          { name: "Expires", value: expireText, inline: true },
          { name: "Script", value: "```lua\n" + scriptReady + "\n```" }
        )
        .setFooter({ text: "Use /checkmykey to view your key info anytime" })
        .setTimestamp();
    } else {
      approveEmbed = new EmbedBuilder()
        .setColor(COLOR_GREEN)
        .setTitle("✅ Payment Approved")
        .setDescription(`Your **${data.product}** order has been verified!`)
        .setTimestamp();
    }

    await channel.send({
      content: `<@${data.userId}>`,
      embeds: [approveEmbed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`leave_review:${channel.id}`).setLabel("Leave a Review").setStyle(ButtonStyle.Primary).setEmoji("⭐")
        )
      ]
    });
    await channel.setName(`approved-${interaction.user.username.slice(0, 20).toLowerCase()}`).catch(() => {});
    return safeReply(interaction, { content: "✅ Approved and customer notified." });
  }

  if (commandName === "reject") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "No permission." });
    const data = findOrder(channel.id);
    if (!data) return safeReply(interaction, { content: "No order in this channel." });
    if (data.status === "rejected") return safeReply(interaction, { content: "Already rejected." });
    const reason = options.getString("reason") || "No reason provided.";
    data.status = "rejected";
    data.rejectedAt = Date.now();
    data.rejectedBy = interaction.user.id;
    data.rejectionReason = reason;
    saveAll();
    trackMessage(channel.id, "SYSTEM", `[REJECTED] Order rejected by ${interaction.user.tag}. Reason: ${reason}`);
    await channel.send({
      content: `<@${data.userId}>`,
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_RED)
          .setTitle("❌ Payment Rejected")
          .setDescription(`Your payment could not be verified.\n**Reason:** ${reason}`)
          .setTimestamp()
      ]
    });
    await channel.setName(`rejected-${interaction.user.username.slice(0, 20).toLowerCase()}`).catch(() => {});
    return safeReply(interaction, { content: "❌ Rejected." });
  }

  // ── Key Bot Commands ───────────────────────────────────────────────────

  if (commandName === "genkey") {
    if (!canGenkey(member, interaction))
      return interaction.reply({ content: "You don't have permission!", flags: 64 });

    await interaction.deferReply({ flags: 64 });

    const productKey = interaction.options.getString("product");
    const durasiStr   = interaction.options.getString("duration") || "1d";
    const seconds     = parseDuration(durasiStr);
    const durationMs  = seconds ? seconds * 1000 : 0;

    const key = createKey(productKey, durationMs, interaction.user.id);
    const loaderUrl = SCRIPT_LOADERS[productKey];
    const scriptReady = `loadstring(game:HttpGet("${loaderUrl}"))()`;
    const expireText = seconds ? `Starts when first used` : `Lifetime`;

    if (genlogChannelId) {
      const logCh = client.channels.cache.get(genlogChannelId);
      if (logCh) {
        const productNames = { killaura: "Kill Aura", combat: "Combat (Silent Aim)", autofarm: "Auto Farm", fps: "FPS" };
        const logEmbed = new EmbedBuilder()
          .setColor(0x00ff99)
          .setTitle("🔑 Key Generated")
          .addFields(
            { name: "Product", value: productNames[productKey], inline: true },
            { name: "Duration", value: durationLabel(durasiStr), inline: true },
            { name: "Generated by", value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true }
          )
          .setTimestamp();
        logCh.send({ embeds: [logEmbed] }).catch(() => {});
      }
    }

    const productNames = {
      killaura: "Kill Aura",
      combat: "Combat (Silent Aim)",
      autofarm: "Auto Farm",
      fps: "FPS"
    };

    const embed = new EmbedBuilder()
      .setTitle("✅ Key Generated Successfully!")
      .setColor(0x00ff99)
      .addFields(
        { name: "Product", value: productNames[productKey], inline: true },
        { name: "Key", value: "```" + key + "```" },
        { name: "Duration", value: formatDurasi(seconds), inline: true },
        { name: "Expires", value: expireText, inline: true },
        { name: "Script", value: "```lua\n" + scriptReady + "\n```" }
      )
      .setTimestamp()
      .setFooter({ text: `Generated by ${interaction.user.tag}` });

    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === "extendkey") {
    if (!isAdmin(member) && !isAdminByRole(interaction))
      return interaction.reply({ content: "No permission.", flags: 64 });

    const key = options.getString("key");
    const durStr = options.getString("duration");
    const addSeconds = parseDuration(durStr);
    if (addSeconds === 0) return interaction.reply({ content: "❌ Invalid duration.", flags: 64 });

    refreshKeys();
    const entry = keys.find(k => k.key === key);
    if (!entry) return interaction.reply({ content: "❌ Key not found.", flags: 64 });
    if (entry.duration === 0) {
      return interaction.reply({ content: "❌ Cannot extend a permanent key.", flags: 64 });
    }

    if (entry.expires === 0) {
      entry.duration += addSeconds * 1000;
    } else {
      const now = Date.now();
      const currentExpiry = entry.expires;
      entry.expires = currentExpiry < now ? now + addSeconds * 1000 : currentExpiry + addSeconds * 1000;
    }
    saveAll();

    const embed = new EmbedBuilder()
      .setColor(COLOR_GREEN)
      .setTitle("✅ Key Extended")
      .addFields(
        { name: "Key", value: `\`${key}\`` },
        { name: "Added Time", value: formatDurasi(addSeconds), inline: true },
        { name: "Current Expiry", value: entry.expires === 0 ? "Not yet bound" : new Date(entry.expires).toLocaleString("id-ID") }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  if (commandName === "checkkey") {
    if (!isAdmin(member) && !isAdminByRole(interaction))
      return interaction.reply({ content: "No permission.", flags: 64 });

    const key = options.getString("key");
    refreshKeys();
    const data = keys.find(k => k.key === key) || global.trialKeys.find(k => k.key === key);
    if (!data) return interaction.reply({ content: "❌ Key not found.", flags: 64 });

    const now = Date.now();
    const isUnbound = data.expires === 0 && data.duration > 0;
    const isPermanent = data.duration === 0;
    const isExpired = !isUnbound && !isPermanent && data.expires !== 0 && now > data.expires;
    const isActive = !isUnbound && !isPermanent && data.expires !== 0 && now <= data.expires;

    let statusText, expiryDisplay, color;
    if (isPermanent) {
      statusText = "🟢 Permanent";
      expiryDisplay = "Never";
      color = COLOR_MAIN;
    } else if (isUnbound) {
      statusText = "🟡 Unbound (timer not started)";
      expiryDisplay = `Starts when first used\nDuration: ${formatDurasi(data.duration / 1000)}`;
      color = COLOR_YELLOW;
    } else if (isExpired) {
      statusText = "🔴 Expired";
      expiryDisplay = new Date(data.expires).toLocaleString("id-ID");
      color = COLOR_RED;
    } else {
      statusText = "🟢 Active";
      expiryDisplay = new Date(data.expires).toLocaleString("id-ID");
      color = COLOR_MAIN;
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle("🔑 Key Details")
      .addFields(
        { name: "Key", value: `\`${data.key}\`` },
        { name: "Product", value: data.product || "Unknown", inline: true },
        { name: "Created", value: new Date(data.created).toLocaleString("id-ID"), inline: true },
        { name: "Expires", value: expiryDisplay, inline: true },
        { name: "Status", value: statusText, inline: true },
        { name: "HWID", value: data.hwid || "Not bound", inline: true },
        { name: "Type", value: data.trial ? "🔰 Trial" : "💎 Paid", inline: true }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  if (commandName === "revokekey") {
    if (!isAdmin(member) && !isAdminByRole(interaction))
      return interaction.reply({ content: "No permission.", flags: 64 });
    const key = options.getString("key");
    
    // Check paid keys first
    const paidIndex = keys.findIndex(k => k.key === key);
    if (paidIndex !== -1) {
      keys.splice(paidIndex, 1);
      saveAll();
      return interaction.reply({ content: "✅ Key revoked.", flags: 64 });
    }
    
    // Check trial keys
    const trialIndex = global.trialKeys.findIndex(k => k.key === key);
    if (trialIndex !== -1) {
      global.trialKeys.splice(trialIndex, 1);
      return interaction.reply({ content: "✅ Trial key revoked.", flags: 64 });
    }
    
    return interaction.reply({ content: "❌ Key not found.", flags: 64 });
  }

  if (commandName === "resethwid") {
    if (!isAdmin(member) && !isAdminByRole(interaction))
      return interaction.reply({ content: "No permission.", flags: 64 });
    const key = options.getString("key");
    
    // Devs can reset both paid and trial keys
    const paidData = keys.find(k => k.key === key);
    if (paidData) {
      paidData.hwid = null;
      saveAll();
      return interaction.reply({ content: "✅ HWID reset. Key can be bound to a new device.", flags: 64 });
    }
    
    const trialData = global.trialKeys.find(k => k.key === key);
    if (trialData) {
      trialData.hwid = null;
      return interaction.reply({ content: "✅ HWID reset for trial key. Key can be bound to a new device.", flags: 64 });
    }
    
    return interaction.reply({ content: "❌ Key not found.", flags: 64 });
  }

  if (commandName === "keylist") {
    if (!isAdmin(member) && !isAdminByRole(interaction))
      return interaction.reply({ content: "No permission.", flags: 64 });

    refreshKeys();
    
    const filterType = options.getString("type") || "paid";
    let allKeys = [];
    
    if (filterType === "paid") {
      allKeys = [...keys];
    } else if (filterType === "trial") {
      allKeys = [...global.trialKeys];
    }
    
    if (allKeys.length === 0) return interaction.reply({ content: `📭 No ${filterType} keys in database.`, flags: 64 });

    const itemsPerPage = 10;
    const pages = [];
    for (let i = 0; i < allKeys.length; i += itemsPerPage) {
      pages.push(allKeys.slice(i, i + itemsPerPage));
    }

    let currentPage = 0;

    const generateEmbed = (page) => {
      const now = Date.now();
      const keyList = pages[page];
      const typeLabel = filterType === "trial" ? "Trial" : "Paid";
      const embed = new EmbedBuilder()
        .setColor(COLOR_MAIN)
        .setTitle(`🔑 ${typeLabel} Key List (Page ${page + 1}/${pages.length})`)
        .setFooter({ text: `${allKeys.length} total ${filterType} keys` });

      keyList.forEach(data => {
        const isUnbound = data.expires === 0 && data.duration > 0;
        const isPermanent = data.duration === 0;
        const isExpired = !isUnbound && !isPermanent && data.expires !== 0 && now > data.expires;
        const isActive = !isUnbound && !isPermanent && data.expires !== 0 && now <= data.expires;

        let statusIcon, expText;
        if (isPermanent) {
          statusIcon = "🟢";
          expText = "∞";
        } else if (isUnbound) {
          statusIcon = "🟡";
          expText = `Unbound (${formatDurasi(data.duration / 1000)})`;
        } else if (isExpired) {
          statusIcon = "🔴";
          expText = new Date(data.expires).toLocaleString("id-ID");
        } else {
          statusIcon = "🟢";
          expText = new Date(data.expires).toLocaleString("id-ID");
        }

        const ownerText = data.userId ? `<@${data.userId}>` : "None";

        embed.addFields({
          name: `${statusIcon} ${data.key}`,
          value: `**Expires:** ${expText}\n**HWID:** ${data.hwid || "None"}\n**Product:** ${data.product || "N/A"}\n**Owner:** ${ownerText}\n**Type:** ${data.trial ? "🔰 Trial" : "💎 Paid"}`,
          inline: false
        });
      });

      return embed;
    };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`keylist_prev_${filterType}`).setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId(`keylist_next_${filterType}`).setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(pages.length <= 1)
    );

    const message = await interaction.reply({
      embeds: [generateEmbed(0)],
      components: [row],
      flags: 64,
      fetchReply: true
    });

    if (pages.length <= 1) return;

    const collector = message.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async (btnInteraction) => {
      if (btnInteraction.user.id !== interaction.user.id) {
        return btnInteraction.reply({ content: "You can't use this.", flags: 64 });
      }

      if (btnInteraction.customId === `keylist_prev_${filterType}`) {
        currentPage--;
      } else if (btnInteraction.customId === `keylist_next_${filterType}`) {
        currentPage++;
      }

      const newRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`keylist_prev_${filterType}`).setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
        new ButtonBuilder().setCustomId(`keylist_next_${filterType}`).setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(currentPage === pages.length - 1)
      );

      await btnInteraction.update({ embeds: [generateEmbed(currentPage)], components: [newRow] });
    });

    collector.on("end", async () => {
      try {
        await message.edit({ components: [] });
      } catch {}
    });

    return;
  }

  // ── /checkmykey (public, with automatic binding) ─────────────────────
  if (commandName === "checkmykey") {
    const key = options.getString("key");
    const userId = interaction.user.id;

    refreshKeys();
    const diskIndex = keys.findIndex(k => k.key === key);
    let data = null;
    let isTrialKey = false;

    if (diskIndex !== -1) {
      data = keys[diskIndex];
      if (!data.userId) {
        data.userId = userId;
        keys[diskIndex] = data;
        saveAll();
        console.log(`[BIND] Key ${key} bound to Discord user ${userId}`);
      }
    } else {
      const trialEntry = global.trialKeys.find(k => k.key === key);
      if (trialEntry) {
        data = trialEntry;
        isTrialKey = true;
      }
    }

    if (!data) return interaction.reply({ content: "❌ Key not found.", flags: 64 });

    const now = Date.now();
    const isUnbound = data.expires === 0 && data.duration > 0;
    const isPermanent = data.duration === 0;
    const isExpired = !isUnbound && !isPermanent && data.expires !== 0 && now > data.expires;
    const isActive = !isUnbound && !isPermanent && data.expires !== 0 && now <= data.expires;

    let statusText, expiryDisplay, color;
    if (isPermanent) {
      statusText = "🟢 Permanent";
      expiryDisplay = "Never";
      color = COLOR_MAIN;
    } else if (isUnbound) {
      statusText = "🟡 Unbound (timer not started)";
      expiryDisplay = `Starts when first used\nDuration: ${formatDurasi(data.duration / 1000)}`;
      color = COLOR_YELLOW;
    } else if (isExpired) {
      statusText = "🔴 Expired";
      expiryDisplay = new Date(data.expires).toLocaleString("id-ID");
      color = COLOR_RED;
    } else {
      statusText = "🟢 Active";
      expiryDisplay = new Date(data.expires).toLocaleString("id-ID");
      color = COLOR_MAIN;
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle("🔑 Key Details")
      .addFields(
        { name: "Key", value: `\`${data.key}\`` },
        { name: "Product", value: data.product || "Unknown", inline: true },
        { name: "Created", value: new Date(data.created).toLocaleString("id-ID"), inline: true },
        { name: "Expires", value: expiryDisplay, inline: true },
        { name: "Status", value: statusText, inline: true },
        { name: "HWID", value: data.hwid || "Not bound", inline: true },
        { name: "Type", value: data.trial ? "🔰 Trial" : "💎 Paid", inline: true }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  // ── /setuptrials (admin only, fixed duration display) ─────────────────
  if (commandName === "setuptrials") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "No permission." });

    const productKey = options.getString("product");
    const durStr = options.getString("duration");
    const expireStr = options.getString("expires");

    const seconds = parseDuration(durStr);
    const expireSeconds = parseDuration(expireStr);
    const expireAt = Date.now() + expireSeconds * 1000;

    const productNames = { killaura: "Kill Aura", combat: "Combat (Silent Aim)", autofarm: "Auto Farm", fps: "FPS" };

    const embed = new EmbedBuilder()
      .setColor(COLOR_MAIN)
      .setTitle(`🎁 Free Trial — ${productNames[productKey]}`)
      .setDescription(`Get a **FREE ${durationLabel(durStr)}** trial of **${productNames[productKey]}**!`)
      .addFields(
        { name: "📦 Product", value: productNames[productKey], inline: true },
        { name: "⏱️ Key Duration", value: durationLabel(durStr), inline: true },
        { name: "⏰ Claim Period", value: `Expires <t:${Math.floor(expireAt / 1000)}:R>`, inline: true }
      )
      .setFooter({ text: "One trial per user • Limited time offer" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("trial_redeem").setLabel("🎁 Redeem Trial Key").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("trial_loadstring").setLabel("📋 Get Loadstring").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("trial_resethwid").setLabel("🔄 Reset HWID").setStyle(ButtonStyle.Secondary)
    );

    const msg = await channel.send({ embeds: [embed], components: [row] });

    trials.push({
      messageId: msg.id,
      channelId: channel.id,
      guildId: guild.id,
      product: productKey,
      durationMs: seconds * 1000,
      expiresAt: expireAt
    });
    saveAll();

    setTimeout(async () => {
      try {
        const fetched = await channel.messages.fetch(msg.id).catch(() => null);
        if (fetched) {
          await fetched.edit({ components: [] });
          const expiredEmbed = EmbedBuilder.from(fetched.embeds[0])
            .setFooter({ text: "Trial claim period has ended." });
          await fetched.edit({ embeds: [expiredEmbed] });
        }
      } catch (e) {
        console.error("[TRIAL EXPIRE] Error updating message:", e);
      }
    }, expireSeconds * 1000);

    return safeReply(interaction, { content: `✅ Trial panel sent for **${productNames[productKey]}** (${durationLabel(durStr)})! It will expire <t:${Math.floor(expireAt / 1000)}:R>.` });
  }
}

/* =====================================================
   BUTTON HANDLER
===================================================== */

async function handleButton(interaction) {
  const { customId, guild, user, member, channel } = interaction;

  if (customId === "trial_redeem") {
    const trial = trials.find(t => t.messageId === interaction.message.id);
    if (!trial) return safeReply(interaction, { content: "This trial panel is no longer valid." });
    if (Date.now() > trial.expiresAt) return interaction.reply({ content: "❌ This trial offer has expired.", flags: 64 });

    const userId = user.id;
    const alreadyClaimed = keys.some(k => k.userId === userId && k.trial === true) ||
                           global.trialKeys.some(k => k.userId === userId);
    if (alreadyClaimed) return interaction.reply({ content: "❌ You have already claimed a trial key before.", flags: 64 });

    const key = createKey(trial.product, trial.durationMs, userId, true);
    const productNames = { killaura: "Kill Aura", combat: "Combat (Silent Aim)", autofarm: "Auto Farm", fps: "FPS" };
    const durationText = formatDurasi(trial.durationMs / 1000);
    
    const redeemEmbed = new EmbedBuilder()
      .setColor(COLOR_GREEN)
      .setTitle("🎁 Trial Key Redeemed!")
      .setDescription(`<@${userId}>, here's your **FREE ${productNames[trial.product]}** trial key!`)
      .addFields(
        { name: "📦 Product", value: productNames[trial.product], inline: true },
        { name: "⏱️ Duration", value: durationText, inline: true },
        { name: "🔑 Key", value: "```" + key + "```" },
        { name: "📋 Instructions", value: "Use `/checkmykey` to view your key details.\nClick **Get Loadstring** for the executor script." }
      )
      .setFooter({ text: "This is a trial key • One-time use only" })
      .setTimestamp();

    await channel.send({ 
      content: `<@${userId}>`,
      embeds: [redeemEmbed]
    });
    return interaction.reply({ content: "✅ Your trial key has been generated! Check the channel above.", flags: 64 });
  }

  if (customId === "trial_loadstring") {
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId("modal_trial_loadstring")
        .setTitle("Get Loadstring")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("key_input")
              .setLabel("Enter your key")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(50)
          )
        )
    );
  }

  if (customId === "trial_resethwid") {
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId("modal_trial_resethwid")
        .setTitle("Reset HWID")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("key_input")
              .setLabel("Enter your key")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(50)
          )
        )
    );
  }

  if (customId === "open_support") {
    const openCount = orders.filter(o => o.userId === user.id && ["payment", "waiting", "approved"].includes(o.status)).length;
    if (openCount >= CONFIG.MAX_OPEN_TICKETS_PER_USER) {
      return safeReply(interaction, { content: `❌ You already have ${CONFIG.MAX_OPEN_TICKETS_PER_USER} open tickets.` });
    }
    const ch = await guild.channels.create({
      name: `support-${user.username}`.substring(0, 32).toLowerCase(),
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    orders.push({
      channelId: ch.id,
      userId: user.id,
      product: "Support",
      status: "open",
      created: Date.now()
    });
    saveAll();
    trackMessage(ch.id, "SYSTEM", `[OPENED] Support ticket by ${user.tag}`);
    await ch.send({
      content: `<@${user.id}>`,
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_MAIN)
          .setTitle("🎫 Support Ticket")
          .setDescription("Describe your issue. Staff will assist shortly.")
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("close_support").setLabel("Close Ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒")
        )
      ]
    });
    return safeReply(interaction, { content: `✅ Support ticket created: ${ch}` });
  }

  if (customId === "close_support") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "No permission." });
    trackMessage(channel.id, "SYSTEM", `[CLOSED] Support ticket closed by ${user.tag}`);
    await sendTranscript(guild, channel.id, channel.name, user.id);
    await interaction.reply({ content: "🚫 Transcript saved. Deleting in 5 seconds...", flags: 64 });
    setTimeout(() => channel.delete().catch(err => console.error("[CLOSE_SUPPORT]", err.message)), 5000);
    return;
  }

  if (customId.startsWith("paid_")) {
    const ticketId = customId.split("_")[1];
    const data = findOrder(ticketId);
    if (!data) return safeReply(interaction, { content: "Order not found." });
    if (data.userId !== user.id) return safeReply(interaction, { content: "Not your order." });
    if (data.status !== "payment") return safeReply(interaction, { content: "Already submitted." });
    data.status = "waiting";
    data.paidAt = Date.now();
    saveAll();
    trackMessage(ticketId, user.tag, `[PAID] Marked payment as sent`);
    await interaction.reply({ content: "✅ Payment submitted. Awaiting admin verification.", flags: 64 });

    const logCh = logChannelId ? guild.channels.cache.get(logChannelId) : null;
    if (logCh) {
      logCh.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_YELLOW)
            .setTitle(`💸 Payment Submitted — #${data.orderId}`)
            .setDescription(`<@${user.id}> marked their order as paid.`)
            .addFields(
              { name: "Product", value: `${data.product} (${data.variant || ""})`, inline: true },
              { name: "Price", value: moneyIDR(data.price), inline: true },
              { name: "Channel", value: `<#${ticketId}>`, inline: true }
            )
            .setTimestamp()
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`approve_${ticketId}`).setLabel("Approve").setStyle(ButtonStyle.Success).setEmoji("✅"),
            new ButtonBuilder().setCustomId(`reject_${ticketId}`).setLabel("Reject").setStyle(ButtonStyle.Danger).setEmoji("❌")
          )
        ]
      });
    }
    const targetCh = guild.channels.cache.get(ticketId);
    if (targetCh) {
      targetCh.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_YELLOW)
            .setTitle("💸 Payment Submitted")
            .setDescription("Your payment is under review. An admin will verify it shortly.")
        ]
      });
    }
    return;
  }

  if (customId.startsWith("approve_")) {
    if (!isAdmin(member)) return safeReply(interaction, { content: "No permission." });
    const ticketId = customId.split("_")[1];
    const data = findOrder(ticketId);
    if (!data) return safeReply(interaction, { content: "Order not found." });
    if (data.status === "approved") return safeReply(interaction, { content: "Already approved." });

    data.status = "approved";
    data.approvedAt = Date.now();
    data.approvedBy = user.id;
    saveAll();
    trackMessage(ticketId, "SYSTEM", `[APPROVED] Payment approved by ${user.tag}`);

    const targetCh = guild.channels.cache.get(ticketId);
    if (targetCh) {
      let approveEmbed;
      const productKey = getProductKey(data.product);
      if (["killaura", "combat", "autofarm", "fps"].includes(productKey)) {
        const seconds = parseDuration(data.duration);
        const durationMs = seconds ? seconds * 1000 : 0;
        const key = createKey(productKey, durationMs, data.userId);
        const loaderUrl = SCRIPT_LOADERS[productKey];
        const scriptReady = `loadstring(game:HttpGet("${loaderUrl}"))()`;
        const expireText = seconds ? `Starts when first used` : `Lifetime`;

        approveEmbed = new EmbedBuilder()
          .setColor(COLOR_GREEN)
          .setTitle("✅ Payment Approved")
          .addFields(
            { name: "Product", value: data.product, inline: true },
            { name: "Duration", value: formatDurasi(seconds), inline: true },
            { name: "Key", value: "```" + key + "```" },
            { name: "Expires", value: expireText, inline: true },
            { name: "Script", value: "```lua\n" + scriptReady + "\n```" }
          )
          .setFooter({ text: "Use /checkmykey to view your key info anytime" })
          .setTimestamp();
      } else {
        approveEmbed = new EmbedBuilder()
          .setColor(COLOR_GREEN)
          .setTitle("✅ Payment Approved")
          .setDescription(`Your **${data.product}** order has been verified!`)
          .setTimestamp();
      }

      targetCh.send({
        content: `<@${data.userId}>`,
        embeds: [approveEmbed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`leave_review:${ticketId}`).setLabel("Leave a Review").setStyle(ButtonStyle.Primary).setEmoji("⭐")
          )
        ]
      });
    }

    try {
      await interaction.update({
        embeds: [new EmbedBuilder().setColor(COLOR_GREEN).setDescription(`✅ Order #${data.orderId} approved by <@${user.id}>`)],
        components: []
      });
    } catch {
      safeReply(interaction, { content: `✅ Approved #${data.orderId}.` });
    }
    return;
  }

  if (customId.startsWith("reject_")) {
    if (!isAdmin(member)) return safeReply(interaction, { content: "No permission." });
    const ticketId = customId.split("_")[1];
    const data = findOrder(ticketId);
    if (!data) return safeReply(interaction, { content: "Order not found." });
    if (data.status === "rejected") return safeReply(interaction, { content: "Already rejected." });

    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`modal_reject:${ticketId}`)
        .setTitle("Reject Order")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("reason")
              .setLabel("Reason for rejection")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(500)
          )
        )
    );
  }

  if (customId.startsWith("leave_review:")) {
    const ticketId = customId.split(":")[1];
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`modal_review:${ticketId}`)
        .setTitle("Leave a Review ⭐")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("rating").setLabel("Rating (1–5)").setStyle(TextInputStyle.Short).setPlaceholder("5").setRequired(true).setMaxLength(1)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("review_text").setLabel("Your review").setStyle(TextInputStyle.Paragraph).setPlaceholder("Tell us about your experience...").setRequired(true).setMaxLength(500)
          )
        )
    );
  }
}

/* =====================================================
   MODAL HANDLER
===================================================== */

async function handleModal(interaction) {
  const { customId, guild, user } = interaction;

  if (customId === "modal_trial_loadstring") {
    const key = interaction.fields.getTextInputValue("key_input").trim();
    const data = keys.find(k => k.key === key) || global.trialKeys.find(k => k.key === key);
    if (!data) return interaction.reply({ content: "❌ Key not found.", flags: 64 });
    if (data.userId !== user.id) return interaction.reply({ content: "❌ This key does not belong to you.", flags: 64 });

    // Only return the loadstring line, no _G.KEY assignment
    const loaderUrl = SCRIPT_LOADERS[data.product] || "https://example.com/script";
    const scriptLoadOnly = `loadstring(game:HttpGet("${loaderUrl}"))()`;
    return interaction.reply({ content: `Your loadstring:\n\`\`\`lua\n${scriptLoadOnly}\n\`\`\``, flags: 64 });
  }

  if (customId === "modal_trial_resethwid") {
    const key = interaction.fields.getTextInputValue("key_input").trim();
    // Only trial keys can be reset via this button modal
    const trialData = global.trialKeys.find(k => k.key === key);
    if (!trialData) return interaction.reply({ content: "❌ Key not found or not a trial key. Use /resethwid command for paid keys.", flags: 64 });
    if (trialData.userId !== user.id) return interaction.reply({ content: "❌ This key does not belong to you.", flags: 64 });

    trialData.hwid = null;
    return interaction.reply({ content: "✅ HWID reset. The key can now be bound to a new device.", flags: 64 });
  }

  if (customId.startsWith("modal_reject:")) {
    const [, ticketId] = customId.split(":");
    const reason = interaction.fields.getTextInputValue("reason");
    const data = findOrder(ticketId);
    if (!data) return safeReply(interaction, { content: "Order not found." });
    data.status = "rejected";
    data.rejectedAt = Date.now();
    data.rejectedBy = user.id;
    data.rejectionReason = reason;
    saveAll();
    trackMessage(ticketId, "SYSTEM", `[REJECTED] Order rejected by ${user.tag}. Reason: ${reason}`);
    const targetCh = guild.channels.cache.get(ticketId);
    if (targetCh) {
      targetCh.send({
        content: `<@${data.userId}>`,
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_RED)
            .setTitle("❌ Order Rejected")
            .setDescription(`Reason: ${reason}`)
        ]
      });
    }
    return safeReply(interaction, { content: `❌ Order #${data.orderId} rejected.` });
  }

  if (customId.startsWith("modal_review:")) {
    const [, ticketId] = customId.split(":");
    const rating = interaction.fields.getTextInputValue("rating").trim();
    const reviewText = interaction.fields.getTextInputValue("review_text").trim();
    const stars = parseInt(rating, 10);
    if (isNaN(stars) || stars < 1 || stars > 5) return safeReply(interaction, { content: "Rating must be 1–5." });
    const starStr = "⭐".repeat(stars) + "☆".repeat(5 - stars);
    const data = findOrder(ticketId);
    const reviewCh = reviewChannelId ? guild.channels.cache.get(reviewChannelId) : guild.channels.cache.find(c => c.name === "reviews");
    trackMessage(ticketId, user.tag, `[REVIEW] ${stars}/5 — ${reviewText}`);

    if (reviewCh) {
      const reviewEmbed = new EmbedBuilder()
        .setColor(COLOR_YELLOW)
        .setTitle(`${starStr} New Review`)
        .setDescription(`> ${reviewText}`)
        .addFields(
          { name: "Reviewer", value: `<@${user.id}>`, inline: true },
          { name: "Product", value: data?.product || "Unknown", inline: true }
        )
        .setFooter({ text: `Order #${data?.orderId || "N/A"}` })
        .setTimestamp();

      reviewCh.send({ embeds: [reviewEmbed] }).catch(() => {});
    }
    return safeReply(interaction, { content: `✅ Thanks for your review! ${starStr}` });
  }
}

/* =====================================================
   SELECT MENU HANDLER
===================================================== */

async function resetDropdown(interaction) {
  try {
    const freshMenu = new StringSelectMenuBuilder()
      .setCustomId("shop_category_select")
      .setPlaceholder("📂 Choose a category... / Pilih kategori...")
      .addOptions([
        { label: "Help with issues / Bantuan", description: "Problems with the software / Masalah dengan software", emoji: "❓", value: "support_help" },
        { label: "Payment Inquiries / Pembayaran", description: "Payment questions / Pertanyaan pembayaran", emoji: "💳", value: "support_payment" },
        { label: "Gift Card (PayPal Rewarble)", description: "Purchase a gift card / Beli gift card", emoji: "🎁", value: "support_gift" },
        { label: "Purchase / Beli (Script/External)", description: "Buy scripts or external products / Beli script atau produk eksternal", emoji: "🛒", value: "product" },
        { label: "Pricing / Harga", description: "View product prices / Lihat harga produk", emoji: "💰", value: "pricing" }
      ]);
    await interaction.message.edit({ components: [new ActionRowBuilder().addComponents(freshMenu)] });
  } catch (e) {
    console.error("[resetDropdown]", e.message);
  }
}

function buildDurationMenu(ticketId, productKey) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`choose_duration:${ticketId}`)
    .setPlaceholder("Select duration");

  for (const [dur, price] of Object.entries(PRICES[productKey])) {
    menu.addOptions({
      label: durationLabel(dur),
      value: dur,
      description: formatPriceIDRUSD(price)
    });
  }

  return menu;
}

async function handleSelect(interaction) {
  const { customId, guild, user, channel } = interaction;
  activityMap.set(channel.id, Date.now());

  if (customId === "shop_category_select") {
    const choice = interaction.values[0];

    if (choice === "pricing") {
      await interaction.reply({ embeds: [pricingDetailEmbed()], flags: 64 });
      return resetDropdown(interaction);
    }

    if (choice === "product") {
      const openCount = orders.filter(o => o.userId === user.id && ["payment", "waiting", "approved"].includes(o.status)).length;
      if (openCount >= CONFIG.MAX_OPEN_TICKETS_PER_USER) {
        await interaction.reply({ content: `❌ You already have ${CONFIG.MAX_OPEN_TICKETS_PER_USER} open tickets.`, flags: 64 });
        return resetDropdown(interaction);
      }

      const ch = await guild.channels.create({
        name: `order-${user.username}`.substring(0, 28).toLowerCase(),
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      const orderId = orders.length + 1;
      orders.push({
        orderId,
        channelId: ch.id,
        userId: user.id,
        product: null,
        variant: null,
        duration: null,
        price: null,
        status: "category_selection",
        created: Date.now(),
        paymentMethod: null
      });
      saveAll();
      trackMessage(ch.id, "SYSTEM", `[OPENED] Product ticket by ${user.tag} – awaiting category selection`);

      const categoryMenu = new StringSelectMenuBuilder()
        .setCustomId(`choose_category:${ch.id}`)
        .setPlaceholder("📂 Select category...")
        .addOptions([
          { label: "Script", description: "Choose script type", emoji: "📜", value: "script" },
          { label: "External", description: "External cheat", emoji: "🎮", value: "external" }
        ]);

      await ch.send({
        content: `<@${user.id}>`,
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_MAIN)
            .setTitle("🛒 Product Selection")
            .setDescription("Welcome! Please choose a category below to continue.")
        ],
        components: [new ActionRowBuilder().addComponents(categoryMenu)]
      });

      await interaction.reply({ content: `✅ Product ticket created: ${ch}`, flags: 64 });
      return resetDropdown(interaction);
    }

    const openCount = orders.filter(o => o.userId === user.id && ["payment", "waiting", "approved"].includes(o.status)).length;
    if (openCount >= CONFIG.MAX_OPEN_TICKETS_PER_USER) {
      await interaction.reply({ content: `❌ You already have ${CONFIG.MAX_OPEN_TICKETS_PER_USER} open tickets.`, flags: 64 });
      return resetDropdown(interaction);
    }

    let ticketName, categoryTitle, categoryDescription;
    if (choice === "support_help") {
      ticketName = `help-${user.username}`.substring(0, 32).toLowerCase();
      categoryTitle = "❓ Help & Questions";
      categoryDescription = "You have opened a **Help** ticket. Describe your issue or question below.";
    } else if (choice === "support_payment") {
      ticketName = `payment-${user.username}`.substring(0, 32).toLowerCase();
      categoryTitle = "💳 Payment Inquiries";
      categoryDescription = "You have opened a **Payment Inquiries** ticket. Please provide details about your payment or issue.";
    } else if (choice === "support_gift") {
      ticketName = `gift-${user.username}`.substring(0, 32).toLowerCase();
      categoryTitle = "🎁 Gift Card Purchase";
      categoryDescription = "You have selected to purchase a **$6 PayPal gift card by Rewarble**. Please send the gift card to us in this ticket.";
    } else {
      return interaction.reply({ content: "Unknown option.", flags: 64 });
    }

    const ch = await guild.channels.create({
      name: ticketName,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });

    orders.push({
      channelId: ch.id,
      userId: user.id,
      product: categoryTitle,
      status: "open",
      created: Date.now()
    });
    saveAll();
    trackMessage(ch.id, "SYSTEM", `[OPENED] ${categoryTitle} ticket by ${user.tag}`);

    await ch.send({
      content: `<@${user.id}>`,
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_MAIN)
          .setTitle(categoryTitle)
          .setDescription(categoryDescription)
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("close_support").setLabel("Close Ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒")
        )
      ]
    });

    await interaction.reply({ content: `✅ Ticket created: ${ch}`, flags: 64 });
    return resetDropdown(interaction);
  }

  if (customId.startsWith("choose_category:")) {
    const [, ticketId] = customId.split(":");
    const data = findOrder(ticketId);
    if (!data || data.userId !== user.id) return safeReply(interaction, { content: "Not your order." });

    const category = interaction.values[0];

    if (category === "external") {
      data.product = "Roblox External";
      saveAll();
      const durMenu = new StringSelectMenuBuilder()
        .setCustomId(`choose_duration:${ticketId}`)
        .setPlaceholder("Select duration")
        .addOptions([
          { label: "Lifetime", value: "perm", description: formatPriceIDRUSD(PRICES.external["perm"]) }
        ]);
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_MAIN)
            .setTitle("🎮 External — Roblox External")
            .setDescription("Only lifetime option available.")
        ],
        components: [new ActionRowBuilder().addComponents(durMenu)]
      });
      return;
    }

    if (category === "script") {
      const subMenu = new StringSelectMenuBuilder()
        .setCustomId(`choose_subcategory:${ticketId}`)
        .setPlaceholder("Select script type...")
        .addOptions([
          { label: "Kill Aura",           value: "killaura", description: "Aimbot / Kill aura" },
          { label: "Combat (Silent Aim)", value: "combat",   description: "Silent Aim included" },
          { label: "Auto Farm",           value: "autofarm", description: "Auto farming features" },
          { label: "FPS",                 value: "fps",      description: "FPS Booster" }
        ]);

      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_MAIN)
            .setTitle("📜 Choose Script Type")
            .setDescription("Select the type of script you want.")
        ],
        components: [new ActionRowBuilder().addComponents(subMenu)]
      });
      return;
    }

    return safeReply(interaction, { content: "Invalid category." });
  }

  if (customId.startsWith("choose_subcategory:")) {
    const [, ticketId] = customId.split(":");
    const data = findOrder(ticketId);
    if (!data || data.userId !== user.id) return safeReply(interaction, { content: "Not your order." });

    const subValue = interaction.values[0];
    const names = { killaura: "Kill Aura", combat: "Combat (Silent Aim)", autofarm: "Auto Farm", fps: "FPS" };
    data.product = names[subValue] || subValue;
    saveAll();

    const durMenu = buildDurationMenu(ticketId, subValue);

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_MAIN)
          .setTitle(`⚙️ ${data.product}`)
          .setDescription("Select a duration below.")
      ],
      components: [new ActionRowBuilder().addComponents(durMenu)]
    });
    return;
  }

  if (customId.startsWith("choose_duration:")) {
    const [, ticketId] = customId.split(":");
    const data = findOrder(ticketId);
    if (!data || data.userId !== user.id) return safeReply(interaction, { content: "Not your order." });

    const dur = interaction.values[0];
    const productKey = getProductKey(data.product);
    if (!productKey) return safeReply(interaction, { content: "Unknown product." });
    const price = PRICES[productKey]?.[dur];
    if (!price) return safeReply(interaction, { content: "Invalid duration." });

    data.duration = dur;
    data.variant = durationLabel(dur);
    data.price = price;
    data.status = "payment";
    saveAll();

    trackMessage(ticketId, user.tag, `[DURATION SELECTED] ${data.product} – ${durationLabel(dur)} at ${moneyIDR(price)} (${getUSDApprox(price)})`);

    const qris = { label: "QRIS", emoji: "🏦", instructions: "Scan QRIS to pay the exact amount.", image: QRIS_IMAGE };
    const paypal = { label: "PayPal", emoji: "💳", instructions: "Send as Friends & Family.", address: PAYPAL_EMAIL };
    const ltc = { label: "LTC", emoji: "🪙", instructions: "Send to LTC address.", address: LTC_TEXT };

    const ch = guild.channels.cache.get(ticketId);
    if (!ch) return safeReply(interaction, { content: "Ticket channel not found." });

    await ch.send({
      content: `<@${user.id}>`,
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_MAIN)
          .setTitle("🏦 QRIS Payment")
          .setDescription(qris.instructions)
          .addFields(
            { name: "Amount", value: `${moneyIDR(price)}\n${getUSDApprox(price)}`, inline: true }
          )
          .setImage(qris.image)
      ]
    });

    await ch.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_MAIN)
          .setTitle("💳 Other Methods")
          .addFields(
            { name: "PayPal", value: `${paypal.instructions}\n**Address:** \`${paypal.address}\``, inline: false },
            { name: "LTC", value: `${ltc.instructions}\n**Address:** \`${ltc.address}\``, inline: false }
          )
      ]
    });

    await ch.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_YELLOW)
          .setTitle(`🛒 Order #${data.orderId} — ${data.product}`)
          .setDescription(`**1.** Select payment method below\n**2.** Pay using instructions above\n**3.** Click **I've Paid ✅**`)
          .addFields(
            { name: "Product", value: data.product, inline: true },
            { name: "Duration", value: durationLabel(dur), inline: true },
            { name: "Price", value: `${moneyIDR(price)}\n${getUSDApprox(price)}`, inline: true },
            { name: "Status", value: statusBadge("payment"), inline: true }
          )
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`select_payment:${ticketId}`)
            .setPlaceholder("Choose payment method")
            .addOptions([
              { label: "QRIS", value: "qris", emoji: "🏦" },
              { label: "PayPal", value: "paypal", emoji: "💳" },
              { label: "LTC", value: "ltc", emoji: "🪙" }
            ])
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`paid_${ticketId}`).setLabel("I've Paid ✅").setStyle(ButtonStyle.Success)
        )
      ]
    });

    return interaction.update({ content: "✅ Duration selected! Check the payment instructions above.", embeds: [], components: [] });
  }

  if (customId.startsWith("select_payment:")) {
    const [, ticketId] = customId.split(":");
    const data = findOrder(ticketId);
    if (!data || data.userId !== user.id) return safeReply(interaction, { content: "No active order found." });
    const methodKey = interaction.values[0];
    let method;
    if (methodKey === "qris") method = { label: "QRIS", emoji: "🏦", image: QRIS_IMAGE };
    else if (methodKey === "paypal") method = { label: "PayPal", emoji: "💳" };
    else if (methodKey === "ltc") method = { label: "LTC", emoji: "🪙" };
    else return safeReply(interaction, { content: "Invalid method." });
    data.paymentMethod = method.label;
    saveAll();
    trackMessage(ticketId, user.tag, `[PAYMENT METHOD] Selected: ${method.label}`);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_GREEN)
          .setDescription(`✅ Payment method set to **${method.emoji} ${method.label}**. Complete your payment and click **I've Paid ✅**.`)
      ],
      flags: 64
    });
  }
}

/* =====================================================
   MESSAGE TRACKING FOR TRANSCRIPTS
===================================================== */

client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;
  const name = msg.channel.name || "";
  if (
    name.startsWith("order-") ||
    name.startsWith("support-") ||
    name.startsWith("help-") ||
    name.startsWith("payment-") ||
    name.startsWith("gift-") ||
    name.startsWith("claimed-") ||
    name.startsWith("approved-") ||
    name.startsWith("rejected-")
  ) {
    activityMap.set(msg.channel.id, Date.now());
    trackMessage(msg.channel.id, `${msg.author.tag}`, msg.content || "[attachment/embed]");
  }
});

/* =====================================================
   LOGIN
===================================================== */

const missing = ["TOKEN", "CLIENT_ID"].filter(k => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

client.login(TOKEN).catch(err => {
  console.error("❌ Login failed:", err.message);
  process.exit(1);
});
