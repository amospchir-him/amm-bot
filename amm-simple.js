// =======================================================
// 🤖 AMM BOT – DEPLOYABLE VERSION (No YouTube, Auto-Pair)
// =======================================================

const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys');
const express = require('express');
const path = require('path');
const moment = require('moment-timezone');
const qrcode = require('qrcode-terminal');
const readline = require('readline');
const fs = require('fs');
require('dotenv').config();

// ---------- CONFIG (✏️ CHANGE THESE TWO NUMBERS) ----------
const config = {
    BOT_NAME: 'AMM',
    PREFIX: '.',
    OWNER_NUMBER: '254745873966',   // ← YOUR WhatsApp number (no +, no spaces)
    VERSION: '1.0.0',
    TIMEZONE: 'Africa/Nairobi'
};

// This is the number the bot will use for pairing (same as owner, usually)
const PAIRING_NUMBER = '254700000000'; // ← CHANGE to your WhatsApp number (no +, no spaces)

// ---------- WEB PANEL ----------
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send(`<h1>🤖 ${config.BOT_NAME}</h1><p>✅ Online</p>`));
app.listen(PORT, () => console.log(`🌐 Web panel: http://localhost:${PORT}`));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let sock = null;
let pairingRequested = false;

// ---------- AUTO-MODERATION SETTINGS ----------
const SETTINGS_FILE = path.join(__dirname, 'automod_cache.json');
let autoModSettings = {};

function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            autoModSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        } else {
            autoModSettings = {};
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(autoModSettings, null, 2));
        }
    } catch (e) { console.error('Settings load error', e); }
}
function saveSettings() {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(autoModSettings, null, 2));
}
loadSettings();

function getGroupSettings(groupId) {
    if (!autoModSettings[groupId]) {
        autoModSettings[groupId] = {
            antilink: false,
            antibadword: false,
            antispam: false,
            antisticker: false,
            antiimage: false,
            antivideo: false,
            antiaudio: false,
            antigrouplink: false,
            antimentions: false,
            warnLimit: 3,
            badwords: ['fuck', 'shit', 'asshole', 'bitch', 'damn', 'stupid'],
            spamCooldown: 3000,
            spamMax: 4,
        };
        saveSettings();
    }
    return autoModSettings[groupId];
}

// Spam tracker
const userMsgCount = new Map();

function checkSpam(groupId, userId, now, gs) {
    const key = `${groupId}|${userId}`;
    if (!userMsgCount.has(key)) userMsgCount.set(key, { timestamps: [], warns: 0 });
    const state = userMsgCount.get(key);
    const cutoff = now - gs.spamCooldown;
    state.timestamps = state.timestamps.filter(t => t > cutoff);
    state.timestamps.push(now);
    if (state.timestamps.length > gs.spamMax) {
        state.warns++;
        state.timestamps = [];
        if (state.warns >= gs.warnLimit) {
            state.warns = 0;
            return { isSpam: true, shouldKick: true };
        }
        return { isSpam: true, shouldKick: false };
    }
    return { isSpam: false, shouldKick: false };
}

function isGroupLink(text) {
    return /https?:\/\/(chat\.whatsapp\.com|wa\.me)\/[\w\d]+/i.test(text) ||
           /whatsapp\.com\/invite\/\S+/i.test(text) ||
           /wa\.me\/\S+/i.test(text);
}

function hasBadWord(text, badwords) {
    const lower = text.toLowerCase();
    return badwords.some(w => lower.includes(w));
}

// ---------- GLOBAL STATES ----------
global.autoRead = {};
global.autoReply = {};
global.antiPm = {};

