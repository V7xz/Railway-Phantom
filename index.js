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
ModalBuilder,
TextInputBuilder,
TextInputStyle,
PermissionsBitField,
ChannelType
} = require("discord.js");

/* =====================================================
 ENV
===================================================== */

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

/* =====================================================
 STATIC CONFIG
===================================================== */

const CONFIG = {
BOT_NAME: "Phantom.wtf",
OWNER_ID: "1491433868677611591",
ADMIN_ROLE_NAME: "Dev",
AUTO_CLOSE_HOURS: 24,
CURRENCY_RATE: 16000,
BUYER_ROLE_NAME: "Buyer"
};

const COLORS = {
main: 0x7b2cff,
dark: 0x111111,
green: 0x57f287,
red: 0xed4245,
yellow: 0xfee75c,
gray: 0x2b2d31
};

const PAYMENT = {
qris: {
label: "QRIS",
emoji: "📱",
image:
"https://cdn.discordapp.com/attachments/1491728132661842061/1491880425923153991/Qris_gw.png",
instructions:
"Scan QR code using any Indonesian e-wallet / banking app."
},
paypal: {
label: "PayPal",
emoji: "💰",
address: "phantom.wtfff@gmail.com",
instructions: "Send using Friends & Family."
},
ltc: {
label: "LTC",
emoji: "🪙",
address: "Unavailable",
instructions: "Crypto temporarily unavailable."
}
};

const PRODUCTS = [
{
id: "south_bronx",
name: "South Bronx",
durations: [
{ id: "1d", label: "1 Day", price: 10000 },
{ id: "3d", label: "3 Day", price: 20000 },
{ id: "7d", label: "7 Day", price: 35000 },
{ id: "30d", label: "30 Day", price: 100000 },
{ id: "lifetime", label: "Lifetime", price: 150000 }
]
}
];

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
config: path.join(DATA_DIR, "config.json"),
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

let orderCounter = orders.length + 1;

/* =====================================================
 UTILITIES
===================================================== */

function isAdmin(member) {
return (
member.id === CONFIG.OWNER_ID ||
member.roles.cache.some(r => r.name === CONFIG.ADMIN_ROLE_NAME)
);
}

function idr(n) {
return "Rp " + Number(n).toLocaleString("id-ID");
}

function usd(n) {
return "$" + (Number(n) / CONFIG.CURRENCY_RATE).toFixed(2);
}

function now() {
return Math.floor(Date.now() / 1000);
}

function randomID(len = 10) {
return crypto.randomBytes(len).toString("hex").slice(0, len);
}

function generateKey() {
return (
randomID(4).toUpperCase() +
"-" +
randomID(4).toUpperCase() +
"-" +
randomID(4).toUpperCase() +
"-" +
randomID(4).toUpperCase()
);
}

function statusBadge(status) {
const map = {
pending: "🟡 Pending",
review: "🟠 Under Review",
approved: "🟢 Approved",
rejected: "🔴 Rejected",
closed: "⚫ Closed"
};
return map[status] || status;
}

function premiumEmbed(title, desc) {
return new EmbedBuilder()
.setColor(COLORS.main)
.setTitle(`💜 ${title}`)
.setDescription(desc)
.setFooter({ text: "Phantom.wtf Premium" })
.setTimestamp();
}

async function safeReply(interaction, payload) {
try {
if (interaction.replied || interaction.deferred) {
return await interaction.followUp(payload);
}
return await interaction.reply(payload);
} catch {}
}

function saveAll() {
writeJSON(FILES.orders, orders);
writeJSON(FILES.keys, keys);
writeJSON(FILES.reviews, reviews);
writeJSON(FILES.logs, logs);
}

function addLog(type, data = {}) {
logs.push({
id: randomID(12),
type,
time: Date.now(),
data
});
saveAll();
}

/* =====================================================
 READY
===================================================== */

client.once("ready", async () => {
console.log(`${client.user.tag} online.`);

client.user.setPresence({
activities: [{ name: "phantomexternal.mysellauth.com" }],
status: "online"
});

const rest = new REST({ version: "10" }).setToken(TOKEN);

await rest.put(
Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
{ body: commands }
);

console.log("Slash commands loaded.");
});

