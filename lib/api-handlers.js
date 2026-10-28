import { EmbedBuilder } from 'discord.js';

function requireEnv(...names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing configuration: ${missing.join(', ')}`);
}

export function config(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ discordClientId: process.env.DISCORD_CLIENT_ID || process.env.DISCORD_APPLICATION_ID || '' });
}

export async function token(req, res) {
  try {
    requireEnv('DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET');
    if (typeof req.body?.code !== 'string' || req.body.code.length > 2048) return res.status(400).json({ error: 'Invalid authorization code.' });
    const response = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: req.body.code,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.access_token) return res.status(401).json({ error: 'Discord authorization failed.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ access_token: data.access_token });
  } catch (error) {
    console.error('Token exchange failed:', error.message);
    return res.status(500).json({ error: error.message.startsWith('Missing configuration:') ? error.message : 'Could not authorize with Discord.' });
  }
}

export async function search(req, res) {
  try {
    requireEnv('IMGUR_CLIENT_ID');
    const query = String(req.query?.q || '').trim().slice(0, 100);
    const page = Number.parseInt(req.query?.page ?? '0', 10);
    if (query.length < 2) return res.status(400).json({ error: 'Enter at least two characters.' });
    if (!Number.isInteger(page) || page < 0 || page > 1000) return res.status(400).json({ error: 'Invalid search page.' });
    const url = new URL(`https://api.imgur.com/3/gallery/search/top/${page}/`);
    url.searchParams.set('q', query);
    const response = await fetch(url, {
      headers: { Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}` },
      signal: AbortSignal.timeout(12000),
    });
    const data = await response.json();
    if (!response.ok) return res.status(502).json({ error: 'Imgur search failed. Check IMGUR_CLIENT_ID in Vercel.' });
    const listings = data.data || [];
    const results = listings.map((item) => {
      const media = item.images?.find((image) => image.animated) || item.images?.find((image) => image.type?.startsWith('image/')) || item;
      const mediaId = media.id || item.id;
      const animated = Boolean(media.animated || item.is_animated);
      const mime = media.type || item.type || 'image/jpeg';
      const extension = mime.includes('gif') ? 'gif' : mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
      const directLink = media.link || item.link;
      const url = mediaId
        ? `https://i.imgur.com/${mediaId}.${animated ? 'gif' : extension}`
        : directLink;
      const previewId = item.cover || mediaId;
      const preview = previewId ? `https://i.imgur.com/${previewId}b.jpg` : directLink;
      return {
        id: item.id || mediaId,
        title: item.title || 'Untitled Imgur listing',
        url,
        preview,
        animated,
        videoPreview: animated && mediaId ? `https://i.imgur.com/${mediaId}.mp4` : null,
      };
    }).filter((item) => item.url && item.preview && /^https:\/\/(i\.)?imgur\.com\//i.test(item.url) && /^https:\/\/(i\.)?imgur\.com\//i.test(item.preview));
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ results, hasMore: listings.length >= 60 });
  } catch (error) {
    console.error('Imgur search failed:', error.message);
    return res.status(500).json({ error: error.message.startsWith('Missing configuration:') ? error.message : 'Could not search Imgur right now.' });
  }
}

export async function send(req, res) {
  try {
    requireEnv('DISCORD_BOT_TOKEN');
    const { accessToken, channelId, guildId, gifUrl } = req.body || {};
    if (![accessToken, channelId, guildId, gifUrl].every((value) => typeof value === 'string') ||
        !/^\d{17,20}$/.test(channelId) || !/^https:\/\/(i\.)?imgur\.com\//i.test(gifUrl)) {
      return res.status(400).json({ error: 'Invalid GIF or channel.' });
    }
    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    const user = await userResponse.json();
    if (!userResponse.ok || !user.id) return res.status(401).json({ error: 'Discord authorization expired. Reopen the Activity.' });

    const discordHeaders = { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` };
    const channelResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
      headers: discordHeaders,
      signal: AbortSignal.timeout(10000),
    });
    const channel = await channelResponse.json();
    if (!channelResponse.ok || ![0, 5].includes(channel.type)) {
      return res.status(403).json({ error: 'The bot cannot access this text channel. Add it to the server and grant Send Messages and Embed Links.' });
    }
    if (!guildId || channel.guild_id !== guildId) return res.status(403).json({ error: 'The selected channel does not match the Activity channel.' });

    const avatar = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
      : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.id) % 6n)}.png`;
    const embed = new EmbedBuilder()
      .setColor(0x6f42c1)
      .setAuthor({ name: `sent by ${user.global_name || user.username}`, iconURL: avatar })
      .setImage(gifUrl)
      .setFooter({ text: 'Imgur' });
    const sendResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { ...discordHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed.toJSON()] }),
      signal: AbortSignal.timeout(10000),
    });
    if (!sendResponse.ok) {
      const failure = await sendResponse.json().catch(() => ({}));
      console.error('Discord message failed:', sendResponse.status, failure);
      return res.status(502).json({ error: 'Discord could not post the GIF. Check the bot channel permissions.' });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Send failed:', error.message);
    return res.status(500).json({ error: error.message.startsWith('Missing configuration:') ? error.message : 'Could not send the GIF.' });
  }
}
