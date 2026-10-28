import { DiscordSDK } from '@discord/embedded-app-sdk';
import titleImage from '../img/title.png';
import starImage from '../img/star.png';
import './style.css';

const root = document.querySelector('#app');
let sdk;
let auth;
let isSending = false;
let searchTerm = '';
let searchPage = 0;
let bufferedListings = [];
let bufferOffset = 0;
let hasMorePages = false;
let loadedListingCount = 0;
let searchVersion = 0;
let searchController;
let loadingBatchVersion = null;

root.innerHTML = `
  <div class="floaties" id="floaties" aria-hidden="true"></div>
  <main class="shell">
    <section class="picker" aria-label="Dimgur GIF picker">
      <img class="title-image" src="${titleImage}" alt="Dimgur" />
      <form id="search-form" class="search-form"><label class="visually-hidden" for="search">Search Imgur GIFs</label><div class="search-box"><input id="search" type="search" placeholder="Search for a GIF..." maxlength="100" autocomplete="off"/><button type="submit" aria-label="Search" title="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6"></circle><path d="m16 16 5 5"></path></svg></button></div></form>
    </section>
    <section id="message" class="message" aria-live="polite">Opening your picker…</section>
    <section id="results" class="results" aria-label="GIF search results"></section>
  </main>`;

const form = document.querySelector('#search-form');
const input = document.querySelector('#search');
const message = document.querySelector('#message');
const grid = document.querySelector('#results');
const shell = document.querySelector('.shell');
const floaties = document.querySelector('#floaties');
const rowObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadNextBatch(searchVersion);
    }, { rootMargin: '350px 0px' })
  : null;
const videoObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const video = entry.target;
        if (entry.isIntersecting) {
          if (!video.src && video.dataset.src) video.src = video.dataset.src;
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    }, { rootMargin: '450px 0px' })
  : null;

const dotColors = ['#36e9b0', '#25b47c', '#1bb76e', '#5865f2', '#ffffff', '#7d7fa4'];
for (let i = 0; i < 29; i += 1) {
  const dot = document.createElement('i');
  const size = 5 + Math.random() * 11;
  dot.className = 'floaty-dot';
  dot.style.left = `${Math.random() * 100}%`;
  dot.style.top = `${Math.random() * 100}%`;
  dot.style.width = `${size}px`;
  dot.style.height = `${size}px`;
  dot.style.backgroundColor = dotColors[i % dotColors.length];
  dot.style.setProperty('--float-time', `${5 + Math.random() * 8}s`);
  dot.style.setProperty('--float-delay', `${-Math.random() * 9}s`);
  floaties.append(dot);
}
for (let i = 0; i < 8; i += 1) {
  const star = document.createElement('img');
  star.className = 'floaty-star';
  star.src = starImage;
  star.alt = '';
  star.style.left = `${5 + Math.random() * 90}%`;
  star.style.top = `${5 + Math.random() * 90}%`;
  star.style.width = `${13 + Math.random() * 18}px`;
  star.style.setProperty('--float-time', `${4 + Math.random() * 7}s`);
  star.style.setProperty('--float-delay', `${-Math.random() * 8}s`);
  floaties.append(star);
}

function setMessage(text, kind = '') {
  message.textContent = text;
  message.className = `message visible ${kind}`;
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
  input.focus();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (query.length < 2) return;
  searchController?.abort();
  searchController = new AbortController();
  searchVersion += 1;
  const version = searchVersion;
  searchTerm = query;
  searchPage = 0;
  bufferedListings = [];
  bufferOffset = 0;
  hasMorePages = true;
  loadedListingCount = 0;
  loadingBatchVersion = null;
  rowObserver?.disconnect();
  videoObserver?.disconnect();
  shell.classList.add('has-searched');
  grid.replaceChildren();
  setMessage('Searching Imgur...');
  await loadNextBatch(version);
});

function rowsPerBatch() {
  const columns = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length || 1;
  return columns * 5;
}

function appendListing(listing) {
  const button = document.createElement('button');
  button.className = 'gif-card';
  button.type = 'button';
  button.title = listing.title;

  if (listing.animated && listing.videoPreview) {
    const video = document.createElement('video');
    video.className = 'gif-preview';
    video.poster = listing.preview;
    video.dataset.src = listing.videoPreview;
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'none';
    video.setAttribute('aria-label', listing.title);
    video.addEventListener('error', () => {
      const poster = document.createElement('img');
      poster.src = listing.preview;
      poster.alt = listing.title;
      poster.loading = 'lazy';
      video.replaceWith(poster);
    }, { once: true });
    button.append(video);
    if (videoObserver) videoObserver.observe(video);
    else {
      video.src = listing.videoPreview;
      video.load();
    }
  } else {
    const image = document.createElement('img');
    image.src = listing.preview;
    image.alt = listing.title;
    image.loading = 'lazy';
    button.append(image);
  }

  const title = document.createElement('span');
  title.textContent = listing.title;
  button.append(title);
  button.addEventListener('click', () => sendGif(listing, button));
  grid.append(button);
}

async function loadNextBatch(version) {
  if (version !== searchVersion || loadingBatchVersion === version) return;
  const oldSentinel = document.querySelector('.load-sentinel');
  if (oldSentinel) {
    rowObserver?.unobserve(oldSentinel);
    oldSentinel.remove();
  }
  loadingBatchVersion = version;
  try {
    while (version === searchVersion && bufferOffset >= bufferedListings.length && hasMorePages) {
      const params = new URLSearchParams({ q: searchTerm, page: String(searchPage) });
      const response = await fetch(`/api/search?${params}`, { signal: searchController.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Search failed.');
      if (version !== searchVersion) return;
      bufferedListings = data.results || [];
      bufferOffset = 0;
      hasMorePages = Boolean(data.hasMore);
      searchPage += 1;
      if (!bufferedListings.length && !hasMorePages) break;
    }

    if (version !== searchVersion) return;
    const batch = bufferedListings.slice(bufferOffset, bufferOffset + rowsPerBatch());
    bufferOffset += batch.length;
    batch.forEach(appendListing);
    loadedListingCount += batch.length;

    if (!loadedListingCount && !hasMorePages && bufferOffset >= bufferedListings.length) {
      setMessage('No Imgur listings found. Try another search.');
      return;
    }
    if (loadedListingCount) setMessage(`Loaded ${loadedListingCount} listings. Scroll for more.`);

    if (bufferOffset < bufferedListings.length || hasMorePages) {
      let sentinel = document.querySelector('.load-sentinel');
      if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.className = 'load-sentinel';
        sentinel.setAttribute('aria-hidden', 'true');
        grid.append(sentinel);
      }
      rowObserver?.observe(sentinel);
    } else {
      document.querySelector('.load-sentinel')?.remove();
      setMessage(`All ${loadedListingCount} listings loaded.`);
    }
  } catch (error) {
    if (error.name !== 'AbortError' && version === searchVersion) setMessage(error.message, 'error');
  } finally {
    if (loadingBatchVersion === version) loadingBatchVersion = null;
  }
}

async function sendGif(gif, button) {
  if (isSending) return;
  isSending = true;
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
    isSending = false;
  }
}

setup().catch((error) => {
  setMessage(error.message, 'error');
});
