const express = require("express");
const fs      = require("fs");
const path    = require("path");

const app = express();
app.use(express.json());

/* =====================================================
   STORAGE — share file yang sama dengan index.js
   Baca/tulis langsung dari data/keys.json
===================================================== */

const DATA_DIR  = path.join(__dirname, "data");
const KEYS_FILE = path.join(DATA_DIR, "keys.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, "[]");

function readKeys() {
    try {
        return JSON.parse(fs.readFileSync(KEYS_FILE, "utf8"));
    } catch {
        return [];
    }
}

function writeKeys(data) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
}

// Prefix mapping – must match the bot’s PRODUCT_PREFIXES
const PREFIX_MAP = {
    killaura: "KA",
    combat:   "CB",
    autofarm: "AF"
};

/* =====================================================
   POST /validate
   Body: { key: string, hwid: string, product?: string }

   product is optional; if sent, the key’s prefix must match.
===================================================== */

app.post("/validate", (req, res) => {
    const { key, hwid, product } = req.body;

    if (!key || !hwid) {
        return res.status(400).json({
            success: false,
            message: "Missing key or hwid"
        });
    }

    const keys  = readKeys();
    const index = keys.findIndex(k => k.key === key);

    // Key tidak ditemukan
    if (index === -1) {
        return res.json({
            success: false,
            message: "Key not found"
        });
    }

    const data = keys[index];
    const now  = Date.now();

    // --- Product check (new) ---
    if (product) {
        const expectedPrefix = PREFIX_MAP[product];
        if (expectedPrefix) {
            if (!key.startsWith(expectedPrefix + "-")) {
                console.log(`[PRODUCT MISMATCH] Key ${key} used for ${product}, but prefix is wrong`);
                return res.json({
                    success: false,
                    message: "Product mismatch"
                });
            }
        }
    }

    // Key expired — expires 0 = permanent, tidak pernah expired
    if (data.expires !== 0 && now > data.expires) {
        keys.splice(index, 1);
        writeKeys(keys);
        console.log(`[EXPIRED] Key ${key} dihapus otomatis`);
        return res.json({
            success: false,
            message: "Key has expired"
        });
    }

    // HWID belum terikat — bind sekarang
    if (!data.hwid) {
        data.hwid     = hwid;
        data.boundAt  = now;
        data.lastSeen = now;
        data.useCount = 1;
        keys[index]   = data;
        writeKeys(keys);
        console.log(`[BIND] Key ${key} → HWID ${hwid}`);
        return res.json({
            success: true,
            message: "Key valid + HWID bound"
        });
    }

    // HWID tidak cocok
    if (data.hwid !== hwid) {
        console.log(`[MISMATCH] Key ${key} | Expected: ${data.hwid} | Got: ${hwid}`);
        return res.json({
            success: false,
            message: "HWID mismatch"
        });
    }

    // Semua valid — update lastSeen & useCount
    data.lastSeen = now;
    data.useCount = (data.useCount || 0) + 1;
    keys[index]   = data;
    writeKeys(keys);

    return res.json({
        success: true,
        message: "Key valid"
    });
});

/* =====================================================
   GET / — Health check + statistik key
===================================================== */

app.get("/", (req, res) => {
    const keys    = readKeys();
    const now     = Date.now();
    const total   = keys.length;
    const active  = keys.filter(k => k.expires === 0 || k.expires > now).length;
    const expired = keys.filter(k => k.expires !== 0 && k.expires < now).length;
    const bound   = keys.filter(k => !!k.hwid).length;

    res.json({
        status: "Phantom API running",
        keys: {
            total,
            active,
            expired,
            bound,
            unbound: total - bound
        }
    });
});

/* =====================================================
   START
===================================================== */

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`[API] Phantom validate server running on port ${PORT}`);
});
