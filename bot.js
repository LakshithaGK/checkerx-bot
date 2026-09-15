const { Telegraf } = require('telegraf');
const http = require('http');

// Initialize Telegram Bot with Token
const bot = new Telegraf('8872491990:AAFHWz6LMI-UjhOVqGf1nPJZY-XtOrT52DE'); // <-- මෙතැනට ඔයාගේ Bot Token එක direct දාන්න

bot.start((ctx) => {
    const welcomeMessage = `👋 **Welcome to CheckerX!** 🎮\n\n` +
        `Play real-time skill-based Checkers games, earn X Coins, and climb the leaderboard! 🏆\n\n` +
        `👇 Click the **Play CheckerX** button below to start playing!`;

    return ctx.replyWithMarkdown(welcomeMessage);
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