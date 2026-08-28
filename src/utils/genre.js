export const GENRE_ORDER = ['Pop', 'Soul', 'Rock', 'Country', 'Other'];

export const GENRE_COLORS = {
  Pop:     { bg: '#ec489920', text: '#f9a8d4', border: '#ec489940' },
  Soul:    { bg: '#a855f720', text: '#d8b4fe', border: '#a855f740' },
  Rock:    { bg: '#22c55e20', text: '#86efac', border: '#22c55e40' },
  Country: { bg: '#eab30820', text: '#fde047', border: '#eab30840' },
  Other:   { bg: '#6b728020', text: '#d1d5db', border: '#6b728040' },
};

export function genreLabel(song) {
  const g = (song.genre || '').trim();
  if (!g) return 'Other';
  const lower = g.toLowerCase();
  if (['r&b', 'rnb', 'soul'].includes(lower)) return 'Soul';
  if (['classic rock', 'rock'].includes(lower)) return 'Rock';
  if (['country', 'folk', 'bluegrass'].includes(lower)) return 'Country';
  if (['pop'].includes(lower)) return 'Pop';
  return 'Other';
}
