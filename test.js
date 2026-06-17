const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const path = require('path');

async function start() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'sessions_test'));
    const sock = makeWASocket({ version, auth: state, browser: Browsers.windows('Chrome') });
    sock.ev.on('connection.update', ({ connection, qr }) => {
        if (qr) require('qrcode-terminal').generate(qr, { small: true });
        if (connection === 'open') console.log('✅ Test bot online');
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        if (text === '.ping') await sock.sendMessage(msg.key.remoteJid, { text: '🏓 Pong!' });
    });
}
start();