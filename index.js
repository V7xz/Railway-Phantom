require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Collection,
  AttachmentBuilder
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const CONFIG = {
  SYMBOL: "$",
  AUTO_CLOSE_HOURS: 24,
  MAX_OPEN_TICKETS_PER_USER: 2,
  LOG_CHANNEL_NAME: "order-logs",
  REVIEW_CHANNEL_NAME: "reviews",
  TRANSCRIPT_CHANNEL_NAME: "transcripts",
  STAFF_ROLE_NAME: "dev",
  COOLDOWN_MS: 3000,
};

const orderData         = new Map();
const activityMap       = new Map();
const userTickets       = new Map();
const commandCooldown   = new Collection();
const ticketMessages    = new Map();
let   orderCounter      = 1;
let   transcriptChannelId = null;

const shopItems = [
  {
    id: "roblox_external",
    name: "Roblox External",
    description: "Undetected external cheat for Roblox",
    stock: 13,
    emoji: "🎮",
    variants: [
      { label: "Lifetime", price: 9.99, value: "perm" }
    ]
  }
];

const externalProducts = [
  { label: "Roblox [ Lifetime ]", value: "roblox_lifetime", price: 9.99, emoji: "🎮" }
];

const PAYMENT = {
  qris: {
    label: "QRIS",
    emoji: "🏦",
    image: "https://cdn.discordapp.com/attachments/1491728132661842061/1491880425923153991/Qris_gw.png",
    instructions: "Scan the QRIS code below and pay the **exact** amount shown."
  },
  paypal: {
    label: "PayPal",
    emoji: "💳",
    address: "your-paypal@email.com",
    instructions: "Send as **Friends & Family** to avoid fees. Include your Order ID in the note."
  },
  crypto: {
    label: "Crypto (USDT TRC20)",
    emoji: "🪙",
    address: "TYourCryptoAddressHere",
    instructions: "Send the exact amount in **USDT on TRC20** network only."
  }
};

const ADMIN_FLAG  = PermissionsBitField.Flags.Administrator;
const MANAGE_FLAG = PermissionsBitField.Flags.ManageChannels;

const isAdmin = (member) =>
  member.permissions.has(ADMIN_FLAG) || member.permissions.has(MANAGE_FLAG);

const isStaff = (member) => {
  if (isAdmin(member)) return true;
  return member.roles.cache.some(r => r.name === CONFIG.STAFF_ROLE_NAME);
};

const fmt = {
  price: (n)  => `${CONFIG.SYMBOL}${Number(n).toFixed(2)}`,
  ts:    (ms) => `<t:${Math.floor((ms || Date.now()) / 1000)}:R>`,
  id:    (n)  => `#${String(n).padStart(4, "0")}`
};

const splitCustomId = (str) => {
  const idx = str.indexOf(":");
  return [str.slice(0, idx), str.slice(idx + 1)];
};

const getLogChannel = (guild) =>
  guild.channels.cache.find(c => c.name === CONFIG.LOG_CHANNEL_NAME && c.type === ChannelType.GuildText);

const getReviewChannel = (guild) =>
  guild.channels.cache.find(c => c.name === CONFIG.REVIEW_CHANNEL_NAME && c.type === ChannelType.GuildText);

const getTranscriptChannel = (guild) => {
  if (transcriptChannelId) return guild.channels.cache.get(transcriptChannelId) || null;
  return guild.channels.cache.find(c => c.name === CONFIG.TRANSCRIPT_CHANNEL_NAME && c.type === ChannelType.GuildText) || null;
};

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

function onCooldown(userId) {
  const now  = Date.now();
  const last = commandCooldown.get(userId) || 0;
  if (now - last < CONFIG.COOLDOWN_MS) return true;
  commandCooldown.set(userId, now);
  return false;
}

function decrementStock(itemName) {
  const item = shopItems.find(i => i.name === itemName);
  if (item) item.stock = Math.max(0, item.stock - 1);
}

function userOpenTicketCount(userId) {
  const set = userTickets.get(userId);
  if (!set) return 0;
  let count = 0;
  for (const id of set) {
    if (orderData.has(id) || client.channels.cache.has(id)) count++;
  }
  return count;
}

function statusBadge(s) {
  return {
    pending:         "🟡 Pending",
    waiting_payment: "⏳ Awaiting Payment",
    waiting_review:  "🔍 Under Review",
    approved:        "✅ Approved",
    rejected:        "❌ Rejected",
    cancelled:       "🚫 Cancelled"
  }[s] || s;
}

