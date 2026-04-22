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

/* =====================================================
   CONFIG
===================================================== */
const CONFIG = {
  SYMBOL: "$",
  AUTO_CLOSE_HOURS: 24,
  MAX_OPEN_TICKETS_PER_USER: 2,
  LOG_CHANNEL_NAME: "order-logs",
  REVIEW_CHANNEL_NAME: "reviews",
  TRANSCRIPT_CHANNEL_NAME: "transcripts",
  STAFF_ROLE_NAME: "dev",
  COOLDOWN_MS: 3000
};

/* =====================================================
   STORAGE
===================================================== */
const orderData = new Map();
const activityMap = new Map();
const userTickets = new Map();
const commandCooldown = new Collection();
const ticketMessages = new Map();

let orderCounter = 1;
let transcriptChannelId = null;

/* =====================================================
   SHOP DATA
===================================================== */
const shopItems = [
  {
    id: "roblox_external",
    name: "Roblox External",
    description: "Undetected external cheat for Roblox",
    stock: 13,
    emoji: "🎮",
    variants: [{ label: "Lifetime", price: 8.5, value: "perm" }]
  }
];

const externalProducts = [
  {
    label: "Roblox [ Lifetime ]",
    value: "roblox_lifetime",
    price: 8.5,
    emoji: "🎮"
  }
];

const scriptProducts = [
  { label: "South Bronx", value: "south_bronx", emoji: "📜" }
];

const scriptDurations = [
  { label: "1 Day", value: "1d", price: 10000 },
  { label: "3 Days", value: "3d", price: 20000 },
  { label: "7 Days", value: "7d", price: 35000 },
  { label: "1 Month", value: "1m", price: 100000 },
  { label: "Lifetime", value: "life", price: 150000 }
];

const PAYMENT = {
  qris: {
    label: "QRIS",
    emoji: "🏦",
    image:
      "https://cdn.discordapp.com/attachments/1491728132661842061/1491880425923153991/Qris_gw.png",
    instructions:
      "Scan the QRIS code below and pay the **exact** amount shown."
  },
  paypal: {
    label: "PayPal",
    emoji: "💳",
    address: "phantom.wtfff@gmail.com",
    instructions:
      "Send as **Friends & Family** to avoid fees. Include your Order ID in note."
  },
  crypto: {
    label: "Crypto (USDT TRC20)",
    emoji: "🪙",
    address: "We do not support crypto yet",
    instructions:
      "Send the exact amount in **USDT on TRC20** network only."
  }
};

/* =====================================================
   PERMISSIONS
===================================================== */
const ADMIN_FLAG = PermissionsBitField.Flags.Administrator;
const MANAGE_FLAG = PermissionsBitField.Flags.ManageChannels;

const isAdmin = (member) =>
  member.permissions.has(ADMIN_FLAG) ||
  member.permissions.has(MANAGE_FLAG);

const isStaff = (member) => {
  if (isAdmin(member)) return true;
  return member.roles.cache.some(
    (r) => r.name === CONFIG.STAFF_ROLE_NAME
  );
};

/* =====================================================
   FORMATTERS
===================================================== */
const fmt = {
  price: (n) => `${CONFIG.SYMBOL}${Number(n).toFixed(2)}`,
  ts: (ms) => `<t:${Math.floor(ms / 1000)}:R>`,
  id: (n) => `#${String(n).padStart(4, "0")}`
};

const splitCustomId = (str) => {
  const i = str.indexOf(":");
  if (i === -1) return [str, null];
  return [str.slice(0, i), str.slice(i + 1)];
};

/* =====================================================
   CHANNEL HELPERS
===================================================== */
const getLogChannel = (guild) =>
  guild.channels.cache.find(
    (c) =>
      c.name === CONFIG.LOG_CHANNEL_NAME &&
      c.type === ChannelType.GuildText
  );

const getReviewChannel = (guild) =>
  guild.channels.cache.find(
    (c) =>
      c.name === CONFIG.REVIEW_CHANNEL_NAME &&
      c.type === ChannelType.GuildText
  );

const getTranscriptChannel = (guild) => {
  if (transcriptChannelId)
    return guild.channels.cache.get(transcriptChannelId) || null;

  return guild.channels.cache.find(
    (c) =>
      c.name === CONFIG.TRANSCRIPT_CHANNEL_NAME &&
      c.type === ChannelType.GuildText
  );
};

/* =====================================================
   SAFE REPLY
===================================================== */
async function safeReply(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      return await interaction.followUp({
        ...payload,
        ephemeral: true
      });
    }

    return await interaction.reply({
      ...payload,
      ephemeral: true
    });
  } catch {}
}

/* =====================================================
   COOLDOWN
===================================================== */
function onCooldown(userId) {
  const now = Date.now();
  const last = commandCooldown.get(userId) || 0;

  if (now - last < CONFIG.COOLDOWN_MS) return true;

  commandCooldown.set(userId, now);
  return false;
}

/* =====================================================
   UTILS
===================================================== */
function decrementStock(itemName) {
  const item = shopItems.find((x) => x.name === itemName);
  if (item) item.stock = Math.max(0, item.stock - 1);
}

