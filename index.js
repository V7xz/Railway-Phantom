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
  ActivityType
} = require("discord.js");

/* =====================================================
   ENV
===================================================== */

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const API_URL = process.env.API_URL;
const API_SECRET = process.env.API_SECRET;
const LOADER_URL = process.env.LOADER_URL;
const BANNER_URL = process.env.BANNER_URL || "";
const QRIS_IMAGE = process.env.QRIS_IMAGE || "https://cdn.discordapp.com/attachments/1491728132661842061/1491880425923153991/Qris_gw.png";
const PAYPAL_EMAIL = process.env.PAYPAL_EMAIL || "phantom.wtfff@gmail.com";
const LTC_TEXT = process.env.LTC_TEXT || "Unavailable";

/* =====================================================
   STATIC CONFIG
===================================================== */

const CONFIG = {
  BOT_NAME: "Phantom.wtf",
  OWNER_ID: "961847981684973569",
  ADMIN_ROLE_NAME: "dev",
  AUTO_CLOSE_HOURS: 24,
  CURRENCY_RATE: 17000,
  BUYER_ROLE_NAME: "Subscriptions"
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
   STORAGE
===================================================== */

const DATA_DIR = path.join(__dirname, "data");

const FILES = {
  orders: path.join(DATA_DIR, "orders.json"),
  keys: path.join(DATA_DIR, "keys.json"),
  reviews: path.join(DATA_DIR, "reviews.json"),
  logs: path.join(DATA_DIR, "logs.json")
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

/* =====================================================
   MEMORY CACHE
===================================================== */

let orders = readJSON(FILES.orders);
let keys = readJSON(FILES.keys);
let reviews = readJSON(FILES.reviews);
let logs = readJSON(FILES.logs);

let logChannelId = null;
let reviewChannelId = null;

/* =====================================================
   UTILITIES
===================================================== */

function isAdmin(member) {
  return (
    member.id === CONFIG.OWNER_ID ||
    member.roles.cache.some(r => r.name === CONFIG.ADMIN_ROLE_NAME)
  );
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
}

function findOrder(channelId) {
  return orders.find(o => o.channelId === channelId);
}

function durationToSeconds(val) {
  if (val === "1d") return 86400;
  if (val === "3d") return 259200;
  if (val === "7d") return 604800;
  if (val === "30d") return 2592000;
  if (val === "perm") return 0;
  return 86400;
}

function durationLabel(val) {
  if (val === "1d") return "1 Day";
  if (val === "3d") return "3 Day";
  if (val === "7d") return "7 Day";
  if (val === "30d") return "30 Day";
  if (val === "perm") return "Lifetime";
  return "Unknown";
}

function moneyIDR(n) {
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}

function moneyUSD(n) {
  return `$${Number(n).toFixed(2)}`;
}

/* =====================================================
   EMBEDS
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
    .setDescription("Need help? Open support ticket below.");
}

function dashboardEmbed(guild) {
  let pending = 0;
  let approved = 0;
  for (const o of orders) {
    if (o.status === "waiting") pending++;
    if (o.status === "approved") approved++;
  }
  return new EmbedBuilder()
    .setColor(COLOR_MAIN)
    .setTitle("📊 Phantom Dashboard")
    .addFields(
      { name: "Open Orders", value: `${pending}`, inline: true },
      { name: "Approved Today", value: `${approved}`, inline: true },
      { name: "Guild", value: guild.name, inline: true }
    )
    .setTimestamp();
}

/* =====================================================
   COMMANDS
===================================================== */

const commands = [
  new SlashCommandBuilder().setName("setup").setDescription("Send main shop panel"),
  new SlashCommandBuilder().setName("setupsupport").setDescription("Send support panel"),
  new SlashCommandBuilder().setName("setuplogs").setDescription("Set current channel as logs"),
  new SlashCommandBuilder().setName("setupreviews").setDescription("Set current channel as reviews"),
  new SlashCommandBuilder().setName("dashboard").setDescription("View live stats"),
  new SlashCommandBuilder().setName("claim").setDescription("Claim ticket"),
  new SlashCommandBuilder().setName("close").setDescription("Close current ticket"),
  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Bot send custom message")
    .addStringOption(o => o.setName("message").setDescription("Message").setRequired(true)),
  new SlashCommandBuilder()
    .setName("genkey")
    .setDescription("Generate script key")
    .addStringOption(o =>
      o.setName("duration").setDescription("Key duration").setRequired(true)
        .addChoices(
          { name: "1 Day", value: "1d" },
          { name: "3 Day", value: "3d" },
          { name: "7 Day", value: "7d" },
          { name: "30 Day", value: "30d" },
          { name: "Lifetime", value: "perm" }
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

  // Auto close inactive tickets
  setInterval(async () => {
    for (const data of orders) {
      if (["approved", "closed", "rejected"].includes(data.status)) continue;
      const diff = Date.now() - data.created;
      if (diff > CONFIG.AUTO_CLOSE_HOURS * 3600000) {
        const ch = client.channels.cache.get(data.channelId);
        if (!ch) continue;
        await ch.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLOR_RED)
              .setTitle("⏰ Auto Closed")
              .setDescription("Ticket closed due to inactivity.")
          ]
        }).catch(() => null);
        await closeTicket(ch, "Auto Closed");
      }
    }
  }, 1800000);
});

