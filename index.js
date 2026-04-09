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

// ===== TRACKING SYSTEM (NEW) =====
const ticketActivity = new Map();

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

function isAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator) ||
         member.permissions.has(PermissionsBitField.Flags.ManageChannels);
}

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder().setName("help").setDescription("Open shop UI"),
  new SlashCommandBuilder().setName("stock").setDescription("View stock"),
  new SlashCommandBuilder().setName("claim").setDescription("Claim ticket"),
  new SlashCommandBuilder().setName("close").setDescription("Close ticket"),
  new SlashCommandBuilder().setName("dashboard").setDescription("Admin panel")
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

  // ===== AUTO CLOSE CHECK (NEW) =====
  setInterval(async () => {
    const now = Date.now();

    client.guilds.cache.forEach(async (guild) => {
      guild.channels.cache.forEach(async (ch) => {
        if (!ch.name.startsWith("order-") && !ch.name.startsWith("support-")) return;

        const last = ticketActivity.get(ch.id) || now;
        const diff = now - last;

        // 24 hours = 86400000ms
        if (diff > 86400000) {
          try {
            await ch.setName(`auto-closed-inactive`);

            await ch.send("⛔ Auto-closed due to 24h inactivity.");

            ticketActivity.delete(ch.id);
          } catch (e) {}
        }
      });
    });
  }, 60 * 60 * 1000); // every 1 hour
});

// ===== INTERACTION =====
client.on("interactionCreate", async (interaction) => {

  // ===== SLASH =====
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "help") {
      const embed = new EmbedBuilder()
        .setTitle("🛒 BOBA STORE")
        .setDescription("Click below to shop or support")
        .setColor("#2b2d31");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("open_shop").setLabel("🛒 Shop").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("ticket_btn").setLabel("🎫 Support").setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({ embeds: [embed], components: [row] });
    }

    if (interaction.commandName === "stock") {
      const embed = new EmbedBuilder().setTitle("📦 Stock").setColor("#2b2d31");

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

    // ===== DASHBOARD (NEW ADMIN PANEL) =====
    if (interaction.commandName === "dashboard") {
      if (!isAdmin(interaction.member))
        return interaction.reply({ content: "❌ Admin only", ephemeral: true });

      const guild = interaction.guild;

      const orders = guild.channels.cache.filter(c => c.name.startsWith("order-")).size;
      const tickets = guild.channels.cache.filter(c => c.name.startsWith("support-")).size;
      const closed = guild.channels.cache.filter(c => c.name.includes("closed") || c.name.includes("auto-closed")).size;

      const embed = new EmbedBuilder()
        .setTitle("📊 ADMIN DASHBOARD")
        .addFields(
          { name: "🧾 Orders", value: `${orders}`, inline: true },
          { name: "🎫 Tickets", value: `${tickets}`, inline: true },
          { name: "⛔ Closed", value: `${closed}`, inline: true }
        )
        .setColor("Blue");

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("refresh_dashboard")
          .setLabel("🔄 Refresh")
          .setStyle(ButtonStyle.Primary)
      );

      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // ADMIN CLAIM
    if (interaction.commandName === "claim") {
      if (!isAdmin(interaction.member))
        return interaction.reply({ content: "❌ Admin only", ephemeral: true });

      await interaction.channel.setName(`claimed-by-${interaction.user.username}`);
      return interaction.reply({ content: `✅ Claimed`, ephemeral: true });
    }

    // CLOSE
    if (interaction.commandName === "close") {
      await interaction.channel.setName(`closed-by-${interaction.user.username}`);
      return interaction.reply({ content: `❌ Closed`, ephemeral: true });
    }
  }

  // ===== BUTTONS =====
  if (interaction.isButton()) {

    // DASHBOARD REFRESH
    if (interaction.customId === "refresh_dashboard") {
      return interaction.deferUpdate().then(() => interaction.message.reactions?.removeAll?.());
    }

    if (interaction.customId === "ticket_btn") {
      const channel = await interaction.guild.channels.create({
        name: `support-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
        ]
      });

      ticketActivity.set(channel.id, Date.now());

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("claim_ticket").setLabel("🔒 Claim").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("close_ticket").setLabel("❌ Close").setStyle(ButtonStyle.Danger)
      );

      await channel.send({ content: `${interaction.user}`, components: [buttons] });

      return interaction.reply({ content: `Created ${channel}`, ephemeral: true });
    }

    // TRACK ACTIVITY (NEW SAFE HOOK)
    ticketActivity.set(interaction.channel.id, Date.now());

    if (interaction.customId === "claim_ticket") {
      if (!isAdmin(interaction.member))
        return interaction.reply({ content: "❌ Admin only", ephemeral: true });

      await interaction.channel.setName(`claimed-by-${interaction.user.username}`);
      return interaction.reply({ content: "✅ Claimed", ephemeral: true });
    }

    if (interaction.customId === "close_ticket") {
      await interaction.channel.setName(`closed-by-${interaction.user.username}`);
      return interaction.reply({ content: "❌ Closed", ephemeral: true });
    }

    if (interaction.customId === "paid_btn") {
      await interaction.channel.setName(`pending-verification-${interaction.user.username}`);

      const verify = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("verify_payment")
          .setLabel("✔ Verify")
          .setStyle(ButtonStyle.Success)
      );

      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setFooter({ text: "⏳ Pending verification" });

      await interaction.message.edit({ embeds: [embed], components: [verify] });

      return interaction.reply({ content: "Sent for verification", ephemeral: true });
    }

    if (interaction.customId === "verify_payment") {
      if (!isAdmin(interaction.member))
        return interaction.reply({ content: "❌ Admin only", ephemeral: true });

      await interaction.channel.setName(`paid-by-${interaction.user.username}`);

      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setFooter({ text: "✔ Verified" });

      await interaction.message.edit({ embeds: [embed], components: [] });

      return interaction.reply({ content: "✔ Verified", ephemeral: true });
    }
  }

  // ===== SELECT =====
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "select_item") {

      const [name, variant, price] = interaction.values[0].split("|");

      const channel = await interaction.guild.channels.create({
        name: `order-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
        ]
      });

      ticketActivity.set(channel.id, Date.now());

      const embed = new EmbedBuilder()
        .setTitle("💳 Payment")
        .setDescription(`📦 ${name} (${variant})\n💰 $${price}`)
        .setColor("Yellow");

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("claim_ticket").setLabel("🔒 Claim").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("close_ticket").setLabel("❌ Close").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("paid_btn").setLabel("✔ Paid").setStyle(ButtonStyle.Success)
      );

      await channel.send({ embeds: [embed], components: [buttons] });

      return interaction.reply({ content: `Created ${channel}`, ephemeral: true });
    }
  }
});

// ===== MESSAGE ACTIVITY TRACK =====
client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;
  if (msg.channel.name.startsWith("order-") || msg.channel.name.startsWith("support-")) {
    ticketActivity.set(msg.channel.id, Date.now());
  }
});

// ===== LOGIN =====
client.login(process.env.TOKEN);
