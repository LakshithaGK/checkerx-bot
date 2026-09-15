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