function buildStockBar(current, max) {
  const filled = Math.min(10, Math.round((current / max) * 10));
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── TRANSCRIPT ────────────────────────────────────────────────────────────────
function trackMessage(channelId, author, content) {
  if (!ticketMessages.has(channelId)) ticketMessages.set(channelId, []);
  ticketMessages.get(channelId).push({ author, content, timestamp: new Date().toISOString() });
}

function buildTranscriptText(channelId, channelName, order) {
  const messages = ticketMessages.get(channelId) || [];
  const lines = [
    `══════════════════════════════════════`,
    `  BOBA SHOP — TICKET TRANSCRIPT`,
    `══════════════════════════════════════`,
    `Channel   : #${channelName}`,
    `Channel ID: ${channelId}`,
    order
      ? [`Order ID  : ${fmt.id(order.orderId)}`, `Product   : ${order.item} (${order.variant})`,
         `Price     : ${fmt.price(order.price)}`, `Customer  : ${order.userId}`,
         `Status    : ${statusBadge(order.status)}`, `Payment   : ${order.paymentMethod || "N/A"}`,
         `Opened    : ${new Date(order.createdAt).toUTCString()}`].join("\n")
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
  const transcriptCh = getTranscriptChannel(guild);
  if (!transcriptCh) return;
  const order  = orderData.get(channelId) || null;
  const text   = buildTranscriptText(channelId, channelName, order);
  const buffer = Buffer.from(text, "utf-8");
  const attachment = new AttachmentBuilder(buffer, { name: `transcript-${channelName}.txt` });
  const embed = new EmbedBuilder()
    .setTitle("📄 Ticket Transcript")
    .setColor(0x5865f2)
    .addFields(
      { name: "Channel",   value: `#${channelName}`,                              inline: true },
      { name: "Closed By", value: closedBy ? `<@${closedBy}>` : "Auto",           inline: true },
      { name: "Messages",  value: `${(ticketMessages.get(channelId) || []).length}`, inline: true }
    );
  if (order) {
    embed.addFields(
      { name: "Order",   value: fmt.id(order.orderId),              inline: true },
      { name: "Product", value: `${order.item} (${order.variant})`, inline: true },
      { name: "Status",  value: statusBadge(order.status),           inline: true }
    );
  }
  embed.setTimestamp();
  await transcriptCh.send({ embeds: [embed], files: [attachment] }).catch(() => {});
  ticketMessages.delete(channelId);
}

// ── BUILDERS ──────────────────────────────────────────────────────────────────
function buildShopEmbed() {
  const e = new EmbedBuilder()
    .setTitle("🛒  BOBA SHOP")
    .setDescription("Browse our catalogue and open a ticket to purchase.")
    .setColor(0x2b2d31)
    .setFooter({ text: "Use the buttons below to browse or get support." })
    .setTimestamp();
  shopItems.forEach(item => {
    e.addFields({
      name:  `${item.emoji}  ${item.name}  ·  ${item.stock} in stock`,
      value: `*${item.description}*\n${item.variants.map(v => `\`${v.label}\` → **${fmt.price(v.price)}**`).join("  |  ")}`,
      inline: false
    });
  });
  return e;
}

function buildShopRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("open_shop") .setLabel("Browse & Buy").setStyle(ButtonStyle.Primary)  .setEmoji("🛍️"),
    new ButtonBuilder().setCustomId("view_stock").setLabel("Live Stock")  .setStyle(ButtonStyle.Secondary).setEmoji("📦")
  );
}

function buildSupportEmbed() {
  return new EmbedBuilder()
    .setTitle("🎫  SUPPORT")
    .setDescription("Need help with an order or have a question?\nClick a button below to open a **private** ticket.\n\nA staff member will assist you as soon as possible.")
    .setColor(0x5865f2)
    .addFields({ name: "📌 Before opening a ticket", value: "• Check if your question is already answered\n• Have your order ID ready if it's order-related\n• Be patient — staff will respond shortly", inline: false })
    .setFooter({ text: "Do not abuse the ticket system." })
    .setTimestamp();
}

function buildSupportRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_support")       .setLabel("Support")       .setStyle(ButtonStyle.Primary).setEmoji("🎫"),
    new ButtonBuilder().setCustomId("ticket_order_external").setLabel("Order External").setStyle(ButtonStyle.Success).setEmoji("🛒")
  );
}

function buildExternalProductSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("select_external_product")
      .setPlaceholder("Select a product...")
      .addOptions(externalProducts.map(p => ({
        label:       p.label,
        value:       p.value,
        description: `Price: ${fmt.price(p.price)}`,
        emoji:       p.emoji
      })))
  );
}

function buildExternalPaymentSelect(channelId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`select_ext_payment:${channelId}`)
      .setPlaceholder("Choose payment method...")
      .addOptions(Object.entries(PAYMENT).map(([key, m]) => ({ label: m.label, value: key, emoji: m.emoji })))
  );
}

function buildProductSelect() {
  const options = [];
  shopItems.forEach(item => {
    item.variants.forEach(v => {
      options.push({
        label:       `${item.name} — ${v.label}`,
        description: `${fmt.price(v.price)} · ${item.stock} in stock`,
        value:       `${item.id}|${v.value}|${v.price}|${item.name}|${v.label}`,
        emoji:       item.emoji
      });
    });
  });
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("select_item").setPlaceholder("Choose a product and duration...").addOptions(options)
  );
}

function buildPaymentSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("select_payment")
      .setPlaceholder("Choose payment method...")
      .addOptions(Object.entries(PAYMENT).map(([key, m]) => ({ label: m.label, value: key, emoji: m.emoji })))
  );
}

function buildOrderEmbed(order) {
  const color =
    order.status === "approved"       ? 0x57f287 :
    order.status === "rejected"       ? 0xed4245 :
    order.status === "waiting_review" ? 0x5865f2 : 0xfee75c;
  return new EmbedBuilder()
    .setTitle(`📋 Order ${fmt.id(order.orderId)}`)
    .setColor(color)
    .addFields(
      { name: "Product",  value: `${order.emoji || ""}  ${order.item}`,    inline: true },
      { name: "Variant",  value: order.variant,                             inline: true },
      { name: "Price",    value: `**${fmt.price(order.price)}**`,           inline: true },
      { name: "Customer", value: `<@${order.userId}>`,                      inline: true },
      { name: "Payment",  value: order.paymentMethod || "Not selected yet", inline: true },
      { name: "Status",   value: statusBadge(order.status),                 inline: true },
      { name: "Opened",   value: fmt.ts(order.createdAt),                   inline: true }
    )
    .setFooter({ text: `Order ${fmt.id(order.orderId)}` })
    .setTimestamp();
}

function buildAdminActionRow(channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`approve_order:${channelId}`).setLabel("Approve")      .setStyle(ButtonStyle.Success)  .setEmoji("✅"),
    new ButtonBuilder().setCustomId(`reject_order:${channelId}`) .setLabel("Reject")       .setStyle(ButtonStyle.Danger)   .setEmoji("❌"),
    new ButtonBuilder().setCustomId(`request_info:${channelId}`) .setLabel("Request Info") .setStyle(ButtonStyle.Secondary).setEmoji("📝")
  );
}

// ── LOGGING ───────────────────────────────────────────────────────────────────
async function logEvent(guild, type, data, actor) {
  const ch = getLogChannel(guild);
  if (!ch) return;
  const colors = { new_order: 0x5865f2, paid: 0xfee75c, approved: 0x57f287, rejected: 0xed4245, auto_close: 0x4f545c, cancelled: 0x4f545c };
  const e = new EmbedBuilder()
    .setColor(colors[type] || 0x2b2d31)
    .setTitle(`📋 ${type.replace(/_/g, " ").toUpperCase()} — Order ${fmt.id(data?.orderId)}`)
    .setTimestamp();
  if (data) {
    e.addFields(
      { name: "Product",  value: `${data.emoji || ""} ${data.item} (${data.variant})`, inline: true },
      { name: "Price",    value: fmt.price(data.price),                                 inline: true },
      { name: "Customer", value: `<@${data.userId}>`,                                   inline: true }
    );
    if (data.paymentMethod) e.addFields({ name: "Payment", value: data.paymentMethod, inline: true });
  }
  if (actor) e.addFields({ name: "Actor", value: `<@${actor.id}>`, inline: true });
  ch.send({ embeds: [e] }).catch(() => {});
}

// ── COMMANDS ──────────────────────────────────────────────────────────────────
const ADMIN_PERM = PermissionsBitField.Flags.Administrator.toString();

const commands = [
  new SlashCommandBuilder().setName("shop").setDescription("Browse the shop and place an order"),

  new SlashCommandBuilder().setName("setup-support").setDescription("Post the support panel to this channel").setDefaultMemberPermissions(ADMIN_PERM),
  new SlashCommandBuilder().setName("setup-transcript").setDescription("Set this channel as the transcript destination").setDefaultMemberPermissions(ADMIN_PERM),
  new SlashCommandBuilder().setName("dashboard").setDescription("View all active orders").setDefaultMemberPermissions(ADMIN_PERM),
  new SlashCommandBuilder().setName("orderinfo").setDescription("Get full order info for this ticket channel").setDefaultMemberPermissions(ADMIN_PERM),
  new SlashCommandBuilder().setName("claim").setDescription("Claim this ticket").setDefaultMemberPermissions(ADMIN_PERM),
  new SlashCommandBuilder().setName("close").setDescription("Close and delete this ticket (generates transcript)").setDefaultMemberPermissions(ADMIN_PERM),
  new SlashCommandBuilder().setName("accept").setDescription("Approve the payment in this ticket channel").setDefaultMemberPermissions(ADMIN_PERM),
  new SlashCommandBuilder().setName("reject").setDescription("Reject the order in this ticket channel").setDefaultMemberPermissions(ADMIN_PERM),
  new SlashCommandBuilder().setName("say").setDescription("Make the bot send a custom message in this channel").setDefaultMemberPermissions(ADMIN_PERM),
].map(c => c.toJSON());

// ── REGISTER COMMANDS ─────────────────────────────────────────────────────────
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

async function registerCommands() {
  try {
    console.log("🔄 Clearing old commands...");
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: [] });
    console.log("🔄 Registering fresh commands...");
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
    console.log("✅ Commands registered.");
  } catch (err) {
    console.error("[REGISTER]", err);
  }
}

// ── READY ─────────────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity("https://phantomexternal.mysellauth.com/", { type: 0 });
  await registerCommands();

  setInterval(async () => {
    const threshold = CONFIG.AUTO_CLOSE_HOURS * 3600 * 1000;
    const now = Date.now();
    for (const [channelId, data] of orderData.entries()) {
      if (["approved", "rejected", "cancelled"].includes(data.status)) continue;
      const last = activityMap.get(channelId) || data.createdAt;
      if (now - last < threshold) continue;
      const ch = client.channels.cache.get(channelId);
      if (!ch) { orderData.delete(channelId); continue; }
      data.status = "cancelled";
      await ch.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("⏰ Ticket Auto-Closed").setDescription(`Closed due to **${CONFIG.AUTO_CLOSE_HOURS}h** of inactivity.`).setTimestamp()] }).catch(() => {});
      trackMessage(channelId, "SYSTEM", `[AUTO-CLOSE] Ticket closed after ${CONFIG.AUTO_CLOSE_HOURS}h of inactivity.`);
      await sendTranscript(ch.guild, channelId, ch.name, null);
      await logEvent(ch.guild, "auto_close", data, null);
      await ch.setName(`expired-${ch.name.split("-").pop()}`).catch(() => {});
    }
  }, 30 * 60 * 1000);
});

// ── INTERACTION ROUTER ────────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (interaction.isModalSubmit()) {
    try { return await handleModal(interaction); }
    catch (err) { console.error("[modal]", err); return safeReply(interaction, { content: "❌ Something went wrong." }); }
  }
  if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isStringSelectMenu()) return;
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
  } catch (err) {
    console.error("[interaction]", err);
    await safeReply(interaction, { content: "❌ Something went wrong. Try again." });
  }
});

// ── SLASH HANDLERS ────────────────────────────────────────────────────────────
async function handleSlash(interaction) {
  const { commandName, guild, member, channel } = interaction;

  if (commandName === "shop") {
    return interaction.reply({ embeds: [buildShopEmbed()], components: [buildShopRow()], flags: 64 });
  }

  if (commandName === "setup-support") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    await channel.send({ embeds: [buildSupportEmbed()], components: [buildSupportRow()] });
    return interaction.reply({ content: "✅ Support panel posted.", flags: 64 });
  }

  if (commandName === "setup-transcript") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    transcriptChannelId = channel.id;
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("✅ Transcript Channel Set").setDescription(`All ticket transcripts will now be posted in ${channel}.\n\nTranscripts are automatically generated when a ticket is closed.`).setTimestamp()],
      flags: 64
    });
  }

  if (commandName === "dashboard") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    const all = [...orderData.entries()];
    if (!all.length) return interaction.reply({ content: "📭 No active orders.", flags: 64 });
    const e = new EmbedBuilder().setTitle(`📊 Order Dashboard — ${all.length} orders`).setColor(0x5865f2).setTimestamp();
    chunkArray(all, 6)[0].forEach(([channelId, order]) => {
      e.addFields({ name: `${fmt.id(order.orderId)}  ·  ${order.item} (${order.variant})`, value: `👤 <@${order.userId}>\n💰 ${fmt.price(order.price)}\n📌 ${statusBadge(order.status)}\n📎 <#${channelId}>`, inline: true });
    });
    if (all.length > 6) e.setFooter({ text: `Showing 6 of ${all.length} orders` });
    return interaction.reply({ embeds: [e], flags: 64 });
  }

  if (commandName === "orderinfo") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    const order = orderData.get(channel.id);
    if (!order) return safeReply(interaction, { content: "❌ No order attached to this channel." });
    return interaction.reply({ embeds: [buildOrderEmbed(order)], flags: 64 });
  }

  if (commandName === "claim") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    const data = orderData.get(channel.id);
    if (data) data.claimedBy = interaction.user.id;
    trackMessage(channel.id, "SYSTEM", `[CLAIMED] Ticket claimed by ${interaction.user.tag}`);
    await channel.setName(`claimed-${interaction.user.username.slice(0, 20).toLowerCase()}`).catch(() => {});
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription(`📌 Claimed by <@${interaction.user.id}>`)] });
  }

  if (commandName === "close") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    const data = orderData.get(channel.id);
    if (data) { data.status = "cancelled"; await logEvent(guild, "cancelled", data, interaction.user); }
    trackMessage(channel.id, "SYSTEM", `[CLOSED] Ticket closed by ${interaction.user.tag}`);
    await sendTranscript(guild, channel.id, channel.name, interaction.user.id);
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x4f545c).setDescription("🚫 Ticket closed. Transcript saved. Deleting in 5 seconds...")] });
    setTimeout(() => channel.delete().catch(() => {}), 5000);
    return;
  }

  if (commandName === "accept") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    const data = orderData.get(channel.id);
    if (!data) return safeReply(interaction, { content: "❌ No order in this channel." });
    if (data.status === "approved") return safeReply(interaction, { content: "⚠️ Already approved." });
    data.status = "approved"; data.approvedAt = Date.now(); data.approvedBy = interaction.user.id;
    decrementStock(data.item);
    await channel.send({
      content: `<@${data.userId}>`,
      embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("✅ Payment Approved!").setDescription(`Your order for **${data.item} (${data.variant})** has been verified!\nA staff member will deliver your product shortly. 🎉`).setTimestamp()],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`leave_review:${channel.id}`).setLabel("Leave a Review").setStyle(ButtonStyle.Primary).setEmoji("⭐"))]
    });
    await channel.setName(`approved-${interaction.user.username.slice(0, 20).toLowerCase()}`).catch(() => {});
    await logEvent(guild, "approved", data, interaction.user);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription("✅ Approved and customer notified.")], flags: 64 });
  }

  if (commandName === "reject") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    const data = orderData.get(channel.id);
    if (!data) return safeReply(interaction, { content: "❌ No order in this channel." });
    if (data.status === "rejected") return safeReply(interaction, { content: "⚠️ Already rejected." });
    return interaction.showModal(
      new ModalBuilder().setCustomId(`modal_reject:${channel.id}`).setTitle("Reject Order").addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("reason").setLabel("Reason for rejection").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500))
      )
    );
  }

  if (commandName === "say") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    return interaction.showModal(
      new ModalBuilder().setCustomId(`modal_say:${channel.id}`).setTitle("Send a Message as the Bot").addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("say_message").setLabel("Message").setStyle(TextInputStyle.Paragraph).setPlaceholder("Type the message you want the bot to send...").setRequired(true).setMaxLength(2000)
        )
      )
    );
  }
}

