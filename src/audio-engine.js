// Port of BeatBossAudioEngine.swift — Web Audio API.
// Dual audio element (A = current, B = gapless next) → GainNode → EQ → Master → destination.

import { getAudioContext, isUnlocked, startKeepAlive, stopKeepAlive } from './ios-audio-unlock.js';
import { DASHLoader } from './dash-loader.js';

const EQ_FREQS  = [32, 125, 250, 500, 1000, 2000, 4000, 8000, 16000, 20000];

export class AudioEngine {
  constructor() {
    this._ctx        = null;
    this._elA        = new Audio();
    this._elB        = new Audio();
    this._srcA       = null;
    this._srcB       = null;
    this._gainA      = null;
    this._gainB      = null;
    this._eqNodes    = [];
    this._master     = null;
    this._dashA      = null;
    this._dashB      = null;
    this._active     = 'A';   // which element is playing
    this._crossTimer  = null;
    this._posTimer    = null;
    this.onPosition  = null;   // callback(position, duration)
    this.onEnded     = null;   // callback()
    this.onBuffering = null;   // callback(bool)

    this._elA.addEventListener('ended',   () => this.onEnded?.());
    this._elA.addEventListener('waiting', () => this.onBuffering?.(true));
    this._elA.addEventListener('playing', () => this.onBuffering?.(false));
    this._elA.addEventListener('timeupdate', () => this._posUpdate());

    // iOS: don't pause when page hides
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this._active === 'A' && !this._elA.paused) {
        // keep playing — iOS allows this if already playing
      }
    });
  }

  _ensureGraph() {
    if (this._ctx) return;
    this._ctx = getAudioContext();

    this._gainA  = this._ctx.createGain();
    this._gainB  = this._ctx.createGain();
    this._master = this._ctx.createGain();

    // EQ chain: 10 BiquadFilterNodes
    this._eqNodes = EQ_FREQS.map((freq, i) => {
      const f = this._ctx.createBiquadFilter();
      f.frequency.value = freq;
      f.gain.value      = 0;
      f.type = i === 0 ? 'lowshelf' : i === 9 ? 'highshelf' : 'peaking';
      return f;
    });

    // Wire: gainA/B → eq chain → master → destination
    let prev = this._eqNodes[0];
    this._eqNodes.slice(1).forEach(n => { prev.connect(n); prev = n; });
    const eqOut = this._eqNodes[9];

    this._gainA.connect(this._eqNodes[0]);
    this._gainB.connect(this._eqNodes[0]);
    eqOut.connect(this._master);
    this._master.connect(this._ctx.destination);

    // Create MediaElementSources lazily (must happen after AudioContext exists)
    this._srcA = this._ctx.createMediaElementSource(this._elA);
    this._srcB = this._ctx.createMediaElementSource(this._elB);
    this._srcA.connect(this._gainA);
    this._srcB.connect(this._gainB);
    this._gainB.gain.value = 0;

    // DASH loaders
    this._dashA = new DASHLoader(this._elA);
    this._dashB = new DASHLoader(this._elB);
  }

  async play(streamURL, isDASH = false, startPosition = 0) {
    this._ensureGraph();
    if (this._ctx.state === 'suspended') await this._ctx.resume();
    this._active = 'A';
    this._gainA.gain.setValueAtTime(1, this._ctx.currentTime);
    this._gainB.gain.setValueAtTime(0, this._ctx.currentTime);

    await this._loadTo(this._elA, this._dashA, streamURL, isDASH, startPosition);
    await this._elA.play();
    startKeepAlive();
    this._startPosTimer();
  }

  async preloadNext(streamURL, isDASH = false) {
    this._ensureGraph();
    this._elB.preload = 'auto';
    await this._loadTo(this._elB, this._dashB, streamURL, isDASH, 0);
  }

  async activatePreloaded(crossfadeDuration = 0) {
    if (!this._srcB) return;
    this._ensureGraph();
    if (this._ctx.state === 'suspended') await this._ctx.resume();

    const now = this._ctx.currentTime;
    if (crossfadeDuration > 0) {
      this._gainA.gain.linearRampToValueAtTime(0, now + crossfadeDuration);
      this._gainB.gain.linearRampToValueAtTime(1, now + crossfadeDuration);
    } else {
      this._elA.pause();
      this._gainA.gain.setValueAtTime(0, now);
      this._gainB.gain.setValueAtTime(1, now);
    }

    await this._elB.play();
    // Swap A ↔ B roles
    [this._elA, this._elB] = [this._elB, this._elA];
    [this._srcA, this._srcB] = [this._srcB, this._srcA];
    [this._gainA, this._gainB] = [this._gainB, this._gainA];
    [this._dashA, this._dashB] = [this._dashB, this._dashA];
    this._gainA.gain.setValueAtTime(1, this._ctx.currentTime);
    this._gainB.gain.setValueAtTime(0, this._ctx.currentTime);

    this._elA.addEventListener('ended', () => this.onEnded?.(), { once: true });
    this._elA.addEventListener('timeupdate', () => this._posUpdate());
  }

  pause()   { this._elA.pause(); this._stopPosTimer(); }
  resume()  { this._elA.play().catch(() => {}); this._startPosTimer(); }
  stop()    { this._elA.pause(); this._elA.src = ''; this._stopPosTimer(); stopKeepAlive(); }
  seek(t)   { this._elA.currentTime = t; }

  get currentTime() { return this._elA.currentTime || 0; }
  get duration()    { return isFinite(this._elA.duration) ? this._elA.duration : 0; }
  get paused()      { return this._elA.paused; }

  set volume(v) {
    if (this._master) this._master.gain.value = v;
    else this._elA.volume = v;
  }

  set playbackRate(r) {
    this._elA.playbackRate = r;
    if ('preservesPitch' in this._elA)       this._elA.preservesPitch = false;
    else if ('webkitPreservesPitch' in this._elA) this._elA.webkitPreservesPitch = false;
  }

  setEQGain(bandIndex, gainDb) {
    if (this._eqNodes[bandIndex]) this._eqNodes[bandIndex].gain.value = gainDb;
  }

  async _loadTo(el, dashLoader, url, isDASH, startPosition) {
    if (isDASH) {
      await dashLoader.load(url, startPosition);
    } else {
      if (el.src.startsWith('blob:')) URL.revokeObjectURL(el.src);
      el.src = url;
      el.load();
      if (startPosition > 0) el.currentTime = startPosition;
    }
  }

  _posUpdate() {
    this.onPosition?.(this.currentTime, this.duration);
  }

  _startPosTimer() {
    this._stopPosTimer();
    this._posTimer = setInterval(() => this._posUpdate(), 250);
  }

  _stopPosTimer() {
    clearInterval(this._posTimer);
    this._posTimer = null;
  }
}
