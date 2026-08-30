import { monthGridDays, rollUpDay } from '../../utils/availability.js';
import DayCell from './DayCell.jsx';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/**
 * One month's sticky header + 42-cell grid.
 *
 * @param {{
 *   month: string, monthRef?: (el: HTMLElement|null) => void,
 *   members: Array<{id:string,name:string}>, docsByMember: Map<string,object>,
 *   showsByDate: Map<string,Array>, eventsByDate: Map<string,Array>,
 *   selectedDate: string, onSelectDate: (d:string)=>void, todayKey: string,
 * }} props
 */
export default function MonthGrid({
  month, monthRef, members, docsByMember,
  showsByDate, eventsByDate, selectedDate, onSelectDate, todayKey,
}) {
  const days = monthGridDays(month);

  return (
    <div ref={monthRef} data-month={month}>
      <div className="sticky top-0 z-10 bg-[#121212] pt-3 pb-1 px-1">
        <h3 className="text-sm font-bold text-white px-1 mb-1.5">{monthLabel(month)}</h3>
        <div className="grid grid-cols-7 text-[10px] font-semibold text-[#555] uppercase tracking-wider">
          {WEEKDAY_LABELS.map(d => (
            <div key={d} className="px-1.5 py-1">{d}</div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-7 border-t border-l border-[#232323]">
        {days.map(day => {
          const { states } = rollUpDay(members, docsByMember, day.dateKey);
          return (
            <DayCell
              key={day.dateKey}
              dateKey={day.dateKey}
              date={day.date}
              inMonth={day.inMonth}
              isToday={day.dateKey === todayKey}
              isSelected={day.dateKey === selectedDate}
              shows={showsByDate.get(day.dateKey) || []}
              events={eventsByDate.get(day.dateKey) || []}
              members={members}
              states={states}
              onSelect={onSelectDate}
            />
          );
        })}
      </div>
    </div>
  );
}
