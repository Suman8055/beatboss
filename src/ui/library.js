import { trackListTile, emptyState } from './components.js';

export function renderLibrary(app, container) {
  container.innerHTML = '<h2 class="screen-title">Library</h2>';

  // Segment control
  const seg = document.createElement('div');
  seg.className = 'seg-control';
  seg.innerHTML = `
    <button class="seg-btn active" data-tab="libraries">Libraries</button>
    <button class="seg-btn"        data-tab="favourites">Favourites</button>`;

  const body = document.createElement('div');
  body.className = 'library-body';

  container.append(seg, body);

  let activeTab = 'libraries';
  seg.addEventListener('click', e => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    seg.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    renderTab();
  });

  function renderTab() {
    body.innerHTML = '';
    if (activeTab === 'libraries') renderLibraries();
    else renderFavourites();
  }

  function renderLibraries() {
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-primary';
    addBtn.textContent = '+ New Library';
    addBtn.addEventListener('click', async () => {
      const name = prompt('Library name:');
      if (name?.trim()) {
        await app.libraryStore.createLibrary(name.trim());
        renderTab();
      }
    });
    body.append(addBtn);

    if (app.libraryStore.libraries.length === 0) {
      body.append(emptyState('🎵', 'No libraries', 'Create one to organise your music.'));
      return;
    }

    for (const lib of app.libraryStore.libraries) {
      const row = document.createElement('div');
      row.className = 'lib-row';
      row.innerHTML = `
        <span class="lib-name">${lib.name}</span>
        <span class="lib-count">${lib.trackIds.length} tracks</span>
        <button class="lib-delete" aria-label="Delete library">🗑</button>`;
      row.querySelector('.lib-delete').addEventListener('click', async e => {
        e.stopPropagation();
        if (confirm(`Delete "${lib.name}"?`)) {
          await app.libraryStore.deleteLibrary(lib.id);
          renderTab();
        }
      });
      row.addEventListener('click', e => {
        if (!e.target.classList.contains('lib-delete'))
          renderLibraryDetail(lib);
      });
      body.append(row);
    }
  }

  function renderLibraryDetail(lib) {
    body.innerHTML = `<button class="back-btn">← Back</button><h3 class="section-title">${lib.name}</h3>`;
    body.querySelector('.back-btn').addEventListener('click', renderTab);

    const tracks = lib.trackIds.map(id => {
      // Look up from IDB asynchronously; for now render what we have
      return { id, title: id, artist: '' };
    });

    if (lib.trackIds.length === 0) {
      body.append(emptyState('🎵', 'Empty library', 'Add tracks from Search.'));
      return;
    }

    // Async load tracks from IDB
    (async () => {
      const { getAllTracks } = await import('../db.js');
      const allTracks = await getAllTracks();
      const libTracks = lib.trackIds
        .map(id => allTracks.find(t => t.id === id))
        .filter(Boolean);
      body.querySelectorAll('.track-tile').forEach(el => el.remove());
      for (const t of libTracks) {
        body.append(trackListTile({
          track: t,
          isPlaying: app.playerStore.currentTrack?.id === t.id,
          onTap: tr => app.audioPlayer.setQueue(libTracks, libTracks.indexOf(tr)),
          onAddToQueue: tr => app.audioPlayer.addToQueue(tr),
          onFavourite:  tr => app.libraryStore.toggleFavourite(tr),
        }));
      }
    })();
  }

  function renderFavourites() {
    const favs = app.libraryStore.favourites.map(f => f.track);
    if (favs.length === 0) {
      body.append(emptyState('♥', 'No favourites', 'Tap ♡ on any track to add it here.'));
      return;
    }
    for (const t of favs) {
      body.append(trackListTile({
        track: t,
        isPlaying: app.playerStore.currentTrack?.id === t.id,
        onTap:        tr => app.audioPlayer.setQueue(favs, favs.indexOf(tr)),
        onAddToQueue: tr => app.audioPlayer.addToQueue(tr),
        onFavourite:  tr => app.libraryStore.toggleFavourite(tr),
        onDownload:   tr => app.downloadManager.download(tr).catch(e => alert(e.message)),
      }));
    }
  }

  renderTab();
}
