// Port of AddonService.swift — installs addons from manifest URL,
// routes search/stream/lyrics to the active handler.

import { putAddon, getAllAddons, deleteAddon } from './db.js';

const TIMEOUT_MS = 15000;

async function fetchJSON(url, signal) {
  const ctrl = new AbortController();
  const tid   = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const mergedSignal = signal
    ? AbortSignal.any([ctrl.signal, signal])
    : ctrl.signal;
  try {
    const r = await fetch(url, { signal: mergedSignal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(tid);
  }
}

// Built-in handler interface (mirrors UserAddonHandler protocol)
// External user-addon handlers call <baseUrl>/search, /stream/:id, /lyrics, etc.

class UserAddonHandler {
  constructor(manifest) { this.manifest = manifest; }
  get addonId() { return this.manifest.id; }

  async search(query, signal) {
    return fetchJSON(`${this.manifest.baseUrl}/search?q=${encodeURIComponent(query)}`, signal);
  }

  async getStreamURL(trackId, signal) {
    const r = await fetchJSON(`${this.manifest.baseUrl}/stream/${encodeURIComponent(trackId)}`, signal);
    return r.url ?? r.streamUrl ?? r;
  }

  async getLyrics(artist, title, signal) {
    try {
      const r = await fetchJSON(
        `${this.manifest.baseUrl}/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`,
        signal
      );
      return r.syncedLyrics ?? r.lyrics ?? null;
    } catch { return null; }
  }
}

export class AddonService {
  constructor(addonStore) {
    this._store    = addonStore;
    this._handlers = new Map();  // addonId → UserAddonHandler | built-in
  }

  async init() {
    const addons = await getAllAddons();
    for (const addon of addons) {
      this._handlers.set(addon.id, new UserAddonHandler(addon));
    }
  }

  // Install from manifest URL
  async installAddon(manifestURL) {
    const manifest = await fetchJSON(manifestURL);
    if (!manifest.id || !manifest.name || !manifest.baseUrl) {
      throw new Error('Invalid manifest: missing id, name, or baseUrl');
    }
    await putAddon(manifest);
    this._handlers.set(manifest.id, new UserAddonHandler(manifest));
    await this._store.install(manifest);
    return manifest;
  }

  async uninstallAddon(id) {
    await deleteAddon(id);
    this._handlers.delete(id);
    await this._store.uninstall(id);
  }

  registerBuiltIn(id, handler) {
    this._handlers.set(id, handler);
  }

  _activeHandler() {
    const id = this._store.activeAddonId;
    return id ? this._handlers.get(id) : [...this._handlers.values()][0] ?? null;
  }

  async search(query, signal) {
    const h = this._activeHandler();
    if (!h) throw new Error('No addon installed');
    const raw = await h.search(query, signal);
    return normaliseSearchResult(raw);
  }

  async getStreamURL(trackId) {
    const h = this._activeHandler();
    if (!h) throw new Error('No addon installed');
    return h.getStreamURL(trackId);
  }

  async getLyrics(artist, title) {
    // Try active addon, then fall back to LrcLib built-in
    const h = this._activeHandler();
    let lrc = null;
    if (h) { try { lrc = await h.getLyrics(artist, title); } catch (_) {} }
    if (!lrc && this._handlers.has('lrclib')) {
      lrc = await this._handlers.get('lrclib').getLyrics(artist, title);
    }
    return lrc;
  }
}

// Normalise various addon response shapes into a consistent object
function normaliseSearchResult(raw) {
  if (Array.isArray(raw)) {
    return { tracks: raw.map(normaliseTrack), albums: [], artists: [], playlists: [] };
  }
  return {
    tracks:    (raw.tracks    ?? []).map(normaliseTrack),
    albums:    raw.albums    ?? [],
    artists:   raw.artists   ?? [],
    playlists: raw.playlists ?? [],
  };
}

function normaliseTrack(t) {
  return {
    id:         t.id ?? t.trackId ?? String(t.videoId ?? ''),
    title:      t.title  ?? t.name ?? '',
    artist:     t.artist ?? t.artistName ?? t.channel ?? '',
    album:      t.album  ?? t.albumTitle ?? '',
    albumCover: t.albumCover ?? t.thumbnail ?? t.image ?? null,
    duration:   t.duration ?? 0,
    isHiRes:    t.isHiRes ?? false,
  };
}
