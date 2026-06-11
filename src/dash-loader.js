// Port of BeatBossDASHResourceLoader.swift — uses MediaSource Extensions (MSE).
// Falls back to full-blob concat on iOS 13–16 where MSE is unreliable.

import { DASHParser } from './dash-parser.js';

const CODEC = 'audio/mp4; codecs="mp4a.40.2"';
const canUseMSE = typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(CODEC);

export class DASHLoader {
  constructor(audioEl) {
    this._audio    = audioEl;
    this._abort    = null;   // AbortController for current load
    this._ms       = null;
    this._sb       = null;
    this._appendQueue = [];
    this._appending   = false;
  }

  async load(manifestURL, startPosition = 0) {
    this._cancel();
    this._abort = new AbortController();
    const signal = this._abort.signal;

    let xmlText;
    try {
      const r = await fetch(manifestURL, { signal });
      xmlText = await r.text();
    } catch (e) {
      if (e.name !== 'AbortError') throw e;
      return;
    }

    const parser  = new DASHParser();
    const { initURL, segmentURLs } = parser.parse(xmlText, manifestURL);

    if (canUseMSE) {
      await this._loadMSE(initURL, segmentURLs, startPosition, signal);
    } else {
      await this._loadBlob(initURL, segmentURLs, signal);
    }
  }

  seek(position) {
    // Abort current segment fetch, restart from the right segment
    this._cancel();
    // Caller should re-invoke load() — audio-player handles this
  }

  _cancel() {
    this._abort?.abort();
    this._abort = null;
    // Only call endOfStream if SourceBuffer is not mid-update — prevents InvalidStateError (Bug 10 fix)
    if (this._ms?.readyState === 'open' && !this._sb?.updating) {
      try { this._ms.endOfStream(); } catch (_) {}
    }
    if (this._audio.src.startsWith('blob:')) {
      URL.revokeObjectURL(this._audio.src);
    }
  }

  // ── MSE path ──────────────────────────────────────────────────────────────

  async _loadMSE(initURL, segments, startPosition, signal) {
    const ms = new MediaSource();
    this._ms = ms;
    this._audio.src = URL.createObjectURL(ms);

    await new Promise(resolve => ms.addEventListener('sourceopen', resolve, { once: true }));
    const sb = ms.addSourceBuffer(CODEC);
    this._sb = sb;

    // Serialise appendBuffer calls
    const append = (buf) => new Promise((res, rej) => {
      this._appendQueue.push({ buf, res, rej });
      if (!this._appending) this._drainQueue(sb, signal);
    });

    // Init segment
    if (initURL) {
      try {
        const r = await fetch(initURL, { signal });
        append(await r.arrayBuffer());
      } catch (e) {
        if (e.name !== 'AbortError') throw e;
        return;
      }
    }

    this._audio.currentTime = startPosition;

    // Media segments — throttle to 15s ahead
    for (let i = 0; i < segments.length; i++) {
      if (signal.aborted) break;
      const seg = segments[i];

      // Throttle: wait while we're more than 15s ahead of playhead
      while (!signal.aborted && this._audio.currentTime < seg.startTime - 15) {
        await sleep(500);
      }
      if (signal.aborted) break;

      // Prune old buffer (keep at most 60s behind currentTime)
      if (sb.buffered.length > 0) {
        const start = sb.buffered.start(0);
        const pruneEnd = this._audio.currentTime - 60;
        if (pruneEnd > start) {
          try { sb.remove(start, pruneEnd); } catch (_) {}
          await new Promise(r => sb.addEventListener('updateend', r, { once: true }));
        }
      }

      // Retry with exponential backoff — mirrors Swift
      let data = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await fetch(seg.url, { signal });
          data = await r.arrayBuffer();
          break;
        } catch (e) {
          if (e.name === 'AbortError' || attempt === 2) { data = null; break; }
          await sleep(1000 * Math.pow(2, attempt));
        }
      }
      if (data) append(data);
    }

    if (!signal.aborted && ms.readyState === 'open') ms.endOfStream();
  }

  _drainQueue(sb, signal) {
    this._appending = true;
    const next = () => {
      if (signal?.aborted || this._appendQueue.length === 0) {
        this._appending = false;
        return;
      }
      const { buf, res } = this._appendQueue.shift();
      sb.addEventListener('updateend', () => { res(); next(); }, { once: true });
      try { sb.appendBuffer(buf); } catch (e) { res(); next(); }
    };
    next();
  }

  // ── Blob concat fallback (iOS 13–16) ─────────────────────────────────────

  async _loadBlob(initURL, segments, signal) {
    const chunks = [];
    const urls   = [initURL, ...segments.map(s => s.url)].filter(Boolean);
    for (const url of urls) {
      if (signal.aborted) return;
      try {
        const r = await fetch(url, { signal });
        chunks.push(await r.arrayBuffer());
      } catch (e) {
        if (e.name !== 'AbortError') console.warn('DASH segment failed:', e);
      }
    }
    if (signal.aborted) return;
    const blob = new Blob(chunks, { type: 'audio/mp4' });
    if (this._audio.src.startsWith('blob:')) URL.revokeObjectURL(this._audio.src);
    this._audio.src = URL.createObjectURL(blob);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
