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

// ================= TRACKING =================
const activityMap = new Map();
const orderData = new Map();

// ================= SHOP =================
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

// ================= PAYMENT =================
const PAYMENT = {
  qrisImage: "https://cdn.discordapp.com/attachments/1491728132661842061/1491880425923153991/Qris_gw.png",
  paypalEmail: "your-paypal@email.com",
  other: "Bank Transfer / Crypto / Manual approval"
};

// ================= PERMISSION =================
const isAdmin = (member) =>
  member.permissions.has(PermissionsBitField.Flags.Administrator) ||
  member.permissions.has(PermissionsBitField.Flags.ManageChannels);

// ================= COMMANDS =================
const commands = [
  new SlashCommandBuilder().setName("help").setDescription("Open shop UI"),
  new SlashCommandBuilder().setName("stock").setDescription("View stock"),
  new SlashCommandBuilder().setName("dashboard").setDescription("Admin dashboard"),
  new SlashCommandBuilder().setName("claim").setDescription("Claim ticket"),
  new SlashCommandBuilder().setName("close").setDescription("Close ticket"),
  new SlashCommandBuilder().setName("accept").setDescription("Verify payment")
];

// ================= REGISTER COMMANDS (FIXED HERE) =================
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log("✅ Slash commands registered (GUILD MODE)");
  } catch (err) {
    console.error(err);
  }
})();

// ================= READY =================
client.once("clientReady", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // AUTO CLOSE SYSTEM
  setInterval(async () => {
    const now = Date.now();

    for (const guild of client.guilds.cache.values()) {
      for (const ch of guild.channels.cache.values()) {
        if (!ch.name.startsWith("order-") && !ch.name.startsWith("support-")) continue;

        const last = activityMap.get(ch.id) || now;

        if (now - last > 86400000) {
          try {
            await ch.setName("auto-closed-inactive");
            await ch.send("⛔ Auto-closed due to inactivity.");
            activityMap.delete(ch.id);
          } catch {}
        }
      }
    }
  }, 3600000);
});

// ================= INTERACTIONS =================
client.on("interactionCreate", async (interaction) => {
  try {

    // ============ SLASH ============
    if (interaction.isChatInputCommand()) {

      // HELP
      if (interaction.commandName === "help") {
        const embed = new EmbedBuilder()
          .setTitle("🛒 BOBA SHOP")
          .setColor("#2b2d31");

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("open_shop").setLabel("Shop").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("ticket_btn").setLabel("Support").setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({ embeds: [embed], components: [row] });
      }

      // STOCK
      if (interaction.commandName === "stock") {
        const embed = new EmbedBuilder().setTitle("📦 Stock").setColor("#2b2d31");

        shopItems.forEach(i => {
          embed.addFields({
            name: i.name,
            value: i.variants
              ? i.variants.map(v => `${v.label}: $${v.price}`).join("\n")
              : `$${i.price} | Stock: ${i.stock}`,
            inline: true
          });
        });

        return interaction.reply({ embeds: [embed] });
      }

      // DASHBOARD
      if (interaction.commandName === "dashboard") {
        if (!isAdmin(interaction.member))
          return interaction.reply({ content: "❌ Admin only", flags: 64 });

        const orders = orderData.size;

        const embed = new EmbedBuilder()
          .setTitle("📊 DASHBOARD")
          .setColor("Blue")
          .addFields(
            { name: "📦 Orders", value: `${orders}`, inline: true }
          );

        return interaction.reply({ embeds: [embed], flags: 64 });
      }

      // CLAIM
      if (interaction.commandName === "claim") {
        await interaction.channel.setName(`claimed-${interaction.user.username}`);
        return interaction.reply({ content: "✅ Claimed", flags: 64 });
      }

      // CLOSE
      if (interaction.commandName === "close") {
        await interaction.channel.setName(`closed-${interaction.user.username}`);
        return interaction.reply({ content: "❌ Closed", flags: 64 });
      }

      // ACCEPT PAYMENT
      if (interaction.commandName === "accept") {
        if (!isAdmin(interaction.member))
          return interaction.reply({ content: "❌ Admin only", flags: 64 });

        await interaction.channel.setName(`paid-${interaction.user.username}`);

        if (orderData.has(interaction.channel.id)) {
          orderData.get(interaction.channel.id).status = "verified";
        }

        return interaction.reply({ content: "✔ Payment verified", flags: 64 });
      }
    }

    // ============ BUTTONS ============
    if (interaction.isButton()) {

      activityMap.set(interaction.channel.id, Date.now());

      if (interaction.customId === "open_shop") {
        const options = [];

        shopItems.forEach(i => {
          if (i.variants) {
            i.variants.forEach(v => {
              options.push({
                label: `${i.name} (${v.label})`,
                value: `${i.name}|${v.label}|${v.price}`
              });
            });
          } else {
            options.push({
              label: i.name,
              value: `${i.name}|default|${i.price}`
            });
          }
        });

        const menu = new StringSelectMenuBuilder()
          .setCustomId("select_item")
          .setPlaceholder("Select product")
          .addOptions(options);

        return interaction.reply({
          components: [new ActionRowBuilder().addComponents(menu)],
          flags: 64
        });
      }

      // SUPPORT TICKET
      if (interaction.customId === "ticket_btn") {
        const ch = await interaction.guild.channels.create({
          name: `order-${interaction.user.username}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
          ]
        });

        orderData.set(ch.id, {
          userId: interaction.user.id,
          status: "pending",
          createdAt: Date.now()
        });

        activityMap.set(ch.id, Date.now());

        const embed = new EmbedBuilder()
          .setTitle("💳 PAYMENT")
          .setDescription(
            `💳 PayPal: ${PAYMENT.paypalEmail}\n` +
            `🏦 Other: ${PAYMENT.other}`
          )
          .setImage(PAYMENT.qrisImage)
          .setColor("Yellow");

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("paid_btn").setLabel("✔ Paid").setStyle(ButtonStyle.Success)
        );

        await ch.send({ content: `${interaction.user}`, embeds: [embed], components: [row] });

        return interaction.reply({ content: `Created ${ch}`, flags: 64 });
      }
    }

    // ============ SELECT ============
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "select_item") {

        const [name, variant, price] = interaction.values[0].split("|");

        const ch = await interaction.guild.channels.create({
          name: `order-${interaction.user.username}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
          ]
        });

        orderData.set(ch.id, {
          userId: interaction.user.id,
          status: "pending",
          createdAt: Date.now()
        });

        activityMap.set(ch.id, Date.now());

        const embed = new EmbedBuilder()
          .setTitle("💳 PAYMENT")
          .setDescription(
            `📦 ${name} (${variant})\n💰 $${price}\n\n` +
            `💳 PayPal: ${PAYMENT.paypalEmail}\n` +
            `🏦 Other: ${PAYMENT.other}`
          )
          .setImage(PAYMENT.qrisImage)
          .setColor("Yellow");

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("paid_btn").setLabel("✔ Paid").setStyle(ButtonStyle.Success)
        );

        await ch.send({ embeds: [embed], components: [row] });

        return interaction.reply({ content: `Created ${ch}`, flags: 64 });
      }
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      interaction.reply({ content: "❌ Error", flags: 64 });
    }
  }
});

// ================= ACTIVITY =================
client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;
  if (msg.channel.name.startsWith("order-") || msg.channel.name.startsWith("support-")) {
    activityMap.set(msg.channel.id, Date.now());
  }
});

// ================= LOGIN =================
client.login(process.env.TOKEN);
