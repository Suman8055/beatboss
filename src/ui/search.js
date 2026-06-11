import { trackListTile, emptyState } from './components.js';

export function renderSearch(app, container) {
  container.innerHTML = '<h2 class="screen-title">Search</h2>';

  const inputWrap = document.createElement('div');
  inputWrap.className = 'search-wrap';
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Songs, artists, albums…';
  input.className = 'search-input';
  input.setAttribute('aria-label', 'Search music');
  inputWrap.append(input);

  const results = document.createElement('div');
  results.className = 'search-results';

  container.append(inputWrap, results);

  let debounce  = null;
  let searchCtrl = null;

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => runSearch(input.value.trim()), 300);
  });

  async function runSearch(q) {
    searchCtrl?.abort();
    results.innerHTML = '';

    if (!q) {
      // Show recent searches hint
      const history = app.historyStore.recentlyPlayed.slice(0, 5);
      if (history.length > 0) {
        const hint = document.createElement('p');
        hint.className = 'section-title';
        hint.textContent = 'Recently Played';
        results.append(hint);
        for (const t of history) {
          results.append(trackListTile({
            track: t,
            isPlaying: app.playerStore.currentTrack?.id === t.id,
            onTap:        tr => app.audioPlayer.setQueue([tr], 0),
            onAddToQueue: tr => app.audioPlayer.addToQueue(tr),
            onPlayNext:   tr => app.audioPlayer.insertNext(tr),
            onFavourite:  tr => app.libraryStore.toggleFavourite(tr),
            onDownload:   tr => app.downloadManager.download(tr).catch(e => alert(e.message)),
          }));
        }
      }
      return;
    }

    searchCtrl = new AbortController();

    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.textContent = '⌛';
    results.append(spinner);

    try {
      const res = await app.addonService.search(q, searchCtrl.signal);
      results.innerHTML = '';

      if (res.tracks.length === 0 && res.albums.length === 0) {
        results.append(emptyState('🔍', 'No results', `Nothing found for "${q}"`));
        return;
      }

      if (res.tracks.length > 0) {
        const hdr = document.createElement('p');
        hdr.className = 'section-title';
        hdr.textContent = 'Tracks';
        results.append(hdr);
        for (const t of res.tracks) {
          results.append(trackListTile({
            track: t,
            isPlaying: app.playerStore.currentTrack?.id === t.id,
            onTap:        tr => app.audioPlayer.setQueue(res.tracks, res.tracks.indexOf(tr)),
            onAddToQueue: tr => app.audioPlayer.addToQueue(tr),
            onPlayNext:   tr => app.audioPlayer.insertNext(tr),
            onFavourite:  tr => app.libraryStore.toggleFavourite(tr),
            onDownload:   tr => app.downloadManager.download(tr).catch(e => alert(e.message)),
          }));
        }
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
      results.innerHTML = '';
      results.append(emptyState('⚠️', 'Search failed', e.message));
    }
  }
}
