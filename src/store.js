// Observable store base — mirrors Swift @Observable pattern.
// All domain stores extend Store and call _emit() on mutation.

import * as db from './db.js';

export class Store extends EventTarget {
  _emit() { this.dispatchEvent(new Event('change')); }
  on(handler)  { this.addEventListener('change', handler); }
  off(handler) { this.removeEventListener('change', handler); }
}

// ── SettingsStore ─────────────────────────────────────────────────────────────
// Mirrors SettingsService.swift

export class SettingsStore extends Store {
  darkMode         = true;
  crossfadeEnabled = false;
  crossfadeDuration = 3;       // seconds
  wifiOnlyDownloads = true;
  showMenuBarPlayer = false;   // unused on web
  lastFmUsername   = '';
  eqBands          = new Array(10).fill(0); // dB, –12 to +12
  activeAddonId    = null;
  playbackRate     = 1.0;

  async load() {
    this.darkMode          = await db.getSetting('darkMode',          true);
    this.crossfadeEnabled  = await db.getSetting('crossfadeEnabled',  false);
    this.crossfadeDuration = await db.getSetting('crossfadeDuration', 3);
    this.wifiOnlyDownloads = await db.getSetting('wifiOnlyDownloads', true);
    this.lastFmUsername    = await db.getSetting('lastFmUsername',    '');
    this.eqBands           = await db.getSetting('eqBands',          new Array(10).fill(0));
    this.activeAddonId     = await db.getSetting('activeAddonId',     null);
    this.playbackRate      = await db.getSetting('playbackRate',      1.0);
    this._emit();
  }

  async set(key, value) {
    this[key] = value;
    await db.setSetting(key, value);
    this._emit();
  }
}

// ── HistoryStore ──────────────────────────────────────────────────────────────

export class HistoryStore extends Store {
  recentlyPlayed = [];

  async load() {
    this.recentlyPlayed = await db.getHistory();
    this._emit();
  }

  async add(track) {
    await db.addHistory(track);
    this.recentlyPlayed = await db.getHistory();
    this._emit();
  }

  async clear() {
    await db.clearHistory();
    this.recentlyPlayed = [];
    this._emit();
  }
}

// ── LibraryStore ──────────────────────────────────────────────────────────────

export class LibraryStore extends Store {
  libraries  = [];
  favourites = [];

  async load() {
    this.libraries  = await db.getAllLibraries();
    this.favourites = await db.getAllFavourites();
    this._emit();
  }

  async createLibrary(name) {
    const lib = { id: crypto.randomUUID(), name, trackIds: [], createdAt: Date.now() };
    await db.putLibrary(lib);
    this.libraries = [...this.libraries, lib];
    this._emit();
    return lib;
  }

  async renameLibrary(id, name) {
    const lib = this.libraries.find(l => l.id === id);
    if (!lib) return;
    lib.name = name;
    await db.putLibrary(lib);
    this._emit();
  }

  async deleteLibrary(id) {
    await db.deleteLibrary(id);
    this.libraries = this.libraries.filter(l => l.id !== id);
    this._emit();
  }

  async addTrackToLibrary(libraryId, track) {
    const lib = this.libraries.find(l => l.id === libraryId);
    if (!lib || lib.trackIds.includes(track.id)) return;
    await db.putTrack(track);
    lib.trackIds = [...lib.trackIds, track.id];
    await db.putLibrary(lib);
    this._emit();
  }

  async removeTrackFromLibrary(libraryId, trackId) {
    const lib = this.libraries.find(l => l.id === libraryId);
    if (!lib) return;
    lib.trackIds = lib.trackIds.filter(id => id !== trackId);
    await db.putLibrary(lib);
    this._emit();
  }

  isFavourite(trackId) {
    return this.favourites.some(f => f.trackId === trackId);
  }

  async toggleFavourite(track) {
    if (this.isFavourite(track.id)) {
      await db.deleteFavourite(track.id);
      this.favourites = this.favourites.filter(f => f.trackId !== track.id);
    } else {
      const fav = { trackId: track.id, track, addedAt: Date.now() };
      await db.putFavourite(fav);
      this.favourites = [...this.favourites, fav];
    }
    this._emit();
  }
}

// ── AddonStore ────────────────────────────────────────────────────────────────

export class AddonStore extends Store {
  installedAddons = [];
  activeAddonId   = null;

  async load(settings) {
    this.installedAddons = await db.getAllAddons();
    this.activeAddonId   = settings.activeAddonId ?? this.installedAddons[0]?.id ?? null;
    this._emit();
  }

  async install(manifest) {
    await db.putAddon(manifest);
    this.installedAddons = [...this.installedAddons.filter(a => a.id !== manifest.id), manifest];
    this._emit();
  }

  async uninstall(id) {
    await db.deleteAddon(id);
    this.installedAddons = this.installedAddons.filter(a => a.id !== id);
    if (this.activeAddonId === id) this.activeAddonId = this.installedAddons[0]?.id ?? null;
    this._emit();
  }

  setActive(id) {
    this.activeAddonId = id;
    this._emit();
  }
}

// ── DownloadStore ─────────────────────────────────────────────────────────────

export class DownloadStore extends Store {
  downloads    = [];        // persisted DownloadRecords
  inProgress   = new Map(); // trackId → { progress 0–1, status }

  async load() {
    this.downloads = await db.getAllDownloads();
    this._emit();
  }

  isDownloaded(trackId) {
    return this.downloads.some(d => d.trackId === trackId);
  }

  setProgress(trackId, progress, status = 'downloading') {
    this.inProgress.set(trackId, { progress, status });
    this._emit();
  }

  async finalize(record) {
    await db.putDownload(record);
    this.downloads = [...this.downloads.filter(d => d.trackId !== record.trackId), record];
    this.inProgress.delete(record.trackId);
    this._emit();
  }

  async remove(trackId) {
    await db.deleteDownload(trackId);
    this.downloads = this.downloads.filter(d => d.trackId !== trackId);
    this.inProgress.delete(trackId);
    this._emit();
  }
}

// ── PlayerStore ───────────────────────────────────────────────────────────────
// Holds observable player state — updated by AudioPlayerService.

export class PlayerStore extends Store {
  currentTrack   = null;
  isPlaying      = false;
  position       = 0;
  duration       = 0;
  queue          = [];
  currentIndex   = 0;
  shuffleEnabled = false;
  loopMode       = 'off';   // 'off' | 'all' | 'one'
  volume         = 1.0;
  lyrics         = [];      // [{timestamp, text}]
  currentLyricIndex = -1;
  isBuffering    = false;
}

// ── ImportStore ───────────────────────────────────────────────────────────────

export class ImportStore extends Store {
  isImporting   = false;
  totalCount    = 0;
  importedCount = 0;

  start(total) {
    this.isImporting   = true;
    this.totalCount    = total;
    this.importedCount = 0;
    this._emit();
  }

  increment() {
    this.importedCount++;
    this._emit();
  }

  done() {
    this.isImporting = false;
    this._emit();
  }
}
