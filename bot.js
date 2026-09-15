const { Telegraf } = require('telegraf');

const token = '8872491990:AAFHWz6LMI-UjhOVqGf1nPJZY-XtOrT52DE';
const bot = new Telegraf(token);
const gameUrl = 'https://lakshithagk.github.io/checkerx/';

bot.start((ctx) => {
    const firstName = ctx.from.first_name || 'Player';
    ctx.reply(
        `👋 Welcome ${firstName} to CheckerX!\n\nThe Ultimate Skill-Based Checkers Game. Click the button below to start playing:`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🎮 Play CheckerX Now', web_app: { url: gameUrl } }]
                ]
            }
        }
    );
});

console.log('CheckerX Bot is running...');
bot.launch();
const http = require('http');
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('CheckerX Bot is active!\n');
}).listen(port, () => {
    console.log(`Port binding server running on port ${port}`);
});