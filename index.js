require("./server.js")
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
const LOADER_URL = process.env.LOADER_URL || "";
const BANNER_URL = process.env.BANNER_URL || "";
const QRIS_IMAGE = process.env.QRIS_IMAGE || "https://cdn.discordapp.com/attachments/1491728132661842061/1491880425923153991/Qris_gw.png";
const PAYPAL_EMAIL = process.env.PAYPAL_EMAIL || "phantom.wtfff@gmail.com";
const LTC_TEXT = process.env.LTC_TEXT || "Unavailable";

const SCRIPT_URL = LOADER_URL;   // used in genkey embed

/* =====================================================
   STATIC CONFIG
===================================================== */

const CONFIG = {
  BOT_NAME: "Phantom.wtf",
  OWNER_ID: "961847981684973569",
  ADMIN_ROLE_NAME: "dev",
  AUTO_CLOSE_HOURS: 24,
  CURRENCY_RATE: 17000,
  BUYER_ROLE_NAME: "Subscriptions",
  COOLDOWN_MS: 3000,
  MAX_OPEN_TICKETS_PER_USER: 2,
  TRANSCRIPT_CHANNEL_NAME: "transcript"
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
  transcript: path.join(DATA_DIR, "transcripts.json")
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

for (const file of Object.values(FILES)) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
}

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let orders = readJSON(FILES.orders);
let keys = readJSON(FILES.keys);
let reviews = readJSON(FILES.reviews);
let logs = readJSON(FILES.logs);
let transcripts = readJSON(FILES.transcript);

let logChannelId = null;
let reviewChannelId = null;
let transcriptChannelId = null;

const ticketMessages = new Map();
const activityMap = new Map();
const commandCooldown = new Collection();

/* =====================================================
   UTILITIES
===================================================== */

function isAdmin(member) {
  return (
    member.id === CONFIG.OWNER_ID ||
    member.roles.cache.some(r => r.name === CONFIG.ADMIN_ROLE_NAME)
  );
}

function isAdminByRole(interaction) {
  const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
  if (!ADMIN_ROLE_ID) return false;
  return interaction.member.roles.cache.has(ADMIN_ROLE_ID);
}

// ── Unified duration parser (handles hours & days) ───────────────────────
function parseDuration(val) {
  if (!val || val === "perm") return 0;                 // permanent
  const unit = val.slice(-1);
  const num  = parseInt(val.slice(0, -1));
  if (unit === "h") return num * 3600;                 // hours to seconds
  if (unit === "d") return num * 86400;                // days to seconds
  return 86400;                                        // default 1 day
}

// ── Duration label for slash command choices ─────────────────────────────
function durationLabel(val) {
  if (val === "1h")  return "1 Hour";
  if (val === "3h")  return "3 Hours";
  if (val === "6h")  return "6 Hours";
  if (val === "12h") return "12 Hours";
  if (val === "1d")  return "1 Day";
  if (val === "3d")  return "3 Days";
  if (val === "7d")  return "7 Days";
  if (val === "30d") return "30 Days";
  if (val === "perm") return "Lifetime";
  return "Unknown";
}

// ── Human‑readable seconds (for embed) ────────────────────────────────────
function formatDurasi(detik) {
  if (!detik) return "Permanent";
  const jam  = Math.floor(detik / 3600);
  const hari = Math.floor(jam / 24);
  if (hari >= 1) return `${hari} hari`;
  return `${jam} jam`;
}

function randomID(len = 10) {
  return crypto.randomBytes(len).toString("hex").slice(0, len);
}

function generateKey() {
  return (
    randomID(4).toUpperCase() + "-" +
    randomID(4).toUpperCase() + "-" +
    randomID(4).toUpperCase() + "-" +
    randomID(4).toUpperCase()
  );
}

function saveAll() {
  writeJSON(FILES.orders, orders);
  writeJSON(FILES.keys, keys);
  writeJSON(FILES.reviews, reviews);
  writeJSON(FILES.logs, logs);
  writeJSON(FILES.transcript, transcripts);
}

function findOrder(channelId) {
  return orders.find(o => o.channelId === channelId);
}

// Old durationToSeconds removed, use parseDuration universally instead.

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
         `Price     : ${moneyIDR(order.price)}`, `Customer  : ${order.userId}`,
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

