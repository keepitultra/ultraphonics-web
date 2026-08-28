import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Loads YouTube's IFrame API once per page, on demand.
 *
 * Deliberately not loaded at import time: nothing from YouTube is requested
 * until the visitor actually presses play, so simply opening a profile does not
 * pull in their player script.
 */
let apiPromise = null;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT); };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    tag.onerror = () => { apiPromise = null; reject(new Error('player-blocked')); };
    document.head.appendChild(tag);
  });
  return apiPromise;
}

function clock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * A MySpace-style audio bar around a YouTube video.
 *
 * The video itself stays hidden and the visitor gets chunky custom controls and
 * album art, the way the original profile players worked. Never autoplays: the
 * bar renders idle and only builds the player on a click.
 */
export default function MyspacePlayer({ videoId, title, accent, theme }) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const tickRef = useRef(null);

  const [status, setStatus] = useState('idle'); // idle | loading | playing | paused | error
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(70);

  const stopTicking = () => { clearInterval(tickRef.current); tickRef.current = null; };

  const startTicking = useCallback(() => {
    stopTicking();
    tickRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      setElapsed(p.getCurrentTime() || 0);
      const d = p.getDuration?.() || 0;
      if (d) setDuration(d);
    }, 250);
  }, []);

  useEffect(() => () => {
    stopTicking();
    try { playerRef.current?.destroy?.(); } catch { /* already gone */ }
  }, []);

  async function handleFirstPlay() {
    setStatus('loading');
    try {
      const YT = await loadYouTubeApi();
      playerRef.current = new YT.Player(hostRef.current, {
        videoId,
        // nocookie host keeps YouTube from setting tracking cookies on playback
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          // autoplay is safe here: this only ever runs from a click
          autoplay: 1, controls: 0, modestbranding: 1, rel: 0,
          playsinline: 1, origin: window.location.origin,
        },
        events: {
          onReady: e => { e.target.setVolume(volume); setDuration(e.target.getDuration() || 0); },
          onStateChange: e => {
            if (e.data === YT.PlayerState.PLAYING) { setStatus('playing'); startTicking(); }
            else if (e.data === YT.PlayerState.PAUSED) { setStatus('paused'); stopTicking(); }
            else if (e.data === YT.PlayerState.ENDED) { setStatus('paused'); stopTicking(); setElapsed(0); }
          },
          onError: () => { setStatus('error'); stopTicking(); },
        },
      });
    } catch {
      // Blocked by an extension or offline — fall back to a plain link.
      setStatus('error');
    }
  }

  function toggle() {
    const p = playerRef.current;
    if (!p) return handleFirstPlay();
    if (status === 'playing') p.pauseVideo();
    else p.playVideo();
  }

  function seek(e) {
    const p = playerRef.current;
    if (!p?.seekTo || !duration) return;
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    p.seekTo(ratio * duration, true);
    setElapsed(ratio * duration);
  }

  function changeVolume(v) {
    setVolume(v);
    playerRef.current?.setVolume?.(v);
  }

  const progress = duration ? (elapsed / duration) * 100 : 0;
  const busy = status === 'loading';

  return (
    <div
      className="rounded-2xl overflow-hidden mt-5"
      style={{ background: theme.panel, border: `1px solid ${theme.border}` }}
    >
      {/* Title strip */}
      <div
        className="px-4 py-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em]"
        style={{ background: `${accent}1f`, color: accent, borderBottom: `1px solid ${theme.border}` }}
      >
        <i className="fas fa-compact-disc" style={{ animation: status === 'playing' ? 'up-spin 3s linear infinite' : 'none' }} />
        Now Playing
      </div>

      <div className="p-4 flex items-center gap-4">
        {/* Album art */}
        <div className="relative shrink-0 rounded-xl overflow-hidden" style={{ width: 68, height: 68, border: `1px solid ${theme.border}` }}>
          <img
            src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            className="w-full h-full object-cover"
            onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate" style={{ color: theme.text }}>
            {title || 'My Song'}
          </p>

          {status === 'error' ? (
            <p className="text-[11px] mt-1" style={{ color: theme.muted }}>
              Couldn&rsquo;t load the player.{' '}
              <a
                href={`https://www.youtube.com/watch?v=${videoId}`}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="underline"
                style={{ color: accent }}
              >
                Open on YouTube
              </a>
            </p>
          ) : (
            <>
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={toggle}
                  disabled={busy}
                  aria-label={status === 'playing' ? 'Pause' : 'Play'}
                  className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-transform hover:scale-105 disabled:opacity-60"
                  style={{ background: accent, color: theme.bg }}
                >
                  <i className={`fas ${busy ? 'fa-spinner fa-spin' : status === 'playing' ? 'fa-pause' : 'fa-play'}`}
                    style={{ marginLeft: !busy && status !== 'playing' ? 2 : 0 }} />
                </button>

                {/* Scrubber */}
                <div
                  onClick={seek}
                  role="progressbar"
                  aria-valuenow={Math.round(progress)}
                  className="flex-1 h-2.5 rounded-full cursor-pointer relative overflow-hidden"
                  style={{ background: `${theme.text}1a`, border: `1px solid ${theme.border}` }}
                >
                  <div className="h-full rounded-full" style={{ width: `${progress}%`, background: accent }} />
                </div>

                <span className="shrink-0 text-[11px] font-mono tabular-nums" style={{ color: theme.muted }}>
                  {clock(elapsed)} / {duration ? clock(duration) : '--:--'}
                </span>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <i className="fas fa-volume-low text-[10px]" style={{ color: theme.muted }} />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={e => changeVolume(Number(e.target.value))}
                  aria-label="Volume"
                  className="w-28 h-1.5"
                  style={{ accentColor: accent }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* The video is never shown — this is an audio player with album art. */}
      <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        <div ref={hostRef} />
      </div>

      <style>{`@keyframes up-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
