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
  Collection
} = require("discord.js");

// ─────────────────────────────────────────────
// CLIENT
// ─────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const CONFIG = {
  CURRENCY: "USD",
  SYMBOL: "$",
  AUTO_CLOSE_HOURS: 24,          // auto-close idle tickets after X hours
  MAX_OPEN_TICKETS_PER_USER: 2,  // prevent spam
  LOG_CHANNEL_NAME: "order-logs",
  REVIEW_CHANNEL_NAME: "reviews",
  STAFF_ROLE_NAME: "Staff",      // optional staff role that can claim/close
  COOLDOWN_MS: 3000,             // per-user interaction cooldown
};

// ─────────────────────────────────────────────
// IN-MEMORY STORES  (swap for a DB in production)
// ─────────────────────────────────────────────
const orderData       = new Map();  // channelId → OrderRecord
const activityMap     = new Map();  // channelId → last message timestamp
const userTickets     = new Map();  // userId    → Set<channelId>
const commandCooldown = new Collection(); // userId → timestamp
let   orderCounter    = 1;          // sequential order IDs

// ─────────────────────────────────────────────
// SHOP CATALOGUE
// ─────────────────────────────────────────────
const shopItems = [
  {
    id: "roblox_external",
    name: "Roblox External",
    description: "Undetected external cheat for Roblox",
    stock: 13,
    emoji: "🎮",
    variants: [
      { label: "3 Days",   price: 3,  value: "3d"  },
      { label: "7 Days",   price: 7,  value: "7d"  },
      { label: "30 Days",  price: 15, value: "30d" },
      { label: "Lifetime", price: 18, value: "perm" }
    ]
  },
  {
    id: "rust",
    name: "Rust",
    description: "Rust cheat with aimbot + ESP",
    price: 20,
    stock: 4,
    emoji: "🦀",
    variants: [
      { label: "30 Days",  price: 20, value: "30d" },
      { label: "Lifetime", price: 35, value: "perm" }
    ]
  },
  {
    id: "valorant",
    name: "Valorant",
    description: "Valorant cheat — aimbot + wallhack",
    price: 10,
    stock: 8,
    emoji: "🎯",
    variants: [
      { label: "7 Days",   price: 10, value: "7d"  },
      { label: "30 Days",  price: 22, value: "30d" },
      { label: "Lifetime", price: 40, value: "perm" }
    ]
  }
];

// ─────────────────────────────────────────────
// PAYMENT METHODS
// ─────────────────────────────────────────────
const PAYMENT = {
  qris: {
    label: "QRIS",
    emoji: "🏦",
    image: "https://cdn.discordapp.com/attachments/1491728132661842061/1491880425923153991/Qris_gw.png",
    instructions: "Scan the QRIS code below and pay the exact amount."
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
    instructions: "Send exact amount in USDT on TRC20 network."
  }
};

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────
const isAdmin = (member) =>
  member.permissions.has(PermissionsBitField.Flags.Administrator) ||
  member.permissions.has(PermissionsBitField.Flags.ManageChannels);

const isStaff = (member) => {
  if (isAdmin(member)) return true;
  return member.roles.cache.some(r => r.name === CONFIG.STAFF_ROLE_NAME);
};

const fmt = {
  price: (n) => `${CONFIG.SYMBOL}${Number(n).toFixed(2)}`,
  timestamp: (ms) => `<t:${Math.floor((ms || Date.now()) / 1000)}:R>`,
  orderId: (n) => `#${String(n).padStart(4, "0")}`
};

const getLogChannel = (guild) =>
  guild.channels.cache.find(
    c => c.name === CONFIG.LOG_CHANNEL_NAME && c.type === ChannelType.GuildText
  );

const getReviewChannel = (guild) =>
  guild.channels.cache.find(
    c => c.name === CONFIG.REVIEW_CHANNEL_NAME && c.type === ChannelType.GuildText
  );

/** Safely reply/followUp to an interaction. */
async function safeReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.followUp({ ...payload, flags: 64 });
    }
    return await interaction.reply({ ...payload, flags: 64 });
  } catch (e) {
    console.error("[safeReply]", e.message);
  }
}

/** Per-user cooldown guard. Returns true if the user is on cooldown. */
function onCooldown(userId) {
  const now = Date.now();
  const last = commandCooldown.get(userId) || 0;
  if (now - last < CONFIG.COOLDOWN_MS) return true;
  commandCooldown.set(userId, now);
  return false;
}

