const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = "8739780042"; // ඔයාගේ Admin ID එක

if (!BOT_TOKEN) {
    console.error("ERROR: BOT_TOKEN is missing!");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Simple In-Memory User Database
const users = {}; 

function getUser(id, name) {
    if (!users[id]) {
        // ඔයාගේ Admin Telegram ID එක නම් (8739780042) Coins 1,000,000 ලබා දීම
        const initialBalance = (String(id) === ADMIN_ID) ? 1000000 : 100;
        users[id] = { id: id, name: name || 'Player', balance: initialBalance };
    } else if (name) {
        users[id].name = name;
    }
    return users[id];
}

// Bot Commands
bot.start((ctx) => {
    const user = getUser(ctx.from.id, ctx.from.first_name);
    const welcomeMsg = `👋 **Welcome to CheckerX Arena!** 🎮\n\n💰 **Your Balance:** ${user.balance.toLocaleString()} X Coins`;
    const mainMenu = Markup.keyboard([
        ['🎮 Play CheckerX', '💰 Balance'],
        ['📥 Deposit', '📤 Withdrawal'],
        ['🔗 Referral', '💬 Customer Support']
    ]).resize();
    return ctx.replyWithMarkdown(welcomeMsg, mainMenu);
});

bot.hears('💰 Balance', (ctx) => {
    const user = getUser(ctx.from.id, ctx.from.first_name);
    ctx.reply(`💳 **Your Balance:** ${user.balance.toLocaleString()} X Coins`);
});

bot.hears('🎮 Play CheckerX', (ctx) => {
    ctx.reply('👇 Click the blue **Play CheckerX** button at bottom left to play!');
});

bot.launch();

// ---------------- Real-time Matchmaking & Socket Logic ----------------
const waitingPlayers = [];

io.on('connection', (socket) => {

    // Authenticate Telegram User & Sync Balance
    socket.on('init_user', (userData) => {
        if (!userData || !userData.id) return;
        const user = getUser(userData.id, userData.first_name);
        socket.userId = user.id;
        socket.userName = user.name;
        socket.emit('user_synced', { balance: user.balance, name: user.name });
    });

    // Find Match
    socket.on('find_match', (data) => {
        const userId = socket.userId || data.userId || 'guest';
        const user = users[userId] || { balance: 100, name: 'Player' };

        if (user.balance < data.stake) {
            return socket.emit('error_message', 'Insufficient Balance! Please deposit coins to play.');
        }

        socket.stake = data.stake;

        const opponentIndex = waitingPlayers.findIndex(p => p.stake === data.stake && p.id !== socket.id);

        if (opponentIndex !== -1) {
            const opponent = waitingPlayers.splice(opponentIndex, 1)[0];
            const roomId = `room_${socket.id}_${opponent.id}`;

            socket.join(roomId);
            opponent.join(roomId);

            socket.roomId = roomId;
            opponent.roomId = roomId;

            socket.emit('match_found', { role: 'red', opponentName: opponent.userName || 'Opponent', roomId });
            opponent.emit('match_found', { role: 'black', opponentName: socket.userName || 'Opponent', roomId });
        } else {
            waitingPlayers.push(socket);
        }
    });

    socket.on('make_move', (moveData) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('opponent_moved', moveData);
        }
    });

    socket.on('cancel_search', () => {
        const index = waitingPlayers.findIndex(p => p.id === socket.id);
        if (index !== -1) waitingPlayers.splice(index, 1);
    });

    socket.on('disconnect', () => {
        const index = waitingPlayers.findIndex(p => p.id === socket.id);
        if (index !== -1) waitingPlayers.splice(index, 1);
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`CheckerX Socket Server running on port ${port}`);
});