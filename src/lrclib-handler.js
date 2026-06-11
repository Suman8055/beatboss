// Port of LrcLibAddonHandler.swift — two-stage lookup on lrclib.net

export class LrcLibHandler {
  get addonId() { return 'lrclib'; }

  async getLyrics(artist, title) {
    // Stage 1: exact match
    try {
      const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
      const r   = await fetch(url);
      if (r.ok) {
        const j = await r.json();
        if (j.syncedLyrics) return j.syncedLyrics;
        if (j.plainLyrics)  return j.plainLyrics;
      }
    } catch (_) {}

    // Stage 2: search fallback
    try {
      const url = `https://lrclib.net/api/search?q=${encodeURIComponent(artist + ' ' + title)}`;
      const r   = await fetch(url);
      if (r.ok) {
        const results = await r.json();
        const hit = results[0];
        if (hit?.syncedLyrics) return hit.syncedLyrics;
        if (hit?.plainLyrics)  return hit.plainLyrics;
      }
    } catch (_) {}

    return null;
  }

  // Unused methods (LrcLib is lyrics-only)
  async search()       { return { tracks: [], albums: [], artists: [], playlists: [] }; }
  async getStreamURL() { throw new Error('LrcLib does not provide streams'); }
}
