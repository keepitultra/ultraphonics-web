/**
 * Utility to parse and transform band-specific lyric syntax
 */

export const NOTES_REGEX = /\[\[(.*?)\]\]/g;
export const HARMONY_REGEX = /\*\*(.*?)\*\*/g;
export const CHORD_REGEX = /\[([^\]]+)\]/g;

const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_TO_SHARP: Record<string, string> = { 'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B' };
const SHARP_TO_FLAT: Record<string, string> = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };

const SECTION_KEYWORDS = ['intro', 'verse', 'chorus', 'bridge', 'outro', 'pre-chorus', 'prechorus', 'hook', 'interlude', 'solo', 'coda', 'tag', 'breakdown', 'instrumental', 'vamp'];

function isSectionKeyword(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return SECTION_KEYWORDS.some(kw => lower === kw || (lower.startsWith(kw) && /^\s*\d*$/.test(lower.slice(kw.length))));
}

export const transposeChord = (chord: string, semitones: number): string => {
  const match = chord.match(/^([A-G][#b]?)(.*)/);
  if (!match) return chord;
  let root = match[1];
  const suffix = match[2];
  const normalized = FLAT_TO_SHARP[root] || root;
  const idx = CHROMATIC.indexOf(normalized);
  if (idx === -1) return chord;
  const newIdx = ((idx + semitones) % 12 + 12) % 12;
  const newRoot = CHROMATIC[newIdx];
  const usedFlat = root.includes('b');
  const displayRoot = usedFlat && SHARP_TO_FLAT[newRoot] ? SHARP_TO_FLAT[newRoot] : newRoot;
  return displayRoot + suffix;
};

/**
 * Parses raw text into a structured object for the UI
 */
export const parseSongData = (rawText: string, isGuitarMode = false, capo = 0): { html: string; footnotes: string[] } => {
  if (!rawText) return { html: '<p class="lp-empty">No lyrics added yet.</p>', footnotes: [] };

  const notes: string[] = [];
  const capoOffset = isGuitarMode && capo ? -capo : 0;

  const lines = rawText.split('\n');
  const htmlLines = lines.map(line => {
    // Escape HTML
    const div = { innerHTML: '' };
    let processed = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 1. Footnotes [[Note]]
    processed = processed.replace(/\[\[(.*?)\]\]/g, (_m, content) => {
      notes.push(content);
      return `<sup class="lp-footnote" data-index="${notes.length}" title="${content}">${notes.length}</sup>`;
    });

    // 2. Harmonies **text**
    processed = processed.replace(/\*\*(.*?)\*\*/g, (_m, content) => {
      return `<span class="lp-harmony">${content}</span>`;
    });

    // 3. Brackets: section keywords or chords
    const segments = processed.split(/(\[[^\]]+\])/g);
    let result = '';
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const bracketMatch = seg.match(/^\[([^\]]+)\]$/);
      if (bracketMatch) {
        const content = bracketMatch[1];
        if (isSectionKeyword(content)) {
          const sectionId = 'section-' + content.toLowerCase().replace(/\s+/g, '-');
          result += `</div><div class="lp-section" id="${sectionId}">${content}</div><div class="lp-line">`;
        } else {
          const transposed = capoOffset !== 0 ? transposeChord(content, capoOffset) : content;
          const next = i + 1 < segments.length ? segments[i + 1] : '';
          const isBracketNext = next.match(/^\[/);
          const followText = (!isBracketNext && next) ? next : '';
          if (followText) i++;
          result += `<span class="lp-cw"><span class="lp-chord">${transposed}</span>${followText}</span>`;
        }
      } else {
        result += seg;
      }
    }

    return result;
  });

  let html = '<div class="lp-line">' + htmlLines.join('\n') + '</div>';
  html = html.replace(/<div class="lp-line"><\/div>/g, '');
  html = html.replace(/\n/g, '<br>');

  return { html, footnotes: notes };
};