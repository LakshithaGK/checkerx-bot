const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI; 
const ADMIN_ID = "8739780042"; 
const MATCH_LOG_CHANNEL_ID = "-1004321776706"; 

if (!BOT_TOKEN) {
    console.error("ERROR: BOT_TOKEN is missing!");
    process.exit(1);
}

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Successfully connected to MongoDB Atlas!"))
    .catch((err) => console.error("❌ MongoDB Connection Error:", err));

const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, default: 'Player' },
    balance: { type: Number, default: 100 }
});

const User = mongoose.model('User', userSchema);

const bot = new Telegraf(BOT_TOKEN);
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function getUser(id, name) {
    const userId = String(id || 'guest');
    try {
        let user = await User.findOne({ id: userId });
        if (!user) {
            const initialBalance = (userId === ADMIN_ID) ? 1000000 : 100;
            user = new User({ id: userId, name: name || 'Player', balance: initialBalance });
            await user.save();
        } else if (name && user.name !== name) {
            user.name = name;
            await user.save();
        }
        return user;
    } catch (e) {
        console.error("Database Error:", e);
        return { id: userId, name: name || 'Player', balance: 100 };
    }
}

bot.start(async (ctx) => {
    const user = await getUser(ctx.from.id, ctx.from.first_name);
    const welcomeMsg = `👋 **Welcome to CheckerX Arena!** 🎮\n\n💰 **Your Balance:** ${user.balance.toLocaleString()} X Coins ($${(user.balance/100).toFixed(2)})`;
    const mainMenu = Markup.keyboard([
        ['🎮 Play CheckerX', '💰 Balance'],
        ['📥 Deposit', '📤 Withdrawal'],
        ['🔗 Referral', '💬 Customer Support']
    ]).resize();
    return ctx.replyWithMarkdown(welcomeMsg, mainMenu);
});

bot.hears('💰 Balance', async (ctx) => {
    const user = await getUser(ctx.from.id, ctx.from.first_name);
    ctx.reply(`💳 **Your Balance:** ${user.balance.toLocaleString()} X Coins`);
});

bot.hears('🎮 Play CheckerX', (ctx) => ctx.reply('👇 Click the blue **Play CheckerX** button at bottom left to play!'));
bot.hears('📥 Deposit', (ctx) => ctx.reply('📥 **Deposit via:**\n1. Binance Pay\n2. USDT (TRC20)\n\nSend payment to Admin & use `/submit_deposit <TxID>`'));
bot.command('submit_deposit', (ctx) => ctx.reply("✅ Deposit request submitted!"));

bot.hears('📤 Withdrawal', async (ctx) => {
    const user = await getUser(ctx.from.id);
    const args = ctx.message.text.split(' ');
    const amount = parseFloat(args[2]);
    if (!args[1] || !amount || amount > user.balance) return ctx.reply("❌ Invalid amount or insufficient balance!");
    user.balance -= amount;
    await user.save();
    ctx.reply("✅ Withdrawal request submitted successfully!");
});

bot.hears('🔗 Referral', (ctx) => ctx.reply(`🔗 **Your Referral Link:**\nhttps://t.me/CheckerX_Bot?start=${ctx.from.id}`));
bot.hears('💬 Customer Support', (ctx) => ctx.reply('💬 **Contact Admin:** @YourPersonalTelegramUsername'));

bot.command('addcoins', async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const args = ctx.message.text.split(' ');
    const targetId = args[1];
    const amount = parseFloat(args[2]);
    try {
        let user = await User.findOne({ id: targetId });
        if (user) {
            user.balance += amount;
            await user.save();
            bot.telegram.sendMessage(targetId, `🎉 ${amount} X Coins added!`);
            ctx.reply(`✅ Added!`);
        } else {
            ctx.reply(`❌ User not found in database!`);
        }
    } catch (e) {
        ctx.reply(`❌ Error adding coins.`);
    }
});

bot.launch().then(() => console.log("Bot launched!")).catch((err) => console.error("Bot Error:", err.message));

const waitingPlayers = [];
const activeRooms = {};
let onlineUsersCount = 0; 

