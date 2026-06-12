import { trackListTile, artworkImage, emptyState } from './components.js';

const GENRES = [
  { label: 'Hip-Hop',    query: 'hip hop hits',       icon: '🎤' },
  { label: 'Pop',        query: 'pop hits 2024',       icon: '🎵' },
  { label: 'Rock',       query: 'rock classics',       icon: '🎸' },
  { label: 'Electronic', query: 'electronic dance',    icon: '🎛️' },
  { label: 'R&B',        query: 'rnb soul hits',       icon: '🎷' },
  { label: 'Jazz',       query: 'jazz classics',       icon: '🎺' },
  { label: 'Classical',  query: 'classical orchestra', icon: '🎻' },
  { label: 'Indie',      query: 'indie alternative',   icon: '🌿' },
];

const MOODS = [
  { label: 'Chill',     query: 'chill lofi relaxing', icon: '😌' },
  { label: 'Workout',   query: 'workout motivation',  icon: '💪' },
  { label: 'Party',     query: 'party dance hits',    icon: '🎉' },
  { label: 'Focus',     query: 'focus study music',   icon: '🧠' },
  { label: 'Sleep',     query: 'sleep ambient calm',  icon: '🌙' },
  { label: 'Happy',     query: 'happy upbeat songs',  icon: '😊' },
];

export function renderDiscover(app, container) {
  container.innerHTML = '<h2 class="screen-title">Discover</h2>';

  const hasAddon = app.addonStore.installedAddons.length > 0;

  if (!hasAddon) {
    container.append(emptyState('🧩', 'No addon installed', 'Install a music addon from the Addons tab to explore music.'));
    return;
  }

  // Genre chips
  const genreSection = document.createElement('section');
  genreSection.innerHTML = '<h3 class="section-title">Genres</h3>';
  const genreGrid = document.createElement('div');
  genreGrid.className = 'discover-chips';
  for (const g of GENRES) {
    genreGrid.append(_chip(g, app, container));
  }
  genreSection.append(genreGrid);

  // Mood chips
  const moodSection = document.createElement('section');
  moodSection.innerHTML = '<h3 class="section-title">Moods</h3>';
  const moodGrid = document.createElement('div');
  moodGrid.className = 'discover-chips';
  for (const m of MOODS) {
    moodGrid.append(_chip(m, app, container));
  }
  moodSection.append(moodGrid);

  // Results area
  const resultsSection = document.createElement('section');
  resultsSection.id = 'discover-results';
  resultsSection.style.marginTop = '8px';

  container.append(genreSection, moodSection, resultsSection);
}

function _chip({ label, query, icon }, app, container) {
  const btn = document.createElement('button');
  btn.className = 'discover-chip';
  btn.setAttribute('data-query', query);
  btn.innerHTML = `<span class="chip-icon">${icon}</span><span class="chip-label">${label}</span>`;
  btn.addEventListener('click', () => _runDiscover(app, container, query, label, btn));
  return btn;
}

let _activeCtrl = null;

async function _runDiscover(app, container, query, label, activeBtn) {
  // Mark active chip
  container.querySelectorAll('.discover-chip').forEach(b => b.classList.remove('active'));
  activeBtn.classList.add('active');

  _activeCtrl?.abort();
  _activeCtrl = new AbortController();

  const results = document.getElementById('discover-results');
  results.innerHTML = '';

  const hdr = document.createElement('h3');
  hdr.className = 'section-title';
  hdr.textContent = label;
  results.append(hdr);

  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  spinner.textContent = '⌛';
  results.append(spinner);

  try {
    const res = await app.addonService.search(query, _activeCtrl.signal);
    results.innerHTML = '';
    results.append(hdr);

    if (!res.tracks.length) {
      results.append(emptyState('🎵', 'No tracks found', `Try a different genre or mood`));
      return;
    }

    for (const track of res.tracks.slice(0, 20)) {
      results.append(trackListTile({
        track,
        isPlaying: app.playerStore.currentTrack?.id === track.id,
        onTap:        tr => app.audioPlayer.setQueue(res.tracks.slice(0, 20), res.tracks.indexOf(tr)),
        onAddToQueue: tr => app.audioPlayer.addToQueue(tr),
        onPlayNext:   tr => app.audioPlayer.insertNext(tr),
        onFavourite:  tr => app.libraryStore.toggleFavourite(tr),
        onDownload:   tr => app.downloadManager.download(tr).catch(e => alert(e.message)),
      }));
    }

    // Scroll results into view
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    if (e?.name === 'AbortError') return;
    results.innerHTML = '';
    results.append(hdr);
    results.append(emptyState('⚠️', 'Failed to load', e.message));
  }
}
