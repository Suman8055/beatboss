// Shared UI components — TrackListTile, ArtworkImage, ContextMenu.

export function artworkImage(url, size = 48) {
  const img = document.createElement('img');
  img.className = 'artwork';
  img.width  = size;
  img.height = size;
  img.style.cssText = `width:${size}px;height:${size}px;border-radius:6px;object-fit:cover;background:var(--card);flex-shrink:0;`;
  img.src = url || '';
  img.onerror = () => { img.src = ''; img.style.background = 'var(--card)'; };
  return img;
}

export function trackListTile({ track, isPlaying = false, onTap, onAddToQueue, onPlayNext, onFavourite, onDownload }) {
  const el = document.createElement('div');
  el.className = 'track-tile';
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', `${track.title} by ${track.artist}`);

  const art = artworkImage(track.albumCover, 48);

  const info = document.createElement('div');
  info.className = 'track-info';

  const titleRow = document.createElement('div');
  titleRow.className = 'track-title-row';

  const title = document.createElement('span');
  title.className = 'track-title' + (isPlaying ? ' playing' : '');
  title.textContent = track.title;

  if (track.isHiRes) {
    const badge = document.createElement('span');
    badge.className = 'hires-badge';
    badge.textContent = 'HI-RES';
    titleRow.append(title, badge);
  } else {
    titleRow.append(title);
  }

  const artist = document.createElement('span');
  artist.className = 'track-artist';
  artist.textContent = track.artist;

  info.append(titleRow, artist);

  const more = document.createElement('button');
  more.className = 'track-more-btn';
  more.innerHTML = '⋯';
  more.setAttribute('aria-label', 'More options');
  more.addEventListener('click', e => {
    e.stopPropagation();
    showContextMenu(e.currentTarget, track, { onAddToQueue, onPlayNext, onFavourite, onDownload });
  });

  el.append(art, info, more);

  el.addEventListener('click',   () => onTap?.(track));
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') onTap?.(track); });

  return el;
}

function showContextMenu(anchor, track, handlers) {
  document.querySelector('.context-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'context-menu';

  const items = [
    { label: 'Add to Queue',  fn: handlers.onAddToQueue },
    { label: 'Play Next',     fn: handlers.onPlayNext },
    { label: 'Favourite',     fn: handlers.onFavourite },
    { label: 'Download',      fn: handlers.onDownload },
  ].filter(i => i.fn);

  for (const { label, fn } of items) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', () => { fn(track); menu.remove(); });
    menu.append(btn);
  }

  const rect = anchor.getBoundingClientRect();
  menu.style.cssText = `position:fixed;right:${window.innerWidth - rect.right}px;top:${rect.bottom + 4}px;z-index:9999;`;
  document.body.append(menu);

  const dismiss = e => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', dismiss); } };
  setTimeout(() => document.addEventListener('click', dismiss), 0);
}

export function emptyState(icon, title, subtitle = '') {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.innerHTML = `<span class="empty-icon">${icon}</span><p class="empty-title">${title}</p>${subtitle ? `<p class="empty-sub">${subtitle}</p>` : ''}`;
  return el;
}

export function formatTime(s) {
  if (!s || !isFinite(s)) return '--:--';
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
