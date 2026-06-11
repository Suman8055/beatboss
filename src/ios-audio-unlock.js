// iOS Safari requires Web Audio to be unlocked by a user gesture.
// This module handles the unlock on the first tap/click anywhere.

// 44-byte minimal silent WAV (PCM 8-bit, 1 channel, 8000Hz, 1 sample)
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';

let _ctx = null;
let _unlocked = false;

export function getAudioContext() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
}

export function isUnlocked() { return _unlocked; }

export function setupUnlock() {
  const unlock = async () => {
    if (_unlocked) return;
    const ctx = getAudioContext();
    // Resume the context (Chrome sometimes suspends it)
    if (ctx.state === 'suspended') await ctx.resume();
    // Play silent audio to register the audio session on iOS
    const silent = new Audio(SILENT_WAV);
    silent.volume = 0;
    try { await silent.play(); silent.pause(); } catch (_) {}
    _unlocked = true;
    document.removeEventListener('touchend', unlock, true);
    document.removeEventListener('click',    unlock, true);
    document.dispatchEvent(new Event('audiounlocked'));
  };
  document.addEventListener('touchend', unlock, true);
  document.addEventListener('click',    unlock, true);
}

// Keep iOS audio session alive when page goes to background.
// Play a silent looping audio element to prevent the OS from
// suspending the audio session after ~30 seconds of no output.
let _keepAliveAudio = null;

export function startKeepAlive() {
  if (_keepAliveAudio) return;
  _keepAliveAudio = new Audio(SILENT_WAV);
  _keepAliveAudio.loop = true;
  _keepAliveAudio.volume = 0;
  _keepAliveAudio.play().catch(() => {});
}

export function stopKeepAlive() {
  if (!_keepAliveAudio) return;
  _keepAliveAudio.pause();
  _keepAliveAudio = null;
}
