import AvailabilityPips from './AvailabilityPips.jsx';

const SHOW_COLOR = '#a78bfa';
const EVENT_TYPE_COLOR = {
  rehearsal: '#14b8a6',
  hold: '#f59e0b',
  deadline: '#ec4899',
  blackout: '#ef4444',
};

const TODAY_ACCENT = '#14b8a6';

/**
 * One day in the calendar grid. The whole cell is the tap target (≥44px in
 * both dimensions at every breakpoint the band uses — see min-height below).
 *
 * @param {{
 *   dateKey: string, date: Date, inMonth: boolean, isToday: boolean, isSelected: boolean,
 *   shows: Array, events: Array, members: Array<{id:string,name:string}>,
 *   states: Map<string,string>, onSelect: (dateKey:string) => void,
 * }} props
 */
export default function DayCell({ dateKey, date, inMonth, isToday, isSelected, shows, events, members, states, onSelect }) {
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const chips = [
    ...shows.map(s => ({ key: `show-${s.id}`, label: s.venue || 'Show', color: SHOW_COLOR })),
    ...events.map(e => ({ key: `evt-${e.id}`, label: e.title || e.type, color: EVENT_TYPE_COLOR[e.type] || '#888' })),
  ];
  const visibleChips = chips.slice(0, 2);
  const overflow = chips.length - visibleChips.length;

  return (
    <button
      type="button"
      onClick={() => onSelect(dateKey)}
      className="flex flex-col items-stretch text-left w-full min-h-[64px] sm:min-h-[88px] px-1.5 py-1 border-b border-r border-[#232323] transition-colors"
      style={{
        opacity: inMonth ? 1 : 0.35,
        background: isSelected
          ? `${TODAY_ACCENT}18`
          : isWeekend
          ? 'rgba(255,255,255,0.02)'
          : 'transparent',
        boxShadow: isSelected ? `inset 0 0 0 1px ${TODAY_ACCENT}60` : 'none',
      }}
    >
      <div className="flex items-center justify-between shrink-0">
        <span
          className="text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full"
          style={isToday ? { border: `1.5px solid ${TODAY_ACCENT}`, color: TODAY_ACCENT } : { color: '#999' }}
        >
          {date.getDate()}
        </span>
      </div>

      <div className="flex-1 flex flex-col gap-0.5 mt-1 min-w-0">
        {visibleChips.map(chip => (
          <span
            key={chip.key}
            className="flex items-center gap-1 text-[10px] leading-tight truncate"
            style={{ color: chip.color }}
          >
            <span className="w-1 h-1 rounded-full shrink-0" style={{ background: chip.color }} />
            <span className="truncate">{chip.label}</span>
          </span>
        ))}
        {overflow > 0 && <span className="text-[10px] text-[#666]">+{overflow} more</span>}
      </div>

      <div className="shrink-0 mt-1">
        <div className="hidden sm:flex">
          <AvailabilityPips members={members} states={states} variant="full" />
        </div>
        <div className="flex sm:hidden">
          <AvailabilityPips members={members} states={states} variant="compact" />
        </div>
      </div>
    </button>
  );
}
