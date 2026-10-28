import { DiscordSDK } from '@discord/embedded-app-sdk';
import './style.css';

const root = document.querySelector('#app');
let sdk;
let auth;
let results = [];
let busy = false;

root.innerHTML = `
  <main class="shell">
    <header class="topbar"><div class="brand-mark">D</div><div><h1>Dimgur</h1><p>Find a GIF. Drop it in chat.</p></div><span class="status" id="status">Connecting to Discord…</span></header>
    <section class="search-panel">
      <label for="search">Search Imgur GIFs</label>
      <form id="search-form"><div class="search-box"><span aria-hidden="true">⌕</span><input id="search" type="search" placeholder="Try “happy dance” or “cat”" maxlength="100" autocomplete="off"/><button type="submit">Search</button></div></form>
      <p class="hint">Choose a result to send it to this channel.</p>
    </section>
    <section id="message" class="message" aria-live="polite">Opening your picker…</section>
    <section id="results" class="results" aria-label="GIF search results"></section>
    <footer>GIFs provided by Imgur</footer>
  </main>`;

const form = document.querySelector('#search-form');
const input = document.querySelector('#search');
const message = document.querySelector('#message');
const grid = document.querySelector('#results');
const status = document.querySelector('#status');

function setMessage(text, kind = '') {
  message.textContent = text;
  message.className = `message ${kind}`;
}

async function setup() {
  const config = await fetch('/api/config').then((response) => response.json());
  if (!config.discordClientId) throw new Error('Add DISCORD_CLIENT_ID to .env and restart the server.');
  sdk = new DiscordSDK(config.discordClientId);
  await sdk.ready();
  const { code } = await sdk.commands.authorize({
    client_id: config.discordClientId,
    response_type: 'code',
    state: crypto.randomUUID(),
    prompt: 'none',
    scope: ['identify'],
  });
  const tokenResponse = await fetch('/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok) throw new Error(token.error || 'Discord authorization failed.');
  auth = await sdk.commands.authenticate({ access_token: token.access_token });
  if (!auth?.user?.id) throw new Error('Discord did not provide your user profile.');
  if (!sdk.channelId) throw new Error('Launch Dimgur from the channel where you want to post the GIF.');
  status.textContent = 'Ready';
  status.classList.add('ready');
  setMessage('Search for a GIF to get started.');
  input.focus();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (query.length < 2 || busy) return;
  busy = true;
  grid.replaceChildren();
  setMessage('Searching Imgur…');
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Search failed.');
    results = data.results;
    if (!results.length) return setMessage('No animated GIFs found. Try a different search.');
    setMessage(`${results.length} GIF${results.length === 1 ? '' : 's'} found. Pick one to send.`);
    for (const [index, gif] of results.entries()) {
      const button = document.createElement('button');
      button.className = 'gif-card';
      button.type = 'button';
      button.title = gif.title;
      const image = document.createElement('img');
      image.src = gif.preview;
      image.alt = gif.title;
      image.loading = 'lazy';
      const title = document.createElement('span');
      title.textContent = gif.title;
      button.append(image, title);
      button.addEventListener('click', () => sendGif(gif, button));
      grid.append(button);
    }
  } catch (error) {
    setMessage(error.message, 'error');
  } finally {
    busy = false;
  }
});

async function sendGif(gif, button) {
  if (busy) return;
  busy = true;
  button.classList.add('sending');
  setMessage('Sending GIF to this channel…');
  try {
    const response = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: auth.access_token, channelId: sdk.channelId, guildId: sdk.guildId, gifUrl: gif.url }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not send this GIF.');
    setMessage('GIF sent! Search for another one or close the picker.', 'success');
    button.classList.add('sent');
  } catch (error) {
    setMessage(error.message, 'error');
    button.classList.remove('sending');
  } finally {
    busy = false;
  }
}

setup().catch((error) => {
  status.textContent = 'Setup needed';
  setMessage(error.message, 'error');
});