// ---------- COMMAND HANDLER ----------
async function handleCommand(cmd, sender, args, fullText, msg, isGroup) {
    // Auto-mod toggles (groups only)
    if (isGroup) {
        const gs = getGroupSettings(sender);
        const toggle = async (feature, displayName) => {
            const newVal = !gs[feature];
            gs[feature] = newVal;
            saveSettings();
            return `✅ ${displayName} ${newVal ? 'enabled' : 'disabled'}.`;
        };
        switch (cmd) {
            case 'antilink': return await toggle('antilink', 'Anti-link');
            case 'antibadword': return await toggle('antibadword', 'Anti-badword');
            case 'antispam': return await toggle('antispam', 'Anti-spam');
            case 'antisticker': return await toggle('antisticker', 'Anti-sticker');
            case 'antiimage': return await toggle('antiimage', 'Anti-image');
            case 'antivideo': return await toggle('antivideo', 'Anti-video');
            case 'antiaudio': return await toggle('antiaudio', 'Anti-audio');
            case 'antigrouplink': return await toggle('antigrouplink', 'Anti-group link');
            case 'antimentions': return await toggle('antimentions', 'Anti-mentions');
            case 'addbadword':
                const word = args[1];
                if (!word) return '❌ Usage: .addbadword <word>';
                if (!gs.badwords.includes(word.toLowerCase())) {
                    gs.badwords.push(word.toLowerCase());
                    saveSettings();
                    return `✅ Added bad word: ${word}`;
                }
                return '⚠️ Word already exists.';
            case 'removebadword':
                const rword = args[1];
                if (!rword) return '❌ Usage: .removebadword <word>';
                const idx = gs.badwords.indexOf(rword.toLowerCase());
                if (idx !== -1) {
                    gs.badwords.splice(idx, 1);
                    saveSettings();
                    return `✅ Removed: ${rword}`;
                }
                return '⚠️ Word not found.';
            case 'listbadword':
                if (gs.badwords.length === 0) return '📋 No bad words.';
                return `📋 Bad words: ${gs.badwords.join(', ')}`;
            case 'setwarn':
                const limit = parseInt(args[1]);
                if (isNaN(limit) || limit < 1) return '❌ Usage: .setwarn <number>';
                gs.warnLimit = limit;
                saveSettings();
                return `✅ Warn limit set to ${limit}.`;
        }
    }

    // Regular commands
    switch (cmd) {
        case 'menu': {
            return `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
┃   🤖 ${config.BOT_NAME} BOT MENU   ┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯

▫️ .ping – test response
▫️ .alive – bot status
▫️ .time – current time
▫️ .owner – bot owner
▫️ .sticker (reply to image)
▫️ .autotype <sec>
▫️ .autoread – toggle read receipts
▫️ .antipm – block unknown PMs

🛡️ AUTO-MOD (group only):
.antilink .antibadword .antispam .antisticker .antiimage .antivideo .antiaudio
.antigrouplink .antimentions .addbadword .removebadword .listbadword .setwarn

👥 GROUP MGMT (admin):
.kick @user .promote @user .demote @user .tagall

🌟 v${config.VERSION}`;
        }
        case 'ping': return '🏓 Pong!';
        case 'alive': {
            const up = process.uptime();
            const h = Math.floor(up/3600), m = Math.floor((up%3600)/60);
            return `✅ ${config.BOT_NAME} online\n⏱️ Uptime: ${h}h ${m}m`;
        }
        case 'time': {
            const t = moment().tz(config.TIMEZONE).format('HH:mm:ss');
            const d = moment().tz(config.TIMEZONE).format('dddd, MMM Do YYYY');
            return `🕐 ${t}\n📅 ${d}\n📍 ${config.TIMEZONE}`;
        }
        case 'owner': return `👑 wa.me/${config.OWNER_NUMBER}`;
        case 'sticker': {
            const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted?.imageMessage) return '❌ Reply to an image with .sticker';
            try {
                const media = await sock.downloadMediaMessage(quoted);
                await sock.sendMessage(sender, { sticker: media });
                return null;
            } catch (e) { return `❌ Sticker failed: ${e.message}`; }
        }
        case 'autotype':
            let sec = parseInt(args[1]) || 3;
            await sock.sendPresenceUpdate('composing', sender);
            setTimeout(async () => {
                await sock.sendPresenceUpdate('paused', sender);
                await sock.sendMessage(sender, { text: `✅ Typing for ${sec}s` });
            }, sec * 1000);
            return null;
        case 'autoread':
            if (global.autoRead[sender]) {
                delete global.autoRead[sender];
                return '❌ Auto-read OFF';
            } else {
                global.autoRead[sender] = true;
                return '✅ Auto-read ON';
            }
        case 'antipm':
            if (global.antiPm[sender]) {
                delete global.antiPm[sender];
                return '❌ Anti-PM OFF';
            } else {
                global.antiPm[sender] = true;
                return '✅ Anti-PM ON';
            }
        // Group management
        case 'kick':
            if (!isGroup) return '❌ Groups only.';
            const kickMention = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (!kickMention || kickMention.length === 0) return '❌ Mention the user to kick.';
            try {
                await sock.groupParticipantsUpdate(sender, [kickMention[0]], 'remove');
                return '✅ User kicked.';
            } catch (e) { return `❌ Failed: ${e.message}`; }
        case 'promote':
            if (!isGroup) return '❌ Groups only.';
            const promMention = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (!promMention || promMention.length === 0) return '❌ Mention the user to promote.';
            try {
                await sock.groupParticipantsUpdate(sender, [promMention[0]], 'promote');
                return '✅ User promoted.';
            } catch (e) { return `❌ Failed: ${e.message}`; }
        case 'demote':
            if (!isGroup) return '❌ Groups only.';
            const demMention = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (!demMention || demMention.length === 0) return '❌ Mention the user to demote.';
            try {
                await sock.groupParticipantsUpdate(sender, [demMention[0]], 'demote');
                return '✅ User demoted.';
            } catch (e) { return `❌ Failed: ${e.message}`; }
        case 'tagall':
            if (!isGroup) return '❌ Groups only.';
            try {
                const meta = await sock.groupMetadata(sender);
                let mentions = [];
                let text = '📢 *Attention everyone!*\n\n';
                for (const p of meta.participants) {
                    mentions.push(p.id);
                    text += `@${p.id.split('@')[0]}\n`;
                }
                await sock.sendMessage(sender, { text, mentions });
                return null;
            } catch (e) { return `❌ Failed: ${e.message}`; }
        default:
            return null;
    }
}

