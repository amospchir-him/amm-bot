// ============================================
// 🤖 AMM BOT - FINAL WORKING VERSION
// ============================================

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
const path = require('path');
const moment = require('moment-timezone');
const readline = require('readline');
require('dotenv').config();

// Disable debug spam
process.env.DEBUG = '';

// Crypto polyfill
if (!global.crypto) {
    global.crypto = require('crypto').webcrypto;
}

// Load config
const config = require('./config.js');

// Setup web panel
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send(`
        <html>
        <head><title>${config.BOT_NAME} Bot</title>
        <style>
            body{font-family:Arial;text-align:center;padding:50px;background:#0a0a0a;color:#00ff00;}
            h1{color:#00ff00;}
        </style>
        </head>
        <body>
            <h1>🤖 ${config.BOT_NAME} BOT</h1>
            <p>✅ Bot is Running!</p>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`🌐 Web panel: http://localhost:${PORT}`);
});

// Setup readline for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Initialize AI
let aiModel = null;
if (config.AI.ENABLED && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_API_KEY_HERE') {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    aiModel = genAI.getGenerativeModel({ model: config.AI.MODEL });
    console.log('✅ AI Loaded');
}

let sock = null;
let isConnecting = false;

async function startAMM() {
    const authFolder = path.join(__dirname, 'sessions_amm');
    
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║     🤖 AMM BOT - CONNECTING                    ║');
    console.log('╚════════════════════════════════════════════════╝\n');
    
    // Get latest WhatsApp version
    const { version } = await fetchLatestBaileysVersion();
    console.log(`✅ WhatsApp Version: ${version.join('.')}`);
    
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    
    sock = makeWASocket({
        version: version,
        auth: state,
        browser: Browsers.windows('Chrome'),
        markOnlineOnConnect: true,
        syncFullHistory: false,
        logger: {
            level: 'error',
            log: () => {}
        }
    });

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Show QR as backup
        if (qr && !sock.authState.creds.registered) {
            console.log('\n📱 QR Code (backup method):');
            const qrTerminal = require('qrcode-terminal');
            qrTerminal.generate(qr, { small: true });
        }
        
        // When connecting, ask for number
        if (connection === 'connecting' && !isConnecting && !sock.authState.creds.registered) {
            isConnecting = true;
            
            console.log('\n═══════════════════════════════════════════════');
            console.log('🔐 PAIRING CODE SETUP');
            console.log('═══════════════════════════════════════════════\n');
            
            // Ask for phone number
            rl.question('📞 Enter your WhatsApp number (e.g., 254712345678): ', async (number) => {
                console.log(`\n⏳ Requesting code for ${number}...`);
                
                try {
                    const code = await sock.requestPairingCode(number);
                    console.log('\n╔════════════════════════════════════════════════╗');
                    console.log(`║     🔐 YOUR PAIRING CODE: ${code}              ║`);
                    console.log('╚════════════════════════════════════════════════╝\n');
                    console.log('📱 STEPS:');
                    console.log('1. Open WhatsApp on your phone');
                    console.log('2. Go to Settings → Linked Devices');
                    console.log('3. Tap "Link a Device"');
                    console.log('4. Tap "Link with phone number"');
                    console.log(`5. Enter code: ${code}\n`);
                    console.log('⏳ Waiting for connection...\n');
                } catch (error) {
                    console.error(`❌ Error: ${error.message}`);
                    if (error.message.includes('428')) {
                        console.log('\n⚠️ Connection issue. Retrying in 10 seconds...\n');
                        setTimeout(() => {
                            isConnecting = false;
                            startAMM();
                        }, 10000);
                    }
                }
            });
        }
        
        // Connected successfully
        if (connection === 'open') {
            console.log('\n╔════════════════════════════════════════════════╗');
            console.log(`║     ✅ ${config.BOT_NAME} BOT IS ONLINE!            ║`);
            console.log('╚════════════════════════════════════════════════╝\n');
            console.log(`💬 Send "${config.PREFIX}menu" on WhatsApp!\n`);
        }
        
        // Handle disconnection
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut && statusCode !== 428) {
                console.log(`⚠️ Disconnected. Reconnecting...\n`);
                isConnecting = false;
                setTimeout(() => startAMM(), 3000);
            } else if (statusCode === 428) {
                console.log(`⚠️ Connection closed (428). Retrying in 10 seconds...\n`);
                isConnecting = false;
                setTimeout(() => startAMM(), 10000);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Handle messages
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') return;
        
        const sender = msg.key.remoteJid;
        let messageText = '';
        
        if (msg.message.conversation) messageText = msg.message.conversation;
        else if (msg.message.extendedTextMessage?.text) messageText = msg.message.extendedTextMessage.text;
        else return;
        
        if (!messageText.startsWith(config.PREFIX)) return;
        
        const command = messageText.slice(config.PREFIX.length).trim().toLowerCase();
        
        // MENU
        if (command === 'menu') {
            const menu = `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
┃   🤖 *${config.BOT_NAME} BOT*   ┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯

╭━━[ 📱 BASIC ]━━╮
┃ ${config.PREFIX}menu - Show menu
┃ ${config.PREFIX}ping - Check bot
┃ ${config.PREFIX}alive - Bot status
┃ ${config.PREFIX}time - Current time
┃ ${config.PREFIX}owner - Contact owner
╰━━━━━━━━━━━━━━╯

╭━━[ 🤖 AI ]━━╮
┃ ${config.PREFIX}ai [question]
╰━━━━━━━━━━━━━━╯

╭━━[ 🎵 MEDIA ]━━╮
┃ ${config.PREFIX}sticker - Img to sticker
╰━━━━━━━━━━━━━━╯

🌟 *AMM BOT v${config.VERSION}*`;
            await sock.sendMessage(sender, { text: menu });
        }
        
        // PING
        else if (command === 'ping') {
            await sock.sendMessage(sender, { text: '🏓 Pong!' });
        }
        
        // ALIVE
        else if (command === 'alive') {
            await sock.sendMessage(sender, { text: `✅ ${config.BOT_NAME} is online!` });
        }
        
        // TIME
        else if (command === 'time') {
            const time = moment().tz(config.TIMEZONE).format('HH:mm:ss');
            await sock.sendMessage(sender, { text: `🕐 ${time} (${config.TIMEZONE})` });
        }
        
        // OWNER
        else if (command === 'owner') {
            await sock.sendMessage(sender, { text: `👑 wa.me/${config.OWNER_NUMBER}` });
        }
        
        // AI
        else if (command === 'ai' || command === 'ask') {
            if (!aiModel) {
                await sock.sendMessage(sender, { text: '❌ AI disabled. Add GEMINI_API_KEY to .env' });
                return;
            }
            
            const query = messageText.slice(4).trim();
            if (!query) {
                await sock.sendMessage(sender, { text: `❌ Usage: ${config.PREFIX}ai question` });
                return;
            }
            
            await sock.sendMessage(sender, { text: '🤔 Thinking...' });
            
            try {
                const result = await aiModel.generateContent(query);
                await sock.sendMessage(sender, { text: `🤖 *AMM AI:*\n\n${result.response.text()}` });
            } catch (error) {
                await sock.sendMessage(sender, { text: `❌ Error: ${error.message}` });
            }
        }
        
        // STICKER
        else if (command === 'sticker') {
            const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted || !quoted.imageMessage) {
                await sock.sendMessage(sender, { text: '❌ Reply to an image with .sticker' });
                return;
            }
            
            try {
                const media = await sock.downloadMediaMessage(quoted);
                await sock.sendMessage(sender, { sticker: media });
            } catch (error) {
                await sock.sendMessage(sender, { text: `❌ Error: ${error.message}` });
            }
        }
        
        else {
            await sock.sendMessage(sender, { text: `❌ Unknown command. Type ${config.PREFIX}menu` });
        }
    });
}

// Start
console.log(`
╔═══════════════════════════════════════════╗
║                                           ║
║      🤖 ${config.BOT_NAME} BOT v${config.VERSION}        ║
║                                           ║
║   Prefix: ${config.PREFIX}                              ║
║   Owner: ${config.OWNER_NUMBER}          ║
║                                           ║
╚═══════════════════════════════════════════╝
`);

startAMM().catch(err => {
    console.error('❌ Fatal error:', err);
});