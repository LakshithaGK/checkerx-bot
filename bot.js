const { Telegraf } = require('telegraf');
const http = require('http');

// Initialize Telegram Bot
const bot = new Telegraf(process.env.BOT_TOKEN || '8872491990:AAFHWz6LMI-UjhOVqGf1nPJZY-XtOrT52DE');

bot.start((ctx) => ctx.reply('Welcome to CheckerX Bot! 🎮'));

console.log('CheckerX Bot is running...');
bot.launch();

// Dummy HTTP Server to satisfy Render Web Service port checks
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('CheckerX Bot is Running Successfully!\n');
}).listen(port, () => {
    console.log(`Port binding server running on port ${port}`);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));