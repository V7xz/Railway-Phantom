const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(express.json());

/* =====================================================
   STORAGE — shared with bot
===================================================== */

const DATA_DIR = path.join(__dirname, "data");
const KEYS_FILE = path.join(DATA_DIR, "keys.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, "[]");
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]");

function readKeys() {
    try { return JSON.parse(fs.readFileSync(KEYS_FILE, "utf8")); } catch { return []; }
}

function writeKeys(data) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
}

function readOrders() {
    try { return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8")); } catch { return []; }
}

function writeOrders(data) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2));
}

// ── Prefix mapping (matches bot) ──
const PREFIX_MAP = {
    killaura: "KA",
    combat: "CB",
    autofarm: "AF",
    fps: "FP"
};

/* =====================================================
   /validate — existing key validation
===================================================== */

app.post("/validate", (req, res) => {
    const { key, hwid, product } = req.body;
    if (!key || !hwid) {
        return res.status(400).json({ success: false, message: "Missing key or hwid" });
    }
    let keys = readKeys();
    const index = keys.findIndex(k => k.key === key);
    if (index === -1) {
        return res.json({ success: false, message: "Key not found" });
    }
    const data = keys[index];
    const now = Date.now();

    if (product) {
        const expectedPrefix = PREFIX_MAP[product];
        if (expectedPrefix && !key.startsWith(expectedPrefix + "-")) {
            console.log(`[PRODUCT MISMATCH] Key ${key} used for ${product}`);
            return res.json({ success: false, message: "Product mismatch" });
        }
    }

    if (data.expires !== 0 && now > data.expires) {
        keys.splice(index, 1);
        writeKeys(keys);
        console.log(`[EXPIRED] Key ${key} removed`);
        return res.json({ success: false, message: "Key has expired" });
    }

    if (!data.hwid) {
        data.hwid = hwid;
        data.boundAt = now;
        data.lastSeen = now;
        data.useCount = 1;
        keys[index] = data;
        writeKeys(keys);
        const expiresSec = data.expires === 0 ? 0 : Math.floor(data.expires / 1000);
        return res.json({ success: true, message: "Key valid + HWID bound", expires: expiresSec });
    }

    if (data.hwid !== hwid) {
        console.log(`[MISMATCH] Key ${key} | Expected: ${data.hwid} | Got: ${hwid}`);
        return res.json({ success: false, message: "HWID mismatch" });
    }

    data.lastSeen = now;
    data.useCount = (data.useCount || 0) + 1;
    keys[index] = data;
    writeKeys(keys);
    const expiresSec = data.expires === 0 ? 0 : Math.floor(data.expires / 1000);
    return res.json({ success: true, message: "Key valid", expires: expiresSec });
});

/* =====================================================
   /api/verify-user — checks if user is in server
===================================================== */

app.post("/api/verify-user", async (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.json({ success: false, message: "Username required" });
    }
    if (!global.botClient) {
        return res.json({ success: false, message: "Bot not ready" });
    }
    try {
        const guild = global.botClient.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) {
            return res.json({ success: false, message: "Guild not found" });
        }
        const members = await guild.members.fetch({ query: username, limit: 1 });
        const member = members.first();
        if (!member) {
            return res.json({ success: false, message: "User not found in server. Please join first." });
        }
        return res.json({
            success: true,
            userId: member.id,
            username: member.user.username,
            displayName: member.displayName
        });
    } catch (error) {
        console.error("Verification API error:", error);
        return res.json({ success: false, message: "Internal error" });
    }
});

/* =====================================================
   /api/create-ticket — creates order ticket
===================================================== */

