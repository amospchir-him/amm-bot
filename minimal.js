const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const path = require('path');

async function start() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'sessions_min'));
    const sock = makeWASocket({ version, auth: state, browser: Browsers.windows('Chrome') });

    sock.ev.on('connection.update', ({ connection, qr }) => {
        if (qr) { console.log('Scan this QR:'); qrcode.generate(qr, { small: true }); }
        if (connection === 'open') console.log('✅ ONLINE! Send .ping');
    });
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const sender = msg.key.remoteJid;
        console.log(`Received: "${text}"`);

        if (text === '.ping') {
            await sock.sendMessage(sender, { text: '🏓 Pong!' });
        } else if (text === '.menu') {
            await sock.sendMessage(sender, { text: 'Commands: .ping, .menu' });
        }
    });
}
start();