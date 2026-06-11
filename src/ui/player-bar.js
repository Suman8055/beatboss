// Persistent bottom player bar + full-screen Now Playing sheet.

import { artworkImage, formatTime } from './components.js';

export class PlayerBar {
  constructor(app) {
    this._app    = app;
    this._bar    = document.getElementById('player-bar');
    this._sheet  = document.getElementById('nowplaying-sheet');
    this._open   = false;

    this._buildBar();
    this._buildSheet();

    app.playerStore.on(() => this._update());
  }

  _buildBar() {
    const b = this._bar;
    b.innerHTML = `
      <div class="pb-progress"><div class="pb-progress-fill"></div></div>
      <div class="pb-inner">
        <div class="pb-art-wrap"></div>
        <div class="pb-info">
          <span class="pb-title"></span>
          <span class="pb-artist"></span>
        </div>
        <button class="pb-btn pb-play" aria-label="Play/Pause"></button>
        <button class="pb-btn pb-next" aria-label="Next">⏭</button>
      </div>`;

    b.querySelector('.pb-inner').addEventListener('click', e => {
      if (!e.target.classList.contains('pb-btn')) this._openSheet();
    });
    b.querySelector('.pb-play').addEventListener('click', e => {
      e.stopPropagation();
      this._app.audioPlayer.togglePlayPause();
    });
    b.querySelector('.pb-next').addEventListener('click', e => {
      e.stopPropagation();
      this._app.audioPlayer.skipToNext();
    });
  }

  _buildSheet() {
    const s = this._sheet;
    s.innerHTML = `
      <div class="np-header">
        <button class="np-close" aria-label="Close">⌄</button>
      </div>
      <div class="np-art-wrap"></div>
      <div class="np-title-row">
        <div class="np-meta">
          <span class="np-title"></span>
          <span class="np-artist"></span>
        </div>
        <button class="np-fav" aria-label="Favourite">♡</button>
      </div>
      <div class="np-seek">
        <input class="np-slider" type="range" min="0" max="1" step="0.001" value="0" aria-label="Seek">
        <div class="np-times"><span class="np-pos">0:00</span><span class="np-dur">0:00</span></div>
      </div>
      <div class="np-transport">
        <button class="np-btn np-shuffle" aria-label="Shuffle">⇄</button>
        <button class="np-btn np-prev"    aria-label="Previous">⏮</button>
        <button class="np-btn np-playpause np-big" aria-label="Play/Pause"></button>
        <button class="np-btn np-next-t"  aria-label="Next">⏭</button>
        <button class="np-btn np-loop"    aria-label="Loop">↻</button>
      </div>
      <div class="np-volume">
        <span>🔈</span>
        <input class="np-vol-slider" type="range" min="0" max="1" step="0.01" value="1" aria-label="Volume">
        <span>🔊</span>
      </div>
      <div class="np-actions">
        <button class="np-lyrics-btn">Lyrics</button>
        <button class="np-queue-btn">Queue</button>
      </div>`;

    s.querySelector('.np-close').addEventListener('click', () => this._closeSheet());
    s.querySelector('.np-playpause').addEventListener('click', () => this._app.audioPlayer.togglePlayPause());
    s.querySelector('.np-prev').addEventListener('click',    () => this._app.audioPlayer.skipToPrevious());
    s.querySelector('.np-next-t').addEventListener('click',  () => this._app.audioPlayer.skipToNext());
    s.querySelector('.np-shuffle').addEventListener('click', () => this._app.audioPlayer.toggleShuffle());
    s.querySelector('.np-loop').addEventListener('click',    () => this._app.audioPlayer.cycleLoopMode());
    s.querySelector('.np-fav').addEventListener('click',     () => {
      const t = this._app.playerStore.currentTrack;
      if (t) this._app.libraryStore.toggleFavourite(t);
    });
    s.querySelector('.np-lyrics-btn').addEventListener('click', () => this._app.showLyrics());
    s.querySelector('.np-queue-btn').addEventListener('click',  () => this._app.showQueue());

    // Seek
    const slider = s.querySelector('.np-slider');
    let seeking = false;
    slider.addEventListener('pointerdown', () => { seeking = true; });
    slider.addEventListener('pointerup',   () => {
      seeking = false;
      const dur = this._app.playerStore.duration;
      this._app.audioPlayer.seek(parseFloat(slider.value) * dur);
    });
    this._seekSlider  = slider;
    this._seekSeeking = () => seeking;

    // Volume
    const vol = s.querySelector('.np-vol-slider');
    vol.addEventListener('input', () => { this._app.audioPlayer.volume = parseFloat(vol.value); });
    this._volSlider = vol;
  }

  _openSheet() {
    this._sheet.classList.add('open');
    this._open = true;
  }

  _closeSheet() {
    this._sheet.classList.remove('open');
    this._open = false;
  }

  _update() {
    const { currentTrack, isPlaying, position, duration, shuffleEnabled, loopMode, volume } = this._app.playerStore;

    // Hide bar if nothing playing
    this._bar.classList.toggle('visible', !!currentTrack);

    if (!currentTrack) return;

    // Progress strip
    const fill = this._bar.querySelector('.pb-progress-fill');
    fill.style.width = duration > 0 ? `${(position / duration) * 100}%` : '0%';

    // Artwork
    for (const wrap of [this._bar.querySelector('.pb-art-wrap'), this._sheet.querySelector('.np-art-wrap')]) {
      wrap.innerHTML = '';
      const size = wrap.classList.contains('np-art-wrap') ? 260 : 44;
      wrap.append(artworkImage(currentTrack.albumCover, size));
    }

    // Text
    this._bar.querySelector('.pb-title').textContent    = currentTrack.title;
    this._bar.querySelector('.pb-artist').textContent   = currentTrack.artist;
    this._sheet.querySelector('.np-title').textContent  = currentTrack.title;
    this._sheet.querySelector('.np-artist').textContent = currentTrack.artist;

    // Play buttons
    const icon = isPlaying ? '⏸' : '▶';
    this._bar.querySelector('.pb-play').textContent           = icon;
    this._sheet.querySelector('.np-playpause').textContent    = icon;

    // Seek (don't update while user is dragging)
    if (!this._seekSeeking?.()) {
      this._seekSlider.value = duration > 0 ? position / duration : 0;
      this._sheet.querySelector('.np-pos').textContent = formatTime(position);
      this._sheet.querySelector('.np-dur').textContent = formatTime(duration);
    }

    // Volume
    this._volSlider.value = volume;

    // Shuffle / loop
    const shuffleBtn = this._sheet.querySelector('.np-shuffle');
    shuffleBtn.classList.toggle('active', shuffleEnabled);
    const loopBtn = this._sheet.querySelector('.np-loop');
    loopBtn.textContent = loopMode === 'one' ? '↺¹' : '↻';
    loopBtn.classList.toggle('active', loopMode !== 'off');

    // Favourite
    const isFav = this._app.libraryStore.isFavourite(currentTrack.id);
    this._sheet.querySelector('.np-fav').textContent = isFav ? '♥' : '♡';
  }
}
