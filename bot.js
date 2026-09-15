const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = "8739780042"; // ඔයාගේ Admin ID එක
const DEPOSIT_CHANNEL_ID = "@your_deposit_channel";
const WITHDRAW_CHANNEL_ID = "@your_withdraw_channel";

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

// Simple In-Memory Database
const users = {}; 

function getUser(ctx) {
    const id = ctx.from.id;
    if (!users[id]) {
        users[id] = { id: id, name: ctx.from.first_name, balance: 100, referredBy: null };
    }
    return users[id];
}

// Bot Commands
bot.start((ctx) => {
    const user = getUser(ctx);
    const welcomeMsg = `👋 **Welcome to CheckerX Ecosystem!** 🎮\n\n💰 **Balance:** ${user.balance} X Coins`;
    const mainMenu = Markup.keyboard([
        ['🎮 Play CheckerX', '💰 Balance'],
        ['📥 Deposit', '📤 Withdrawal'],
        ['🔗 Referral', '💬 Customer Support']
    ]).resize();
    return ctx.replyWithMarkdown(welcomeMsg, mainMenu);
});

bot.hears('💰 Balance', (ctx) => {
    const user = getUser(ctx);
    ctx.reply(`💳 **Your Balance:** ${user.balance} X Coins`);
});

bot.hears('🎮 Play CheckerX', (ctx) => {
    ctx.reply('👇 Click the blue **Play CheckerX** button at bottom left to play!');
});

bot.launch();

// ---------------- Real-time Matchmaking & Socket Logic ----------------
const waitingPlayers = []; // Matchmaking Queue

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Player joins matchmaking
    socket.on('find_match', (data) => {
        socket.stake = data.stake;
        socket.playerName = data.name || 'Player';

        // Check if there is an opponent waiting with the SAME STAKE
        const opponentIndex = waitingPlayers.findIndex(p => p.stake === data.stake && p.id !== socket.id);

        if (opponentIndex !== -1) {
            // Found Match!
            const opponent = waitingPlayers.splice(opponentIndex, 1)[0];
            const roomId = `room_${socket.id}_${opponent.id}`;

            socket.join(roomId);
            opponent.join(roomId);

            socket.roomId = roomId;
            opponent.roomId = roomId;

            // Assign Colors & Start Game
            socket.emit('match_found', { role: 'red', opponentName: opponent.playerName, roomId });
            opponent.emit('match_found', { role: 'black', opponentName: socket.playerName, roomId });
        } else {
            // No opponent yet -> Add to Waiting List
            waitingPlayers.push(socket);
        }
    });

    // Handle Moves Syncing between 2 Players
    socket.on('make_move', (moveData) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('opponent_moved', moveData);
        }
    });

    // Cancel Matchmaking
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
    console.log(`CheckerX Socket & Express Server running on port ${port}`);
});