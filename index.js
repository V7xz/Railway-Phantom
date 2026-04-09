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

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

// ================= REGISTER (SAFE CLEAN MODE) =================
(async () => {
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: [] }
  );

  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
})();

// ================= READY =================
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ================= INTERACTIONS =================
client.on("interactionCreate", async (interaction) => {
  try {

    // ================= SLASH =================
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

      // DASHBOARD (FULL ORDER INFO)
      if (interaction.commandName === "dashboard") {
        if (!isAdmin(interaction.member))
          return interaction.reply({ content: "❌ Admin only", flags: 64 });

        const embed = new EmbedBuilder()
          .setTitle("📊 ORDER DASHBOARD")
          .setColor("Blue");

        for (const [channelId, data] of orderData.entries()) {
          embed.addFields({
            name: `Order | ${data.item}`,
            value:
              `👤 <@${data.userId}>\n` +
              `📦 Item: ${data.item}\n` +
              `⚙ Variant: ${data.variant}\n` +
              `💰 Price: $${data.price}\n` +
              `📌 Status: ${data.status}\n` +
              `🆔 Channel: <#${channelId}>`,
            inline: false
          });
        }

        return interaction.reply({ embeds: [embed], flags: 64 });
      }

      if (interaction.commandName === "claim") {
        await interaction.channel.setName(`claimed-${interaction.user.username}`);
        return interaction.reply({ content: "✅ Claimed", flags: 64 });
      }

      if (interaction.commandName === "close") {
        await interaction.channel.setName(`closed-${interaction.user.username}`);
        return interaction.reply({ content: "❌ Closed", flags: 64 });
      }

      // ADMIN ACCEPT
      if (interaction.commandName === "accept") {
        if (!isAdmin(interaction.member))
          return interaction.reply({ content: "❌ Admin only", flags: 64 });

        const data = orderData.get(interaction.channel.id);
        if (data) {
          data.status = "approved";

          // AUTO STOCK DECREASE
          const item = shopItems.find(i => i.name === data.item);
          if (item && typeof item.stock === "number") {
            item.stock = Math.max(0, item.stock - 1);
          }
        }

        await interaction.channel.setName(`paid-${interaction.user.username}`);

        return interaction.reply({
          content: "✔ Payment approved & stock updated",
          flags: 64
        });
      }
    }

    // ================= BUTTONS =================
    if (interaction.isButton()) {

      activityMap.set(interaction.channel.id, Date.now());

      // OPEN SHOP
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

      // SUPPORT (IMPROVED PROMPT)
      if (interaction.customId === "ticket_btn") {
        const ch = await interaction.guild.channels.create({
          name: `support-${interaction.user.username}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
          ]
        });

        const embed = new EmbedBuilder()
          .setTitle("🎫 SUPPORT OPENED")
          .setDescription("Please describe your issue. Staff will respond shortly.")
          .setColor("Blue");

        await ch.send({ content: `${interaction.user}`, embeds: [embed] });

        return interaction.reply({ content: `✅ Support created: ${ch}`, flags: 64 });
      }

      // PAID BUTTON → WAIT ADMIN APPROVAL
      if (interaction.customId === "paid_btn") {
        await interaction.deferUpdate();

        const data = orderData.get(interaction.channel.id);
        if (data) data.status = "waiting_admin";

        await interaction.channel.send("💸 Marked as PAID. Waiting for admin approval.");
      }

      // ADMIN APPROVE BUTTON
      if (interaction.customId === "approve_order") {
        if (!isAdmin(interaction.member)) return;

        const data = orderData.get(interaction.channel.id);
        if (data) {
          data.status = "approved";

          const item = shopItems.find(i => i.name === data.item);
          if (item && typeof item.stock === "number") {
            item.stock = Math.max(0, item.stock - 1);
          }
        }

        await interaction.channel.setName(`approved-${interaction.user.username}`);
        await interaction.reply({ content: "✅ Order Approved", flags: 64 });
      }

      // ADMIN REJECT BUTTON
      if (interaction.customId === "reject_order") {
        if (!isAdmin(interaction.member)) return;

        const data = orderData.get(interaction.channel.id);
        if (data) data.status = "rejected";

        await interaction.channel.setName(`rejected-${interaction.user.username}`);
        await interaction.reply({ content: "❌ Order Rejected", flags: 64 });
      }
    }

    // ================= SELECT =================
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
          item: name,
          variant,
          price,
          status: "pending",
          createdAt: Date.now()
        });

        const embed = new EmbedBuilder()
          .setTitle("💳 PAYMENT")
          .setDescription(`📦 ${name} (${variant})\n💰 $${price}`)
          .setColor("Yellow");

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("paid_btn")
            .setLabel("✔ Paid")
            .setStyle(ButtonStyle.Success)
        );

        await ch.send({ content: `${interaction.user}`, embeds: [embed], components: [row] });

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
