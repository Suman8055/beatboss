// Port of LastFmService.swift — scrobbling via Cloudflare Worker proxy.

const WORKER = 'https://beatboss-lastfm.thevolecitor.workers.dev';

export class LastFmService {
  constructor(settings) {
    this._settings   = settings;
    this._sessionKey = localStorage.getItem('lastfm_session_key') ?? null;
    this._username   = localStorage.getItem('lastfm_username')    ?? '';
    this._scrobbled  = new Set(); // trackId → prevent double-scrobble per session
  }

  get isLoggedIn() { return !!this._sessionKey; }
  get username()   { return this._username; }

  async login(username, password) {
    const r = await fetch(`${WORKER}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!r.ok) throw new Error(await r.text());
    const { sessionKey } = await r.json();
    this._sessionKey = sessionKey;
    this._username   = username;
    localStorage.setItem('lastfm_session_key', sessionKey);
    localStorage.setItem('lastfm_username',    username);
  }

  logout() {
    this._sessionKey = null;
    this._username   = '';
    localStorage.removeItem('lastfm_session_key');
    localStorage.removeItem('lastfm_username');
  }

  async updateNowPlaying(track) {
    if (!this._sessionKey) return;
    try {
      await fetch(`${WORKER}/nowplaying`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionKey: this._sessionKey,
          track: track.title,
          artist: track.artist,
          album:  track.album ?? '',
        }),
      });
    } catch (_) {}
  }

  // Call periodically from AudioPlayerService; mirrors scrobble threshold logic exactly.
  checkAndScrobble(track, position) {
    if (!this._sessionKey) return;
    if (this._scrobbled.has(track.id)) return;
    const duration = track.duration ?? 0;
    // threshold = min(max(30, duration/2), 240)
    const threshold = Math.min(Math.max(30, duration / 2), 240);
    if (position < threshold) return;
    this._scrobbled.add(track.id);
    this._scrobble(track).catch(() => {});
  }

  resetScrobble(trackId) { this._scrobbled.delete(trackId); }

  async _scrobble(track) {
    await fetch(`${WORKER}/scrobble`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionKey: this._sessionKey,
        track:      track.title,
        artist:     track.artist,
        album:      track.album ?? '',
        timestamp:  Math.floor(Date.now() / 1000),
      }),
    });
  }
}