function mainPanel() {
  return new EmbedBuilder()
    .setColor(COLOR_MAIN)
    .setTitle("👻 Phantom.wtf")
    .setDescription(`
Premium Roblox Script Store

> South Bronx Available
> Instant Support
> Fast Delivery
> Secure Payments

Choose option below.
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
  const now = Date.now();
  const totalKeys = keys.length;
  const activeKeys = keys.filter(k => k.expires === 0 || k.expires > now).length;

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

/* =====================================================
   COMMANDS
===================================================== */

const commands = [
  new SlashCommandBuilder().setName("setup").setDescription("Send main shop panel"),
  new SlashCommandBuilder().setName("setupsupport").setDescription("Send support panel"),
  new SlashCommandBuilder().setName("setuplogs").setDescription("Set current channel as log channel"),
  new SlashCommandBuilder().setName("setupreviews").setDescription("Set current channel as review channel"),
  new SlashCommandBuilder().setName("setuptranscript").setDescription("Set current channel as transcript destination"),
  new SlashCommandBuilder().setName("dashboard").setDescription("View live stats"),
  new SlashCommandBuilder().setName("claim").setDescription("Claim this ticket"),
  new SlashCommandBuilder().setName("close").setDescription("Close current ticket (generates transcript)"),
  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Bot send custom message")
    .addStringOption(o => o.setName("message").setDescription("Message").setRequired(true)),
  new SlashCommandBuilder()
    .setName("accept")
    .setDescription("Approve payment in this ticket"),
  new SlashCommandBuilder()
    .setName("reject")
    .setDescription("Reject payment in this ticket")
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)),
  new SlashCommandBuilder()
    .setName("genkey")
    .setDescription("Generate script key")
    .addStringOption(o =>
      o.setName("duration").setDescription("Key duration").setRequired(true)
        .addChoices(
          { name: "1 Hour",    value: "1h"   },
          { name: "3 Hours",   value: "3h"   },
          { name: "6 Hours",   value: "6h"   },
          { name: "12 Hours",  value: "12h"  },
          { name: "1 Day",     value: "1d"   },
          { name: "3 Days",    value: "3d"   },
          { name: "7 Days",    value: "7d"   },
          { name: "30 Days",   value: "30d"  },
          { name: "Lifetime",  value: "perm" }
        )
    ),
  new SlashCommandBuilder()
    .setName("extendkey")
    .setDescription("Extend key duration")
    .addStringOption(o => o.setName("key").setDescription("Key to extend").setRequired(true))
    .addStringOption(o =>
      o.setName("duration").setDescription("Duration to add").setRequired(true)
        .addChoices(
          { name: "1 Hour",    value: "1h"   },
          { name: "3 Hours",   value: "3h"   },
          { name: "6 Hours",   value: "6h"   },
          { name: "12 Hours",  value: "12h"  },
          { name: "1 Day",     value: "1d"   },
          { name: "3 Days",    value: "3d"   },
          { name: "7 Days",    value: "7d"   },
          { name: "30 Days",   value: "30d"  }
        )
    ),
  new SlashCommandBuilder()
    .setName("revokekey")
    .setDescription("Delete key")
    .addStringOption(o => o.setName("key").setDescription("Key").setRequired(true)),
  new SlashCommandBuilder()
    .setName("checkkey")
    .setDescription("Check key")
    .addStringOption(o => o.setName("key").setDescription("Key").setRequired(true)),
  new SlashCommandBuilder()
    .setName("resethwid")
    .setDescription("Reset HWID")
    .addStringOption(o => o.setName("key").setDescription("Key").setRequired(true)),
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

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("Slash commands loaded.");
  } catch (err) {
    console.error(err);
  }

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
      await ch.setName(`expired-${ch.name.split("-").pop()}`).catch(() => {});
    }
  }, 30 * 60 * 1000);
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
      if (onCooldown(interaction.user.id)) return safeReply(interaction, { content: "⏳ Slow down a bit." });
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

  // ── Shop Bot Commands ──────────────────────────────────────────────────────

  if (commandName === "setup") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "No permission." });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("buy_script").setLabel("Buy Script").setStyle(ButtonStyle.Success).setEmoji("🛒"),
      new ButtonBuilder().setCustomId("open_support").setLabel("Support").setStyle(ButtonStyle.Primary).setEmoji("🎫"),
      new ButtonBuilder().setCustomId("view_prices").setLabel("Pricing").setStyle(ButtonStyle.Secondary).setEmoji("💰")
    );
    await channel.send({ embeds: [mainPanel()], components: [row] });
    return safeReply(interaction, { content: "✅ Shop panel sent." });
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
    setTimeout(() => channel.delete().catch(() => {}), 5000);
    return;
  }

  if (commandName === "say") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "No permission." });
    const msg = options.getString("message");
    await channel.send({ content: msg });
    return safeReply(interaction, { content: "✅ Message sent." });
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

    let deliveryContent = "";
    if (data.product === "South Bronx") {
      const key = generateKey();
      const seconds = parseDuration(data.duration);
      keys.push({ key, expires: seconds === 0 ? 0 : Date.now() + seconds * 1000, hwid: null, created: Date.now() });
      saveAll();
      deliveryContent = `Here is your script:\n\`\`\`lua\n_G.KEY="${key}"\nloadstring(game:HttpGet("${LOADER_URL}"))()\n\`\`\``;
    }
    await channel.send({
      content: `<@${data.userId}>`,
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_GREEN)
          .setTitle("✅ Payment Approved!")
          .setDescription(`Your **${data.product}** order has been verified!${deliveryContent ? "\n" + deliveryContent : ""}`)
          .setTimestamp()
      ],
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

  // ── Key Bot Commands (LOCAL, no external API) ──────────────────────────

  if (commandName === "genkey") {
    if (!isAdmin(member) && !isAdminByRole(interaction))
      return interaction.reply({ content: "Kamu tidak punya izin!", flags: 64 });

    await interaction.deferReply({ flags: 64 });

    const durasiStr   = interaction.options.getString("durasi") || "1d";
    const seconds     = parseDuration(durasiStr);
    const key         = generateKey();

    try {
      const expires = seconds ? Date.now() + seconds * 1000 : 0;
      keys.push({ key, expires, hwid: null, created: Date.now() });
      saveAll();

      const scriptReady = `_G.KEY = "${key}"\nloadstring(game:HttpGet("${SCRIPT_URL}"))()`;
      const expireText = seconds
        ? `Expired: ${new Date(expires).toLocaleString("id-ID")}`
        : "Key ini tidak akan expired (Permanent)";

      const embed = new EmbedBuilder()
        .setTitle("✅ Key Berhasil Di-generate!")
        .setColor(0x00ff99)
        .addFields(
          { name: "Key", value: "```" + key + "```" },
          { name: "Durasi", value: formatDurasi(seconds), inline: true },
          { name: "Expired", value: expireText, inline: true },
          { name: "Script - Copy Paste ke Xeno", value: "```lua\n" + scriptReady + "\n```" }
        )
        .setTimestamp()
        .setFooter({ text: `Di-generate oleh ${interaction.user.tag}` });

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("[GENKEY]", err);
      return interaction.editReply({ content: "❌ Gagal menyimpan key. Cek console." });
    }
  }

  // ── EXTENDKEY (NEW) ────────────────────────────────────────────────────────
  if (commandName === "extendkey") {
    if (!isAdmin(member) && !isAdminByRole(interaction))
      return interaction.reply({ content: "No permission.", flags: 64 });

    const key = options.getString("key");
    const durStr = options.getString("duration");
    const addSeconds = parseDuration(durStr);
    if (addSeconds === 0) return interaction.reply({ content: "❌ Invalid duration.", flags: 64 });

    const entry = keys.find(k => k.key === key);
    if (!entry) return interaction.reply({ content: "❌ Key not found.", flags: 64 });
    if (entry.expires === 0) {
      return interaction.reply({ content: "❌ Cannot extend a permanent key.", flags: 64 });
    }

    const now = Date.now();
    const currentExpiry = entry.expires;
    const newExpiry = currentExpiry < now ? now + addSeconds * 1000 : currentExpiry + addSeconds * 1000;
    entry.expires = newExpiry;
    saveAll();

    const embed = new EmbedBuilder()
      .setColor(COLOR_GREEN)
      .setTitle("✅ Key Extended")
      .addFields(
        { name: "Key", value: `\`${key}\`` },
        { name: "Added Time", value: formatDurasi(addSeconds), inline: true },
        { name: "Previous Expiry", value: new Date(currentExpiry).toLocaleString("id-ID") },
        { name: "New Expiry", value: new Date(newExpiry).toLocaleString("id-ID") }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  // ── CHECKKEY (ENHANCED) ────────────────────────────────────────────────────
  if (commandName === "checkkey") {
    if (!isAdmin(member) && !isAdminByRole(interaction))
      return interaction.reply({ content: "No permission.", flags: 64 });

    const key = options.getString("key");
    const data = keys.find(k => k.key === key);
    if (!data) return interaction.reply({ content: "❌ Key not found.", flags: 64 });

    const now = Date.now();
    const isExpired = data.expires !== 0 && now > data.expires;
    const statusText = data.expires === 0 ? "🟢 Permanent" : (isExpired ? "🔴 Expired" : "🟢 Active");
    const expiryDisplay = data.expires === 0 ? "Never" : new Date(data.expires).toLocaleString("id-ID");
    const relativeTime = data.expires === 0 ? "∞" : `<t:${Math.floor(data.expires / 1000)}:R>`;

    const embed = new EmbedBuilder()
      .setColor(isExpired ? COLOR_RED : COLOR_MAIN)
      .setTitle("🔑 Key Details")
      .addFields(
        { name: "Key", value: `\`${data.key}\`` },
        { name: "Created", value: new Date(data.created).toLocaleString("id-ID"), inline: true },
        { name: "Expires", value: `${expiryDisplay}\n${relativeTime}`, inline: true },
        { name: "Status", value: statusText, inline: true },
        { name: "HWID", value: data.hwid || "Not set", inline: true }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  // ── REVOKEKEY ──────────────────────────────────────────────────────────────
  if (commandName === "revokekey") {
    if (!isAdmin(member) && !isAdminByRole(interaction))
      return interaction.reply({ content: "No permission.", flags: 64 });
    const key = options.getString("key");
    const index = keys.findIndex(k => k.key === key);
    if (index === -1) return interaction.reply({ content: "❌ Key not found.", flags: 64 });
    keys.splice(index, 1);
    saveAll();
    return interaction.reply({ content: "✅ Key revoked.", flags: 64 });
  }

  // ── RESETHWID ───────────────────────────────────────────────────────────────
  if (commandName === "resethwid") {
    if (!isAdmin(member) && !isAdminByRole(interaction))
      return interaction.reply({ content: "No permission.", flags: 64 });
    const key = options.getString("key");
    const data = keys.find(k => k.key === key);
    if (!data) return interaction.reply({ content: "❌ Key not found.", flags: 64 });
    data.hwid = null;
    saveAll();
    return interaction.reply({ content: "✅ HWID reset.", flags: 64 });
  }
}

/* =====================================================
   BUTTON HANDLER
===================================================== */

async function handleButton(interaction) {
  const { customId, guild, user, member, channel } = interaction;
  activityMap.set(channel.id, Date.now());

  if (customId === "buy_script") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("choose_product")
      .setPlaceholder("Select product")
      .addOptions([{ label: "South Bronx", description: "Premium Roblox Script", emoji: "👻", value: "southbronx" }]);
    return interaction.reply({
      content: "Choose product below.",
      components: [new ActionRowBuilder().addComponents(menu)],
      flags: 64
    });
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

  if (customId === "view_prices") {
    const embed = new EmbedBuilder()
      .setColor(COLOR_MAIN)
      .setTitle("💰 Pricing")
      .setDescription(`
**South Bronx**
1 Hour — Rp10.000
3 Hours — Rp20.000
6 Hours — Rp35.000
12 Hours — Rp50.000
1 Day — Rp10.000
3 Day — Rp20.000
7 Day — Rp35.000
30 Day — Rp100.000
Lifetime — Rp150.000
`);
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  if (customId === "close_support") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "No permission." });
    trackMessage(channel.id, "SYSTEM", `[CLOSED] Support ticket closed by ${user.tag}`);
    await sendTranscript(guild, channel.id, channel.name, user.id);
    await interaction.reply({ content: "🚫 Transcript saved. Deleting in 5 seconds...", flags: 64 });
    setTimeout(() => channel.delete().catch(() => {}), 5000);
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
      let delivery = "";
      if (data.product === "South Bronx") {
        const key = generateKey();
        const seconds = parseDuration(data.duration);
        keys.push({ key, expires: seconds === 0 ? 0 : Date.now() + seconds * 1000, hwid: null, created: Date.now() });
        saveAll();
        delivery = `\n\`\`\`lua\n_G.KEY="${key}"\nloadstring(game:HttpGet("${LOADER_URL}"))()\n\`\`\``;
      }
      targetCh.send({
        content: `<@${data.userId}>`,
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_GREEN)
            .setTitle("✅ Payment Approved!")
            .setDescription(`Your **${data.product}** order has been verified!${delivery}`)
        ],
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
   SELECT MENU HANDLER
===================================================== */

async function handleSelect(interaction) {
  const { customId, guild, user, channel } = interaction;
  activityMap.set(channel.id, Date.now());

  if (customId === "choose_product") {
    const chosen = interaction.values[0];
    if (chosen === "southbronx") {
      const durMenu = new StringSelectMenuBuilder()
        .setCustomId("choose_duration")
        .setPlaceholder("Select duration")
        .addOptions([
          { label: "1 Hour", value: "1h", description: "Rp10.000" },
          { label: "3 Hours", value: "3h", description: "Rp20.000" },
          { label: "6 Hours", value: "6h", description: "Rp35.000" },
          { label: "12 Hours", value: "12h", description: "Rp50.000" },
          { label: "1 Day", value: "1d", description: "Rp10.000" },
          { label: "3 Day", value: "3d", description: "Rp20.000" },
          { label: "7 Day", value: "7d", description: "Rp35.000" },
          { label: "30 Day", value: "30d", description: "Rp100.000" },
          { label: "Lifetime", value: "perm", description: "Rp150.000" }
        ]);
      return interaction.update({
        content: "Select duration for **South Bronx**:",
        components: [new ActionRowBuilder().addComponents(durMenu)]
      });
    }
  }

  if (customId === "choose_duration") {
    const dur = interaction.values[0];
    const priceMap = {
      "1h": 10000, "3h": 20000, "6h": 35000, "12h": 50000,
      "1d": 10000, "3d": 20000, "7d": 35000, "30d": 100000, "perm": 150000
    };
    const price = priceMap[dur] || 10000;

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
      product: "South Bronx",
      variant: durationLabel(dur),
      duration: dur,
      price,
      status: "payment",
      created: Date.now(),
      paymentMethod: null
    });
    saveAll();
    trackMessage(ch.id, "SYSTEM", `[OPENED] Order #${orderId} for South Bronx (${durationLabel(dur)}) at ${moneyIDR(price)}`);

    const qris = {
      label: "QRIS",
      emoji: "🏦",
      instructions: "Scan QRIS to pay the exact amount.",
      image: QRIS_IMAGE
    };
    const paypal = {
      label: "PayPal",
      emoji: "💳",
      instructions: "Send as Friends & Family.",
      address: PAYPAL_EMAIL
    };
    const ltc = {
      label: "LTC",
      emoji: "🪙",
      instructions: "Send to LTC address.",
      address: LTC_TEXT
    };

    await ch.send({
      content: `<@${user.id}>`,
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_MAIN)
          .setTitle("🏦 QRIS Payment")
          .setDescription(qris.instructions)
          .addFields({ name: "Amount", value: moneyIDR(price), inline: true })
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
          .setTitle(`🛒 Order #${orderId} — South Bronx`)
          .setDescription(`**1.** Select payment method below\n**2.** Pay using instructions above\n**3.** Click **I've Paid ✅**`)
          .addFields(
            { name: "Product", value: "South Bronx", inline: true },
            { name: "Duration", value: durationLabel(dur), inline: true },
            { name: "Price", value: moneyIDR(price), inline: true },
            { name: "Status", value: statusBadge("payment"), inline: true }
          )
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`select_payment:${ch.id}`)
            .setPlaceholder("Choose payment method")
            .addOptions([
              { label: "QRIS", value: "qris", emoji: "🏦" },
              { label: "PayPal", value: "paypal", emoji: "💳" },
              { label: "LTC", value: "ltc", emoji: "🪙" }
            ])
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`paid_${ch.id}`).setLabel("I've Paid ✅").setStyle(ButtonStyle.Success)
        )
      ]
    });

    await interaction.update({ content: `✅ Order channel created: ${ch}`, components: [], embeds: [] });
    return;
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
   MODAL HANDLER
===================================================== */

async function handleModal(interaction) {
  const { customId, guild, user } = interaction;

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
      reviewCh.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_YELLOW)
            .setTitle(`${starStr} New Review`)
            .setDescription(`> ${reviewText}`)
            .addFields(
              { name: "From", value: `<@${user.id}>`, inline: true },
              { name: "Product", value: data?.product || "Unknown", inline: true }
            )
            .setTimestamp()
        ]
      });
    }
    return safeReply(interaction, { content: `✅ Thanks for your review! ${starStr}` });
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

const missing = ["TOKEN", "CLIENT_ID", "GUILD_ID"].filter(k => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

client.login(TOKEN).catch(err => {
  console.error("❌ Login failed:", err.message);
  process.exit(1);
});