// ---------------------- COMMANDS ----------------------
const commands = [

new SlashCommandBuilder()
.setName("setup")
.setDescription("Send main shop panel"),

new SlashCommandBuilder()
.setName("setupsupport")
.setDescription("Send support panel"),

new SlashCommandBuilder()
.setName("setuplogs")
.setDescription("Set current channel as logs"),

new SlashCommandBuilder()
.setName("setupreviews")
.setDescription("Set current channel as reviews"),

new SlashCommandBuilder()
.setName("dashboard")
.setDescription("View live stats"),

new SlashCommandBuilder()
.setName("claim")
.setDescription("Claim ticket"),

new SlashCommandBuilder()
.setName("close")
.setDescription("Close current ticket"),

new SlashCommandBuilder()
.setName("say")
.setDescription("Bot send custom message")
.addStringOption(o =>
o.setName("message")
.setDescription("Message")
.setRequired(true)
),

new SlashCommandBuilder()
.setName("genkey")
.setDescription("Generate script key")
.addStringOption(o =>
o.setName("duration")
.setDescription("Key duration")
.setRequired(true)
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
.addStringOption(o =>
o.setName("key")
.setDescription("Key")
.setRequired(true)
),

new SlashCommandBuilder()
.setName("checkkey")
.setDescription("Check key")
.addStringOption(o =>
o.setName("key")
.setDescription("Key")
.setRequired(true)
),

new SlashCommandBuilder()
.setName("resethwid")
.setDescription("Reset HWID")
.addStringOption(o =>
o.setName("key")
.setDescription("Key")
.setRequired(true)
),

].map(x => x.toJSON());

// ---------------------- REGISTER ----------------------
const rest = new REST({ version: "10" }).setToken(TOKEN);

async function registerCommands() {
try {
await rest.put(
Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
{ body: commands }
);
console.log("Slash commands loaded.");
} catch (err) {
console.log(err);
}
}

// ---------------------- READY ----------------------
client.once("ready", async () => {
console.log(`${client.user.tag} online.`);
client.user.setPresence({
activities: [{
name: "phantomexternal.mysellauth.com",
type: ActivityType.Watching
}],
status: "online"
});

await registerCommands();

setInterval(async () => {
for (const [id, data] of orders.entries()) {

if (["approved","closed","rejected"].includes(data.status)) continue;

const diff = Date.now() - data.lastActivity;

if (diff > AUTO_CLOSE_HOURS * 3600000) {

const ch = client.channels.cache.get(id);
if (!ch) continue;

await ch.send({
embeds: [
new EmbedBuilder()
.setColor(COLOR_RED)
.setTitle("⏰ Auto Closed")
.setDescription("Ticket closed due inactivity.")
]
}).catch(()=>null);

await closeTicket(ch, "Auto Closed");
}
}
}, 1800000);

});

// ---------------------- HELPERS ----------------------
function isAdmin(member) {
return member.roles.cache.has(ADMIN_ROLE_ID);
}

function moneyIDR(n) {
return `Rp ${Number(n).toLocaleString("id-ID")}`;
}

function moneyUSD(n) {
return `$${Number(n).toFixed(2)}`;
}

function makeOrderId() {
return `${Date.now().toString().slice(-6)}${Math.floor(Math.random()*99)}`;
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

function durationPrice(val) {
if (val === "1d") return 10000;
if (val === "3d") return 20000;
if (val === "7d") return 35000;
if (val === "30d") return 100000;
if (val === "perm") return 150000;
return 10000;
}

function durationUSD(val) {
if (val === "1d") return 1;
if (val === "3d") return 2;
if (val === "7d") return 3;
if (val === "30d") return 7;
if (val === "perm") return 10;
return 1;
}

// ---------------------- EMBEDS ----------------------
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
.setImage(BANNER_URL)
.setFooter({ text: "phantomexternal.mysellauth.com" });
}

function supportPanel() {
return new EmbedBuilder()
.setColor(COLOR_MAIN)
.setTitle("🎫 Phantom Support")
.setDescription("Need help? Open support ticket below.");
}

function paymentEmbed(order) {
return new EmbedBuilder()
.setColor(COLOR_GREEN)
.setTitle("💳 Payment Information")
.addFields(
{
name: "Product",
value: `${order.product} (${order.duration})`,
inline: true
},
{
name: "Price IDR",
value: moneyIDR(order.price),
inline: true
},
{
name: "Price USD",
value: moneyUSD(order.usd),
inline: true
},
{
name: "QRIS",
value: "Available",
inline: false
},
{
name: "PayPal",
value: PAYPAL_EMAIL,
inline: false
},
{
name: "LTC",
value: LTC_TEXT,
inline: false
}
)
.setImage(QRIS_IMAGE)
.setFooter({ text: "After payment click I've Paid" });
}

function dashboardEmbed(guild) {

let pending = 0;
let approved = 0;

for (const [,o] of orders.entries()) {
if (o.status === "waiting") pending++;
if (o.status === "approved") approved++;
}

return new EmbedBuilder()
.setColor(COLOR_MAIN)
.setTitle("📊 Phantom Dashboard")
.addFields(
{
name: "Open Orders",
value: `${pending}`,
inline: true
},
{
name: "Approved Today",
value: `${approved}`,
inline: true
},
{
name: "Guild",
value: guild.name,
inline: true
}
)
.setTimestamp();
}
// =====================================================
// Phantom.wtf Premium Bot - PART 3 / 4
// InteractionCreate Handlers
// Continue below PART 2
// =====================================================

client.on("interactionCreate", async (interaction) => {
try {

if (interaction.isChatInputCommand()) {
await handleSlash(interaction);
return;
}

if (interaction.isButton()) {
await handleButton(interaction);
return;
}

if (interaction.isStringSelectMenu()) {
await handleSelect(interaction);
return;
}

} catch (err) {
console.log(err);

if (interaction.replied || interaction.deferred) {
interaction.followUp({
content: "❌ Something went wrong.",
ephemeral: true
}).catch(()=>null);
} else {
interaction.reply({
content: "❌ Something went wrong.",
ephemeral: true
}).catch(()=>null);
}
}
});

// -----------------------------------------------------
// SLASH COMMANDS
// -----------------------------------------------------
async function handleSlash(interaction) {

const { commandName, member, channel, guild, options } = interaction;

// ---------------- SETUP SHOP ----------------
if (commandName === "setup") {

if (!isAdmin(member))
return interaction.reply({
content: "No permission.",
ephemeral: true
});

const row = new ActionRowBuilder()
.addComponents(
new ButtonBuilder()
.setCustomId("buy_script")
.setLabel("Buy Script")
.setStyle(ButtonStyle.Success)
.setEmoji("🛒"),

new ButtonBuilder()
.setCustomId("open_support")
.setLabel("Support")
.setStyle(ButtonStyle.Primary)
.setEmoji("🎫"),

new ButtonBuilder()
.setCustomId("view_prices")
.setLabel("Pricing")
.setStyle(ButtonStyle.Secondary)
.setEmoji("💰")
);

await channel.send({
embeds: [mainPanel()],
components: [row]
});

return interaction.reply({
content: "✅ Shop panel sent.",
ephemeral: true
});
}

// ---------------- SUPPORT PANEL ----------------
if (commandName === "setupsupport") {

if (!isAdmin(member))
return interaction.reply({
content: "No permission.",
ephemeral: true
});

const row = new ActionRowBuilder()
.addComponents(
new ButtonBuilder()
.setCustomId("open_support")
.setLabel("Open Support")
.setStyle(ButtonStyle.Primary)
.setEmoji("🎫")
);

await channel.send({
embeds: [supportPanel()],
components: [row]
});

return interaction.reply({
content: "✅ Support panel sent.",
ephemeral: true
});
}

// ---------------- LOG CHANNEL ----------------
if (commandName === "setuplogs") {

if (!isAdmin(member))
return interaction.reply({
content: "No permission.",
ephemeral: true
});

logChannelId = channel.id;
saveData();

return interaction.reply({
content: "✅ Logs channel set.",
ephemeral: true
});
}

// ---------------- REVIEW CHANNEL ----------------
if (commandName === "setupreviews") {

if (!isAdmin(member))
return interaction.reply({
content: "No permission.",
ephemeral: true
});

reviewChannelId = channel.id;
saveData();

return interaction.reply({
content: "✅ Review channel set.",
ephemeral: true
});
}

// ---------------- DASHBOARD ----------------
if (commandName === "dashboard") {

if (!isAdmin(member))
return interaction.reply({
content: "No permission.",
ephemeral: true
});

return interaction.reply({
embeds: [dashboardEmbed(guild)],
ephemeral: true
});
}

// ---------------- CLAIM ----------------
if (commandName === "claim") {

if (!isAdmin(member))
return interaction.reply({
content: "No permission.",
ephemeral: true
});

await channel.send({
embeds: [
new EmbedBuilder()
.setColor(COLOR_MAIN)
.setDescription(`📌 Ticket claimed by <@${interaction.user.id}>`)
]
});

return interaction.reply({
content: "Claimed.",
ephemeral: true
});
}

// ---------------- CLOSE ----------------
if (commandName === "close") {

if (!isAdmin(member))
return interaction.reply({
content: "No permission.",
ephemeral: true
});

await interaction.reply({
content: "Closing ticket...",
ephemeral: true
});

return closeTicket(channel, interaction.user.tag);
}

// ---------------- SAY ----------------
if (commandName === "say") {

if (!isAdmin(member))
return interaction.reply({
content: "No permission.",
ephemeral: true
});

const msg = options.getString("message");

await channel.send({ content: msg });

return interaction.reply({
content: "Sent.",
ephemeral: true
});
}

// ---------------- GENKEY ----------------
if (commandName === "genkey") {

if (!isAdmin(member))
return interaction.reply({
content: "No permission.",
ephemeral: true
});

const duration = options.getString("duration");
const key = generateKey();
const seconds = durationToSeconds(duration);

const res = await fetch(`${API_URL}/addkey`, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({
secret: API_SECRET,
key,
duration: seconds
})
}).then(r=>r.json()).catch(()=>null);

if (!res || !res.success) {
return interaction.reply({
content: "❌ API failed.",
ephemeral: true
});
}

const script = `_G.KEY="${key}"\nloadstring(game:HttpGet("${LOADER_URL}"))()`;

return interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(COLOR_GREEN)
.setTitle("✅ Key Generated")
.addFields(
{
name: "Key",
value: `\`${key}\``
},
{
name: "Duration",
value: durationLabel(duration),
inline: true
},
{
name: "Loader",
value: "```lua\n" + script + "\n```"
}
)
],
ephemeral: true
});
}