// ── BUTTON HANDLERS ───────────────────────────────────────────────────────────
async function handleButton(interaction) {
  const { customId, guild, user, member, channel } = interaction;
  activityMap.set(channel.id, Date.now());

  if (customId === "open_shop") {
    return interaction.reply({
      embeds: [new EmbedBuilder().setTitle("🛒 Select a Product").setColor(0x2b2d31).setDescription("Pick a product and duration below.")],
      components: [buildProductSelect()], flags: 64
    });
  }

  if (customId === "view_stock") {
    const e = new EmbedBuilder().setTitle("📦 Live Stock").setColor(0x2b2d31).setTimestamp();
    shopItems.forEach(item => {
      e.addFields({ name: `${item.emoji}  ${item.name}`, value: `**${item.stock}** in stock\n${item.variants.map(v => `\`${v.label}\` → ${fmt.price(v.price)}`).join("  |  ")}`, inline: false });
    });
    return interaction.reply({ embeds: [e], flags: 64 });
  }

  if (customId === "ticket_support") {
    if (userOpenTicketCount(user.id) >= CONFIG.MAX_OPEN_TICKETS_PER_USER) {
      return safeReply(interaction, { content: `❌ You already have **${CONFIG.MAX_OPEN_TICKETS_PER_USER}** open tickets.` });
    }
    const ch = await guild.channels.create({
      name: `support-${user.username.slice(0, 20).toLowerCase()}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    if (!userTickets.has(user.id)) userTickets.set(user.id, new Set());
    userTickets.get(user.id).add(ch.id);
    trackMessage(ch.id, "SYSTEM", `[OPENED] Support ticket opened by ${user.tag}`);
    await ch.send({
      content: `<@${user.id}>`,
      embeds: [new EmbedBuilder().setTitle("🎫 Support Ticket").setColor(0x5865f2).setDescription("Staff will be with you shortly. Describe your issue in detail.").addFields({ name: "Opened by", value: `<@${user.id}>`, inline: true }, { name: "Opened", value: fmt.ts(Date.now()), inline: true })],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("close_support").setLabel("Close Ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒"))]
    });
    return interaction.reply({ content: `✅ Support ticket created: ${ch}`, flags: 64 });
  }

  if (customId === "ticket_order_external") {
    if (userOpenTicketCount(user.id) >= CONFIG.MAX_OPEN_TICKETS_PER_USER) {
      return safeReply(interaction, { content: `❌ You already have **${CONFIG.MAX_OPEN_TICKETS_PER_USER}** open tickets.` });
    }
    const ch = await guild.channels.create({
      name: `order-ext-${user.username.slice(0, 20).toLowerCase()}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    if (!userTickets.has(user.id)) userTickets.set(user.id, new Set());
    userTickets.get(user.id).add(ch.id);
    trackMessage(ch.id, "SYSTEM", `[OPENED] Order External ticket opened by ${user.tag}`);
    await ch.send({
      content: `<@${user.id}>`,
      embeds: [
        new EmbedBuilder()
          .setTitle("🛒 Order External")
          .setColor(0x57f287)
          .setDescription(`Welcome, <@${user.id}>! 👋\n\nPlease select the product you'd like to purchase from the dropdown below.\nA staff member will assist you shortly.`)
          .addFields({ name: "Opened by", value: `<@${user.id}>`, inline: true }, { name: "Opened", value: fmt.ts(Date.now()), inline: true })
          .setFooter({ text: "Select a product to continue." })
          .setTimestamp()
      ],
      components: [
        buildExternalProductSelect(),
        new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("close_support").setLabel("Close Ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒"))
      ]
    });
    return interaction.reply({ content: `✅ Order External ticket created: ${ch}`, flags: 64 });
  }

  if (customId === "close_support") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    trackMessage(channel.id, "SYSTEM", `[CLOSED] Ticket closed by ${interaction.user.tag}`);
    await sendTranscript(guild, channel.id, channel.name, interaction.user.id);
    await interaction.reply({ content: "🚫 Transcript saved. Deleting in 5 seconds...", flags: 64 });
    setTimeout(() => channel.delete().catch(() => {}), 5000);
    return;
  }

  if (customId === "choose_payment") {
    return interaction.reply({ content: "💳 **Select your payment method:**", components: [buildPaymentSelect()], flags: 64 });
  }

  if (customId === "paid_btn") {
    const data = orderData.get(channel.id);
    if (!data)                             return safeReply(interaction, { content: "❌ No order found for this channel." });
    if (data.userId !== user.id)           return safeReply(interaction, { content: "❌ This isn't your order." });
    if (data.status !== "waiting_payment") return safeReply(interaction, { content: "⚠️ This order is already submitted." });
    if (!data.paymentMethod)               return safeReply(interaction, { content: "❌ Choose a payment method first!", components: [buildPaymentSelect()] });
    await interaction.reply({ content: "✅ Submitted! Waiting for admin to verify your payment...", flags: 64 });
    data.status = "waiting_review"; data.paidAt = Date.now();
    trackMessage(channel.id, user.tag, `[PAID] Marked payment as sent via ${data.paymentMethod}`);
    const logCh = getLogChannel(guild);
    if (logCh) {
      await logCh.send({
        embeds: [buildOrderEmbed(data).setTitle(`🔔 Payment Submitted — Order ${fmt.id(data.orderId)}`).setDescription(`<@${user.id}> marked their order as paid. Review before approving.`)],
        components: [buildAdminActionRow(channel.id)]
      });
    }
    await channel.send({ embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle("💸 Payment Submitted!").setDescription("Your payment is under review. An admin will verify it shortly.\nDo **not** click again — it's already submitted.").addFields({ name: "Submitted", value: fmt.ts(Date.now()), inline: true })] });
    await logEvent(guild, "paid", data, user);
    return;
  }

  if (customId.startsWith("ext_paid_btn:")) {
    const [, targetChannelId] = splitCustomId(customId);
    const data = orderData.get(targetChannelId);
    if (!data)                             return safeReply(interaction, { content: "❌ No order found." });
    if (data.userId !== user.id)           return safeReply(interaction, { content: "❌ This isn't your order." });
    if (data.status !== "waiting_payment") return safeReply(interaction, { content: "⚠️ Already submitted." });
    if (!data.paymentMethod)               return safeReply(interaction, { content: "❌ Choose a payment method first!" });
    await interaction.reply({ content: "✅ Submitted! Waiting for admin to verify your payment...", flags: 64 });
    data.status = "waiting_review"; data.paidAt = Date.now();
    trackMessage(targetChannelId, user.tag, `[PAID] External order marked paid via ${data.paymentMethod}`);
    const logCh = getLogChannel(guild);
    if (logCh) {
      await logCh.send({
        embeds: [buildOrderEmbed(data).setTitle(`🔔 Payment Submitted — Order ${fmt.id(data.orderId)} [External]`).setDescription(`<@${user.id}> marked their external order as paid. Review before approving.`)],
        components: [buildAdminActionRow(targetChannelId)]
      });
    }
    await channel.send({ embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle("💸 Payment Submitted!").setDescription("Your payment is under review. An admin will verify it shortly.\nDo **not** click again — it's already submitted.").addFields({ name: "Submitted", value: fmt.ts(Date.now()), inline: true })] });
    await logEvent(guild, "paid", data, user);
    return;
  }

  if (customId.startsWith("approve_order:")) {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    const [, targetChannelId] = splitCustomId(customId);
    const data = orderData.get(targetChannelId);
    if (!data) return safeReply(interaction, { content: "❌ Order not found." });
    if (data.status === "approved") return safeReply(interaction, { content: "⚠️ Already approved." });
    data.status = "approved"; data.approvedAt = Date.now(); data.approvedBy = user.id;
    decrementStock(data.item);
    const targetCh = guild.channels.cache.get(targetChannelId);
    if (targetCh) {
      trackMessage(targetChannelId, "SYSTEM", `[APPROVED] Order approved by ${interaction.user.tag}`);
      await targetCh.send({
        content: `<@${data.userId}>`,
        embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("✅ Payment Approved!").setDescription(`Your **${data.item} (${data.variant})** is verified! Product coming shortly. 🎉`).setTimestamp()],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`leave_review:${targetChannelId}`).setLabel("Leave a Review").setStyle(ButtonStyle.Primary).setEmoji("⭐"))]
      });
      await targetCh.setName(`approved-${user.username.slice(0, 20).toLowerCase()}`).catch(() => {});
    }
    await logEvent(guild, "approved", data, user);
    try {
      await interaction.update({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Order ${fmt.id(data.orderId)} approved by <@${user.id}>`)], components: [] });
    } catch {
      await safeReply(interaction, { content: `✅ Order ${fmt.id(data.orderId)} approved.` });
    }
    return;
  }

  if (customId.startsWith("reject_order:")) {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    const [, targetChannelId] = splitCustomId(customId);
    return interaction.showModal(
      new ModalBuilder().setCustomId(`modal_reject:${targetChannelId}`).setTitle("Reject Order").addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("reason").setLabel("Reason for rejection").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500))
      )
    );
  }

  if (customId.startsWith("request_info:")) {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    const [, targetChannelId] = splitCustomId(customId);
    const data     = orderData.get(targetChannelId);
    const targetCh = guild.channels.cache.get(targetChannelId);
    if (targetCh && data) {
      trackMessage(targetChannelId, "SYSTEM", `[INFO REQUESTED] Admin ${interaction.user.tag} requested more info`);
      await targetCh.send({ content: `<@${data.userId}>`, embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle("📝 More Information Needed").setDescription("An admin needs your **payment proof** (screenshot). Please send it here.")] });
    }
    return safeReply(interaction, { content: "✅ User notified." });
  }

  if (customId.startsWith("leave_review:")) {
    return interaction.showModal(
      new ModalBuilder().setCustomId(`modal_review:${channel.id}`).setTitle("Leave a Review ⭐").addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("rating").setLabel("Rating (1–5)").setStyle(TextInputStyle.Short).setPlaceholder("5").setRequired(true).setMaxLength(1)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("review_text").setLabel("Your review").setStyle(TextInputStyle.Paragraph).setPlaceholder("Tell us about your experience...").setRequired(true).setMaxLength(500))
      )
    );
  }
}

// ── SELECT MENU HANDLERS ──────────────────────────────────────────────────────
async function handleSelect(interaction) {
  const { customId, guild, user, channel } = interaction;

  if (customId === "select_external_product") {
    const productValue = interaction.values[0];
    const product = externalProducts.find(p => p.value === productValue);
    if (!product) return safeReply(interaction, { content: "❌ Product not found." });

    const orderId = orderCounter++;
    const record = {
      orderId, userId: user.id,
      item: product.label, itemId: product.value, emoji: product.emoji,
      variant: "External", variantValue: "external",
      price: product.price, paymentMethod: null,
      status: "waiting_payment", createdAt: Date.now()
    };
    orderData.set(channel.id, record);
    activityMap.set(channel.id, Date.now());
    trackMessage(channel.id, user.tag, `[PRODUCT SELECTED] ${product.label} at ${fmt.price(product.price)}`);

    const qris   = PAYMENT.qris;
    const paypal = PAYMENT.paypal;
    const crypto = PAYMENT.crypto;

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(`${qris.emoji}  QRIS — Payment`)
          .setColor(0x5865f2)
          .setDescription(qris.instructions)
          .addFields({ name: "💰 Amount Due", value: `**${fmt.price(product.price)}**`, inline: true })
          .setImage(qris.image)
          .setFooter({ text: "After paying, select your method below and click I've Paid." })
      ]
    });

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("💳  Other Payment Methods")
          .setColor(0x5865f2)
          .addFields(
            { name: `${paypal.emoji}  PayPal`, value: `${paypal.instructions}\n**Address:** \`${paypal.address}\``, inline: false },
            { name: `${crypto.emoji}  ${crypto.label}`, value: `${crypto.instructions}\n**Wallet:** \`${crypto.address}\``, inline: false },
            { name: "💰 Amount Due", value: `**${fmt.price(product.price)}**`, inline: true }
          )
          .setFooter({ text: "Send Friends & Family for PayPal. TRC20 only for Crypto." })
      ]
    });

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(`🛒 Order ${fmt.id(orderId)}`)
          .setColor(0xfee75c)
          .setDescription("**1.** Select your payment method below\n**2.** Complete the payment using the instructions above\n**3.** Click **I've Paid ✅**")
          .addFields(
            { name: `${product.emoji}  Product`, value: product.label,                 inline: true },
            { name: "💰 Price",                  value: `**${fmt.price(product.price)}**`, inline: true },
            { name: "📌 Status",                 value: statusBadge("waiting_payment"), inline: true }
          )
          .setFooter({ text: `Order ${fmt.id(orderId)}` })
          .setTimestamp()
      ],
      components: [
        buildExternalPaymentSelect(channel.id),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ext_paid_btn:${channel.id}`).setLabel("I've Paid ✅").setStyle(ButtonStyle.Success)
        )
      ]
    });

    return interaction.reply({ content: "✅ Product selected! Please review the payment instructions above.", flags: 64 });
  }

  if (customId.startsWith("select_ext_payment:")) {
    const [, targetChannelId] = splitCustomId(customId);
    const data = orderData.get(targetChannelId);
    if (!data || data.userId !== user.id) return safeReply(interaction, { content: "❌ No active order found." });
    const key    = interaction.values[0];
    const method = PAYMENT[key];
    if (!method) return safeReply(interaction, { content: "❌ Invalid payment method." });
    data.paymentMethod = method.label;
    trackMessage(targetChannelId, user.tag, `[PAYMENT METHOD] Selected: ${method.label}`);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Payment method set to **${method.emoji} ${method.label}**. Complete your payment and click **I've Paid ✅**.`)],
      flags: 64
    });
  }

  if (customId === "select_item") {
    const [itemId, variantValue, price, itemName, variantLabel] = interaction.values[0].split("|");
    const item = shopItems.find(i => i.id === itemId);
    if (!item)            return safeReply(interaction, { content: "❌ Product not found." });
    if (item.stock <= 0)  return safeReply(interaction, { content: "❌ This product is **out of stock**." });
    if (userOpenTicketCount(user.id) >= CONFIG.MAX_OPEN_TICKETS_PER_USER) {
      return safeReply(interaction, { content: `❌ You already have **${CONFIG.MAX_OPEN_TICKETS_PER_USER}** open tickets.` });
    }
    const orderId = orderCounter++;
    const ch = await guild.channels.create({
      name: `order-${String(orderId).padStart(4, "0")}-${user.username.slice(0, 15).toLowerCase()}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.id, deny:  [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id,  allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });
    const record = { orderId, userId: user.id, item: itemName, itemId, emoji: item.emoji, variant: variantLabel, variantValue, price, paymentMethod: null, status: "waiting_payment", createdAt: Date.now() };
    orderData.set(ch.id, record);
    activityMap.set(ch.id, Date.now());
    if (!userTickets.has(user.id)) userTickets.set(user.id, new Set());
    userTickets.get(user.id).add(ch.id);
    trackMessage(ch.id, "SYSTEM", `[OPENED] Order ticket #${fmt.id(orderId)} opened by ${user.tag} for ${itemName} (${variantLabel}) at ${fmt.price(price)}`);
    await ch.send({
      content: `<@${user.id}>`,
      embeds: [
        new EmbedBuilder()
          .setTitle(`🛒 Order ${fmt.id(orderId)}`)
          .setColor(0xfee75c)
          .setDescription(`Thanks for your order, <@${user.id}>!\n\n**Step 1** — Click **Choose Payment Method**\n**Step 2** — Complete the payment\n**Step 3** — Click **I've Paid** and wait for verification`)
          .addFields(
            { name: `${item.emoji}  Product`, value: itemName,                  inline: true },
            { name: "📦 Variant",             value: variantLabel,              inline: true },
            { name: "💰 Price",               value: `**${fmt.price(price)}**`, inline: true }
          )
          .setFooter({ text: `Order ${fmt.id(orderId)}` })
          .setTimestamp()
      ],
      components: [
        new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("choose_payment").setLabel("Choose Payment Method").setStyle(ButtonStyle.Primary).setEmoji("💳")),
        new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("paid_btn").setLabel("I've Paid ✅").setStyle(ButtonStyle.Success))
      ]
    });
    await logEvent(guild, "new_order", record, user);
    return interaction.reply({ content: `✅ Order channel created: ${ch}`, flags: 64 });
  }

  if (customId === "select_payment") {
    let data = orderData.get(channel.id);
    if (!data || data.userId !== user.id) {
      for (const [, record] of orderData.entries()) {
        if (record.userId === user.id && record.status === "waiting_payment") { data = record; break; }
      }
    }
    if (!data || data.userId !== user.id) return safeReply(interaction, { content: "❌ No active order found. Please create an order first." });
    const key    = interaction.values[0];
    const method = PAYMENT[key];
    if (!method) return safeReply(interaction, { content: "❌ Invalid payment method." });
    data.paymentMethod = method.label;
    trackMessage(channel.id, user.tag, `[PAYMENT METHOD] Selected: ${method.label}`);
    const e = new EmbedBuilder()
      .setTitle(`${method.emoji}  ${method.label} — Payment Instructions`)
      .setColor(0x5865f2)
      .setDescription(method.instructions)
      .addFields({ name: "Amount Due", value: `**${fmt.price(data.price)}**`, inline: true })
      .setFooter({ text: "After paying, go to your order channel and click 'I've Paid ✅'" });
    if (key === "paypal") e.addFields({ name: "PayPal Address", value: `\`${method.address}\``, inline: true });
    if (key === "crypto") e.addFields({ name: "Wallet Address", value: `\`${method.address}\``, inline: true });
    if (key === "qris")   e.setImage(method.image);
    return interaction.reply({ embeds: [e], flags: 64 });
  }
}

