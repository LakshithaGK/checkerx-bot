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
const ADMIN_GROUP_ID = "-1004321776706"; 

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
    balance: { type: Number, default: 20 }, 
    country: { type: String, default: null },
    language: { type: String, default: null },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    history: { type: Array, default: [] },
    registeredAt: { type: Date, default: Date.now }
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
            const initialBalance = (userId === ADMIN_ID) ? 1000000 : 20;
            user = new User({ id: userId, name: name || 'Player', balance: initialBalance });
            await user.save();
        } else if (name && user.name !== name) {
            user.name = name;
            await user.save();
        }
        return user;
    } catch (e) {
        return { id: userId, name: name || 'Player', balance: 20, wins: 0, losses: 0, history: [] };
    }
}

const userStates = {}; 

bot.start(async (ctx) => {
    const userId = String(ctx.from.id);
    let user = await User.findOne({ id: userId });
    delete userStates[userId]; 

    const payload = ctx.startPayload;
    if (payload && payload.startsWith('room_')) {
        if (!user || !user.country || !user.language) {
            return ctx.reply("🌍 *Welcome to CheckerX!*\nPlease complete your quick setup first using /start");
        }
        return ctx.replyWithMarkdown(
            `🎮 *FRIEND INVITE RECEIVED!*\n\nYou have been invited to a private 1vs1 match!\nClick the button below to enter the room and play:`,
            Markup.inlineKeyboard([
                [Markup.button.webApp('⚔️ Join Match Now', `https://checkerx-bot.onrender.com/?room=${payload}`)]
            ])
        );
    }

    if (!user || !user.country) {
        return ctx.reply("🌍 *Welcome to CheckerX!*\nPlease select your country to continue:", {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🇧🇷 Brazil', 'country_Brazil'), Markup.button.callback('🇱🇰 Sri Lanka', 'country_Sri Lanka')],
                [Markup.button.callback('🇺🇸 USA', 'country_USA'), Markup.button.callback('🇵🇹 Portugal', 'country_Portugal')],
                [Markup.button.callback('🇷🇺 Russia', 'country_Russia'), Markup.button.callback('🇮🇳 India', 'country_India')],
                [Markup.button.callback('🌍 Other (Type your country)', 'country_other')]
            ])
        });
    } else if (!user.language) {
        return sendLanguageSelection(ctx);
    } else {
        return sendMainMenu(ctx, user);
    }
});

bot.action(/country_(.+)/, async (ctx) => {
    const countryParam = ctx.match[1];
    const userId = String(ctx.from.id);
    if (countryParam === 'other') {
        userStates[userId] = { action: 'register', step: 'awaiting_country_name' };
        await ctx.answerCbQuery();
        return ctx.replyWithMarkdown("🌍 *Please type the name of your country below:*");
    }
    let user = await User.findOne({ id: userId });
    if (!user) user = new User({ id: userId, name: ctx.from.first_name, country: countryParam });
    else user.country = countryParam;
    await user.save();
    ctx.deleteMessage();
    sendLanguageSelection(ctx);
});

function sendLanguageSelection(ctx) {
    ctx.reply("🗣 *Select your Language / Selecione seu idioma:*", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🇬🇧 English', 'lang_en'), Markup.button.callback('🇵🇹 Português', 'lang_pt')]
        ])
    });
}

bot.action(/lang_(.+)/, async (ctx) => {
    const lang = ctx.match[1];
    const userId = String(ctx.from.id);
    let user = await User.findOne({ id: userId });
    user.language = lang;
    await user.save();
    ctx.deleteMessage();

    try {
        const totalUsers = await User.countDocuments();
        const adminMsg = `🚨 *New Player Joined!* 🚨\n\n👤 *Name:* ${user.name}\n🆔 *ID:* \`${user.id}\`\n🌍 *Country:* ${user.country}\n🗣 *Language:* ${user.language.toUpperCase()}\n\n📊 *Total Players:* ${totalUsers} 📈`;
        await bot.telegram.sendMessage(ADMIN_GROUP_ID, adminMsg, { parse_mode: 'Markdown' });
    } catch (error) { console.log("Admin group error", error.message); }

    const rulesMsg = lang === 'pt' ? `📜 *Regras do CheckerX:*\n1. Captura obrigatória.\n2. Timeout de 30s = Perda.\n3. Taxa de rede: 20%.` : `📜 *CheckerX Pro Rules:*\n1. Majority capture is mandatory.\n2. 30s Timeout = Loss.\n3. Network Fee: 20%.`;
    await ctx.replyWithMarkdown(rulesMsg);
    sendMainMenu(ctx, user);
});