// ---------------- CHECKKEY ----------------
if (commandName === "checkkey") {

if (!isAdmin(member))
return interaction.reply({
content: "No permission.",
ephemeral: true
});

const key = options.getString("key");

const res = await fetch(`${API_URL}/check?key=${key}&secret=${API_SECRET}`)
.then(r=>r.json())
.catch(()=>null);

return interaction.reply({
content: "```json\n" + JSON.stringify(res,null,2) + "\n```",
ephemeral: true
});
}

// ---------------- REVOKEKEY ----------------
if (commandName === "revokekey") {

if (!isAdmin(member))
return interaction.reply({
content: "No permission.",
ephemeral: true
});

const key = options.getString("key");

await fetch(`${API_URL}/revoke`, {
method: "POST",
headers: { "Content-Type":"application/json" },
body: JSON.stringify({
secret: API_SECRET,
key
})
}).catch(()=>null);

return interaction.reply({
content: "✅ Key revoked.",
ephemeral: true
});
}

// ---------------- RESETHWID ----------------
if (commandName === "resethwid") {

if (!isAdmin(member))
return interaction.reply({
content: "No permission.",
ephemeral: true
});

const key = options.getString("key");

await fetch(`${API_URL}/resethwid`, {
method: "POST",
headers: { "Content-Type":"application/json" },
body: JSON.stringify({
secret: API_SECRET,
key
})
}).catch(()=>null);

return interaction.reply({
content: "✅ HWID reset.",
ephemeral: true
});
}

