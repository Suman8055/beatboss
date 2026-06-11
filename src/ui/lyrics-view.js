import { emptyState } from './components.js';

export function renderLyricsView(app, container) {
  container.innerHTML = `
    <div class="sheet-header">
      <button class="sheet-close" id="lyrics-close">✕</button>
      <h3>Lyrics</h3>
    </div>`;

  const scroll = document.createElement('div');
  scroll.className = 'lyrics-scroll';
  container.append(scroll);

  const { lyrics, currentLyricIndex } = app.playerStore;

  if (lyrics.length === 0) {
    scroll.append(emptyState('🎵', 'No Lyrics', 'Lyrics not available for this track.'));
    return;
  }

  let isDragging = false;
  scroll.addEventListener('touchstart', () => { isDragging = true; },  { passive: true });
  scroll.addEventListener('touchend',   () => { setTimeout(() => { isDragging = false; }, 300); });

  function renderLines() {
    scroll.innerHTML = '';
    for (let i = 0; i < lyrics.length; i++) {
      const line = document.createElement('p');
      line.className = 'lyric-line' + (i === app.playerStore.currentLyricIndex ? ' active' : '');
      line.textContent = lyrics[i].text;
      line.dataset.idx = i;
      line.addEventListener('click', () => {
        app.audioPlayer.seek(lyrics[i].timestamp);
      });
      scroll.append(line);
    }
  }

  renderLines();

  // Auto-scroll when lyric index changes
  const onchange = () => {
    if (isDragging) return;
    const idx = app.playerStore.currentLyricIndex;
    scroll.querySelectorAll('.lyric-line').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
    });
    const active = scroll.querySelector('.lyric-line.active');
    active?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  app.playerStore.on(onchange);
  container._cleanup = () => app.playerStore.off(onchange);
}

export function renderQueueView(app, container) {
  container.innerHTML = `
    <div class="sheet-header">
      <button class="sheet-close" id="queue-close">✕</button>
      <h3>Queue</h3>
      <button class="btn-ghost" id="queue-clear">Clear</button>
    </div>`;

  const list = document.createElement('div');
  list.className = 'queue-list';
  container.append(list);

  function renderQ() {
    list.innerHTML = '';
    const { queue, currentIndex } = app.playerStore;
    if (queue.length === 0) {
      list.append(emptyState('🎵', 'Queue is Empty', 'Add tracks to start a queue.'));
      return;
    }
    queue.forEach((track, i) => {
      const row = document.createElement('div');
      row.className = 'queue-row' + (i === currentIndex ? ' current' : '');
      row.innerHTML = `
        <span class="q-idx">${i + 1}</span>
        <div class="q-info">
          <span class="q-title">${track.title}</span>
          <span class="q-artist">${track.artist}</span>
        </div>
        <button class="q-remove" aria-label="Remove">✕</button>`;
      row.addEventListener('click', e => {
        if (!e.target.classList.contains('q-remove'))
          app.audioPlayer.playFromQueue(i);
      });
      row.querySelector('.q-remove').addEventListener('click', () => {
        app.audioPlayer.removeFromQueue(i);
        renderQ();
      });
      list.append(row);
    });
  }

  container.querySelector('#queue-clear').addEventListener('click', () => {
    app.audioPlayer.clearQueue();
    renderQ();
  });

  renderQ();
  app.playerStore.on(renderQ);
  container._cleanup = () => app.playerStore.off(renderQ);
}