/* =====================================================
   INTERACTION HANDLER
===================================================== */

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) return await handleSlash(interaction);
    if (interaction.isButton()) return await handleButton(interaction);
    if (interaction.isStringSelectMenu()) return await handleSelect(interaction);
  } catch (err) {
    console.error(err);
    const payload = { content: "❌ Something went wrong.", ephemeral: true };
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
    if (!isAdmin(member)) return interaction.reply({ content: "No permission.", ephemeral: true });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("buy_script").setLabel("Buy Script").setStyle(ButtonStyle.Success).setEmoji("🛒"),
      new ButtonBuilder().setCustomId("open_support").setLabel("Support").setStyle(ButtonStyle.Primary).setEmoji("🎫"),
      new ButtonBuilder().setCustomId("view_prices").setLabel("Pricing").setStyle(ButtonStyle.Secondary).setEmoji("💰")
    );
    await channel.send({ embeds: [mainPanel()], components: [row] });
    return interaction.reply({ content: "✅ Shop panel sent.", ephemeral: true });
  }

  if (commandName === "setupsupport") {
    if (!isAdmin(member)) return interaction.reply({ content: "No permission.", ephemeral: true });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("open_support").setLabel("Open Support").setStyle(ButtonStyle.Primary).setEmoji("🎫")
    );
    await channel.send({ embeds: [supportPanel()], components: [row] });
    return interaction.reply({ content: "✅ Support panel sent.", ephemeral: true });
  }

  if (commandName === "setuplogs") {
    if (!isAdmin(member)) return interaction.reply({ content: "No permission.", ephemeral: true });
    logChannelId = channel.id;
    saveAll();
    return interaction.reply({ content: "✅ Logs channel set.", ephemeral: true });
  }

  if (commandName === "setupreviews") {
    if (!isAdmin(member)) return interaction.reply({ content: "No permission.", ephemeral: true });
    reviewChannelId = channel.id;
    saveAll();
    return interaction.reply({ content: "✅ Review channel set.", ephemeral: true });
  }

  if (commandName === "dashboard") {
    if (!isAdmin(member)) return interaction.reply({ content: "No permission.", ephemeral: true });
    return interaction.reply({ embeds: [dashboardEmbed(guild)], ephemeral: true });
  }

  if (commandName === "claim") {
    if (!isAdmin(member)) return interaction.reply({ content: "No permission.", ephemeral: true });
    await channel.send({
      embeds: [new EmbedBuilder().setColor(COLOR_MAIN).setDescription(`📌 Ticket claimed by <@${interaction.user.id}>`)]
    });
    return interaction.reply({ content: "Claimed.", ephemeral: true });
  }

  if (commandName === "close") {
    if (!isAdmin(member)) return interaction.reply({ content: "No permission.", ephemeral: true });
    await interaction.reply({ content: "Closing ticket...", ephemeral: true });
    return closeTicket(channel, interaction.user.tag);
  }

  if (commandName === "say") {
    if (!isAdmin(member)) return interaction.reply({ content: "No permission.", ephemeral: true });
    await channel.send({ content: options.getString("message") });
    return interaction.reply({ content: "Sent.", ephemeral: true });
  }

  if (commandName === "genkey") {
    if (!isAdmin(member)) return interaction.reply({ content: "No permission.", ephemeral: true });
    const duration = options.getString("duration");
    const key = generateKey();
    const seconds = durationToSeconds(duration);
    const res = await fetch(`${API_URL}/addkey`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: API_SECRET, key, duration: seconds })
    }).then(r => r.json()).catch(() => null);
    if (!res || !res.success) return interaction.reply({ content: "❌ API failed.", ephemeral: true });
    const script = `_G.KEY="${key}"\nloadstring(game:HttpGet("${LOADER_URL}"))()`;
    return interaction.reply({
      embeds: [
        new EmbedBuilder().setColor(COLOR_GREEN).setTitle("✅ Key Generated")
          .addFields(
            { name: "Key", value: `\`${key}\`` },
            { name: "Duration", value: durationLabel(duration), inline: true },
            { name: "Loader", value: "```lua\n" + script + "\n```" }
          )
      ],
      ephemeral: true
    });
  }

  if (commandName === "checkkey") {
    if (!isAdmin(member)) return interaction.reply({ content: "No permission.", ephemeral: true });
    const key = options.getString("key");
    const res = await fetch(`${API_URL}/check?key=${key}&secret=${API_SECRET}`).then(r => r.json()).catch(() => null);
    return interaction.reply({ content: "```json\n" + JSON.stringify(res, null, 2) + "\n```", ephemeral: true });
  }

  if (commandName === "revokekey") {
    if (!isAdmin(member)) return interaction.reply({ content: "No permission.", ephemeral: true });
    const key = options.getString("key");
    await fetch(`${API_URL}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: API_SECRET, key })
    }).catch(() => null);
    return interaction.reply({ content: "✅ Key revoked.", ephemeral: true });
  }

  if (commandName === "resethwid") {
    if (!isAdmin(member)) return interaction.reply({ content: "No permission.", ephemeral: true });
    const key = options.getString("key");
    await fetch(`${API_URL}/resethwid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: API_SECRET, key })
    }).catch(() => null);
    return interaction.reply({ content: "✅ HWID reset.", ephemeral: true });
  }
}