// =====================================================
// Phantom.wtf Premium Bot - PART 4 / 4
// Buttons + Select Menus + Ticket System + Closing
// Continue below PART 3
// =====================================================

// -----------------------------------------------------
// BUTTON HANDLER
// -----------------------------------------------------
async function handleButton(interaction) {

const { customId, guild, user } = interaction;

// ---------------- BUY SCRIPT ----------------
if (customId === "buy_script") {

const menu = new StringSelectMenuBuilder()
.setCustomId("choose_product")
.setPlaceholder("Select product")
.addOptions([
{
label: "South Bronx",
description: "Premium Roblox Script",
emoji: "👻",
value: "southbronx"
}
]);

const row = new ActionRowBuilder().addComponents(menu);

return interaction.reply({
content: "Choose product below.",
components: [row],
ephemeral: true
});
}

// ---------------- SUPPORT ----------------
if (customId === "open_support") {

const ch = await guild.channels.create({
name: `support-${user.username}`.toLowerCase(),
type: ChannelType.GuildText,
permissionOverwrites: [
{
id: guild.id,
deny: [PermissionsBitField.Flags.ViewChannel]
},
{
id: user.id,
allow: [
PermissionsBitField.Flags.ViewChannel,
PermissionsBitField.Flags.SendMessages
]
},
{
id: ADMIN_ROLE_ID,
allow: [
PermissionsBitField.Flags.ViewChannel,
PermissionsBitField.Flags.SendMessages
]
}
]
});

await ch.send({
content: `<@${user.id}> <@&${ADMIN_ROLE_ID}>`,
embeds: [
new EmbedBuilder()
.setColor(COLOR_MAIN)
.setTitle("🎫 Support Ticket")
.setDescription("Describe your issue. Staff will help shortly.")
]
});

return interaction.reply({
content: `✅ Ticket created: ${ch}`,
ephemeral: true
});
}

// ---------------- PRICE BUTTON ----------------
if (customId === "view_prices") {

return interaction.reply({
embeds: [
new EmbedBuilder()
.setColor(COLOR_MAIN)
.setTitle("💰 Pricing")
.setDescription(`
South Bronx

1 Day — Rp10.000 / $1
3 Day — Rp20.000 / $2
7 Day — Rp35.000 / $3
30 Day — Rp100.000 / $7
Lifetime — Rp150.000 / $10
`)
],
ephemeral: true
});
}

// ---------------- I PAID ----------------
if (customId.startsWith("paid_")) {

const ticketId = customId.split("_")[1];
const data = orders.get(ticketId);

if (!data)
return interaction.reply({
content: "Order not found.",
ephemeral: true
});

data.status = "waiting";
saveData();

await interaction.reply({
content: "✅ Payment submitted. Waiting admin approval.",
ephemeral: true
});

const logCh = guild.channels.cache.get(logChannelId);

if (logCh) {
await logCh.send({
embeds: [
new EmbedBuilder()
.setColor(COLOR_YELLOW)
.setTitle("💸 Payment Submitted")
.addFields(
{ name: "User", value: `<@${data.userId}>`, inline: true },
{ name: "Product", value: data.product, inline: true },
{ name: "Duration", value: data.duration, inline: true }
)
]
});
}

return;
}

// ---------------- APPROVE ----------------
if (customId.startsWith("approve_")) {

if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID))
return interaction.reply({
content: "No permission.",
ephemeral: true
});