/** Decrement stock for an item (in-memory). */
function decrementStock(itemName) {
  const item = shopItems.find(i => i.name === itemName);
  if (item && typeof item.stock === "number") {
    item.stock = Math.max(0, item.stock - 1);
  }
}

/** Open-ticket count for a user. */
function userOpenTickets(userId) {
  const set = userTickets.get(userId);
  if (!set) return 0;
  return [...set].filter(id => orderData.has(id) || client.channels.cache.has(id)).length;
}

// ─────────────────────────────────────────────
// BUILDERS — reusable UI components
// ─────────────────────────────────────────────

function buildShopEmbed() {
  const embed = new EmbedBuilder()
    .setTitle("🛒  BOBA SHOP")
    .setDescription("Browse our catalogue and open a ticket to purchase.")
    .setColor(0x2b2d31)
    .setFooter({ text: "Use /stock to see live inventory" })
    .setTimestamp();

  shopItems.forEach(item => {
    const lines = item.variants.map(v => `${v.label}: **${fmt.price(v.price)}**`).join("\n");
    embed.addFields({
      name: `${item.emoji}  ${item.name}  ·  ${item.stock} in stock`,
      value: `*${item.description}*\n${lines}`,
      inline: true
    });
  });

  return embed;
}

function buildShopRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("open_shop")
      .setLabel("Browse & Buy")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🛍️"),
    new ButtonBuilder()
      .setCustomId("ticket_support")
      .setLabel("Support")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🎫"),
    new ButtonBuilder()
      .setCustomId("view_stock")
      .setLabel("Live Stock")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("📦")
  );
}

function buildProductSelect() {
  const options = [];
  shopItems.forEach(item => {
    item.variants.forEach(v => {
      options.push({
        label: `${item.name} — ${v.label}`,
        description: `${fmt.price(v.price)} · ${item.stock} available`,
        value: `${item.id}|${v.value}|${v.price}|${item.name}|${v.label}`,
        emoji: item.emoji
      });
    });
  });

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("select_item")
      .setPlaceholder("Choose a product and duration...")
      .addOptions(options)
  );
}

function buildPaymentSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("select_payment")
      .setPlaceholder("Choose payment method...")
      .addOptions(
        Object.entries(PAYMENT).map(([key, m]) => ({
          label: m.label,
          value: key,
          emoji: m.emoji
        }))
      )
  );
}

function buildOrderEmbed(order) {
  return new EmbedBuilder()
    .setTitle(`📋 Order ${fmt.orderId(order.orderId)}`)
    .setColor(
      order.status === "approved"         ? 0x57f287 :
      order.status === "waiting_payment"  ? 0xfee75c :
      order.status === "waiting_review"   ? 0x5865f2 :
      order.status === "rejected"         ? 0xed4245 :
      0xfee75c
    )
    .addFields(
      { name: "Product",    value: `${order.emoji}  ${order.item}`,       inline: true },
      { name: "Variant",    value: order.variant,                          inline: true },
      { name: "Price",      value: `**${fmt.price(order.price)}**`,        inline: true },
      { name: "Customer",   value: `<@${order.userId}>`,                   inline: true },
      { name: "Payment",    value: order.paymentMethod || "Not selected",  inline: true },
      { name: "Status",     value: statusBadge(order.status),              inline: true },
      { name: "Opened",     value: fmt.timestamp(order.createdAt),         inline: true }
    )
    .setFooter({ text: `Order ${fmt.orderId(order.orderId)}` })
    .setTimestamp();
}

function statusBadge(status) {
  const map = {
    pending:         "🟡 Pending",
    waiting_payment: "⏳ Awaiting Payment",
    waiting_review:  "🔍 Under Review",
    approved:        "✅ Approved",
    rejected:        "❌ Rejected",
    cancelled:       "🚫 Cancelled"
  };
  return map[status] || status;
}

