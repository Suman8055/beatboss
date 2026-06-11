// Port of DownloadManagerService.swift — downloads DASH or direct tracks to IndexedDB Blobs.

import { DASHParser } from './dash-parser.js';
import { putDownload, getDownload, deleteDownload } from './db.js';

export class DownloadManager {
  constructor(addonService, downloadStore, settings) {
    this._addon    = addonService;
    this._store    = downloadStore;
    this._settings = settings;
  }

  isDownloaded(trackId) { return this._store.isDownloaded(trackId); }

  // Returns a Blob URL for playback (ephemeral — revoke when done)
  async getBlobURL(trackId) {
    const rec = await getDownload(trackId);
    if (!rec?.blob) return null;
    return URL.createObjectURL(rec.blob);
  }

  async download(track) {
    if (this._store.isDownloaded(track.id)) return;

    // WiFi check (Android only — navigator.connection absent on iOS)
    if (this._settings.wifiOnlyDownloads) {
      const conn = navigator.connection;
      if (conn && conn.type !== 'wifi' && conn.type !== 'unknown') {
        throw new Error('WiFi required for downloads');
      }
    }

    this._store.setProgress(track.id, 0, 'queued');
    try {
      const streamURL = await this._addon.getStreamURL(track.id);
      const isDASH    = this._isDASH(streamURL);

      let blob;
      if (isDASH) {
        blob = await this._downloadDASH(streamURL, track.id);
      } else {
        blob = await this._downloadDirect(streamURL, track.id);
      }

      const record = {
        trackId:      track.id,
        title:        track.title,
        artist:       track.artist,
        albumCover:   track.albumCover ?? '',
        blob,
        downloadedAt: Date.now(),
        sizeBytes:    blob.size,
      };
      await this._store.finalize(record);
    } catch (e) {
      this._store.setProgress(track.id, 0, 'failed');
      throw e;
    }
  }

  async remove(trackId) {
    await this._store.remove(trackId);
  }

  // ── DASH: fetch all segments, concatenate ──────────────────────────────────

  async _downloadDASH(manifestURL, trackId) {
    this._store.setProgress(trackId, 0, 'downloading');
    const r       = await fetch(manifestURL);
    const parser  = new DASHParser();
    const { initURL, segmentURLs } = parser.parse(await r.text(), manifestURL);

    const urls   = [initURL, ...segmentURLs.map(s => s.url)].filter(Boolean);
    const chunks = [];
    for (let i = 0; i < urls.length; i++) {
      const seg = await fetch(urls[i]);
      chunks.push(await seg.arrayBuffer());
      this._store.setProgress(trackId, (i + 1) / urls.length, 'downloading');
    }
    return new Blob(chunks, { type: 'audio/mp4' });
  }

  // ── Direct: stream with progress ──────────────────────────────────────────

  async _downloadDirect(url, trackId) {
    this._store.setProgress(trackId, 0, 'downloading');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentLength = parseInt(response.headers.get('Content-Length') ?? '0', 10);
    const reader  = response.body.getReader();
    const chunks  = [];
    let received  = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      if (contentLength > 0) {
        this._store.setProgress(trackId, received / contentLength, 'downloading');
      }
    }

    const mimeType = response.headers.get('Content-Type') ?? 'audio/mpeg';
    return new Blob(chunks, { type: mimeType });
  }

  _isDASH(url) {
    return url.includes('.mpd') || url.includes('manifest') || url.includes('dash');
  }
}
