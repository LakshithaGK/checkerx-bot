const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = "8739780042";

if (!BOT_TOKEN) {
    console.error("ERROR: BOT_TOKEN is missing!");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const users = {}; 

function getUser(id, name) {
    const userId = id || 'guest';
    if (!users[userId]) {
        const initialBalance = (String(userId) === ADMIN_ID) ? 1000000 : 100;
        users[userId] = { id: userId, name: name || 'Player', balance: initialBalance, referredBy: null };
    } else if (name) {
        users[userId].name = name;
    }
    return users[userId];
}

bot.start((ctx) => {
    const user = getUser(ctx.from.id, ctx.from.first_name);
    const welcomeMsg = `👋 **Welcome to CheckerX Arena!** 🎮\n\n💰 **Your Balance:** ${user.balance.toLocaleString()} X Coins ($${(user.balance/100).toFixed(2)})`;
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
bot.hears('🎮 Play CheckerX', (ctx) => ctx.reply('👇 Click the blue **Play CheckerX** button at bottom left to play!'));
bot.hears('📥 Deposit', (ctx) => ctx.reply('📥 **Deposit via:**\n1. Binance Pay\n2. USDT (TRC20)\n\nSend payment to Admin & use `/submit_deposit <TxID>`'));
bot.command('submit_deposit', (ctx) => ctx.reply("✅ Deposit request submitted!"));
bot.hears('📤 Withdrawal', (ctx) => ctx.reply("📤 Format: `/withdraw <Address> <Amount>`"));
bot.command('withdraw', (ctx) => ctx.reply("✅ Withdrawal submitted!"));
bot.hears('🔗 Referral', (ctx) => ctx.reply(`🔗 **Your Referral Link:**\nhttps://t.me/CheckerX_Bot?start=${ctx.from.id}`));
bot.hears('💬 Customer Support', (ctx) => ctx.reply('💬 **Contact Admin:** @YourPersonalTelegramUsername'));
bot.command('addcoins', (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const args = ctx.message.text.split(' ');
    if (users[args[1]]) {
        users[args[1]].balance += parseFloat(args[2]);
        bot.telegram.sendMessage(args[1], `🎉 ${args[2]} X Coins added!`);
        ctx.reply(`✅ Added!`);
    }
});

bot.launch();

const waitingPlayers = [];
const activeRooms = {};

io.on('connection', (socket) => {
    socket.on('init_user', (userData) => {
        try {
            if (!userData || !userData.id) return;
            const user = getUser(userData.id, userData.first_name);
            socket.userId = user.id;
            socket.userName = user.name;
            socket.emit('user_synced', { balance: user.balance, name: user.name });
        } catch (e) { console.error(e); }
    });

    socket.on('find_match', (data) => {
        try {
            const uid = socket.userId || (data && data.userId) || 'guest';
            socket.userId = uid;
            socket.userName = socket.userName || 'Player';
            const user = getUser(uid, socket.userName);

            if (user.balance < 100) return socket.emit('error_message', 'Insufficient Balance!');

            if (waitingPlayers.length > 0 && waitingPlayers[0].id !== socket.id) {
                const opponent = waitingPlayers.shift();
                const roomId = `room_${socket.id}_${opponent.id}`;

                socket.join(roomId); opponent.join(roomId);
                socket.roomId = roomId; opponent.roomId = roomId;
                activeRooms[roomId] = { p1: socket, p2: opponent, turn: 'red' };

                users[socket.userId].balance -= 100;
                users[opponent.userId].balance -= 100;
                
                socket.emit('user_synced', { balance: users[socket.userId].balance, name: users[socket.userId].name });
                opponent.emit('user_synced', { balance: users[opponent.userId].balance, name: users[opponent.userId].name });

                socket.emit('match_found', { role: 'red', opponentName: opponent.userName, roomId });
                opponent.emit('match_found', { role: 'black', opponentName: socket.userName, roomId });
            } else {
                if (!waitingPlayers.find(p => p.id === socket.id)) waitingPlayers.push(socket);
            }
        } catch (e) { console.error(e); }
    });

    socket.on('make_move', (moveData) => {
        if (socket.roomId && activeRooms[socket.roomId]) {
            activeRooms[socket.roomId].turn = moveData.nextTurn;
            socket.to(socket.roomId).emit('opponent_moved', moveData);
        }
    });

    socket.on('pass_turn', (data) => {
        if (socket.roomId && activeRooms[socket.roomId]) {
            activeRooms[socket.roomId].turn = data.nextTurn;
            socket.to(socket.roomId).emit('turn_passed', { nextTurn: data.nextTurn });
        }
    });

    function handleWin(winnerSocket, loserSocket, eventName) {
        if (!winnerSocket || !winnerSocket.userId) return;
        const winner = getUser(winnerSocket.userId);
        winner.balance += 180; // 80% Profit, 20 Network fee
        winnerSocket.emit('user_synced', { balance: winner.balance, name: winner.name });
        if (loserSocket && eventName) winnerSocket.emit(eventName);
    }

    socket.on('game_won', () => {
        if (socket.roomId && activeRooms[socket.roomId]) {
            const room = activeRooms[socket.roomId];
            const loserSocket = (room.p1.id === socket.id) ? room.p2 : room.p1;
            handleWin(socket, loserSocket);
            loserSocket.emit('you_lost_game');
            delete activeRooms[socket.roomId];
        }
    });

    socket.on('timeout_loss', () => {
        if (socket.roomId && activeRooms[socket.roomId]) {
            const room = activeRooms[socket.roomId];
            const winnerSocket = (room.p1.id === socket.id) ? room.p2 : room.p1;
            handleWin(winnerSocket, socket, 'opponent_timed_out');
            delete activeRooms[socket.roomId];
        }
    });

    socket.on('cancel_search', () => {
        const index = waitingPlayers.findIndex(p => p.id === socket.id);
        if (index !== -1) waitingPlayers.splice(index, 1);
    });

    socket.on('disconnect', () => {
        const index = waitingPlayers.findIndex(p => p.id === socket.id);
        if (index !== -1) waitingPlayers.splice(index, 1);

        if (socket.roomId && activeRooms[socket.roomId]) {
            const room = activeRooms[socket.roomId];
            const winnerSocket = (room.p1.id === socket.id) ? room.p2 : room.p1;
            handleWin(winnerSocket, socket, 'opponent_disconnected');
            delete activeRooms[socket.roomId];
        }
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server Running on port ${port}`));