function buildAdminActionRow(channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`approve_order:${channelId}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId(`reject_order:${channelId}`)
      .setLabel("Reject")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌"),
    new ButtonBuilder()
      .setCustomId(`request_info:${channelId}`)
      .setLabel("Request Info")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("📝")
  );
}

// ─────────────────────────────────────────────
// COMMANDS
// ─────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Open the shop panel"),

  new SlashCommandBuilder()
    .setName("stock")
    .setDescription("View live product stock"),

  new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("[Admin] View all active orders"),

  new SlashCommandBuilder()
    .setName("claim")
    .setDescription("[Staff] Claim this support ticket"),

  new SlashCommandBuilder()
    .setName("close")
    .setDescription("[Staff] Close and archive this ticket"),

  new SlashCommandBuilder()
    .setName("accept")
    .setDescription("[Admin] Approve payment in this channel"),

  new SlashCommandBuilder()
    .setName("reject")
    .setDescription("[Admin] Reject the order in this channel"),

  new SlashCommandBuilder()
    .setName("addstock")
    .setDescription("[Admin] Add stock to a product")
    .addStringOption(opt =>
      opt.setName("product")
        .setDescription("Product ID")
        .setRequired(true)
        .addChoices(...shopItems.map(i => ({ name: i.name, value: i.id })))
    )
    .addIntegerOption(opt =>
      opt.setName("amount")
        .setDescription("Amount to add")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(999)
    ),

  new SlashCommandBuilder()
    .setName("setstock")
    .setDescription("[Admin] Set stock for a product to an exact value")
    .addStringOption(opt =>
      opt.setName("product")
        .setDescription("Product ID")
        .setRequired(true)
        .addChoices(...shopItems.map(i => ({ name: i.name, value: i.id })))
    )
    .addIntegerOption(opt =>
      opt.setName("amount")
        .setDescription("Exact stock amount")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(9999)
    ),

  new SlashCommandBuilder()
    .setName("orderinfo")
    .setDescription("[Staff] Get order info for this channel"),

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("[Admin] Post the shop panel to this channel")
];

// ─────────────────────────────────────────────
// REGISTER COMMANDS
// ─────────────────────────────────────────────
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("🔄 Clearing old commands...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: [] }
    );
    console.log("🔄 Registering slash commands...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("✅ Commands registered.");
  } catch (err) {
    console.error("[COMMAND REGISTER]", err);
  }
})();

// ─────────────────────────────────────────────
// READY
// ─────────────────────────────────────────────
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity("🛒 BOBA SHOP | /shop", { type: 0 });

  // ── Auto-close idle tickets every 30 minutes ──
  setInterval(async () => {
    const threshold = CONFIG.AUTO_CLOSE_HOURS * 60 * 60 * 1000;
    const now = Date.now();

    for (const [channelId, data] of orderData.entries()) {
      if (data.status === "approved" || data.status === "rejected" || data.status === "cancelled") {
        continue;
      }
      const last = activityMap.get(channelId) || data.createdAt;
      if (now - last > threshold) {
        const channel = client.channels.cache.get(channelId);
        if (!channel) { orderData.delete(channelId); continue; }

        data.status = "cancelled";
        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xed4245)
              .setTitle("⏰ Ticket Auto-Closed")
              .setDescription(`This ticket was automatically closed due to **${CONFIG.AUTO_CLOSE_HOURS}h** of inactivity.`)
              .setTimestamp()
          ]
        }).catch(() => {});

        await channel.setName(`expired-${channel.name.split("-").pop()}`).catch(() => {});
        await logEvent(channel.guild, "auto_close", data, null);
      }
    }
  }, 30 * 60 * 1000);
});

// ─────────────────────────────────────────────
// LOG EVENT
// ─────────────────────────────────────────────
async function logEvent(guild, type, data, actor) {
  const ch = getLogChannel(guild);
  if (!ch) return;

  const colors = {
    new_order:   0x5865f2,
    paid:        0xfee75c,
    approved:    0x57f287,
    rejected:    0xed4245,
    auto_close:  0x4f545c,
    cancelled:   0xed4245
  };

  const embed = new EmbedBuilder()
    .setColor(colors[type] || 0x2b2d31)
    .setTitle(`📋 ${type.replace(/_/g, " ").toUpperCase()} — Order ${fmt.orderId(data?.orderId)}`)
    .setTimestamp();

  if (data) {
    embed.addFields(
      { name: "Product",  value: `${data.emoji || ""} ${data.item} (${data.variant})`, inline: true },
      { name: "Price",    value: fmt.price(data.price),                                 inline: true },
      { name: "Customer", value: `<@${data.userId}>`,                                   inline: true }
    );
    if (data.paymentMethod) embed.addFields({ name: "Payment", value: data.paymentMethod, inline: true });
  }
  if (actor) embed.addFields({ name: "Actor", value: `<@${actor.id}>`, inline: true });

  ch.send({ embeds: [embed] }).catch(() => {});
}

// ─────────────────────────────────────────────
// INTERACTIONS
// ─────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (err) {
    console.error("[interactionCreate]", err);
    await safeReply(interaction, { content: "❌ An unexpected error occurred." });
  }
});

async function handleInteraction(interaction) {

  // ── MODALS ─────────────────────────────────
  if (interaction.isModalSubmit()) {
    return handleModal(interaction);
  }

  // ── SLASH COMMANDS ─────────────────────────
  if (interaction.isChatInputCommand()) {
    return handleSlash(interaction);
  }

  // ── BUTTONS ────────────────────────────────
  if (interaction.isButton()) {
    if (onCooldown(interaction.user.id)) {
      return safeReply(interaction, { content: "⏳ Please slow down." });
    }
    return handleButton(interaction);
  }

  // ── SELECT MENUS ───────────────────────────
  if (interaction.isStringSelectMenu()) {
    if (onCooldown(interaction.user.id)) {
      return safeReply(interaction, { content: "⏳ Please slow down." });
    }
    return handleSelect(interaction);
  }
}

// ─────────────────────────────────────────────
// SLASH HANDLERS
// ─────────────────────────────────────────────
async function handleSlash(interaction) {
  const { commandName, guild, member, channel } = interaction;

  // /shop — post ephemeral shop panel
  if (commandName === "shop") {
    return interaction.reply({
      embeds: [buildShopEmbed()],
      components: [buildShopRow()],
      flags: 64
    });
  }

  // /setup — post persistent shop panel in channel
  if (commandName === "setup") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    await channel.send({ embeds: [buildShopEmbed()], components: [buildShopRow()] });
    return interaction.reply({ content: "✅ Shop panel posted.", flags: 64 });
  }

  // /stock — live inventory
  if (commandName === "stock") {
    const embed = new EmbedBuilder()
      .setTitle("📦 Live Stock")
      .setColor(0x2b2d31)
      .setTimestamp();

    shopItems.forEach(item => {
      const stockBar = buildStockBar(item.stock, 20);
      embed.addFields({
        name: `${item.emoji}  ${item.name}`,
        value: `${stockBar}  **${item.stock}** available\n${item.variants.map(v => `\`${v.label}\` → ${fmt.price(v.price)}`).join("  |  ")}`,
        inline: false
      });
    });

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  // /addstock
  if (commandName === "addstock") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    const id = interaction.options.getString("product");
    const amount = interaction.options.getInteger("amount");
    const item = shopItems.find(i => i.id === id);
    if (!item) return safeReply(interaction, { content: "❌ Product not found." });
    item.stock += amount;
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`✅ Added **${amount}** to **${item.name}**. New stock: **${item.stock}**`)
      ],
      flags: 64
    });
  }

  // /setstock
  if (commandName === "setstock") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    const id = interaction.options.getString("product");
    const amount = interaction.options.getInteger("amount");
    const item = shopItems.find(i => i.id === id);
    if (!item) return safeReply(interaction, { content: "❌ Product not found." });
    item.stock = amount;
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`✅ Stock for **${item.name}** set to **${amount}**.`)
      ],
      flags: 64
    });
  }

  // /dashboard
  if (commandName === "dashboard") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });

    const allOrders = [...orderData.values()];
    if (!allOrders.length) {
      return interaction.reply({ content: "📭 No active orders.", flags: 64 });
    }

    const pages = chunkArray(allOrders, 6);
    const page = pages[0];

    const embed = new EmbedBuilder()
      .setTitle(`📊 Order Dashboard — ${allOrders.length} total`)
      .setColor(0x5865f2)
      .setTimestamp();

    page.forEach(order => {
      embed.addFields({
        name: `${fmt.orderId(order.orderId)}  ·  ${order.item} (${order.variant})`,
        value: `👤 <@${order.userId}>\n💰 ${fmt.price(order.price)}\n📌 ${statusBadge(order.status)}\n📎 <#${[...orderData.entries()].find(([, v]) => v === order)?.[0]}>`,
        inline: true
      });
    });

    if (pages.length > 1) {
      embed.setFooter({ text: `Page 1/${pages.length} — ${allOrders.length} orders total` });
    }

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  // /orderinfo
  if (commandName === "orderinfo") {
    if (!isStaff(member)) return safeReply(interaction, { content: "❌ Staff only." });
    const order = orderData.get(channel.id);
    if (!order) return safeReply(interaction, { content: "❌ No order attached to this channel." });
    return interaction.reply({ embeds: [buildOrderEmbed(order)], flags: 64 });
  }

  // /claim
  if (commandName === "claim") {
    if (!isStaff(member)) return safeReply(interaction, { content: "❌ Staff only." });
    const data = orderData.get(channel.id);
    if (data) data.claimedBy = interaction.user.id;
    await channel.setName(`claimed-${interaction.user.username.toLowerCase()}`).catch(() => {});
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setDescription(`📌 Ticket claimed by <@${interaction.user.id}>`)
      ]
    });
  }

  // /close
  if (commandName === "close") {
    if (!isStaff(member)) return safeReply(interaction, { content: "❌ Staff only." });
    const data = orderData.get(channel.id);
    if (data) data.status = "cancelled";
    await channel.setName(`closed-${interaction.user.username.toLowerCase()}`).catch(() => {});
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x4f545c)
          .setDescription("🚫 Ticket closed.")
      ]
    });
    if (data) await logEvent(guild, "cancelled", data, interaction.user);
    setTimeout(() => channel.delete().catch(() => {}), 5000);
    return;
  }

  // /accept
  if (commandName === "accept") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    const data = orderData.get(channel.id);
    if (!data) return safeReply(interaction, { content: "❌ No order in this channel." });

    data.status = "approved";
    data.approvedAt = Date.now();
    data.approvedBy = interaction.user.id;
    decrementStock(data.item);

    await channel.send({
      content: `<@${data.userId}>`,
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("✅ Payment Approved!")
          .setDescription(`Your order for **${data.item} (${data.variant})** has been verified!\n\nA staff member will deliver your product shortly. Thank you for your purchase!`)
          .setTimestamp()
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`leave_review:${channel.id}`)
            .setLabel("Leave a Review")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("⭐")
        )
      ]
    });

    await channel.setName(`approved-${interaction.user.username.toLowerCase()}`).catch(() => {});
    await logEvent(guild, "approved", data, interaction.user);

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x57f287).setDescription("✅ Order approved and customer notified.")],
      flags: 64
    });
  }

  // /reject
  if (commandName === "reject") {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    const data = orderData.get(channel.id);
    if (!data) return safeReply(interaction, { content: "❌ No order in this channel." });

    // open a modal to get rejection reason
    const modal = new ModalBuilder()
      .setCustomId(`modal_reject:${channel.id}`)
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
      );

    return interaction.showModal(modal);
  }
}

