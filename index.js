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
  {
    name: "Roblox External",
    stock: 13,
    variants: [
      { label: "3 Days", price: 3 },
      { label: "7 Days", price: 7 },
      { label: "30 Days", price: 15 },
      { label: "Permanent", price: 18 }
    ]
  },
  { name: "Rust", price: 20, stock: 4 },
  { name: "Valorant", price: 10, stock: 8 }
];

// ===== PAYMENT =====
const PAYMENT = {
  qrisImage: "https://cdn.discordapp.com/attachments/1491728132661842061/1491880425923153991/Qris_gw.png",
  paypalEmail: "your-paypal@email.com"
};

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder().setName("help").setDescription("Open shop UI"),
  new SlashCommandBuilder().setName("stock").setDescription("View stock")
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );
})();

// ===== READY =====
client.once("clientReady", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ===== INTERACTIONS =====
client.on("interactionCreate", async (interaction) => {

  // ===== SLASH =====
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "help") {
      const embed = new EmbedBuilder()
        .setTitle("🛒 BOBA STORE")
        .setDescription("Click below to shop or get support")
        .setColor("#2b2d31");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("open_shop").setLabel("🛒 Shop").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("ticket_btn").setLabel("🎫 Support").setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({ embeds: [embed], components: [row] });
    }

    if (interaction.commandName === "stock") {
      const embed = new EmbedBuilder()
        .setTitle("📦 Stock")
        .setColor("#2b2d31");

      shopItems.forEach(item => {
        embed.addFields({
          name: item.name,
          value: item.variants
            ? item.variants.map(v => `${v.label}: $${v.price}`).join("\n")
            : `$${item.price} | Stock: ${item.stock}`,
          inline: true
        });
      });

      return interaction.reply({ embeds: [embed] });
    }
  }

  // ===== BUTTONS =====
  if (interaction.isButton()) {

    // OPEN SHOP
    if (interaction.customId === "open_shop") {
      const options = [];

      shopItems.forEach(item => {
        if (item.variants) {
          item.variants.forEach(v => {
            options.push({
              label: `${item.name} (${v.label})`,
              value: `${item.name}|${v.label}|${v.price}`
            });
          });
        } else {
          options.push({
            label: item.name,
            value: `${item.name}|default|${item.price}`
          });
        }
      });

      const menu = new StringSelectMenuBuilder()
        .setCustomId("select_item")
        .setPlaceholder("Select product")
        .addOptions(options);

      return interaction.reply({
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true
      });
    }

    // SUPPORT TICKET
    if (interaction.customId === "ticket_btn") {
      const category = interaction.guild.channels.cache.find(
        c => c.name === "tickets" && c.type === ChannelType.GuildCategory
      );

      const channel = await interaction.guild.channels.create({
        name: `support-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: category?.id,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
        ]
      });

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("claim_ticket").setLabel("🔒 Claim").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("close_ticket").setLabel("❌ Close").setStyle(ButtonStyle.Danger)
      );

      await channel.send({
        content: `👋 Hello ${interaction.user}, can I help you?\n\n⚠️ Don't spam please.\n🕐 Your ticket will be handled shortly.`,
        components: [buttons]
      });

      return interaction.reply({ content: `✅ Created: ${channel}`, ephemeral: true });
    }

    // CLAIM
    if (interaction.customId === "claim_ticket") {
      await interaction.channel.setName(`claimed-by-${interaction.user.username}`);
      return interaction.reply({ content: `✅ Claimed by ${interaction.user}`, ephemeral: true });
    }

    // CLOSE
    if (interaction.customId === "close_ticket") {
      await interaction.channel.setName(`closed-by-${interaction.user.username}`);
      return interaction.reply({ content: `❌ Closed by ${interaction.user}`, ephemeral: true });
    }
  }

  // ===== SELECT MENU (BUY) =====
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "select_item") {

      const [name, variant, price] = interaction.values[0].split("|");

      const category = interaction.guild.channels.cache.find(
        c => c.name === "tickets" && c.type === ChannelType.GuildCategory
      );

      const channel = await interaction.guild.channels.create({
        name: `order-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: category?.id,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
        ]
      });

      const embed = new EmbedBuilder()
        .setTitle("💳 Payment")
        .setDescription(
          `👤 ${interaction.user}\n\n` +
          `📦 ${name} (${variant})\n` +
          `💰 $${price}\n\n` +
          `Pay via QRIS / PayPal\n${PAYMENT.paypalEmail}\n\n` +
          `📸 Upload payment proof here`
        )
        .setImage(PAYMENT.qrisImage)
        .setColor("Yellow");

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("claim_ticket").setLabel("🔒 Claim").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("close_ticket").setLabel("❌ Close").setStyle(ButtonStyle.Danger)
      );

      await channel.send({
        content: `${interaction.user}`,
        embeds: [embed],
        components: [buttons]
      });

      return interaction.reply({
        content: `✅ Order ticket created: ${channel}`,
        ephemeral: true
      });
    }
  }
});

// ===== PROOF SYSTEM =====
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  if (!msg.channel.name.startsWith("order-")) return;

  const att = msg.attachments.first();
  if (!att || !att.contentType?.startsWith("image")) return;

  const logChannel = msg.guild.channels.cache.find(c => c.name === "orders");

  logChannel?.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("🧾 Payment Proof")
        .addFields(
          { name: "User", value: msg.author.tag },
          { name: "Channel", value: msg.channel.name }
        )
        .setImage(att.url)
        .setColor("Green")
    ]
  });

  msg.reply("✅ Payment received, wait admin.");
});

// ===== LOGIN =====
client.login(process.env.TOKEN);
