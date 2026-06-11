import { artworkImage } from './components.js';
import { navigate } from '../router.js';

export function renderHome(app, container) {
  container.innerHTML = '<h2 class="screen-title">Home</h2>';

  const { recentlyPlayed } = app.historyStore;
  const addons = app.addonStore.installedAddons;

  // Recently Played
  const section = document.createElement('section');
  section.innerHTML = '<h3 class="section-title">Recently Played</h3>';

  if (recentlyPlayed.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'empty-hint';
    msg.textContent = 'Play a track to see your history here.';
    section.append(msg);
  } else {
    const scroll = document.createElement('div');
    scroll.className = 'h-scroll';
    for (const track of recentlyPlayed.slice(0, 20)) {
      const card = document.createElement('div');
      card.className = 'recent-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', track.title);
      const art = artworkImage(track.albumCover, 80);
      const name = document.createElement('span');
      name.className = 'recent-name';
      name.textContent = track.title;
      const artist = document.createElement('span');
      artist.className = 'recent-artist';
      artist.textContent = track.artist;
      card.append(art, name, artist);
      card.addEventListener('click', () => app.audioPlayer.setQueue([track], 0));
      scroll.append(card);
    }
    section.append(scroll);
  }

  // Onboarding banner — shown until first addon is installed (Bug 1 fix)
  if (addons.length === 0) {
    const banner = document.createElement('div');
    banner.className = 'onboarding-banner';
    banner.innerHTML = `
      <span class="onboarding-icon">🧩</span>
      <div class="onboarding-text">
        <strong>Install an addon to start listening</strong>
        <p>BeatBoss needs a music source addon. Tap the Addons tab to install one.</p>
      </div>
      <button class="btn-primary onboarding-btn">Go to Addons →</button>`;
    banner.querySelector('.onboarding-btn').addEventListener('click', () => navigate('addons'));
    container.append(banner);
  }

  // Installed Addons
  const addonSec = document.createElement('section');
  addonSec.innerHTML = '<h3 class="section-title">Active Addon</h3>';
  if (addons.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'empty-hint';
    msg.textContent = 'Tap the 🧩 Addons tab above to install a music source.';
    addonSec.append(msg);
  } else {
    const active = addons.find(a => a.id === app.addonStore.activeAddonId) ?? addons[0];
    const row = document.createElement('div');
    row.className = 'addon-row-active';
    row.innerHTML = `
      <span class="addon-dot"></span>
      <span class="addon-name">${active.name}</span>
      <span class="addon-ver">v${active.version}</span>`;
    addonSec.append(row);
  }

  container.append(section, addonSec);
}
