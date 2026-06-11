// Port of ImportService.swift — Spotify + YouTube playlist import.
// 3 concurrent searches via Promise.all batching.

const SPOTIFY_WORKER  = 'https://beatboss-spotify.thevolecitor.workers.dev';
const YOUTUBE_WORKER  = 'https://beatboss-spotify.thevolecitor.workers.dev'; // same worker, different param

export class ImportService {
  constructor(addonService, libraryStore, importStore) {
    this._addon   = addonService;
    this._library = libraryStore;
    this._import  = importStore;
    this._abort   = null;
  }

  get isImporting() { return this._import.isImporting; }

  // Extract Spotify playlist ID from URL or raw ID
  _spotifyId(input) {
    const m = input.match(/playlist\/([A-Za-z0-9]+)/);
    return m ? m[1] : input.trim();
  }

  // Extract YouTube playlist ID
  _youtubeId(input) {
    const m = input.match(/list=([^&]+)/);
    return m ? m[1] : input.trim();
  }

  async importSpotify(urlOrId, libraryId) {
    const id = this._spotifyId(urlOrId);
    const r  = await fetch(`${SPOTIFY_WORKER}?playlist=${id}`);
    if (!r.ok) throw new Error(`Spotify fetch failed: ${r.status}`);
    const tracks = await r.json();
    return this._runImport(tracks, libraryId, t => `${t.artist ?? ''} ${t.name ?? t.title ?? ''}`);
  }

  async importYouTube(urlOrId, libraryId) {
    const id = this._youtubeId(urlOrId);
    const r  = await fetch(`${YOUTUBE_WORKER}?youtube_playlist=${id}`);
    if (!r.ok) throw new Error(`YouTube fetch failed: ${r.status}`);
    const tracks = await r.json();
    return this._runImport(tracks, libraryId, t => `${t.channel ?? ''} ${t.title ?? ''}`);
  }

  async _runImport(rawTracks, libraryId, toQuery) {
    this._abort = new AbortController();
    const signal = this._abort.signal;
    this._import.start(rawTracks.length);

    const results = [];
    // Process in batches of 3 (mirrors Swift withTaskGroup maxConcurrency:3)
    for (let i = 0; i < rawTracks.length; i += 3) {
      if (signal.aborted) break;
      const batch = rawTracks.slice(i, i + 3);
      const settled = await Promise.allSettled(
        batch.map(t =>
          this._addon.search(toQuery(t), signal)
            .then(res => res.tracks[0] ?? null)
            .catch(() => null)
        )
      );
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) {
          results.push(r.value);
          if (libraryId) {
            await this._library.addTrackToLibrary(libraryId, r.value);
          }
        }
        this._import.increment();
      }
    }
    this._import.done();
    return results;
  }

  cancel() {
    this._abort?.abort();
    this._import.done();
  }
}
