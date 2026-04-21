import { useEffect, useRef, useState, useCallback } from 'react';
import { getSongs } from '../firestore-service.js';

const RECONNECT_DELAY = 2000;

function processLine(line) {
  let processed = line
    .replace(/\[([A-G][#b]?(?:m|maj|min|sus|aug|dim|add|[0-9])*)\]/g, '<span class="chord">[$1]</span>')
    .replace(/\*\*([^*]+)\*\*/g, '<span class="harmony-section">$1</span>')
    .replace(/\[\[([^\]]+)\]\]/g, '<span class="footnote-marker" title="$1">[*]</span>');
  return processed || '&nbsp;';
}

function renderLyrics(text) {
  if (!text) return '';
  return text
    .split('\n')
    .map((line) => {
      const sectionMatch = line.match(/^\[([^\]]+)\]$/);
      if (sectionMatch) {
        return `<div class="section-anchor">${sectionMatch[1].trim()}</div>`;
      }
      return `<div class="lyric-line">${processLine(line)}</div>`;
    })
    .join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export default function LiveViewer() {
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const songCacheRef = useRef(new Map());

  const [songTitle, setSongTitle] = useState('');
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [songHtml, setSongHtml] = useState('');
  const [chartUrl, setChartUrl] = useState('');
  const [songKey, setSongKey] = useState('');
  const [loadingText, setLoadingText] = useState('Waiting for song selection in AbleSet...');
  const [error, setError] = useState('');

  const fetchAndDisplaySong = useCallback(async (songName) => {
    setLoadingText(`Loading "${songName}"...`);
    setSongHtml('');
    setError('');
    try {
      const songs = await getSongs();
      const lower = songName.toLowerCase();
      let song =
        songs.find((s) => s.name === songName || s.title === songName) ||
        songs.find(
          (s) =>
            (s.name && s.name.toLowerCase() === lower) ||
            (s.title && s.title.toLowerCase() === lower) ||
            (s.ablesetName && s.ablesetName.toLowerCase() === lower)
        );

      if (!song) {
        setError(`Song "${songName}" not found in database`);
        setLoadingText('');
        return;
      }

      songCacheRef.current.set(songName, song);

      setSongKey(song.key || '');
      setChartUrl(song.chartUrl || '');
      setSongHtml(renderLyrics(song.lyrics || song.chart || ''));
      setLoadingText('');
    } catch (err) {
      console.error('[LiveViewer] Fetch error:', err);
      setError('Error loading song: ' + err.message);
      setLoadingText('');
    }
  }, []);

  const handleMessage = useCallback(
    (data) => {
      switch (data.type) {
        case 'songName':
          if (!data.value) return;
          setSongTitle(data.value);
          if (songCacheRef.current.has(data.value)) {
            const cached = songCacheRef.current.get(data.value);
            setSongKey(cached.key || '');
            setChartUrl(cached.chartUrl || '');
            setSongHtml(renderLyrics(cached.lyrics || cached.chart || ''));
            setLoadingText('');
          } else {
            fetchAndDisplaySong(data.value);
          }
          break;
        case 'progress':
          setProgress(Math.min(100, Math.max(0, (data.value || 0) * 100)));
          break;
        case 'playing':
          setPlaying(!!data.value);
          break;
        default:
          break;
      }
    },
    [fetchAndDisplaySong]
  );

  useEffect(() => {
    const wsUrl = `ws://${window.location.hostname}:8080`;

    function connect() {
      if (wsRef.current) return;
      console.log('[LiveViewer] Connecting to bridge:', wsUrl);
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[LiveViewer] Connected');
          clearTimeout(reconnectTimerRef.current);
        };

        ws.onclose = () => {
          console.log('[LiveViewer] Disconnected');
          wsRef.current = null;
          scheduleReconnect();
        };

        ws.onerror = () => {
          console.error('[LiveViewer] WebSocket error');
        };

        ws.onmessage = (event) => {
          try {
            handleMessage(JSON.parse(event.data));
          } catch (err) {
            console.error('[LiveViewer] Parse error:', err);
          }
        };
      } catch (err) {
        console.error('[LiveViewer] WebSocket creation failed:', err);
        scheduleReconnect();
      }
    }

    function scheduleReconnect() {
      if (reconnectTimerRef.current) return;
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, RECONNECT_DELAY);
    }

    connect();

    return () => {
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [handleMessage]);

  return (
    <div className="bg-stone-950 text-stone-100 h-screen overflow-hidden flex flex-col">
      {/* Progress bar */}
      {(playing || progress > 0) && (
        <div className="h-[3px] bg-stone-800 flex-shrink-0">
          <div
            className="h-full bg-accent-green transition-[width] duration-300 ease-linear"
            style={{ width: `${progress}%`, backgroundColor: '#1DB954' }}
          />
        </div>
      )}

      {/* Song title bar */}
      {songTitle && (
        <div className="px-4 md:px-6 py-3 bg-stone-900/95 border-b border-stone-800">
          <h1 className="text-lg md:text-xl font-bold text-white">{songTitle}</h1>
        </div>
      )}

      {/* Chart container */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 md:px-12 py-8" style={{ fontSize: '20px' }}>

          {/* Loading / waiting state */}
          {!songHtml && !error && (
            <div className="text-center py-16">
              <p className="text-xl text-stone-500">Connected to hub</p>
              <p className="text-sm text-stone-600 mt-2">{loadingText}</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="text-center py-16">
              <p className="text-xl text-red-400">{error}</p>
            </div>
          )}

          {/* Song content */}
          {songHtml && (
            <div>
              {songKey && (
                <div className="mb-4 text-stone-400 text-sm">
                  Key: <span className="font-bold" style={{ color: '#1DB954' }}>{songKey}</span>
                </div>
              )}
              <div
                dangerouslySetInnerHTML={{ __html: songHtml }}
                className="lyric-content"
              />
              {chartUrl && (
                <div className="mt-8 pt-8 border-t border-stone-800">
                  <a
                    href={chartUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg hover:opacity-90 transition-opacity text-white"
                    style={{ backgroundColor: '#1DB954' }}
                  >
                    View Full Chart PDF
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .section-anchor {
          position: sticky; top: 0; z-index: 10;
          background: rgba(28, 25, 23, 0.95);
          backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(29, 185, 84, 0.3);
          padding: 0.5rem 1rem;
          margin: 1rem 0 0.5rem 0;
          font-weight: 700; color: #1DB954;
          font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .chord { color: #1DB954; font-family: 'Courier New', monospace; font-weight: 700; font-size: 0.8em; }
        .harmony-section { font-weight: 700; color: #6EE7B7; }
        .footnote-marker { color: #1DB954; font-weight: 600; margin: 0 1px; }
        .lyric-line { line-height: 2.2; white-space: pre-wrap; }
      `}</style>
    </div>
  );
}