/* =====================================================
   BUTTON HANDLER
===================================================== */

async function handleButton(interaction) {
  const { customId, guild, user, member } = interaction;

  if (customId === "buy_script") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("choose_product")
      .setPlaceholder("Select product")
      .addOptions([{ label: "South Bronx", description: "Premium Roblox Script", emoji: "👻", value: "southbronx" }]);
    return interaction.reply({
      content: "Choose product below.",
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true
    });
  }

  if (customId === "open_support") {
    const ch = await guild.channels.create({
      name: `support-${user.username}`.toLowerCase(),
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    await ch.send({
      content: `<@${user.id}>`,
      embeds: [new EmbedBuilder().setColor(COLORS.main).setTitle("🎫 Support Ticket").setDescription("Describe your issue.")]
    });
    return interaction.reply({ content: `Ticket created: ${ch}`, ephemeral: true });
  }

  if (customId === "view_prices") {
    return interaction.reply({
      embeds: [
        new EmbedBuilder().setColor(COLORS.main).setTitle("💰 Pricing").setDescription(`
**South Bronx**
1 Day — Rp10.000
3 Day — Rp20.000
7 Day — Rp35.000
30 Day — Rp100.000
Lifetime — Rp150.000
`)
      ],
      ephemeral: true
    });
  }

  if (customId.startsWith("paid_")) {
    const ticketId = customId.split("_")[1];
    const data = findOrder(ticketId);
    if (!data) return interaction.reply({ content: "Order not found.", ephemeral: true });
    data.status = "waiting";
    saveAll();
    return interaction.reply({ content: "Payment submitted.", ephemeral: true });
  }

  if (customId.startsWith("approve_")) {
    if (!isAdmin(member)) return interaction.reply({ content: "No permission.", ephemeral: true });
    const ticketId = customId.split("_")[1];
    const data = findOrder(ticketId);
    if (!data) return interaction.reply({ content: "Order not found.", ephemeral: true });
    data.status = "approved";
    saveAll();
    return interaction.reply({ content: "Approved.", ephemeral: true });
  }

  if (customId.startsWith("reject_")) {
    if (!isAdmin(member)) return interaction.reply({ content: "No permission.", ephemeral: true });
    const ticketId = customId.split("_")[1];
    const data = findOrder(ticketId);
    if (!data) return interaction.reply({ content: "Order not found.", ephemeral: true });
    data.status = "rejected";
    saveAll();
    return interaction.reply({ content: "Rejected.", ephemeral: true });
  }
}

/* =====================================================
   SELECT MENU HANDLER
===================================================== */

async function handleSelect(interaction) {
  const { customId, guild, user } = interaction;

  if (customId === "choose_product") {
    const durationMenu = new StringSelectMenuBuilder()
      .setCustomId("choose_duration")
      .setPlaceholder("Select duration")
      .addOptions([
        { label: "1 Day", value: "1d" },
        { label: "3 Day", value: "3d" },
        { label: "7 Day", value: "7d" },
        { label: "30 Day", value: "30d" },
        { label: "Lifetime", value: "perm" }
      ]);
    return interaction.update({
      content: "Choose duration",
      components: [new ActionRowBuilder().addComponents(durationMenu)]
    });
  }

  if (customId === "choose_duration") {
    const dur = interaction.values[0];
    const ch = await guild.channels.create({
      name: `order-${user.username}`.toLowerCase(),
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    orders.push({
      channelId: ch.id,
      userId: user.id,
      product: "South Bronx",
      duration: dur,
      status: "payment",
      created: Date.now()
    });
    saveAll();
    return interaction.update({ content: `Order created: ${ch}`, components: [] });
  }
}

/* =====================================================
   CLOSE TICKET
===================================================== */

async function closeTicket(channel, reason = "Closed") {
  await channel.send({
    embeds: [new EmbedBuilder().setColor(COLORS.red).setDescription(`🔒 ${reason}`)]
  }).catch(() => {});
  setTimeout(() => channel.delete().catch(() => {}), 3000);
}

/* =====================================================
   LOGIN
===================================================== */

client.login(TOKEN);
