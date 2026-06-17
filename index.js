// ============================================
// 🤖 AMM BOT - FULLY WORKING VERSION
// ============================================

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const moment = require('moment-timezone');
require('dotenv').config();

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
            <p>📱 Check terminal for QR code</p>
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
    console.log('⚠️ AI Disabled - Add valid GEMINI_API_KEY to .env file');
}

// Global variable to store connection
let sock = null;
let qrDisplayed = false;

// Main bot function
async function startAMM() {
    const authFolder = path.join(__dirname, 'sessions');
    
    // Delete old session if corrupted
    if (fs.existsSync(authFolder)) {
        console.log('📁 Loading existing session...');
    }
    
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    
    // Create socket WITHOUT printQRInTerminal (deprecated)
    sock = makeWASocket({
        auth: state,
        browser: [`${config.BOT_NAME}`, 'Chrome', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        patchHistory: false
    });

    // Handle QR code manually
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Handle QR code
        if (qr && !qrDisplayed) {
            qrDisplayed = true;
            console.log('\n╔════════════════════════════════════════════════╗');
            console.log('║         📱 SCAN THIS QR CODE TO LOGIN          ║');
            console.log('╚════════════════════════════════════════════════╝\n');
            qrcode.generate(qr, { small: true });
            console.log('\n📌 INSTRUCTIONS:');
            console.log('1️⃣  Open WhatsApp on your phone');
            console.log('2️⃣  Tap Settings (bottom right on iOS, top right dots on Android)');
            console.log('3️⃣  Tap "Linked Devices"');
            console.log('4️⃣  Tap "Link a Device"');
            console.log('5️⃣  Scan the QR code above with your phone\n');
            console.log('⏳ Waiting for connection...\n');
        }
        
        // Handle connection status
        if (connection === 'open') {
            qrDisplayed = false;
            console.log('\n╔════════════════════════════════════════════════╗');
            console.log(`║     ✅ ${config.BOT_NAME} BOT IS ONLINE!            ║`);
            console.log('╚════════════════════════════════════════════════╝\n');
            console.log(`📱 Bot Name: ${config.BOT_NAME}`);
            console.log(`⚡ Command Prefix: ${config.PREFIX}`);
            console.log(`🤖 AI Status: ${aiModel ? '✅ Enabled' : '❌ Disabled'}`);
            console.log(`🌐 Web Panel: http://localhost:${PORT}`);
            console.log(`\n💬 Send "${config.PREFIX}menu" on WhatsApp to start!\n`);
        }
        
        // Handle disconnection
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`\n⚠️ Connection closed. Code: ${statusCode}`);
            
            // Don't reconnect if logged out
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log('🔄 Reconnecting in 5 seconds...\n');
                qrDisplayed = false;
                setTimeout(() => startAMM(), 5000);
            } else {
                console.log('❌ Bot logged out. Please delete "sessions" folder and restart.\n');
            }
        }
    });

    // Save credentials
    sock.ev.on('creds.update', saveCreds);

    // Handle messages
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        
        // Ignore own messages and status broadcasts
        if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') return;
        
        const sender = msg.key.remoteJid;
        const isGroup = sender.includes('@g.us');
        
        // Get message text
        let messageText = '';
        if (msg.message.conversation) messageText = msg.message.conversation;
        else if (msg.message.extendedTextMessage?.text) messageText = msg.message.extendedTextMessage.text;
        else return;
        
        // Check prefix
        if (!messageText.startsWith(config.PREFIX)) return;
        
        // Extract command
        const command = messageText.slice(config.PREFIX.length).trim().toLowerCase();
        const args = command.split(' ');
        const cmd = args[0];
        
        console.log(`📨 Command: ${cmd} | From: ${isGroup ? 'Group' : 'Private'}`);
        
        // ========== COMMANDS ==========
        
        // .menu
        if (cmd === 'menu') {
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
┃ ${config.PREFIX}toimage - Convert sticker to image
╰━━━━━━━━━━━━━━━━━━━━━━━━━╯

╭━━━[ 👥 *GROUP COMMANDS* ]━━━╮
┃ ${config.PREFIX}kick @user - Remove member
┃ ${config.PREFIX}promote @user - Make admin
┃ ${config.PREFIX}demote @user - Remove admin
┃ ${config.PREFIX}tagall - Mention everyone
╰━━━━━━━━━━━━━━━━━━━━━━━━━╯

🌟 *Powered by ${config.BOT_NAME} v${config.VERSION}* 🌟
💬 Type "${config.PREFIX}help [command]" for details`;

            await sock.sendMessage(sender, { text: menu });
        }
        
        // .ping
        else if (cmd === 'ping') {
            const start = Date.now();
            await sock.sendMessage(sender, { text: '🏓 Pinging...' });
            const end = Date.now();
            await sock.sendMessage(sender, { text: `🏓 Pong! ${end - start}ms` });
        }
        
        // .alive
        else if (cmd === 'alive') {
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            await sock.sendMessage(sender, { text: `✅ *${config.BOT_NAME} is alive!*\n⏱️ Uptime: ${hours}h ${minutes}m\n⚡ Status: Online\n🤖 AI: ${aiModel ? 'Enabled' : 'Disabled'}` });
        }
        
        // .time
        else if (cmd === 'time') {
            const time = moment().tz(config.TIMEZONE).format('HH:mm:ss');
            const date = moment().tz(config.TIMEZONE).format('dddd, MMMM Do YYYY');
            await sock.sendMessage(sender, { text: `🕐 *Current Time*\n📍 ${config.TIMEZONE}\n📅 ${date}\n⏰ ${time}` });
        }
        
        // .owner
        else if (cmd === 'owner') {
            await sock.sendMessage(sender, { text: `👑 *Bot Owner*\n📱 wa.me/${config.OWNER_NUMBER}\n💬 Send a message for support or feature requests!` });
        }
        
        // .ai or .ask
        else if (cmd === 'ai' || cmd === 'ask') {
            if (!aiModel) {
                await sock.sendMessage(sender, { text: '❌ *AI is disabled*\n\nPlease add your Gemini API key to the .env file and restart the bot.\n\nGet a free key at: https://aistudio.google.com' });
                return;
            }
            
            const query = messageText.slice(config.PREFIX.length + cmd.length + 1).trim();
            if (!query) {
                await sock.sendMessage(sender, { text: `❌ Usage: ${config.PREFIX}ai [your question]\n\nExample: ${config.PREFIX}ai What is artificial intelligence?` });
                return;
            }
            
            await sock.sendMessage(sender, { text: '🤔 *Thinking...*' });
            
            try {
                const result = await aiModel.generateContent(query);
                const response = result.response.text();
                
                if (response.length > 4000) {
                    const parts = response.match(/.{1,4000}/g);
                    for (const part of parts) {
                        await sock.sendMessage(sender, { text: part });
                    }
                } else {
                    await sock.sendMessage(sender, { text: `🤖 *${config.BOT_NAME} AI:*\n\n${response}` });
                }
            } catch (error) {
                console.error('AI Error:', error);
                await sock.sendMessage(sender, { text: `❌ *AI Error:*\n${error.message}\n\nPlease try again later.` });
            }
        }
        
        // .sticker
        else if (cmd === 'sticker') {
            const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
            
            if (!quoted) {
                await sock.sendMessage(sender, { text: `❌ *How to use .sticker:*\n\n1. Reply to an image message\n2. Type ${config.PREFIX}sticker\n3. The image will be converted to a sticker!` });
                return;
            }
            
            let mediaBuffer = null;
            
            if (quoted.imageMessage) {
                mediaBuffer = await sock.downloadMediaMessage(quoted);
            } else {
                await sock.sendMessage(sender, { text: '❌ Please reply to an *image*, not a video or other media.' });
                return;
            }
            
            if (mediaBuffer) {
                try {
                    await sock.sendMessage(sender, { 
                        sticker: mediaBuffer,
                        mimetype: 'image/webp'
                    });
                } catch (error) {
                    await sock.sendMessage(sender, { text: `❌ Failed to create sticker: ${error.message}` });
                }
            }
        }
        
        // .help
        else if (cmd === 'help') {
            const helpCmd = args[1];
            const helpMessages = {
                'menu': '📖 Shows the main menu with all available commands',
                'ping': '🏓 Checks if the bot is responding (returns response time)',
                'ai': '🤖 Chat with Google Gemini AI. Usage: .ai What is love?',
                'sticker': '🎨 Convert an image to a sticker. Reply to an image with .sticker',
                'alive': '✅ Shows bot status and uptime',
                'time': '🕐 Shows current time in your timezone',
                'owner': '👑 Shows bot owner contact information',
                'kick': '👥 Remove a member from group (admin only)',
                'promote': '⬆️ Make someone admin (admin only)',
                'tagall': '📢 Mention all group members (admin only)'
            };
            
            if (helpCmd && helpMessages[helpCmd]) {
                await sock.sendMessage(sender, { text: `📖 *Help: ${helpCmd}*\n\n${helpMessages[helpCmd]}` });
            } else {
                await sock.sendMessage(sender, { text: `📖 *Help Menu*\n\nUse ${config.PREFIX}help [command] for details.\n\n📋 Available commands:\n${config.PREFIX}menu\n${config.PREFIX}ping\n${config.PREFIX}ai\n${config.PREFIX}sticker\n${config.PREFIX}alive\n${config.PREFIX}time\n${config.PREFIX}owner\n\nType ${config.PREFIX}menu for full list!` });
            }
        }
        
        // Unknown command
        else {
            await sock.sendMessage(sender, { text: `❌ *Unknown command:* ${cmd}\n\nType ${config.PREFIX}menu to see all available commands.\n\n💡 Tip: Use ${config.PREFIX}help [command] for usage info` });
        }
    });
}

// Start the bot
console.log(`
╔═══════════════════════════════════════════╗
║                                           ║
║      🤖 ${config.BOT_NAME} BOT STARTING...       ║
║                                           ║
║   Name: ${config.BOT_NAME}                         ║
║   Version: ${config.VERSION}                         ║
║   Prefix: ${config.PREFIX}                              ║
║   Owner: ${config.OWNER_NUMBER}          ║
║   Timezone: ${config.TIMEZONE}                   ║
║   AI: ${aiModel ? 'Enabled ✅' : 'Disabled ⚠️'}               ║
║                                           ║
╚═══════════════════════════════════════════╝
`);

// Start the bot
startAMM().catch(err => {
    console.error('❌ Fatal error:', err);
    console.log('\n💡 Troubleshooting:');
    console.log('1. Make sure you have internet connection');
    console.log('2. Check if Node.js is up to date');
    console.log('3. Try deleting "sessions" folder and restarting');
    console.log('4. Make sure no VPN/proxy is active\n');
});