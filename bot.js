const { Telegraf, Markup } = require('telegraf');
const http = require('http');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = "YOUR_TELEGRAM_USER_ID"; // ඔයාගේ Telegram User ID එක මෙතැනට දාන්න
const DEPOSIT_CHANNEL_ID = "@your_deposit_channel"; // Deposit Request එන Channel ID එක
const WITHDRAW_CHANNEL_ID = "@your_withdraw_channel"; // Withdraw Request එන Channel ID එක
const MINI_APP_URL = 'https://checkerx-bot.onrender.com';

if (!BOT_TOKEN) {
    console.error("ERROR: BOT_TOKEN is missing!");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Simple In-Memory Database (Real DB එකක් නැති නිසා)
const users = {}; 

function getUser(ctx) {
    const id = ctx.from.id;
    if (!users[id]) {
        users[id] = {
            id: id,
            name: ctx.from.first_name,
            balance: 0,
            referredBy: null,
            hasDeposited: false
        };
    }
    return users[id];
}

// 1. /start Command & Main Keyboard
bot.start((ctx) => {
    const user = getUser(ctx);
    
    // Referral Track Logic
    const startPayload = ctx.startPayload;
    if (startPayload && !user.referredBy && startPayload != user.id) {
        user.referredBy = startPayload;
    }

    const welcomeMsg = `👋 **Welcome to CheckerX Ecosystem!** 🎮\n\n` +
        ` Play skill-based Checkers games, earn X Coins, and instantly withdraw!\n\n` +
        `👤 **Name:** ${user.name}\n` +
        `💰 **Balance:** ${user.balance} X Coins`;

    const mainMenu = Markup.keyboard([
        ['🎮 Play CheckerX', '💰 Balance'],
        ['📥 Deposit', '📤 Withdrawal'],
        ['🔗 Referral', '💬 Customer Support']
    ]).resize();

    return ctx.replyWithMarkdown(welcomeMsg, mainMenu);
});

// 2. Balance Button
bot.hears('💰 Balance', (ctx) => {
    const user = getUser(ctx);
    ctx.reply(`💳 **Your Wallet Balance:**\n\n💰 **${user.balance} X Coins**`);
});

// 3. Deposit Option
bot.hears('📥 Deposit', (ctx) => {
    ctx.reply('📥 **Select Your Preferred Deposit Method:**', Markup.inlineKeyboard([
        [Markup.button.callback('Binance Pay', 'dep_binance')],
        [Markup.button.callback('USDT (TRC20)', 'dep_usdt')],
        [Markup.button.callback('TRX (TRC20)', 'dep_trx')]
    ]));
});

bot.action(/dep_(.+)/, (ctx) => {
    const method = ctx.match[1].toUpperCase();
    const adminAddress = "YOUR_CRYPTO_WALLET_ADDRESS_HERE"; // ඔයාගේ Binance/TRC20 Address එක

    ctx.replyWithMarkdown(`📥 **Deposit via ${method}**\n\n` +
        ` Please send your payment to the following address:\n\n` +
        `\`${adminAddress}\`\n\n` +
        `⚠️ **Instructions:**\n` +
        `1. Send payment.\n` +
        `2. Send screenshot & TxID here.\n\n` +
        `Format: \`/submit_deposit <TxID>\``);
});

// 4. Submit Deposit Request to Admin Channel
bot.command('submit_deposit', (ctx) => {
    const user = getUser(ctx);
    const txId = ctx.message.text.split(' ')[1];

    if (!txId) return ctx.reply("❌ Please provide TxID! Example: `/submit_deposit 1234567`");

    const msg = `📥 **NEW DEPOSIT REQUEST**\n\n` +
        `👤 **User:** ${user.name} (\`${user.id}\`)\n` +
        `🧾 **TxID:** \`${txId}\`\n\n` +
        `Approve Coins using: \`/addcoins ${user.id} <amount>\``;

    bot.telegram.sendMessage(DEPOSIT_CHANNEL_ID, msg);
    ctx.reply("✅ Your deposit request has been submitted to Admin!");
});

// 5. Withdrawal Logic
bot.hears('📤 Withdrawal', (ctx) => {
    ctx.reply("📤 To withdraw, please use the following command:\n\nFormat: `/withdraw <Address> <Amount>`");
});

bot.command('withdraw', (ctx) => {
    const user = getUser(ctx);
    const args = ctx.message.text.split(' ');
    const address = args[1];
    const amount = parseFloat(args[2]);

    if (!address || !amount || amount > user.balance) {
        return ctx.reply("❌ Invalid address or insufficient balance!");
    }

    user.balance -= amount;

    const msg = `📤 **NEW WITHDRAWAL REQUEST**\n\n` +
        `👤 **User:** ${user.name} (\`${user.id}\`)\n` +
        `📍 **Address:** \`${address}\`\n` +
        `💰 **Amount:** ${amount} X Coins`;

    bot.telegram.sendMessage(WITHDRAW_CHANNEL_ID, msg);
    ctx.reply("✅ Withdrawal request submitted successfully!");
});

// 6. Referral Link & Commission
bot.hears('🔗 Referral', (ctx) => {
    const user = getUser(ctx);
    const refLink = `https://t.me/CheckerX_Bot?start=${user.id}`;
    ctx.reply(`🔗 **Your Referral Link:**\n${refLink}\n\n🎁 Share with friends! Get **10 X Coins ($0.1)** for every referral's first deposit.`);
});

// 7. Customer Support
bot.hears('💬 Customer Support', (ctx) => {
    ctx.reply('💬 **Customer Support:**\n\n👤 Direct Admin: @YourPersonalTelegramUsername\n🤖 Support Bot: @YourSupportBotUsername');
});

// 8. Admin Add Coins Command
bot.command('addcoins', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const args = ctx.message.text.split(' ');
    const targetId = args[1];
    const amount = parseFloat(args[2]);

    if (users[targetId]) {
        users[targetId].balance += amount;

        // Referral bonus allocation
        if (!users[targetId].hasDeposited && users[targetId].referredBy) {
            const referrer = users[users[targetId].referredBy];
            if (referrer) {
                referrer.balance += 10; // 10 Coins commission
                bot.telegram.sendMessage(referrer.id, "🎉 You earned 10 X Coins referral bonus!");
            }
            users[targetId].hasDeposited = true;
        }

        bot.telegram.sendMessage(targetId, `🎉 ${amount} X Coins added to your wallet!`);
        ctx.reply(`✅ Added ${amount} coins to ${targetId}`);
    }
});

// Open Web App Button Logic
bot.hears('🎮 Play CheckerX', (ctx) => {
    ctx.reply('👇 Click below to enter the CheckerX Arena!', Markup.inlineKeyboard([
        [Markup.button.webApp('🚀 Launch Game', MINI_APP_URL)]
    ]));
});

bot.launch();

// Dummy Server for Render
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('CheckerX Backend Running!');
}).listen(port);