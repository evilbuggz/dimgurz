import 'dotenv/config';

const { DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN } = process.env;
if (!DISCORD_APPLICATION_ID || !DISCORD_BOT_TOKEN) {
  console.error('Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN in .env first.');
  process.exit(1);
}

let response;
try {
  response = await fetch(`https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands`, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{
      name: 'dimgur',
      description: 'Search Imgur GIFs and send one to this channel',
      type: 4,
      handler: 2,
    }]),
  });
} catch (error) {
  console.error('Could not reach Discord to register /dimgur. Check your internet connection/firewall and try again.');
  console.error(error.cause?.code || error.message);
  process.exit(1);
}

const body = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(`Discord rejected command registration (${response.status}):`, body);
  process.exit(1);
}
console.log('Registered the /dimgur Activity entry point:', body);
