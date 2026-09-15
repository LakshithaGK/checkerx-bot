const { Telegraf, Markup } = require('telegraf');
const http = require('http');

// Initialize Telegram Bot with Token
const bot = new Telegraf('8872491990:AAFHWz6LMI-UjhOVqGf1nPJZY-XtOrT52DE'); // ඔයාගේ Bot Token එක මෙතැනට දාන්න

// Mini App Render URL
const MINI_APP_URL = 'https://checkerx-bot.onrender.com';

bot.start((ctx) => {
    const welcomeMessage = `👋 **Welcome to CheckerX!** 🎮\n\n` +
        `Play real-time skill-based Checkers games, earn X Coins, and climb the leaderboard! 🏆\n\n` +
        `👇 Click the button below to start playing now!`;

    return ctx.replyWithMarkdown(welcomeMessage, 
        Markup.inlineKeyboard([
            [Markup.button.webApp('🎮 Play CheckerX Now', MINI_APP_URL)]
        ])
    );
});

console.log('CheckerX Bot is running...');
bot.launch();

// Dummy HTTP Server for Render Port Binding
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('CheckerX Bot is Running Successfully!\n');
}).listen(port, () => {
    console.log(`Port binding server running on port ${port}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));