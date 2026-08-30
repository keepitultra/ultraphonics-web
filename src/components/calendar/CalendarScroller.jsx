import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useEffect } from 'react';
import MonthGrid from './MonthGrid.jsx';

/**
 * The continuously-scrolling month list. Renders a bounded, non-virtualized
 * stack of MonthGrids (a year+ of months is a few hundred cheap cells — see
 * src/utils/availability.js monthGridDays — so virtualizing buys nothing and
 * costs sticky-header/scrollIntoView correctness).
 *
 * Two IntersectionObserver sentinels ask the parent to widen the rendered
 * range as the user nears either edge. Prepending months above the viewport
 * is the one real hazard (iOS Safari doesn't reliably apply CSS scroll
 * anchoring in a nested scroller), so a prepend's height delta is captured
 * synchronously before the parent's state update and applied to scrollTop in
 * a layout effect, before paint.
 *
 * @param {{
 *   months: string[], members: Array, availabilityByMonth: Map<string, Map<string,object>>,
 *   showsByDate: Map<string,Array>, eventsByDate: Map<string,Array>,
 *   selectedDate: string, onSelectDate: (d:string)=>void, todayKey: string,
 *   onNeedPast?: () => void, onNeedFuture?: () => void,
 * }} props
 */
const CalendarScroller = forwardRef(function CalendarScroller(props, ref) {
  const {
    months, members, availabilityByMonth, showsByDate, eventsByDate,
    selectedDate, onSelectDate, todayKey, onNeedPast, onNeedFuture,
  } = props;

  const scrollerRef = useRef(null);
  const topSentinelRef = useRef(null);
  const bottomSentinelRef = useRef(null);
  const monthNodeRefs = useRef(new Map());
  const pendingPrependHeight = useRef(null);
  const prevFirstMonth = useRef(months[0]);
  const lockPast = useRef(false);
  const lockFuture = useRef(false);

  useImperativeHandle(ref, () => ({
    scrollToMonth(month, opts = {}) {
      const el = monthNodeRefs.current.get(month);
      if (el) el.scrollIntoView({ block: 'start', behavior: opts.smooth ? 'smooth' : 'auto' });
    },
  }));

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return undefined;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        if (entry.target === topSentinelRef.current && !lockPast.current) {
          lockPast.current = true;
          // Capture height BEFORE the parent's state update lands, so the
          // layout effect below can compute exactly how much content was
          // prepended and offset scrollTop by that amount.
          pendingPrependHeight.current = root.scrollHeight;
          onNeedPast?.();
        }
        if (entry.target === bottomSentinelRef.current && !lockFuture.current) {
          lockFuture.current = true;
          onNeedFuture?.();
        }
      }
    }, { root, rootMargin: '400px 0px 400px 0px' });
    if (topSentinelRef.current) io.observe(topSentinelRef.current);
    if (bottomSentinelRef.current) io.observe(bottomSentinelRef.current);
    return () => io.disconnect();
  }, [onNeedPast, onNeedFuture]);

  // Runs before paint whenever the rendered month list changes.
  useLayoutEffect(() => {
    const root = scrollerRef.current;
    if (months[0] !== prevFirstMonth.current) {
      if (root && pendingPrependHeight.current != null) {
        const delta = root.scrollHeight - pendingPrependHeight.current;
        root.scrollTop += delta;
      }
      pendingPrependHeight.current = null;
      prevFirstMonth.current = months[0];
    }
    // Release the sentinel locks a beat after render settles, so a genuine
    // scroll back to an edge can trigger another extension. If the parent
    // declined to extend (the ~48-month cap), `months` won't change and this
    // effect won't rerun, so the lock simply stays engaged — a deliberate
    // stop, not a bug.
    const t = setTimeout(() => { lockPast.current = false; lockFuture.current = false; }, 50);
    return () => clearTimeout(t);
  }, [months]);

  return (
    <div
      ref={scrollerRef}
      className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div ref={topSentinelRef} style={{ height: 1 }} />
      {months.map(month => (
        <MonthGrid
          key={month}
          month={month}
          monthRef={el => {
            if (el) monthNodeRefs.current.set(month, el);
            else monthNodeRefs.current.delete(month);
          }}
          members={members}
          docsByMember={availabilityByMonth.get(month) || new Map()}
          showsByDate={showsByDate}
          eventsByDate={eventsByDate}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          todayKey={todayKey}
        />
      ))}
      <div ref={bottomSentinelRef} style={{ height: 1 }} />
    </div>
  );
});

export default CalendarScroller;
