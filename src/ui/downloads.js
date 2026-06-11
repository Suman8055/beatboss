import { artworkImage, emptyState, formatTime } from './components.js';

export function renderDownloads(app, container) {
  container.innerHTML = '<h2 class="screen-title">Downloads</h2>';

  const list = document.createElement('div');
  list.className = 'download-list';
  container.append(list);

  function renderList() {
    list.innerHTML = '';
    const { downloads, inProgress } = app.downloadStore;

    // Active downloads first
    for (const [trackId, state] of inProgress) {
      const row = document.createElement('div');
      row.className = 'dl-row dl-active';
      row.innerHTML = `
        <div class="dl-info">
          <span class="dl-title">${trackId}</span>
          <progress class="dl-progress" max="1" value="${state.progress}"></progress>
          <span class="dl-status">${Math.round(state.progress * 100)}%</span>
        </div>`;
      list.append(row);
    }

    if (downloads.length === 0 && inProgress.size === 0) {
      list.append(emptyState('⬇', 'No Downloads', 'Download tracks from Search or Library.'));
      return;
    }

    for (const rec of [...downloads].sort((a, b) => b.downloadedAt - a.downloadedAt)) {
      const row = document.createElement('div');
      row.className = 'dl-row';
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', rec.title);

      const art = artworkImage(rec.albumCover, 44);

      const info = document.createElement('div');
      info.className = 'dl-info';
      info.innerHTML = `
        <span class="dl-title">${rec.title}</span>
        <span class="dl-artist">${rec.artist}</span>
        <span class="dl-size">${formatBytes(rec.sizeBytes)}</span>`;

      const del = document.createElement('button');
      del.className = 'dl-delete';
      del.textContent = '🗑';
      del.setAttribute('aria-label', 'Delete download');
      del.addEventListener('click', async e => {
        e.stopPropagation();
        await app.downloadManager.remove(rec.trackId);
        renderList();
      });

      row.append(art, info, del);
      row.addEventListener('click', async e => {
        if (e.target === del) return;
        const blobURL = await app.downloadManager.getBlobURL(rec.trackId);
        if (blobURL) {
          const track = { id: rec.trackId, title: rec.title, artist: rec.artist, albumCover: rec.albumCover };
          app.audioPlayer.setQueue([track], 0);
        }
      });
      list.append(row);
    }
  }

  renderList();
  app.downloadStore.on(renderList);
  // Clean up listener when navigating away
  container._cleanup = () => app.downloadStore.off(renderList);
}

function formatBytes(b) {
  if (!b) return '';
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