// ─────────────────────────────────────────────
// BUTTON HANDLERS
// ─────────────────────────────────────────────
async function handleButton(interaction) {
  const { customId, guild, user, member, channel } = interaction;
  activityMap.set(channel.id, Date.now());

  // ── OPEN SHOP SELECT MENU ──────────────────
  if (customId === "open_shop") {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🛒 Select a Product")
          .setColor(0x2b2d31)
          .setDescription("Choose the product and subscription length you want to purchase.")
      ],
      components: [buildProductSelect()],
      flags: 64
    });
  }

  // ── VIEW STOCK ─────────────────────────────
  if (customId === "view_stock") {
    const embed = new EmbedBuilder().setTitle("📦 Live Stock").setColor(0x2b2d31).setTimestamp();
    shopItems.forEach(item => {
      embed.addFields({
        name: `${item.emoji}  ${item.name}`,
        value: `**${item.stock}** in stock\n${item.variants.map(v => `\`${v.label}\` → ${fmt.price(v.price)}`).join("  |  ")}`,
        inline: false
      });
    });
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  // ── SUPPORT TICKET ─────────────────────────
  if (customId === "ticket_support") {
    if (userOpenTickets(user.id) >= CONFIG.MAX_OPEN_TICKETS_PER_USER) {
      return safeReply(interaction, {
        content: `❌ You already have **${CONFIG.MAX_OPEN_TICKETS_PER_USER}** open tickets. Please resolve them before opening new ones.`
      });
    }

    const ch = await guild.channels.create({
      name: `support-${user.username.toLowerCase()}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.id,  deny:  [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id,   allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });

    if (!userTickets.has(user.id)) userTickets.set(user.id, new Set());
    userTickets.get(user.id).add(ch.id);

    const embed = new EmbedBuilder()
      .setTitle("🎫 Support Ticket")
      .setColor(0x5865f2)
      .setDescription("Hey! A staff member will be with you shortly.\n\nPlease describe your issue in detail below.")
      .addFields(
        { name: "Opened by", value: `<@${user.id}>`, inline: true },
        { name: "Opened",    value: fmt.timestamp(Date.now()), inline: true }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("close_support").setLabel("Close Ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒")
    );

    await ch.send({ content: `<@${user.id}>`, embeds: [embed], components: [row] });
    return interaction.reply({ content: `✅ Support ticket created: ${ch}`, flags: 64 });
  }

  // ── CLOSE SUPPORT TICKET ───────────────────
  if (customId === "close_support") {
    if (!isStaff(member)) return safeReply(interaction, { content: "❌ Staff only." });
    await interaction.reply({ content: "🚫 Closing in 5 seconds...", flags: 64 });
    setTimeout(() => channel.delete().catch(() => {}), 5000);
    return;
  }

  // ── SELECT PAYMENT METHOD (in order channel) ──
  if (customId === "choose_payment") {
    return interaction.reply({
      content: "💳 **Select payment method:**",
      components: [buildPaymentSelect()],
      flags: 64
    });
  }

  // ── MARK AS PAID ───────────────────────────
  if (customId === "paid_btn") {
    const data = orderData.get(channel.id);
    if (!data) return safeReply(interaction, { content: "❌ No order found." });
    if (data.userId !== user.id) return safeReply(interaction, { content: "❌ This is not your order." });
    if (!data.paymentMethod) {
      return safeReply(interaction, {
        content: "❌ Please select a payment method first.",
        components: [buildPaymentSelect()]
      });
    }

    await interaction.deferUpdate();

    data.status = "waiting_review";
    data.paidAt = Date.now();

    const logCh = getLogChannel(guild);

    // Send admin panel to log channel
    if (logCh) {
      await logCh.send({
        embeds: [
          buildOrderEmbed(data)
            .setTitle(`🔔 Payment Submitted — Order ${fmt.orderId(data.orderId)}`)
            .setDescription(`<@${user.id}> has marked their order as paid.\n\nReview and verify before approving.`)
        ],
        components: [buildAdminActionRow(channel.id)]
      });
    }

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle("💸 Payment Submitted!")
          .setDescription("Your payment has been submitted for review. An admin will verify it shortly.\n\nPlease wait — do **not** submit multiple times.")
          .addFields({ name: "Submitted", value: fmt.timestamp(Date.now()), inline: true })
      ]
    });

    await logEvent(guild, "paid", data, user);
    return;
  }

  // ── ADMIN APPROVE (button from log channel) ─
  if (customId.startsWith("approve_order:")) {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    const targetChannelId = customId.split(":")[1];
    const data = orderData.get(targetChannelId);
    if (!data) return safeReply(interaction, { content: "❌ Order not found." });

    data.status = "approved";
    data.approvedAt = Date.now();
    data.approvedBy = user.id;
    decrementStock(data.item);

    const targetChannel = guild.channels.cache.get(targetChannelId);
    if (targetChannel) {
      await targetChannel.send({
        content: `<@${data.userId}>`,
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Payment Approved!")
            .setDescription(`Your order for **${data.item} (${data.variant})** has been verified!\nProduct will be delivered shortly. Thank you! 🎉`)
            .setTimestamp()
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`leave_review:${targetChannelId}`)
              .setLabel("Leave a Review")
              .setStyle(ButtonStyle.Primary)
              .setEmoji("⭐")
          )
        ]
      });
      await targetChannel.setName(`approved-${user.username.toLowerCase()}`).catch(() => {});
    }

    await logEvent(guild, "approved", data, user);
    return interaction.update({
      components: [],
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`✅ Order ${fmt.orderId(data.orderId)} approved by <@${user.id}>`)
      ]
    });
  }

  // ── ADMIN REJECT (button from log channel) ──
  if (customId.startsWith("reject_order:")) {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    const targetChannelId = customId.split(":")[1];

    const modal = new ModalBuilder()
      .setCustomId(`modal_reject:${targetChannelId}`)
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
      );

    return interaction.showModal(modal);
  }

  // ── ADMIN REQUEST INFO ─────────────────────
  if (customId.startsWith("request_info:")) {
    if (!isAdmin(member)) return safeReply(interaction, { content: "❌ Admin only." });
    const targetChannelId = customId.split(":")[1];
    const targetChannel = guild.channels.cache.get(targetChannelId);
    const data = orderData.get(targetChannelId);

    if (targetChannel && data) {
      await targetChannel.send({
        content: `<@${data.userId}>`,
        embeds: [
          new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle("📝 Additional Information Needed")
            .setDescription("An admin needs more information to process your order. Please provide your payment proof (screenshot) in this channel.")
        ]
      });
    }

    return safeReply(interaction, { content: "✅ User notified to provide more info." });
  }

  // ── LEAVE REVIEW ───────────────────────────
  if (customId.startsWith("leave_review:")) {
    const modal = new ModalBuilder()
      .setCustomId(`modal_review:${channel.id}`)
      .setTitle("Leave a Review ⭐")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("rating")
            .setLabel("Rating (1–5 stars)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("e.g. 5")
            .setRequired(true)
            .setMaxLength(1)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("review_text")
            .setLabel("Your review")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Tell us about your experience...")
            .setRequired(true)
            .setMaxLength(500)
        )
      );

    return interaction.showModal(modal);
  }
}