// ── MODAL HANDLERS ────────────────────────────────────────────────────────────
async function handleModal(interaction) {
  const { customId, guild, user } = interaction;

  if (customId.startsWith("modal_say:")) {
    const [, targetChannelId] = splitCustomId(customId);
    const message  = interaction.fields.getTextInputValue("say_message").trim();
    const targetCh = guild.channels.cache.get(targetChannelId);
    if (!targetCh) return safeReply(interaction, { content: "❌ Channel not found." });
    await targetCh.send({ content: message }).catch(() => {});
    return interaction.reply({ content: "✅ Message sent!", flags: 64 });
  }

  if (customId.startsWith("modal_reject:")) {
    const [, targetChannelId] = splitCustomId(customId);
    const reason = interaction.fields.getTextInputValue("reason");
    const data   = orderData.get(targetChannelId);
    if (!data) return safeReply(interaction, { content: "❌ Order not found." });
    data.status = "rejected"; data.rejectedAt = Date.now(); data.rejectedBy = user.id; data.rejectionReason = reason;
    const targetCh = guild.channels.cache.get(targetChannelId);
    if (targetCh) {
      trackMessage(targetChannelId, "SYSTEM", `[REJECTED] Order rejected by ${user.tag}. Reason: ${reason}`);
      await targetCh.send({
        content: `<@${data.userId}>`,
        embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("❌ Order Rejected").setDescription(`Your payment for **${data.item} (${data.variant})** could not be verified.\n\n**Reason:** ${reason}\n\nContact staff if you believe this is a mistake.`).setTimestamp()]
      });
      await targetCh.setName(`rejected-${user.username.slice(0, 20).toLowerCase()}`).catch(() => {});
    }
    await logEvent(guild, "rejected", data, user);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`❌ Order ${fmt.id(data.orderId)} rejected.`)], flags: 64 });
  }

  if (customId.startsWith("modal_review:")) {
    const [, targetChannelId] = splitCustomId(customId);
    const rating    = interaction.fields.getTextInputValue("rating").trim();
    const reviewTxt = interaction.fields.getTextInputValue("review_text").trim();
    const stars     = parseInt(rating, 10);
    if (isNaN(stars) || stars < 1 || stars > 5) return safeReply(interaction, { content: "❌ Rating must be 1–5." });
    const starStr  = "⭐".repeat(stars) + "☆".repeat(5 - stars);
    const data     = orderData.get(targetChannelId);
    const reviewCh = getReviewChannel(guild);
    trackMessage(targetChannelId, user.tag, `[REVIEW] ${stars}/5 stars — ${reviewTxt}`);
    if (reviewCh) {
      await reviewCh.send({
        embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle(`${starStr}  New Review`).setDescription(`> ${reviewTxt}`).addFields({ name: "From", value: `<@${user.id}>`, inline: true }, { name: "Product", value: data?.item || "Unknown", inline: true }).setTimestamp()]
      });
    }
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Thanks for your review! ${starStr}`)], flags: 64 });
  }
}

// ── MESSAGE TRACKER ───────────────────────────────────────────────────────────
client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;
  const name = msg.channel.name || "";
  if (
    name.startsWith("order-")    ||
    name.startsWith("support-")  ||
    name.startsWith("claimed-")  ||
    name.startsWith("approved-") ||
    name.startsWith("rejected-") ||
    name.startsWith("order-ext-")
  ) {
    activityMap.set(msg.channel.id, Date.now());
    trackMessage(msg.channel.id, `${msg.author.tag}`, msg.content || "[attachment/embed]");
  }
});

// ── ERROR HANDLERS ────────────────────────────────────────────────────────────
process.on("unhandledRejection", (reason) => console.error("[unhandledRejection]", reason));
process.on("uncaughtException",  (err)    => console.error("[uncaughtException]",  err));

// ── LOGIN ─────────────────────────────────────────────────────────────────────
const MISSING = ["TOKEN", "CLIENT_ID", "GUILD_ID"].filter(k => !process.env[k]);
if (MISSING.length) {
  console.error(`❌ Missing required environment variables: ${MISSING.join(", ")}`);
  process.exit(1);
}

client.login(process.env.TOKEN).catch(err => {
  console.error("❌ Failed to login:", err.message);
  process.exit(1);
});
