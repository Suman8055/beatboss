// Port of NowPlayingManager.swift — MediaSession API.
// Lock screen controls + artwork + track metadata.

export class MediaSessionManager {
  constructor(player) {
    this._player = player;
  }

  update(track, isPlaying, position, duration) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  track?.title  ?? '',
      artist: track?.artist ?? '',
      album:  track?.album  ?? '',
      artwork: track?.albumCover
        ? [{ src: track.albumCover, sizes: '512x512', type: 'image/jpeg' }]
        : [],
    });
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    try {
      navigator.mediaSession.setPositionState({
        duration:     duration  || 0,
        playbackRate: 1,
        position:     position  || 0,
      });
    } catch (_) {}
  }

  bindControls(handlers) {
    if (!('mediaSession' in navigator)) return;
    const bind = (action, fn) => {
      try { navigator.mediaSession.setActionHandler(action, fn); } catch (_) {}
    };
    bind('play',          handlers.play);
    bind('pause',         handlers.pause);
    bind('stop',          handlers.stop);
    bind('nexttrack',     handlers.next);
    bind('previoustrack', handlers.previous);
    bind('seekto',        e => handlers.seek(e.seekTime));
  }
}