// ─────────────────────────────────────────────
// SELECT MENU HANDLERS
// ─────────────────────────────────────────────
async function handleSelect(interaction) {
  const { customId, guild, user, member, channel } = interaction;

  // ── PRODUCT SELECTION ──────────────────────
  if (customId === "select_item") {
    const [itemId, variantValue, price, itemName, variantLabel] = interaction.values[0].split("|");
    const item = shopItems.find(i => i.id === itemId);

    if (!item) return safeReply(interaction, { content: "❌ Product not found." });
    if (item.stock <= 0) return safeReply(interaction, { content: "❌ This product is currently **out of stock**." });

    if (userOpenTickets(user.id) >= CONFIG.MAX_OPEN_TICKETS_PER_USER) {
      return safeReply(interaction, {
        content: `❌ You already have **${CONFIG.MAX_OPEN_TICKETS_PER_USER}** open tickets. Please resolve them first.`
      });
    }

    const orderId = orderCounter++;
    const ch = await guild.channels.create({
      name: `order-${String(orderId).padStart(4, "0")}-${user.username.toLowerCase()}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.id,  deny:  [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id,   allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });

    const record = {
      orderId,
      userId: user.id,
      item: itemName,
      itemId,
      emoji: item.emoji,
      variant: variantLabel,
      variantValue,
      price,
      paymentMethod: null,
      status: "waiting_payment",
      createdAt: Date.now()
    };

    orderData.set(ch.id, record);
    activityMap.set(ch.id, Date.now());

    if (!userTickets.has(user.id)) userTickets.set(user.id, new Set());
    userTickets.get(user.id).add(ch.id);

    const embed = new EmbedBuilder()
      .setTitle(`🛒 Order ${fmt.orderId(orderId)}`)
      .setColor(0xfee75c)
      .setDescription(`Thanks for your order, <@${user.id}>!\n\n**1.** Choose a payment method below.\n**2.** Complete your payment.\n**3.** Click **"I've Paid"** and wait for staff to verify.`)
      .addFields(
        { name: `${item.emoji}  Product`, value: itemName,              inline: true },
        { name: "📦 Variant",             value: variantLabel,          inline: true },
        { name: "💰 Price",               value: `**${fmt.price(price)}**`, inline: true }
      )
      .setFooter({ text: `Order ${fmt.orderId(orderId)}` })
      .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("choose_payment")
        .setLabel("Choose Payment Method")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("💳")
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("paid_btn")
        .setLabel("I've Paid ✅")
        .setStyle(ButtonStyle.Success)
    );

    await ch.send({ content: `<@${user.id}>`, embeds: [embed], components: [row1, row2] });
    await logEvent(guild, "new_order", record, user);

    return interaction.reply({ content: `✅ Order created: ${ch}`, flags: 64 });
  }

  // ── PAYMENT METHOD SELECTION ───────────────
  if (customId === "select_payment") {
    const data = orderData.get(channel.id);
    if (!data) return safeReply(interaction, { content: "❌ No order found." });
    if (data.userId !== user.id) return safeReply(interaction, { content: "❌ This is not your order." });

    const key = interaction.values[0];
    const method = PAYMENT[key];
    if (!method) return safeReply(interaction, { content: "❌ Invalid payment method." });

    data.paymentMethod = method.label;

    const embed = new EmbedBuilder()
      .setTitle(`${method.emoji}  ${method.label} — Payment Instructions`)
      .setColor(0x5865f2)
      .setDescription(method.instructions)
      .addFields({ name: "Amount Due", value: `**${fmt.price(data.price)}**`, inline: true });

    if (key === "paypal")  embed.addFields({ name: "PayPal Address", value: `\`${method.address}\``, inline: true });
    if (key === "crypto")  embed.addFields({ name: "Wallet Address", value: `\`${method.address}\``, inline: true });
    if (key === "qris") embed.setImage(method.image);

    embed.setFooter({ text: "After paying, click 'I've Paid ✅' in your order channel." });

    return interaction.reply({ embeds: [embed], flags: 64 });
  }
}

