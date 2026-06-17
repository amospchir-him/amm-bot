// ============================================
// 🤖 AMM BOT - FIXED 405 ERROR VERSION
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
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const moment = require('moment-timezone');
require('dotenv').config();

// ✅ FIX: Crypto polyfill for Node.js compatibility
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
            .status{color:#00ff00;font-size:20px;}
        </style>
        </head>
        <body>
            <h1>🤖 ${config.BOT_NAME} BOT</h1>
            <p class="status">✅ Bot is Running!</p>
            <p>📱 Check terminal for pairing code</p>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`🌐 Web panel: http://localhost:${PORT}`);
});

// Initialize AI
let aiModel = null;
if (config.AI.ENABLED && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_API_KEY_HERE') {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    aiModel = genAI.getGenerativeModel({ model: config.AI.MODEL });
    console.log('✅ AI Model Loaded');
} else {
    console.log('⚠️ AI Disabled - Add GEMINI_API_KEY to .env file');
}

let sock = null;
let pairingRequested = false;

async function startAMM() {
    const authFolder = path.join(__dirname, 'sessions_pair');
    
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║     🔐 AMM BOT - PAIRING CODE MODE            ║');
    console.log('╚════════════════════════════════════════════════╝\n');
    
    // ✅ FIX 1: Get latest WhatsApp version dynamically
    const { version } = await fetchLatestBaileysVersion();
    console.log(`✅ WhatsApp Version: ${version.join('.')}`);
    
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    
    // ✅ FIX 2: Use dynamic version and Browsers helper
    sock = makeWASocket({
        version: version,
        auth: state,
        browser: Browsers.windows('Chrome'),
        markOnlineOnConnect: true,
        syncFullHistory: false
    });

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        // ✅ FIX 3: Request pairing code at the RIGHT TIME (when connecting)
        if (connection === 'connecting' && !pairingRequested && !sock.authState.creds.registered) {
            pairingRequested = true;
            
            console.log('\n╔════════════════════════════════════════════════╗');
            console.log('║     📱 PAIRING CODE MODE                       ║');
            console.log('╚════════════════════════════════════════════════╝\n');
            
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            rl.question('📱 Enter your WhatsApp number (country code without +): ', async (number) => {
                rl.close();
                
                console.log(`\n⏳ Requesting pairing code for: ${number}...`);
                
                try {
                    const code = await sock.requestPairingCode(number);
                    console.log('\n╔════════════════════════════════════════════════╗');
                    console.log(`║     🔐 YOUR PAIRING CODE: ${code}              ║`);
                    console.log('╚════════════════════════════════════════════════╝\n');
                    console.log('📱 Enter this code in WhatsApp when prompted!\n');
                } catch (error) {
                    console.error('\n❌ Failed to get pairing code:', error.message);
                }
            });
        }
        
        // Handle successful connection
        if (connection === 'open') {
            console.log('\n╔════════════════════════════════════════════════╗');
            console.log(`║     ✅ ${config.BOT_NAME} BOT IS ONLINE!            ║`);
            console.log('╚════════════════════════════════════════════════╝\n');
        }
        
        // ✅ FIX 4: Handle 405 error specifically with retry
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            
            if (statusCode === 405) {
                console.log('\n⚠️ Error 405: Version mismatch detected.');
                console.log('💡 This means WhatsApp updated their protocol.');
                console.log('🔄 The bot will automatically restart with latest version...\n');
                pairingRequested = false;
                setTimeout(() => startAMM(), 3000);
            } else if (statusCode !== DisconnectReason.loggedOut) {
                console.log(`\n⚠️ Connection closed (${statusCode}). Reconnecting...\n`);
                pairingRequested = false;
                setTimeout(() => startAMM(), 5000);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages (same as before)
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
        
        // .menu command
        if (command === 'menu') {
            const menu = `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
┃      🤖 *${config.BOT_NAME} BOT MENU*      ┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯

╭━━━[ 📱 *BASIC COMMANDS* ]━━━╮
┃ ${config.PREFIX}menu - Show this menu
┃ ${config.PREFIX}ping - Check bot status
┃ ${config.PREFIX}alive - Bot health
┃ ${config.PREFIX}time - Current time
┃ ${config.PREFIX}owner - Contact owner
╰━━━━━━━━━━━━━━━━━━━━━━━━━╯

╭━━━[ 🤖 *AI COMMANDS* ]━━━╮
┃ ${config.PREFIX}ai [question] - Chat with AI
┃ ${config.PREFIX}ask [question] - Ask anything
╰━━━━━━━━━━━━━━━━━━━━━━━━━╯

╭━━━[ 🎵 *MEDIA COMMANDS* ]━━━╮
┃ ${config.PREFIX}sticker - Convert image to sticker
╰━━━━━━━━━━━━━━━━━━━━━━━━━╯

🌟 *Powered by ${config.BOT_NAME} v${config.VERSION}* 🌟`;

            await sock.sendMessage(sender, { text: menu });
        }
        
        // .ping
        else if (command === 'ping') {
            await sock.sendMessage(sender, { text: '🏓 Pong! AMM Bot is active.' });
        }
        
        // .alive
        else if (command === 'alive') {
            await sock.sendMessage(sender, { text: `✅ ${config.BOT_NAME} is alive and running!` });
        }
        
        // .time
        else if (command === 'time') {
            const time = moment().tz(config.TIMEZONE).format('HH:mm:ss');
            await sock.sendMessage(sender, { text: `🕐 Current time: ${time} (${config.TIMEZONE})` });
        }
        
        // .owner
        else if (command === 'owner') {
            await sock.sendMessage(sender, { text: `👑 Bot Owner: wa.me/${config.OWNER_NUMBER}` });
        }
        
        // .ai
        else if (command === 'ai' || command === 'ask') {
            if (!aiModel) {
                await sock.sendMessage(sender, { text: '❌ AI disabled. Add GEMINI_API_KEY to .env' });
                return;
            }
            
            const query = messageText.slice(4).trim();
            if (!query) {
                await sock.sendMessage(sender, { text: `❌ Usage: ${config.PREFIX}ai [question]` });
                return;
            }
            
            await sock.sendMessage(sender, { text: '🤔 Thinking...' });
            
            try {
                const result = await aiModel.generateContent(query);
                const response = result.response.text();
                await sock.sendMessage(sender, { text: `🤖 *${config.BOT_NAME} AI:*\n\n${response}` });
            } catch (error) {
                await sock.sendMessage(sender, { text: `❌ Error: ${error.message}` });
            }
        }
        
        // .sticker
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
                await sock.sendMessage(sender, { text: `❌ Failed: ${error.message}` });
            }
        }
        
        // Unknown command
        else {
            await sock.sendMessage(sender, { text: `❌ Unknown command. Type ${config.PREFIX}menu for help.` });
        }
    });
}

// Start
console.log(`
╔═══════════════════════════════════════════╗
║                                           ║
║      🤖 ${config.BOT_NAME} BOT STARTING       ║
║                                           ║
║   Mode: PAIRING CODE 🔐                   ║
║   Version: ${config.VERSION}                         ║
║   Prefix: ${config.PREFIX}                              ║
║   AI: ${aiModel ? 'Enabled ✅' : 'Disabled ⚠️'}               ║
║                                           ║
╚═══════════════════════════════════════════╝
`);

startAMM().catch(err => {
    console.error('❌ Fatal error:', err);
});