app.post("/api/create-ticket", async (req, res) => {
    const { userId, username, cart, total, orderId, paymentMethod } = req.body;
    if (!userId || !cart || cart.length === 0) {
        return res.json({ success: false, message: "Missing required data" });
    }
    if (!global.botClient) {
        return res.json({ success: false, message: "Bot not ready" });
    }
    try {
        const guild = global.botClient.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) {
            return res.json({ success: false, message: "Guild not found" });
        }
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
            return res.json({ success: false, message: "User not found in server" });
        }
        const channel = await guild.channels.create({
            name: `order-${member.user.username}`.substring(0, 28).toLowerCase(),
            type: 0,
            permissionOverwrites: [
                { id: guild.id, deny: [1024] },
                { id: userId, allow: [1024, 2048] }
            ]
        });
        const orderData = {
            orderId: orderId || `PH-${Date.now().toString(36).toUpperCase()}`,
            channelId: channel.id,
            userId: userId,
            verifiedUserId: userId,
            verifiedUsername: username,
            product: cart.length === 1 ? cart[0].productName : "Multiple Items",
            variant: cart.length === 1 ? cart[0].durationLabel : "Cart Checkout",
            duration: cart.length === 1 ? cart[0].duration : null,
            price: total,
            status: "payment",
            created: Date.now(),
            paymentMethod: paymentMethod || "qris",
            cartItems: cart.map(item => ({
                productKey: item.productId,
                productName: item.productName,
                duration: item.duration,
                durationLabel: item.durationLabel,
                price: item.price,
                quantity: item.quantity
            })),
            total: total
        };
        let orders = readOrders();
        orders.push(orderData);
        writeOrders(orders);

        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

        const embed = new EmbedBuilder()
            .setColor(0x7b2cff)
            .setTitle(`🛒 Order #${orderData.orderId}`)
            .setDescription(`Welcome ${username}! Please follow the instructions below to complete your purchase.`)
            .addFields(
                { name: "Items", value: cart.map(i => `${i.productName} (${i.durationLabel}) × ${i.quantity}`).join("\n"), inline: false },
                { name: "Total", value: `Rp ${total.toLocaleString("id-ID")}`, inline: true },
                { name: "Payment Method", value: paymentMethod.toUpperCase(), inline: true },
                { name: "Step 1", value: "Pay using the method below.", inline: false },
                { name: "Step 2", value: "After payment, **upload a screenshot/proof** as an image in this channel.", inline: false }
            )
            .setImage(process.env.QRIS_IMAGE || "https://imgur.com/a/xVOfymB")
            .setTimestamp();

        await channel.send({
            content: `<@${userId}>`,
            embeds: [embed],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                    .setCustomId(`paid_${channel.id}`)
                    .setLabel("I've Paid ✅")
                    .setStyle(ButtonStyle.Success)
                )
            ]
        });

        const paypalEmbed = new EmbedBuilder()
            .setColor(0x7b2cff)
            .setTitle("💳 PayPal Payment")
            .setDescription(`Send to: \`${process.env.PAYPAL_EMAIL || "phantom.wtfff@gmail.com"}\`\nSend as Friends & Family. Include your Order ID in the note.`);

        await channel.send({ embeds: [paypalEmbed] });

        res.json({ success: true, channelId: channel.id, channelName: channel.name });
    } catch (error) {
        console.error("Ticket creation error:", error);
        res.json({ success: false, message: error.message });
    }
});

/* =====================================================
   GET / — Health check
===================================================== */

app.get("/", (req, res) => {
    const keys = readKeys();
    const now = Date.now();
    res.json({
        status: "Phantom API running",
        keys: {
            total: keys.length,
            active: keys.filter(k => k.expires === 0 || k.expires > now).length,
            expired: keys.filter(k => k.expires !== 0 && k.expires < now).length,
            bound: keys.filter(k => !!k.hwid).length
        }
    });
});

/* =====================================================
   START
===================================================== */

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`[API] Server running on port ${PORT}`);
    console.log(`📋 Webhook URL: http://localhost:${PORT}/api/verify-user`);
    console.log(`🔑 Validation endpoint: http://localhost:${PORT}/validate`);
});
