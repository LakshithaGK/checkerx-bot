const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI; 
const ADMIN_ID = "8739780042"; // 🔴 ඔයාගේ Admin ID එක
const MATCH_LOG_CHANNEL_ID = "-1004321776706"; // 🔴 ඔයාගේ Private Channel ID එක 
const ADMIN_GROUP_ID = "-1004321776706"; // 🔴 New Users ලා වැටෙන Channel එකත් මේකමයි

if (!BOT_TOKEN) {
    console.error("ERROR: BOT_TOKEN is missing!");
    process.exit(1);
}

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Successfully connected to MongoDB Atlas!"))
    .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// 🟢 අලුත් User Schema එක (Country, Language සහ Welcome Bonus 20ක් එක්ක)
const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, default: 'Player' },
    balance: { type: Number, default: 20 }, // 🎁 Welcome Bonus 20 Coins
    country: { type: String, default: null },
    language: { type: String, default: null },
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
        return { id: userId, name: name || 'Player', balance: 20 };
    }
}

// --- 🟢 අලුත් BOT COMMANDS සහ REGISTRATION FLOW ---

bot.start(async (ctx) => {
    const userId = String(ctx.from.id);
    let user = await User.findOne({ id: userId });

    if (!user) {
        // අලුත් යූසර් කෙනෙක් නම් රට අහනවා
        return ctx.reply("🌍 **Welcome to CheckerX!**\nPlease select your country to continue:", Markup.inlineKeyboard([
            [Markup.button.callback('🇧🇷 Brazil', 'country_br'), Markup.button.callback('🇱🇰 Sri Lanka', 'country_lk')],
            [Markup.button.callback('🇺🇸 USA', 'country_us'), Markup.button.callback('🌍 Other', 'country_other')]
        ]));
    } else if (!user.language) {
        // රට තෝරලා භාෂාව තෝරලා නැත්නම්
        return sendLanguageSelection(ctx);
    } else {
        // ඔක්කොම තෝරලා නම් Main Menu එක දෙනවා
        return sendMainMenu(ctx, user);
    }
});

bot.action(/country_(.+)/, async (ctx) => {
    const country = ctx.match[1];
    const userId = String(ctx.from.id);
    let user = await User.findOne({ id: userId });
    
    if (!user) {
        user = new User({ id: userId, name: ctx.from.first_name, country: country });
        await user.save();
    } else {
        user.country = country;
        await user.save();
    }
    
    ctx.deleteMessage();
    sendLanguageSelection(ctx);
});

function sendLanguageSelection(ctx) {
    ctx.reply("🗣 **Select your Language / Selecione seu idioma:**", Markup.inlineKeyboard([
        [Markup.button.callback('🇬🇧 English', 'lang_en'), Markup.button.callback('🇵🇹 Português', 'lang_pt')]
    ]));
}

bot.action(/lang_(.+)/, async (ctx) => {
    const lang = ctx.match[1];
    const userId = String(ctx.from.id);
    let user = await User.findOne({ id: userId });
    
    user.language = lang;
    await user.save();
    ctx.deleteMessage();

    // 🟢 ගෲප් එකට නොටිෆිකේෂන් එක යවනවා
    try {
        const totalUsers = await User.countDocuments();
        const adminMsg = `🚨 **New Player Joined!** 🚨\n\n👤 **Name:** ${user.name}\n🆔 **ID:** \`${user.id}\`\n🌍 **Country:** ${user.country.toUpperCase()}\n🗣 **Language:** ${user.language.toUpperCase()}\n\n📊 **Total Players:** ${totalUsers} 📈`;
        await bot.telegram.sendMessage(ADMIN_GROUP_ID, adminMsg, { parse_mode: 'Markdown' });
    } catch (error) {
        console.log("Admin notification group error", error.message);
    }

    // Rules මැසේජ් එක යවනවා (භාෂාව අනුව)
    const rulesMsg = lang === 'pt' ? 
        `📜 *Regras do CheckerX:*\n1. Captura obrigatória.\n2. Timeout de 30s = Perda.\n3. Taxa de rede: 20%.\n\n🎁 *Você ganhou 20 X Coins de bônus!*` : 
        `📜 *CheckerX Pro Rules:*\n1. Majority capture is mandatory.\n2. 30s Timeout = Loss.\n3. Network Fee: 20%.\n\n🎁 *You received a 20 X Coins Welcome Bonus!*`;
    
    await ctx.replyWithMarkdown(rulesMsg);
    sendMainMenu(ctx, user);
});

