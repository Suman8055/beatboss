// IndexedDB schema — mirrors Swift SwiftData models exactly.
// Uses idb library (Jake Archibald's promisified wrapper, ~1KB).

import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8/build/index.js';

const DB_NAME = 'beatboss';
const DB_VERSION = 1;

let _db = null;

export async function getDB() {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // tracks
      if (!db.objectStoreNames.contains('tracks'))
        db.createObjectStore('tracks', { keyPath: 'id' });
      // addons
      if (!db.objectStoreNames.contains('addons'))
        db.createObjectStore('addons', { keyPath: 'id' });
      // libraries
      if (!db.objectStoreNames.contains('libraries'))
        db.createObjectStore('libraries', { keyPath: 'id' });
      // favourites
      if (!db.objectStoreNames.contains('favourites'))
        db.createObjectStore('favourites', { keyPath: 'trackId' });
      // downloads — blob stored directly in IDB
      if (!db.objectStoreNames.contains('downloads'))
        db.createObjectStore('downloads', { keyPath: 'trackId' });
      // history — auto-increment, cap at 50 entries via pruning
      if (!db.objectStoreNames.contains('history'))
        db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
      // settings — key/value
      if (!db.objectStoreNames.contains('settings'))
        db.createObjectStore('settings', { keyPath: 'key' });
    },
  });
  return _db;
}

// ── Tracks ───────────────────────────────────────────────────────────────────

export async function putTrack(track)        { return (await getDB()).put('tracks', track); }
export async function getTrack(id)           { return (await getDB()).get('tracks', id); }
export async function getAllTracks()         { return (await getDB()).getAll('tracks'); }
export async function deleteTrack(id)        { return (await getDB()).delete('tracks', id); }

// ── Addons ───────────────────────────────────────────────────────────────────

export async function putAddon(addon)        { return (await getDB()).put('addons', addon); }
export async function getAddon(id)           { return (await getDB()).get('addons', id); }
export async function getAllAddons()         { return (await getDB()).getAll('addons'); }
export async function deleteAddon(id)        { return (await getDB()).delete('addons', id); }

// ── Libraries ────────────────────────────────────────────────────────────────

export async function putLibrary(lib)        { return (await getDB()).put('libraries', lib); }
export async function getLibrary(id)         { return (await getDB()).get('libraries', id); }
export async function getAllLibraries()      { return (await getDB()).getAll('libraries'); }
export async function deleteLibrary(id)      { return (await getDB()).delete('libraries', id); }

// ── Favourites ───────────────────────────────────────────────────────────────

export async function putFavourite(fav)      { return (await getDB()).put('favourites', fav); }
export async function getFavourite(trackId)  { return (await getDB()).get('favourites', trackId); }
export async function getAllFavourites()     { return (await getDB()).getAll('favourites'); }
export async function deleteFavourite(tid)  { return (await getDB()).delete('favourites', tid); }

// ── Downloads ────────────────────────────────────────────────────────────────

export async function putDownload(rec)       { return (await getDB()).put('downloads', rec); }
export async function getDownload(trackId)   { return (await getDB()).get('downloads', trackId); }
export async function getAllDownloads()      { return (await getDB()).getAll('downloads'); }
export async function deleteDownload(tid)   { return (await getDB()).delete('downloads', tid); }

// ── History ──────────────────────────────────────────────────────────────────

export async function addHistory(track) {
  const db = await getDB();
  const tx = db.transaction('history', 'readwrite');
  const store = tx.objectStore('history');
  // Remove duplicate if exists
  const all = await store.getAll();
  const dup = all.find(h => h.track.id === track.id);
  if (dup) await store.delete(dup.id);
  await store.put({ track, playedAt: Date.now() });
  // Prune to 50 most recent
  const updated = await store.getAll();
  if (updated.length > 50) {
    updated.sort((a, b) => a.playedAt - b.playedAt);
    for (const old of updated.slice(0, updated.length - 50))
      await store.delete(old.id);
  }
  await tx.done;
}

export async function getHistory() {
  const all = await (await getDB()).getAll('history');
  return all.sort((a, b) => b.playedAt - a.playedAt).map(h => h.track);
}

export async function clearHistory() { return (await getDB()).clear('history'); }

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getSetting(key, fallback = null) {
  const rec = await (await getDB()).get('settings', key);
  return rec ? rec.value : fallback;
}

export async function setSetting(key, value) {
  return (await getDB()).put('settings', { key, value });
}