const ticketId = customId.split("_")[1];
const data = orders.get(ticketId);

if (!data) return;

data.status = "approved";
saveData();

const ch = guild.channels.cache.get(ticketId);

if (ch) {
await ch.send({
content: `<@${data.userId}>`,
embeds: [
new EmbedBuilder()
.setColor(COLOR_GREEN)
.setTitle("✅ Payment Approved")
.setDescription("Your order has been approved.\nStaff will deliver key now.")
]
});
}

return interaction.reply({
content: "Approved.",
ephemeral: true
});
}

// ---------------- REJECT ----------------
if (customId.startsWith("reject_")) {

if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID))
return interaction.reply({
content: "No permission.",
ephemeral: true
});

const ticketId = customId.split("_")[1];
const data = orders.get(ticketId);

if (!data) return;

data.status = "rejected";
saveData();

const ch = guild.channels.cache.get(ticketId);

if (ch) {
await ch.send({
content: `<@${data.userId}>`,
embeds: [
new EmbedBuilder()
.setColor(COLOR_RED)
.setTitle("❌ Payment Rejected")
.setDescription("Please contact staff.")
]
});
}

return interaction.reply({
content: "Rejected.",
ephemeral: true
});
}

}

// -----------------------------------------------------
// SELECT MENU HANDLER
// -----------------------------------------------------
async function handleSelect(interaction) {

const { customId, guild, user } = interaction;

// ---------------- PRODUCT SELECT ----------------
if (customId === "choose_product") {

const durationMenu = new StringSelectMenuBuilder()
.setCustomId("choose_duration")
.setPlaceholder("Select duration")
.addOptions([
{ label:"1 Day", value:"1d" },
{ label:"3 Day", value:"3d" },
{ label:"7 Day", value:"7d" },
{ label:"30 Day", value:"30d" },
{ label:"Lifetime", value:"perm" }
]);

return interaction.update({
content: "Choose duration below.",
components: [
new ActionRowBuilder().addComponents(durationMenu)
]
});
}

// ---------------- DURATION SELECT ----------------
if (customId === "choose_duration") {

const dur = interaction.values[0];
const price = durationPrice(dur);
const usd = durationUSD(dur);

const ch = await guild.channels.create({
name: `order-${user.username}`.toLowerCase(),
type: ChannelType.GuildText,
permissionOverwrites: [
{
id: guild.id,
deny: [PermissionsBitField.Flags.ViewChannel]
},
{
id: user.id,
allow: [
PermissionsBitField.Flags.ViewChannel,
PermissionsBitField.Flags.SendMessages
]
},
{
id: ADMIN_ROLE_ID,
allow: [
PermissionsBitField.Flags.ViewChannel,
PermissionsBitField.Flags.SendMessages
]
}
]
});

orders.set(ch.id, {
userId: user.id,
product: "South Bronx",
duration: durationLabel(dur),
price,
usd,
status: "payment",
lastActivity: Date.now()
});

saveData();

const row = new ActionRowBuilder()
.addComponents(
new ButtonBuilder()
.setCustomId(`paid_${ch.id}`)
.setLabel("I've Paid")
.setStyle(ButtonStyle.Success)
.setEmoji("✅")
);

await ch.send({
content: `<@${user.id}>`,
embeds: [
paymentEmbed({
product: "South Bronx",
duration: durationLabel(dur),
price,
usd
})
],
components: [row]
});

return interaction.update({
content: `✅ Order created: ${ch}`,
components: []
});
}

}

// -----------------------------------------------------
// CLOSE TICKET FUNCTION
// -----------------------------------------------------
async function closeTicket(channel, reason = "Closed") {

try {

await channel.send({
embeds: [
new EmbedBuilder()
.setColor(COLOR_RED)
.setDescription(`🔒 ${reason}`)
]
}).catch(()=>null);

setTimeout(async () => {
await channel.delete().catch(()=>null);
}, 3000);

} catch (e) {
console.log(e);
}

}

// -----------------------------------------------------
// MESSAGE ACTIVITY TRACKER
// -----------------------------------------------------
client.on("messageCreate", async (msg) => {

if (msg.author.bot) return;

const data = orders.get(msg.channel.id);

if (data) {
data.lastActivity = Date.now();
saveData();
}

});

// -----------------------------------------------------
// LOGIN
// -----------------------------------------------------
client.login(TOKEN);