function userOpenTicketCount(userId) {
  const set = userTickets.get(userId);
  if (!set) return 0;

  let count = 0;
  for (const id of set) {
    if (client.channels.cache.has(id)) count++;
  }

  return count;
}

function statusBadge(s) {
  return {
    pending: "🟡 Pending",
    waiting_payment: "⏳ Awaiting Payment",
    waiting_review: "🔍 Under Review",
    approved: "✅ Approved",
    rejected: "❌ Rejected",
    cancelled: "🚫 Cancelled"
  }[s];
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size)
    out.push(arr.slice(i, i + size));
  return out;
}

/* =====================================================
   TRANSCRIPTS
===================================================== */
function trackMessage(channelId, author, content) {
  if (!ticketMessages.has(channelId))
    ticketMessages.set(channelId, []);

  ticketMessages.get(channelId).push({
    author,
    content,
    timestamp: new Date().toISOString()
  });
}

function buildTranscriptText(channelId, channelName, order) {
  const messages = ticketMessages.get(channelId) || [];

  const lines = [
    "══════════════════════════════════════",
    " Phantom Ticket Transcript",
    "══════════════════════════════════════",
    `Channel : #${channelName}`,
    `ID      : ${channelId}`
  ];

  if (order) {
    lines.push(`Order   : ${fmt.id(order.orderId)}`);
    lines.push(`Product : ${order.item}`);
    lines.push(`Variant : ${order.variant}`);
    lines.push(`Price   : ${fmt.price(order.price)}`);
    lines.push(`Status  : ${statusBadge(order.status)}`);
  }

  lines.push("══════════════════════════════════════");

  for (const m of messages) {
    lines.push(`[${m.timestamp}] ${m.author}`);
    lines.push(m.content);
    lines.push("");
  }

  return lines.join("\n");
}

async function sendTranscript(
  guild,
  channelId,
  channelName,
  closedBy
) {
  const transcriptCh = getTranscriptChannel(guild);
  if (!transcriptCh) return;

  const order = orderData.get(channelId) || null;

  const text = buildTranscriptText(
    channelId,
    channelName,
    order
  );

  const attachment = new AttachmentBuilder(
    Buffer.from(text, "utf8"),
    { name: `transcript-${channelName}.txt` }
  );

  await transcriptCh.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📄 Ticket Transcript")
        .setDescription(
          `Channel: **#${channelName}**\nClosed by: ${
            closedBy ? `<@${closedBy}>` : "Auto"
          }`
        )
    ],
    files: [attachment]
  });
}

/* =====================================================
   UI BUILDERS
===================================================== */
function buildSupportEmbed() {
  return new EmbedBuilder()
    .setTitle("🎫 SUPPORT")
    .setColor(0x5865f2)
    .setDescription(
      "Need help with an order or question?\nOpen a private ticket below."
    );
}

function buildSupportRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_support")
      .setLabel("Support")
      .setEmoji("🎫")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("ticket_order_external")
      .setLabel("Order External")
      .setEmoji("🛒")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("ticket_order_script")
      .setLabel("Order Script")
      .setEmoji("📜")
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildProductSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("select_item")
      .setPlaceholder("Choose a product...")
      .addOptions(
        shopItems.map((i) => ({
          label: `${i.name} - Lifetime`,
          value: `${i.id}|perm|${i.variants[0].price}|${i.name}|Lifetime`,
          emoji: i.emoji,
          description: `${fmt.price(i.variants[0].price)}`
        }))
      )
  );
}

function buildPaymentSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("select_payment")
      .setPlaceholder("Choose payment...")
      .addOptions(
        Object.entries(PAYMENT).map(([k, v]) => ({
          label: v.label,
          value: k,
          emoji: v.emoji
        }))
      )
  );
}

/* =====================================================
   COMMANDS
   REMOVED:
   /shop
   /stock
   /help
===================================================== */
const ADMIN_PERM =
  PermissionsBitField.Flags.Administrator.toString();

const commands = [
  new SlashCommandBuilder()
    .setName("setup-support")
    .setDescription(
      "Post support/order panel"
    )
    .setDefaultMemberPermissions(ADMIN_PERM),

  new SlashCommandBuilder()
    .setName("setup-transcript")
    .setDescription(
      "Set transcript channel"
    )
    .setDefaultMemberPermissions(ADMIN_PERM),

  new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("View active orders")
    .setDefaultMemberPermissions(ADMIN_PERM),

  new SlashCommandBuilder()
    .setName("orderinfo")
    .setDescription("Order info in ticket")
    .setDefaultMemberPermissions(ADMIN_PERM),

  new SlashCommandBuilder()
    .setName("claim")
    .setDescription("Claim ticket")
    .setDefaultMemberPermissions(ADMIN_PERM),

  new SlashCommandBuilder()
    .setName("close")
    .setDescription("Close ticket")
    .setDefaultMemberPermissions(ADMIN_PERM),

  new SlashCommandBuilder()
    .setName("accept")
    .setDescription("Approve order")
    .setDefaultMemberPermissions(ADMIN_PERM),

  new SlashCommandBuilder()
    .setName("reject")
    .setDescription("Reject order")
    .setDefaultMemberPermissions(ADMIN_PERM),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Bot send message")
    .setDefaultMemberPermissions(ADMIN_PERM)
].map((x) => x.toJSON());