function sendMainMenu(ctx, user) {
    const msg = user.language === 'pt' ? `🎮 *Menu Principal*\n💰 Saldo: ${user.balance} X Coins` : `🎮 *Main Menu*\n💰 Balance: ${user.balance} X Coins`;
    const mainMenu = Markup.keyboard([
        ['🎮 Play CheckerX', '💰 Balance'],
        ['📥 Deposit', '📤 Withdrawal'],
        ['🔗 Referral', '💬 Support']
    ]).resize();
    ctx.reply(msg, { parse_mode: 'Markdown', ...mainMenu });
}

bot.hears('🎮 Play CheckerX', (ctx) => ctx.replyWithMarkdown('👇 Click the *Play CheckerX* button at bottom left to play!'));
bot.hears('🔗 Referral', (ctx) => {
    const botUsername = 'CheckerX_Official_Bot';
    ctx.replyWithMarkdown(`🔗 *YOUR REFERRAL LINK*\nShare this link with your friends to invite them to the Arena!\n\n👉 \`https://t.me/${botUsername}?start=${ctx.from.id}\``);
});
bot.hears('💰 Balance', async (ctx) => {
    const user = await User.findOne({ id: String(ctx.from.id) });
    const totalMatches = user.wins + user.losses;
    const winRate = totalMatches > 0 ? Math.round((user.wins / totalMatches) * 100) : 0;
    const balanceMsg = `🏦 *CHECKERX WALLET* 🏦\n━━━━━━━━━━━━━━━━━━\n👤 *User:* ${user.name}\n💰 *Balance:* \`${user.balance.toLocaleString()} X Coins\`\n🏆 *Win Rate:* ${winRate}% (${user.wins}W / ${user.losses}L)\n━━━━━━━━━━━━━━━━━━`;
    ctx.replyWithMarkdown(balanceMsg);
});
bot.hears('📥 Deposit', (ctx) => {
    delete userStates[ctx.from.id];
    ctx.reply("📥 *SELECT DEPOSIT METHOD*\n\n_Minimum Deposit: $2.00 (200 X Coins)_", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔶 Binance Pay', 'dep_binance'), Markup.button.callback('💵 USDT (TRC20)', 'dep_usdt')],
            [Markup.button.callback('🔴 TRX (TRC20)', 'dep_trx'), Markup.button.callback('🟣 Solana', 'dep_sol')]
        ])
    });
});
bot.action(/dep_(.+)/, async (ctx) => {
    const method = ctx.match[1].toUpperCase();
    const userId = ctx.from.id;
    let address = 'Your_Wallet_Address_Here';
    if(method === 'BINANCE') address = 'Pay ID: 123456789'; 
    userStates[userId] = { action: 'deposit', method: method, step: 'awaiting_amount' };
    await ctx.answerCbQuery();
    ctx.replyWithMarkdown(`📥 *${method} DEPOSIT*\n\nSend payment to:\n\`${address}\`\n\n👇 *How much are you depositing? (in USD)*`);
});
bot.hears('📤 Withdrawal', async (ctx) => {
    const userId = ctx.from.id;
    const user = await User.findOne({ id: String(userId) });
    if (user.balance < 300) return ctx.replyWithMarkdown(`❌ *Insufficient Balance* (Min: 300 X Coins)`);
    userStates[userId] = { action: 'withdraw', step: 'awaiting_amount' };
    ctx.replyWithMarkdown("📤 *WITHDRAWAL REQUEST*\n\n👇 *How many X Coins do you want to withdraw?*");
});
bot.action(/with_(.+)/, async (ctx) => {
    const userId = ctx.from.id;
    const state = userStates[userId];
    if (!state) return;
    state.method = ctx.match[1].toUpperCase();
    state.step = 'awaiting_address';
    await ctx.answerCbQuery();
    ctx.replyWithMarkdown(`🏦 *${state.method} Selected*\n\n📍 *Paste your Wallet Address below:*`);
});
bot.hears('💬 Support', (ctx) => ctx.reply("💬 *Customer Support*", { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.url('👨‍💻 Contact Admin', 'https://t.me/YourUsernameHere')]]) }));
bot.command('addcoins', async (ctx) => {
    if (String(ctx.from.id) !== ADMIN_ID) return;
    const args = ctx.message.text.split(' ');
    let user = await User.findOne({ id: args[1] });
    if (user) { user.balance += parseFloat(args[2]); await user.save(); ctx.reply(`✅ Added!`); }
    else ctx.reply(`❌ Not found!`);
});