// ─────────────────────────────────────────────
// MODAL HANDLERS
// ─────────────────────────────────────────────
async function handleModal(interaction) {
  const { customId, guild, user } = interaction;

  // ── REJECTION REASON ───────────────────────
  if (customId.startsWith("modal_reject:")) {
    const targetChannelId = customId.split(":")[1];
    const reason = interaction.fields.getTextInputValue("reason");
    const data = orderData.get(targetChannelId);

    if (!data) return safeReply(interaction, { content: "❌ Order not found." });

    data.status = "rejected";
    data.rejectedAt = Date.now();
    data.rejectedBy = user.id;
    data.rejectionReason = reason;

    const targetChannel = guild.channels.cache.get(targetChannelId);
    if (targetChannel) {
      await targetChannel.send({
        content: `<@${data.userId}>`,
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("❌ Order Rejected")
            .setDescription(`Your payment for **${data.item} (${data.variant})** could not be verified.\n\n**Reason:** ${reason}\n\nIf you believe this is a mistake, please contact staff.`)
            .setTimestamp()
        ]
      });
      await targetChannel.setName(`rejected-${user.username.toLowerCase()}`).catch(() => {});
    }

    await logEvent(guild, "rejected", data, user);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`❌ Order ${fmt.orderId(data.orderId)} rejected.`)],
      flags: 64
    });
  }

  // ── REVIEW ─────────────────────────────────
  if (customId.startsWith("modal_review:")) {
    const rating    = interaction.fields.getTextInputValue("rating").trim();
    const reviewTxt = interaction.fields.getTextInputValue("review_text").trim();
    const stars     = parseInt(rating, 10);

    if (isNaN(stars) || stars < 1 || stars > 5) {
      return safeReply(interaction, { content: "❌ Rating must be a number between 1 and 5." });
    }

    const starStr = "⭐".repeat(stars) + "☆".repeat(5 - stars);
    const data = orderData.get(customId.split(":")[1]);

    const reviewCh = getReviewChannel(guild);
    if (reviewCh) {
      await reviewCh.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xfee75c)
            .setTitle(`${starStr}  New Review`)
            .setDescription(`> ${reviewTxt}`)
            .addFields(
              { name: "From",    value: `<@${user.id}>`,         inline: true },
              { name: "Product", value: data?.item || "Unknown", inline: true }
            )
            .setTimestamp()
        ]
      });
    }

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`✅ Thanks for your review! ${starStr}`)
      ],
      flags: 64
    });
  }
}

// ─────────────────────────────────────────────
// MESSAGE LISTENER — activity tracking
// ─────────────────────────────────────────────
client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;
  const name = msg.channel.name || "";
  if (name.startsWith("order-") || name.startsWith("support-") || name.startsWith("claimed-")) {
    activityMap.set(msg.channel.id, Date.now());
  }
});

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function buildStockBar(current, max) {
  const filled = Math.round((current / max) * 10);
  const empty  = 10 - filled;
  return `${"█".repeat(filled)}${"░".repeat(empty)}`;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ─────────────────────────────────────────────
// ERROR HANDLING
// ─────────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────
client.login(process.env.TOKEN);