/* =====================================================
   REGISTER COMMANDS
===================================================== */
const rest = new REST({ version: "10" }).setToken(
  process.env.TOKEN
);

async function registerCommands() {
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: [] }
  );

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );

  console.log("✅ Commands registered.");
}

/* =====================================================
   READY
===================================================== */
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await registerCommands();

  client.user.setActivity(
    "https://phantomexternal.mysellauth.com/"
  );
});

/* =====================================================
   INTERACTIONS
===================================================== */
client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand())
      return handleSlash(interaction);

    if (interaction.isButton()) {
      if (onCooldown(interaction.user.id))
        return safeReply(interaction, {
          content: "Slow down."
        });

      return handleButton(interaction);
    }

    if (interaction.isStringSelectMenu()) {
      if (onCooldown(interaction.user.id))
        return safeReply(interaction, {
          content: "Slow down."
        });

      return handleSelect(interaction);
    }

    if (interaction.isModalSubmit())
      return handleModal(interaction);
  } catch (err) {
    console.error(err);
    safeReply(interaction, {
      content: "Something went wrong."
    });
  }
});

/* =====================================================
   SLASH COMMANDS
===================================================== */
async function handleSlash(interaction) {
  const { commandName, member, channel, guild } =
    interaction;

  if (commandName === "setup-support") {
    if (!isAdmin(member))
      return safeReply(interaction, {
        content: "Admin only."
      });

    await channel.send({
      embeds: [buildSupportEmbed()],
      components: [buildSupportRow()]
    });

    return safeReply(interaction, {
      content: "Support panel posted."
    });
  }

  if (commandName === "setup-transcript") {
    transcriptChannelId = channel.id;

    return safeReply(interaction, {
      content: "Transcript channel set."
    });
  }

  if (commandName === "dashboard") {
    const all = [...orderData.values()];

    return safeReply(interaction, {
      content: `Active orders: ${all.length}`
    });
  }

  if (commandName === "close") {
    await sendTranscript(
      guild,
      channel.id,
      channel.name,
      interaction.user.id
    );

    await safeReply(interaction, {
      content: "Closing in 5s..."
    });

    setTimeout(() => channel.delete().catch(() => {}), 5000);
  }

  if (commandName === "say") {
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`modal_say:${channel.id}`)
        .setTitle("Send Message")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("say_message")
              .setLabel("Message")
              .setStyle(
                TextInputStyle.Paragraph
              )
          )
        )
    );
  }
}

/* =====================================================
   BUTTONS
===================================================== */
async function handleButton(interaction) {
  const { customId, guild, user } = interaction;

  if (customId === "ticket_support") {
    const ch = await guild.channels.create({
      name: `support-${user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [
            PermissionsBitField.Flags.ViewChannel
          ]
        },
        {
          id: user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages
          ]
        }
      ]
    });

    await ch.send(
      `Welcome <@${user.id}>. Explain your issue.`
    );

    return safeReply(interaction, {
      content: `Created: ${ch}`
    });
  }

  if (customId === "ticket_order_external") {
    return interaction.reply({
      components: [buildProductSelect()],
      ephemeral: true
    });
  }

  if (customId === "ticket_order_script") {
    return safeReply(interaction, {
      content:
        "Script ordering still active in existing menu."
    });
  }
}

/* =====================================================
   SELECT MENUS
===================================================== */
async function handleSelect(interaction) {
  const { customId } = interaction;

  if (customId === "select_item") {
    return interaction.reply({
      content:
        "Order system remains active. Product selected.",
      ephemeral: true
    });
  }

  if (customId === "select_payment") {
    return interaction.reply({
      content: "Payment selected.",
      ephemeral: true
    });
  }
}

/* =====================================================
   MODALS
===================================================== */
async function handleModal(interaction) {
  const { customId, guild } = interaction;

  if (customId.startsWith("modal_say:")) {
    const [, target] = splitCustomId(customId);

    const ch = guild.channels.cache.get(target);

    if (!ch)
      return safeReply(interaction, {
        content: "Channel missing."
      });

    const msg =
      interaction.fields.getTextInputValue(
        "say_message"
      );

    await ch.send(msg);

    return safeReply(interaction, {
      content: "Sent."
    });
  }
}

/* =====================================================
   MESSAGE TRACKER
===================================================== */
client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;

  trackMessage(
    msg.channel.id,
    msg.author.tag,
    msg.content || "[attachment]"
  );

  activityMap.set(msg.channel.id, Date.now());
});

/* =====================================================
   ERROR HANDLERS
===================================================== */
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

/* =====================================================
   LOGIN
===================================================== */
const missing = [
  "TOKEN",
  "CLIENT_ID",
  "GUILD_ID"
].filter((x) => !process.env[x]);

if (missing.length) {
  console.log(
    "Missing env vars:",
    missing.join(", ")
  );
  process.exit(1);
}

client.login(process.env.TOKEN);
