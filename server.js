import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const required = ['DISCORD_APPLICATION_ID', 'DISCORD_BOT_TOKEN'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing required .env value(s): ${missing.join(', ')}`);
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('ready', (bot) => console.log(`Dimgur bot is online as ${bot.user.tag}. Keep this window open.`));
client.on('error', (error) => console.error('Discord gateway error:', error.message));
client.login(process.env.DISCORD_BOT_TOKEN).catch((error) => {
  console.error('Discord bot login failed. Check that DISCORD_BOT_TOKEN is the Bot Token from this application.');
  console.error(error.message);
  process.exitCode = 1;
});
