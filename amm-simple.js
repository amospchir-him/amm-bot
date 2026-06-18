// ============================================================
// 🤖 AMM BOT – MINIMAL PAIRING CODE TEST (NO QR)
// ============================================================

const fs = require('fs');
const path = require('path');

// === DELETE SESSIONS ON START ===
const sessionDir = path.join(__dirname, 'sessions_amm');
if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
}
// ====================================

const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys');
require('dotenv').config();

// ---------- CONFIG ----------
const config = {
    BOT_NAME: 'AMM',
    PREFIX: '.',
};

const PAIRING_NUMBER = '254724579779'; // ← CHANGE to your number

// ---------- MAIN BOT ----------
async function startBot() {
    console.log('\n🤖 Starting AMM Bot...\n');

    const { version } = await fetchLatestBaileysVersion();
    console.log(`📱 WhatsApp version: ${v
        ersion.join('.')}`);

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const sock = makeWASocket({
        version,
        auth: state,
        browser: Browsers.windows('Chrome'),
        printQRInTerminal: false,   // ← QR DISABLED
        markOnlineOnConnect: true,
        syncFullHistory: false,
    });

    // ---------- REQUEST PAIRING CODE ----------
    let pairingRequested = false;
    async function requestPairing() {
        if (pairingRequested || sock.authState.creds.registered) return;
        pairingRequested = true;
        console.log('\n🔐 Requesting pairing code...\n');
        const number = PAIRING_NUMBER;
        console.log(`📞 Using number: ${number}`);
        try {
            const code = await sock.requestPairingCode(number);
            console.log(`\n🔐 YOUR PAIRING CODE: ${code}\n`);
            console.log('Open WhatsApp → Settings → Linked Devices → Link with phone number → enter this code');
        } catch (err) {
            console.error('❌ Pairing request failed:', err.message);
            pairingRequested = false;
            setTimeout(requestPairing, 10000);
        }
    }

    setTimeout(requestPairing, 2000);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (!sock.authState.creds.registered && !pairingRequested) {
            await requestPairing();
        }
        if (connection === 'open') {
            console.log(`\n✅ ${config.BOT_NAME} BOT ONLINE!\nSend "${config.PREFIX}menu" on WhatsApp\n`);
        }
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                console.log(`Disconnected (${code}). Reconnecting in 5s...`);
                pairingRequested = false;
                setTimeout(startBot, 5000);
            } else {
                console.log('Logged out. Delete "sessions_amm" folder and restart.');
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // ---------- MESSAGE HANDLER (basic) ----------
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
        const sender = msg.key.remoteJid;
        let text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        if (!text) return;
        console.log(`📨 "${text}"`);

        if (!text.startsWith(config.PREFIX)) return;
        const cmd = text.slice(config.PREFIX.length).trim().toLowerCase();

        let reply = '';
        if (cmd === 'menu') {
            reply = `🤖 ${config.BOT_NAME} Bot\nCommands: .ping, .menu`;
        } else if (cmd === 'ping') {
            reply = '🏓 Pong!';
        } else {
            reply = `Unknown command: ${cmd}`;
        }
        await sock.sendMessage(sender, { text: reply });
    });
}

startBot().catch(console.error);