// ---------- MAIN BOT ----------
async function startBot() {
    const sessionDir = path.join(__dirname, 'sessions_amm');
    console.log('\n🤖 Starting AMM Bot...\n');

    const { version } = await fetchLatestBaileysVersion();
    console.log(`📱 WhatsApp version: ${version.join('.')}`);

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    sock = makeWASocket({
        version,
        auth: state,
        browser: Browsers.windows('Chrome'),
        markOnlineOnConnect: true,
        syncFullHistory: false
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr && !pairingRequested && !sock.authState.creds.registered) {
            console.log('⚠️ QR code (fallback) – scan if pairing fails');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'connecting' && !pairingRequested && !sock.authState.creds.registered) {
            pairingRequested = true;
            console.log('\n🔐 PAIRING CODE REQUIRED\n');
            // 🔥 HARDCODED NUMBER – NO TERMINAL INPUT NEEDED!
            const number = PAIRING_NUMBER;
            console.log(`📞 Using number: ${number}`);
            try {
                const code = await sock.requestPairingCode(number);
                console.log(`\n🔐 YOUR PAIRING CODE: ${code}\n`);
                console.log('Open WhatsApp → Linked Devices → Link with phone number → enter this code');
            } catch (err) {
                console.error('Pairing error:', err.message);
                pairingRequested = false; // allow retry
                setTimeout(() => { pairingRequested = false; }, 10000);
            }
        }
        if (connection === 'open') {
            console.log(`\n✅ ${config.BOT_NAME} BOT ONLINE!\nSend "${config.PREFIX}menu" on WhatsApp\n`);
            rl.close();
        }
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                console.log(`Disconnected (${code}). Reconnecting in 5s...`);
                setTimeout(startBot, 5000);
            } else console.log('Logged out. Delete "sessions_amm" folder and restart.');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // ---------- MESSAGE HANDLER ----------
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
        const sender = msg.key.remoteJid;
        const isGroup = sender.includes('@g.us');
        let text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        if (!text) return;
        console.log(`📨 "${text}" from ${isGroup ? 'group' : 'private'}`);

        // Anti-PM
        if (!isGroup && global.antiPm[sender] && !config.OWNER_NUMBER.includes(sender.split('@')[0])) {
            await sock.sendMessage(sender, { text: '🔒 Private messages not allowed.' });
            await sock.updateBlockStatus(sender, 'block');
            return;
        }

        // Auto-read
        if (global.autoRead[sender]) {
            try { await sock.readMessages([msg.key]); } catch(e) {}
        }

        // Auto-moderation (groups only)
        if (isGroup) {
            let msgType = 'text';
            if (msg.message.stickerMessage) msgType = 'sticker';
            else if (msg.message.imageMessage) msgType = 'image';
            else if (msg.message.videoMessage) msgType = 'video';
            else if (msg.message.audioMessage) msgType = 'audio';
            
            const gs = getGroupSettings(sender);
            const senderId = msg.key.participant || sender;
            let deleteMsg = false, warnUser = false, kickUser = false, reason = '';

            if (gs.antigrouplink && isGroupLink(text)) { deleteMsg = true; reason = 'group link'; }
            else if (gs.antilink && /https?:\/\/\S+/i.test(text)) { deleteMsg = true; reason = 'link'; }
            else if (gs.antibadword && hasBadWord(text, gs.badwords)) { deleteMsg = true; reason = 'bad word'; }
            else if (gs.antispam) {
                const spam = checkSpam(sender, senderId, Date.now(), gs);
                if (spam.isSpam) {
                    deleteMsg = true;
                    reason = 'spamming';
                    if (spam.shouldKick) kickUser = true;
                    else warnUser = true;
                }
            }
            if ((msgType === 'sticker' && gs.antisticker) ||
                (msgType === 'image' && gs.antiimage) ||
                (msgType === 'video' && gs.antivideo) ||
                (msgType === 'audio' && gs.antiaudio)) {
                deleteMsg = true;
                reason = `${msgType} not allowed`;
            }
            if (gs.antimentions && msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 5) {
                deleteMsg = true;
                reason = 'mass mentions';
            }

            if (deleteMsg) {
                await sock.sendMessage(sender, { delete: msg.key });
                if (warnUser) {
                    await sock.sendMessage(sender, { text: `⚠️ @${senderId.split('@')[0]} warned for ${reason}.`, mentions: [senderId] });
                } else if (kickUser) {
                    await sock.groupParticipantsUpdate(sender, [senderId], 'remove');
                    await sock.sendMessage(sender, { text: `🚫 @${senderId.split('@')[0]} kicked for repeated spam.`, mentions: [senderId] });
                } else {
                    await sock.sendMessage(sender, { text: `🚫 Deleted message from @${senderId.split('@')[0]}: ${reason}`, mentions: [senderId] });
                }
            }
        }

        // Command handling
        if (!text.startsWith(config.PREFIX)) return;

        const full = text.slice(config.PREFIX.length).trim();
        const args = full.split(/\s+/);
        const cmd = args[0].toLowerCase();
        console.log(`⚡ Command: ${cmd}`);

        const reply = await handleCommand(cmd, sender, args, full, msg, isGroup);
        if (reply) await sock.sendMessage(sender, { text: reply });
    });
}

startBot().catch(console.error);