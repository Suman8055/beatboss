// Port of AudioPlayerService.swift — queue management, gapless preload, lyrics, scrobbling.

const LRC_REGEX = /\[(\d+):(\d+\.?\d*)\](.*)/;

function parseLRC(text) {
  if (!text) return [];
  const lines = [];
  for (const line of text.split('\n')) {
    // Multiple timestamps on one line
    const parts = line.split(/(?=\[\d+:\d+)/).filter(Boolean);
    for (const part of parts) {
      const m = part.match(LRC_REGEX);
      if (m) {
        const mins = parseInt(m[1], 10);
        const secs = parseFloat(m[2]);
        const text = m[3].trim();
        if (text) lines.push({ timestamp: mins * 60 + secs, text });
      }
    }
  }
  return lines.sort((a, b) => a.timestamp - b.timestamp);
}

export class AudioPlayerService {
  constructor(engine, addonService, historyStore, lastFmService, playerStore, downloadManager) {
    this._engine    = engine;
    this._addon     = addonService;
    this._history   = historyStore;
    this._lastfm    = lastFmService;
    this._store     = playerStore;
    this._downloads = downloadManager;
    this._playAbort = null;   // AbortController — mirrors Swift's playTask
    this._preloadScheduled = false;

    engine.onPosition  = (pos, dur) => this._onPosition(pos, dur);
    engine.onEnded     = ()         => this._onEnded();
    engine.onBuffering = (b)        => { this._store.isBuffering = b; this._store._emit(); };
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  async play(track) {
    // Cancel any in-flight play task (fixes the race condition from audio_handler.dart:278)
    this._playAbort?.abort();
    this._playAbort = new AbortController();
    const signal = this._playAbort.signal;

    this._store.currentTrack = track;
    this._store.isPlaying    = true;
    this._store.position     = 0;
    this._store.isBuffering  = true;
    this._store._emit();

    this._lastfm.resetScrobble(track.id);
    await this._history.add(track);

    try {
      // Check for local download first
      let streamURL = null;
      let isDASH    = false;
      const blobURL = await this._downloads.getBlobURL(track.id);
      if (blobURL) {
        streamURL = blobURL;
      } else {
        streamURL = await this._addon.getStreamURL(track.id);
        isDASH    = streamURL.includes('.mpd') || streamURL.includes('manifest');
      }
      if (signal.aborted) return;

      await this._engine.play(streamURL, isDASH, 0);
      this._store.isBuffering = false;
      this._store._emit();

      // Fetch lyrics async
      this._loadLyrics(track);

      // MediaSession
      this._updateNowPlaying();
      this._lastfm.updateNowPlaying(track);

      this._preloadScheduled = false;
    } catch (e) {
      if (e?.name === 'AbortError') return;
      this._store.isPlaying   = false;
      this._store.isBuffering = false;
      this._store._emit();
    }
  }

  togglePlayPause() {
    if (this._engine.paused) {
      this._engine.resume();
      this._store.isPlaying = true;
    } else {
      this._engine.pause();
      this._store.isPlaying = false;
    }
    this._store._emit();
    this._updateNowPlaying();
  }

  seek(t) {
    this._engine.seek(t);
    this._store.position = t;
    this._store._emit();
    this._updateNowPlaying();
  }

  stop() {
    this._engine.stop();
    this._store.isPlaying    = false;
    this._store.currentTrack = null;
    this._store._emit();
  }

  // ── Queue ─────────────────────────────────────────────────────────────────

  setQueue(tracks, startIndex = 0) {
    this._store.queue        = [...tracks];
    this._store.currentIndex = startIndex;
    this._store._emit();
    this.play(tracks[startIndex]);
  }

  addToQueue(track) {
    this._store.queue = [...this._store.queue, track];
    this._store._emit();
  }

  insertNext(track) {
    const q   = [...this._store.queue];
    const idx = this._store.currentIndex + 1;
    q.splice(idx, 0, track);
    this._store.queue = q;
    this._store._emit();
  }

  removeFromQueue(index) {
    const q = [...this._store.queue];
    q.splice(index, 1);
    this._store.queue = q;
    if (index < this._store.currentIndex) this._store.currentIndex--;
    this._store._emit();
  }

  moveInQueue(from, to) {
    const q = [...this._store.queue];
    const [item] = q.splice(from, 1);
    q.splice(to, 0, item);
    this._store.queue = q;
    this._store._emit();
  }

  clearQueue() {
    this._store.queue        = [];
    this._store.currentIndex = 0;
    this._store._emit();
  }

  playFromQueue(index) {
    this._store.currentIndex = index;
    this.play(this._store.queue[index]);
  }

  skipToNext() {
    const { queue, currentIndex, shuffleEnabled, loopMode } = this._store;
    if (queue.length === 0) return;
    let next;
    if (shuffleEnabled) {
      next = Math.floor(Math.random() * queue.length);
    } else if (currentIndex < queue.length - 1) {
      next = currentIndex + 1;
    } else if (loopMode === 'all') {
      next = 0;
    } else {
      return;
    }
    this._store.currentIndex = next;
    this.play(queue[next]);
  }

  skipToPrevious() {
    const { queue, currentIndex } = this._store;
    if (this._engine.currentTime > 3) { this.seek(0); return; }
    if (currentIndex > 0) {
      this._store.currentIndex = currentIndex - 1;
      this.play(queue[currentIndex - 1]);
    }
  }

  toggleShuffle() {
    this._store.shuffleEnabled = !this._store.shuffleEnabled;
    this._store._emit();
  }

  cycleLoopMode() {
    const modes = ['off', 'all', 'one'];
    const i = modes.indexOf(this._store.loopMode);
    this._store.loopMode = modes[(i + 1) % modes.length];
    this._store._emit();
  }

  set volume(v) {
    this._store.volume = v;
    this._engine.volume = v;
    this._store._emit();
  }

  // ── Position callback ─────────────────────────────────────────────────────

  _onPosition(pos, dur) {
    this._store.position = pos;
    this._store.duration = dur;
    this._store._emit();

    const track = this._store.currentTrack;
    if (track) this._lastfm.checkAndScrobble(track, pos);

    this._updateCurrentLyricIndex(pos);

    // Gapless preload at 80%
    if (!this._preloadScheduled && dur > 0 && pos / dur >= 0.8) {
      this._preloadScheduled = true;
      this._schedulePreload();
    }
  }

  _onEnded() {
    const { loopMode } = this._store;
    if (loopMode === 'one') {
      // Re-invoke full play() to handle stream re-fetch and iOS resume correctly (Bug 4 fix)
      this.play(this._store.currentTrack);
    } else {
      this.skipToNext();
    }
  }

  async _schedulePreload() {
    const { queue, currentIndex } = this._store;
    const nextIndex = currentIndex + 1;
    if (nextIndex >= queue.length) return;
    try {
      const url = await this._addon.getStreamURL(queue[nextIndex].id);
      const isDASH = url.includes('.mpd') || url.includes('manifest');
      await this._engine.preloadNext(url, isDASH);
    } catch (_) {}
  }

  // ── Lyrics ────────────────────────────────────────────────────────────────

  async _loadLyrics(track) {
    this._store.lyrics           = [];
    this._store.currentLyricIndex = -1;
    this._store._emit();
    try {
      const lrc = await this._addon.getLyrics(track.artist, track.title);
      if (lrc) {
        this._store.lyrics = parseLRC(lrc);
        this._store._emit();
      }
    } catch (_) {}
  }

  _updateCurrentLyricIndex(pos) {
    const lines = this._store.lyrics;
    if (lines.length === 0) return;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].timestamp <= pos) idx = i;
      else break;
    }
    if (idx !== this._store.currentLyricIndex) {
      this._store.currentLyricIndex = idx;
      this._store._emit();
    }
  }

  // ── Now Playing ───────────────────────────────────────────────────────────

  _updateNowPlaying() {
    const { currentTrack, isPlaying, position, duration } = this._store;
    if (this._mediaSession) {
      this._mediaSession.update(currentTrack, isPlaying, position, duration);
    }
  }

  bindMediaSession(ms) {
    this._mediaSession = ms;
    ms.bindControls({
      play:     () => { this._engine.resume(); this._store.isPlaying = true; this._store._emit(); },
      pause:    () => { this._engine.pause();  this._store.isPlaying = false; this._store._emit(); },
      stop:     () => this.stop(),
      next:     () => this.skipToNext(),
      previous: () => this.skipToPrevious(),
      seek:     t  => this.seek(t),
    });
  }
}