io.on('connection', (socket) => {
    onlineUsersCount++;
    io.emit('online_count', onlineUsersCount); 

    socket.on('init_user', async (userData) => {
        try {
            if (!userData || !userData.id) return;
            const user = await getUser(userData.id, userData.first_name);
            socket.userId = user.id;
            socket.userName = user.name;
            socket.emit('user_synced', { balance: user.balance, name: user.name });
        } catch (e) { console.error(e); }
    });

    socket.on('find_match', async (data) => {
        try {
            const uid = socket.userId || (data && data.userId) || 'guest';
            socket.userId = uid;
            socket.userName = socket.userName || 'Player';
            const user = await getUser(uid, socket.userName);

            if (user.balance < 100) return socket.emit('error_message', 'Insufficient Balance!');

            if (waitingPlayers.length > 0 && waitingPlayers[0].id !== socket.id) {
                const opponent = waitingPlayers.shift();
                const roomId = `room_${socket.id}_${opponent.id}`;

                socket.join(roomId); opponent.join(roomId);
                socket.roomId = roomId; opponent.roomId = roomId;
                activeRooms[roomId] = { p1: socket, p2: opponent, turn: 'red' };

                const u1 = await User.findOne({ id: socket.userId });
                const u2 = await User.findOne({ id: opponent.userId });
                
                if (u1) { u1.balance -= 100; await u1.save(); socket.emit('user_synced', { balance: u1.balance, name: u1.name }); }
                if (u2) { u2.balance -= 100; await u2.save(); opponent.emit('user_synced', { balance: u2.balance, name: u2.name }); }

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

    async function handleWin(winnerSocket, loserSocket, eventName, reason = "Normal Win") {
        if (!winnerSocket || !winnerSocket.userId) return;
        try {
            const winner = await User.findOne({ id: winnerSocket.userId });
            if (winner) {
                winner.balance += 180;
                await winner.save();
                winnerSocket.emit('user_synced', { balance: winner.balance, name: winner.name });
            }
            if (loserSocket && eventName) loserSocket.emit(eventName);

            if (loserSocket && loserSocket.userId) {
                const loser = await User.findOne({ id: loserSocket.userId });
                const logMsg = `🏆 *Match Finished*\n\n🟢 *Winner:* ${winner ? winner.name : 'Player'} (\`${winnerSocket.userId}\`)\n🔴 *Loser:* ${loser ? loser.name : 'Player'} (\`${loserSocket.userId}\`)\nℹ️ *Reason:* ${reason}`;
                bot.telegram.sendMessage(MATCH_LOG_CHANNEL_ID, logMsg, { parse_mode: 'Markdown' }).catch(e => console.log(e.message));
            }
        } catch (e) { console.error("Win handling error:", e); }
    }

    socket.on('game_won', async () => {
        if (socket.roomId && activeRooms[socket.roomId]) {
            const room = activeRooms[socket.roomId];
            const loserSocket = (room.p1.id === socket.id) ? room.p2 : room.p1;
            await handleWin(socket, loserSocket, null, "All Pieces Captured");
            loserSocket.emit('you_lost_game');
            delete activeRooms[socket.roomId];
        }
    });

    // 🟢 Improved Timeout Handling (Works for both players securely)
    socket.on('timeout_loss', async () => {
        if (socket.roomId && activeRooms[socket.roomId]) {
            const room = activeRooms[socket.roomId];
            const winnerSocket = (room.p1.id === socket.id) ? room.p2 : room.p1;
            await handleWin(winnerSocket, socket, 'opponent_timed_out', "Turn Timeout Limit Exceeded");
            winnerSocket.emit('opponent_timed_out');
            socket.emit('you_lost_game');
            delete activeRooms[socket.roomId];
        }
    });

    socket.on('cancel_search', () => {
        const index = waitingPlayers.findIndex(p => p.id === socket.id);
        if (index !== -1) waitingPlayers.splice(index, 1);
    });

    socket.on('disconnect', async () => {
        onlineUsersCount--;
        io.emit('online_count', onlineUsersCount); 

        const index = waitingPlayers.findIndex(p => p.id === socket.id);
        if (index !== -1) waitingPlayers.splice(index, 1);

        if (socket.roomId && activeRooms[socket.roomId]) {
            const room = activeRooms[socket.roomId];
            const winnerSocket = (room.p1.id === socket.id) ? room.p2 : room.p1;
            await handleWin(winnerSocket, socket, 'opponent_disconnected', "Opponent Disconnected / Left Match");
            winnerSocket.emit('opponent_disconnected');
            delete activeRooms[socket.roomId];
        }
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server running on port ${port}`));