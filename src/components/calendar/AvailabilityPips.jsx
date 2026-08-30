import { STATE_META } from '../../utils/availability.js';

/**
 * A day cell's per-member availability roll-up.
 *
 * `variant="full"` — one 8px circle per member, in a fixed sort order shared
 * across every cell (position IS identity — that's what makes a 17-month
 * scroll scannable). `variant="compact"` — a 3-segment proportional bar plus
 * a red numeral, for widths too narrow to show 6 labelled circles honestly.
 *
 * @param {{ members: Array<{id:string,name:string}>, states: Map<string,string>, variant: 'full'|'compact' }} props
 */
export default function AvailabilityPips({ members, states, variant = 'full' }) {
  if (!members.length) return null;

  if (variant === 'compact') {
    const counts = { available: 0, maybe: 0, unavailable: 0, unknown: 0 };
    for (const m of members) counts[states.get(m.id) || 'unknown']++;
    const total = members.length;
    return (
      <div className="flex items-center gap-1 w-full">
        <div className="flex-1 h-1 rounded-full overflow-hidden flex bg-[#2a2a2a]">
          {counts.available > 0 && (
            <div style={{ width: `${(counts.available / total) * 100}%`, background: STATE_META.available.color }} />
          )}
          {counts.maybe > 0 && (
            <div style={{ width: `${(counts.maybe / total) * 100}%`, background: STATE_META.maybe.color }} />
          )}
          {counts.unavailable > 0 && (
            <div style={{ width: `${(counts.unavailable / total) * 100}%`, background: STATE_META.unavailable.color }} />
          )}
        </div>
        {counts.unavailable > 0 && (
          <span className="text-[9px] font-bold leading-none" style={{ color: STATE_META.unavailable.color }}>
            {counts.unavailable}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-[3px]">
      {members.map(m => {
        const state = states.get(m.id) || 'unknown';
        const meta = STATE_META[state];
        const filled = state === 'unavailable' || state === 'maybe';
        return (
          <span
            key={m.id}
            title={`${m.name} — ${meta.label}`}
            className="inline-block rounded-full shrink-0"
            style={{
              width: 8,
              height: 8,
              background: filled ? meta.color : 'transparent',
              border: `1.5px solid ${filled ? meta.color : meta.color}`,
              opacity: state === 'unknown' ? 0.5 : 1,
            }}
          />
        );
      })}
    </div>
  );
}