bot.on('text', async (ctx, next) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    const state = userStates[userId];
    if (state && state.action === 'register' && state.step === 'awaiting_country_name') {
        let user = await User.findOne({ id: String(userId) });
        if (!user) user = new User({ id: String(userId), name: ctx.from.first_name, country: text.trim() });
        else user.country = text.trim();
        await user.save();
        delete userStates[userId];
        return sendLanguageSelection(ctx);
    }
    let user = await User.findOne({ id: String(userId) });
    if (user && (!user.country || !user.language)) return ctx.reply("⚠️ Complete setup using /start");
    if (['🎮 Play CheckerX', '💰 Balance', '📥 Deposit', '📤 Withdrawal', '🔗 Referral', '💬 Support'].includes(text)) {
        delete userStates[userId];
        return next();
    }
    if (!state) return next();
    if (state.action === 'deposit' && state.step === 'awaiting_amount') {
        state.amount = parseFloat(text); state.step = 'awaiting_txid';
        return ctx.replyWithMarkdown(`✅ Amount saved: *$${state.amount}*\n\n🔗 Paste your *TxID* below:`);
    }
    if (state.action === 'deposit' && state.step === 'awaiting_txid') {
        const adminMsg = `📥 *NEW DEPOSIT*\n👤 *User:* ${user.name}\n💸 *Amt:* $${state.amount}\n🔗 *TxID:* \`${text}\``;
        bot.telegram.sendMessage(ADMIN_GROUP_ID, adminMsg, { parse_mode: 'Markdown' }).catch(e=>{});
        ctx.replyWithMarkdown("✅ *Deposit Submitted!*");
        delete userStates[userId]; return;
    }
    if (state.action === 'withdraw' && state.step === 'awaiting_amount') {
        state.amount = parseFloat(text); state.step = 'awaiting_method';
        return ctx.reply("💳 Select withdrawal method:", Markup.inlineKeyboard([
            [Markup.button.callback('🔶 Binance', 'with_binance'), Markup.button.callback('💵 USDT', 'with_usdt')],
            [Markup.button.callback('🔴 TRX', 'with_trx'), Markup.button.callback('🟣 Solana', 'with_sol')]
        ]));
    }
    if (state.action === 'withdraw' && state.step === 'awaiting_address') {
        user.balance -= state.amount; await user.save();
        const adminMsg = `📤 *NEW WITHDRAWAL*\n👤 *User:* ${user.name}\n💸 *Amt:* ${state.amount} Coins\n📍 *Addr:* \`${text}\``;
        bot.telegram.sendMessage(ADMIN_GROUP_ID, adminMsg, { parse_mode: 'Markdown' }).catch(e=>{});
        ctx.replyWithMarkdown(`✅ *Withdrawal Successful!* New Balance: ${user.balance} Coins`);
        delete userStates[userId]; return;
    }
    return next();
});

bot.launch().then(() => console.log("Bot launched!")).catch((err) => console.error("Bot Error:", err.message));

// ==========================================
// --- MULTIPLAYER & LIVE PLAYERS ENGINE ---
// ==========================================
const waitingPlayers = [];
const privateRooms = {}; 
const activeRooms = {};
const activeSockets = {}; 
let onlineUsersCount = 0; 

function broadcastOnlineUsers() {
    const usersList = Object.values(activeSockets).map(s => ({ id: s.userId, name: s.userName }));
    io.emit('online_users_list', usersList);
}