function sendMainMenu(ctx, user) {
    const msg = user.language === 'pt' ? 
        `🎮 **Menu Principal**\n💰 Saldo: ${user.balance} X Coins` : 
        `🎮 **Main Menu**\n💰 Balance: ${user.balance} X Coins`;
    
    const mainMenu = Markup.keyboard([
        ['🎮 Play CheckerX', '💰 Balance'],
        ['📥 Deposit', '📤 Withdrawal'],
        ['🔗 Referral', '💬 Support']
    ]).resize();
    ctx.reply(msg, mainMenu);
}

bot.hears('🎮 Play CheckerX', (ctx) => ctx.reply('👇 Click the **Play CheckerX** button at bottom left to play!'));

bot.hears('🔗 Referral', (ctx) => ctx.reply(`🔗 **Your Referral Link:**\nhttps://t.me/CheckerX_Bot?start=${ctx.from.id}`));

// 🟢 Cyberpunk Balance
bot.hears('💰 Balance', async (ctx) => {
    const user = await User.findOne({ id: String(ctx.from.id) });
    const balanceMsg = `
🏦 *CHECKERX WALLET* 🏦
━━━━━━━━━━━━━━━━━━
👤 *User:* ${user.name}
💰 *Balance:* \`${user.balance.toLocaleString()} X Coins\`
💵 *Value:* \`$${(user.balance/100).toFixed(2)} USD\`
━━━━━━━━━━━━━━━━━━
⚡️ Play matches to earn more!`;
    ctx.replyWithMarkdown(balanceMsg);
});

// 🟢 Deposit Menu (Crypto Options)
bot.hears('📥 Deposit', (ctx) => {
    ctx.reply("📥 *SELECT DEPOSIT METHOD*\n\n_Minimum Deposit: $2.00 (200 X Coins)_\nChoose your preferred crypto network:", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔶 Binance Pay', 'dep_binance'), Markup.button.callback('💵 USDT (TRC20)', 'dep_usdt')],
            [Markup.button.callback('🔴 TRX (TRC20)', 'dep_trx'), Markup.button.callback('🟣 Solana', 'dep_sol')],
            [Markup.button.callback('✖️ XRP', 'dep_xrp')]
        ])
    });
});

bot.action(/dep_(.+)/, (ctx) => {
    const method = ctx.match[1].toUpperCase();
    
    // 🔴 ඔයාගේ ඇඩ්‍රස් ටික මෙතන වෙනස් කරගන්න පුළුවන් පස්සේ
    let address = 'Your_Wallet_Address_Here';
    if(method === 'BINANCE') address = 'Pay ID: 123456789'; 

    ctx.replyWithMarkdown(`📥 *${method} DEPOSIT*\n\nSend to this address:\n\`${address}\`\n\n⚠️ *Action Required:*\nAfter sending the payment, please send a screenshot and your Transaction ID (TxID) to our Customer Support to get your coins credited.\n\n_Minimum: $2.00_`);
});

// 🟢 Withdrawal Menu
bot.hears('📤 Withdrawal', (ctx) => {
    ctx.replyWithMarkdown("📤 *WITHDRAWAL REQUEST*\n\n_Minimum Withdrawal: $3.00 (300 X Coins)_\n\nTo withdraw, please send a message to Customer Support in this format:\n\n`WITHDRAW [Amount] [Your Address] [Method]`\n\nExample:\n`WITHDRAW 300 Txxxxxxxx... USDT-TRC20`");
});

// 🟢 Support
bot.hears('💬 Support', (ctx) => ctx.reply("💬 **Customer Support**\nClick below to chat directly with an Admin for deposits, withdrawals, or issues.", Markup.inlineKeyboard([
    // 🔴 ඔයාගේ ටෙලිග්‍රෑම් යූසර්නෙම් එක (උදා: @LakshithaGK) මෙතන දාන්න
    [Markup.button.url('👨‍💻 Contact Admin', 'https://t.me/YourUsernameHere')] 
])));

// Admin Add Coins Command
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
            bot.telegram.sendMessage(targetId, `🎉 ${amount} X Coins added to your account!`);
            ctx.reply(`✅ Added!`);
        } else {
            ctx.reply(`❌ User not found in database!`);
        }
    } catch (e) {
        ctx.reply(`❌ Error adding coins.`);
    }
});

bot.launch().then(() => console.log("Bot launched!")).catch((err) => console.error("Bot Error:", err.message));


// ==========================================
// --- MULTIPLAYER ENGINE (නොවෙනස්ව තබා ඇත) ---
// ==========================================
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