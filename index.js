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
  ChannelType
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===== SHOP DATA =====
const shopItems = [
  { name: "Roblox External", price: 3-18, stock: 13 },
  { name: "Rust", price: 20, stock: 4 },
  { name: "Valorant", price: 10, stock: 8 }
];

// ===== PAYMENT CONFIG =====
const PAYMENT = {
  qrisImage: "https://cdn.discordapp.com/attachments/1491728132661842061/1491880425923153991/Qris_gw.png?ex=69d94d6b&is=69d7fbeb&hm=ed8c9148dbab3ca0c8ef06ddce14aa7e8b11f69034ae389033ac4d6887ae966b&",
  paypalEmail: "your-paypal@email.com"
};

// ===== TEMP STORAGE =====
const pendingProofs = new Map();

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder().setName("help").setDescription("Show UI help"),
  new SlashCommandBuilder().setName("stock").setDescription("View shop"),
  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy item")
    .addStringOption(option =>
      option.setName("item")
        .setDescription("Select item")
        .setRequired(true)
        .addChoices(
          { name: "Roblox External", value: "3$ (3 Days)" },
          { name: "Roblox External", value: "7$ (7 Days)" },
          { name: "Roblox External", value: "15$ (30 Days)" },
          { name: "Roblox External", value: "18$ (Perm)" },
        )
    )
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );
})();

// ===== READY =====
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ===== INTERACTIONS =====
client.on("interactionCreate", async (interaction) => {

  // ===== SLASH =====
  if (interaction.isChatInputCommand()) {

    // HELP UI
    if (interaction.commandName === "help") {
      const embed = new EmbedBuilder()
        .setTitle("🛒 Shop UI")
        .setDescription("Use buttons below")
        .setColor("Orange");

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("shop_btn").setLabel("🛒 Shop").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("ticket_btn").setLabel("🎫 Support").setStyle(ButtonStyle.Success)
      );

      await interaction.reply({ embeds: [embed], components: [buttons] });
    }

    // STOCK
    if (interaction.commandName === "stock") {
      const embed = new EmbedBuilder().setTitle("📦 Stock").setColor("Blue");

      shopItems.forEach(i => {
        embed.addFields({
          name: i.name,
          value: `💰 $${i.price}\n📦 ${i.stock}`,
          inline: true
        });
      });

      await interaction.reply({ embeds: [embed] });
    }

    // BUY
    if (interaction.commandName === "buy") {
      const itemName = interaction.options.getString("item");
      const item = shopItems.find(i => i.name === itemName);

      if (!item || item.stock <= 0) {
        return interaction.reply({ content: "❌ Item unavailable", ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle("💳 Payment")
        .setDescription(
          `Item: **${item.name}**\nPrice: $${item.price}\n\n` +
          `Pay using:\nQRIS or PayPal: ${PAYMENT.paypalEmail}\n\nClick **I Paid**`
        )
        .setImage(PAYMENT.qrisImage)
        .setColor("Yellow");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`paid_${item.name}`)
          .setLabel("✅ I Paid")
          .setStyle(ButtonStyle.Success)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    }
  }

  // ===== BUTTONS =====
  if (interaction.isButton()) {

    // ===== CREATE TICKET =====
    if (interaction.customId === "ticket_btn") {
      const category = interaction.guild.channels.cache.find(
        c => c.name === "tickets" && c.type === ChannelType.GuildCategory
      );

      if (!category) {
        return interaction.reply({ content: "❌ Ticket category not found", ephemeral: true });
      }

      const channel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [PermissionsBitField.Flags.ViewChannel]
          }
        ]
      });

      await channel.send(`🎫 Ticket created for ${interaction.user}\nDescribe your issue.`);
      await interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
    }

    // ===== PAYMENT CLICK =====
    if (interaction.customId.startsWith("paid_")) {
      const itemName = interaction.customId.replace("paid_", "");
      pendingProofs.set(interaction.user.id, itemName);

      await interaction.reply({
        content: "📸 Send payment screenshot now (2 min)",
        ephemeral: true
      });
    }
  }

  // ===== DROPDOWN =====
  if (interaction.isStringSelectMenu()) {
    await interaction.reply({ content: "Use /stock and /buy", ephemeral: true });
  }
});

// ===== PROOF SYSTEM =====
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  const userId = msg.author.id;
  if (!pendingProofs.has(userId)) return;

  const attachment = msg.attachments.first();

  if (!attachment || !attachment.contentType?.startsWith("image")) {
    return msg.reply("❌ Send valid image.");
  }

  const itemName = pendingProofs.get(userId);
  pendingProofs.delete(userId);

  const logChannel = msg.guild.channels.cache.find(c => c.name === "orders");

  if (logChannel) {
    logChannel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🧾 Payment Proof")
          .addFields(
            { name: "User", value: msg.author.tag, inline: true },
            { name: "Item", value: itemName, inline: true }
          )
          .setImage(attachment.url)
          .setColor("Green")
      ]
    });
  }

  msg.reply("✅ Proof sent, wait admin.");
});

// ===== LOGIN =====
client.login(process.env.TOKEN);