io.on('connection', (socket) => {
    onlineUsersCount++;
    io.emit('online_count', onlineUsersCount); 

    socket.on('init_user', async (userData) => {
        try {
            if (!userData || !userData.id) return;
            const user = await getUser(userData.id, userData.first_name);
            socket.userId = user.id;
            socket.userName = user.name;
            activeSockets[socket.id] = socket;

            const totalMatches = user.wins + user.losses;
            const winRate = totalMatches > 0 ? Math.round((user.wins / totalMatches) * 100) : 0;

            socket.emit('user_synced', { balance: user.balance, name: user.name, winRate, history: user.history });
            broadcastOnlineUsers();
        } catch (e) { console.error(e); }
    });

    socket.on('create_room', async (data) => {
        try {
            const user = await getUser(socket.userId, socket.userName);
            if (user.balance < 100) return socket.emit('error_message', 'Insufficient Balance!');
            const roomId = `room_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
            socket.join(roomId);
            socket.roomId = roomId;
            privateRooms[roomId] = socket;
            socket.emit('room_created', { roomId });
        } catch (e) { console.error(e); }
    });

    socket.on('join_room', async (data) => {
        try {
            const user = await getUser(socket.userId, socket.userName);
            if (user.balance < 100) return socket.emit('error_message', 'Insufficient Balance!');
            const creatorSocket = privateRooms[data.roomId];
            if (!creatorSocket) return socket.emit('error_message', 'Room expired!');
            if (creatorSocket.id === socket.id) return;

            socket.join(data.roomId);
            socket.roomId = data.roomId;
            delete privateRooms[data.roomId];

            activeRooms[data.roomId] = { p1: creatorSocket, p2: socket, turn: 'red' };

            const u1 = await User.findOne({ id: creatorSocket.userId });
            const u2 = await User.findOne({ id: socket.userId });

            if (u1) { u1.balance -= 100; await u1.save(); creatorSocket.emit('user_synced', { balance: u1.balance, name: u1.name, winRate: Math.round((u1.wins/(u1.wins+u1.losses||1))*100), history: u1.history }); }
            if (u2) { u2.balance -= 100; await u2.save(); socket.emit('user_synced', { balance: u2.balance, name: u2.name, winRate: Math.round((u2.wins/(u2.wins+u2.losses||1))*100), history: u2.history }); }

            creatorSocket.emit('match_found', { role: 'red', opponentName: socket.userName, roomId: data.roomId });
            socket.emit('match_found', { role: 'black', opponentName: creatorSocket.userName, roomId: data.roomId });
        } catch (e) { console.error(e); }
    });

    socket.on('find_match', async (data) => {
        try {
            const user = await getUser(socket.userId, socket.userName);
            if (user.balance < 100) return socket.emit('error_message', 'Insufficient Balance!');

            if (waitingPlayers.length > 0 && waitingPlayers[0].id !== socket.id) {
                const opponent = waitingPlayers.shift();
                const roomId = `room_${socket.id}_${opponent.id}`;

                socket.join(roomId); opponent.join(roomId);
                socket.roomId = roomId; opponent.roomId = roomId;
                activeRooms[roomId] = { p1: socket, p2: opponent, turn: 'red' };

                const u1 = await User.findOne({ id: socket.userId });
                const u2 = await User.findOne({ id: opponent.userId });
                
                if (u1) { u1.balance -= 100; await u1.save(); u1.winRate = Math.round((u1.wins/(u1.wins+u1.losses||1))*100); socket.emit('user_synced', { balance: u1.balance, name: u1.name, winRate: u1.winRate, history: u1.history }); }
                if (u2) { u2.balance -= 100; await u2.save(); u2.winRate = Math.round((u2.wins/(u2.wins+u2.losses||1))*100); opponent.emit('user_synced', { balance: u2.balance, name: u2.name, winRate: u2.winRate, history: u2.history }); }

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

    // 🟢 RESTORED ORIGINAL STABLE handleWin (Fixes 0 timer hang & restores exact event names)
    async function handleWin(winnerSocket, loserSocket, eventName, reason = "Normal Win") {
        if (!winnerSocket || !winnerSocket.userId) return;
        try {
            const winner = await User.findOne({ id: winnerSocket.userId });
            if (winner) {
                winner.balance += 180;
                winner.wins += 1;
                winner.history.unshift({ result: 'WIN', opponent: loserSocket && loserSocket.userName ? loserSocket.userName : 'Opponent', time: Date.now() });
                if (winner.history.length > 20) winner.history.pop();
                await winner.save();
                const wr = Math.round((winner.wins / (winner.wins + winner.losses || 1)) * 100);
                winnerSocket.emit('user_synced', { balance: winner.balance, name: winner.name, winRate: wr, history: winner.history });
            }

            if (loserSocket && eventName) {
                loserSocket.emit(eventName);
                if (loserSocket.userId) {
                    const loser = await User.findOne({ id: loserSocket.userId });
                    if (loser) {
                        loser.losses += 1;
                        loser.history.unshift({ result: 'LOSS', opponent: winner ? winner.name : 'Opponent', time: Date.now() });
                        if (loser.history.length > 20) loser.history.pop();
                        await loser.save();
                        const wr = Math.round((loser.wins / (loser.wins + loser.losses || 1)) * 100);
                        loserSocket.emit('user_synced', { balance: loser.balance, name: loser.name, winRate: wr, history: loser.history });
                    }
                }
            }

            if (loserSocket && loserSocket.userId && winner) {
                const loserUser = await User.findOne({ id: loserSocket.userId });
                const logMsg = `🏆 *Match Finished*\n\n🟢 *Winner:* ${winner.name} (\`${winner.id}\`)\n🔴 *Loser:* ${loserUser ? loserUser.name : 'Player'} (\`${loserSocket.userId}\`)\nℹ️ *Reason:* ${reason}`;
                bot.telegram.sendMessage(MATCH_LOG_CHANNEL_ID, logMsg, { parse_mode: 'Markdown' }).catch(e => {});
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
        for (const [rid, s] of Object.entries(privateRooms)) {
            if (s.id === socket.id) delete privateRooms[rid];
        }
    });

    socket.on('disconnect', async () => {
        onlineUsersCount--;
        io.emit('online_count', onlineUsersCount); 
        delete activeSockets[socket.id];
        broadcastOnlineUsers();

        const index = waitingPlayers.findIndex(p => p.id === socket.id);
        if (index !== -1) waitingPlayers.splice(index, 1);

        for (const [rid, s] of Object.entries(privateRooms)) {
            if (s.id === socket.id) delete privateRooms[rid];
        }

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