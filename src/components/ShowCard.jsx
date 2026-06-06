import { Link } from 'react-router-dom';
import { trackEvent } from '../analytics.js';
import { parseLocalDateOnly, parseTimeToHM } from '../utils.js';

function formatTime12(timeStr) {
  if (!timeStr) return '';
  const { hours, minutes, isAM, isPM } = parseTimeToHM(timeStr.trim());
  if (isNaN(hours)) return '';
  const usePM = isPM || (!isAM && hours >= 12);
  const h = hours % 12 || 12;
  const m = minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`;
  return `${h}${m} ${usePM ? 'PM' : 'AM'}`;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  if (isNaN(date)) return 'Date TBD';
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}`;
}

export default function ShowCard({ show }) {
  const formattedDate = formatDate(show.date);

  if (show.isPrivate) {
    return <div>{formattedDate} • Private Event</div>;
  }

  const venueText = show.venue?.trim() || 'Venue TBD';
  const city = show.city || '';
  const state = show.state || '';
  const time = formatTime12(show.startTime);
  const linkText = `${venueText}, ${city}${state ? ', ' + state : ''}`;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const showDate = show.date ? parseLocalDateOnly(show.date) : null;
  const isPast = showDate && !isNaN(showDate) ? showDate < today : false;

  const handleClick = () => {
    trackEvent('view_show_details', {
      event_category: 'Schedule',
      event_label: show.venue?.trim(),
      show_date: show.date,
    });
  };

  return (
    <div style={ isPast ? { opacity: 0.5 } : undefined }>
      {formattedDate} •{' '}
      <Link
        to={`/events/${show.id}`}
        className="venue-link"
        onClick={handleClick}
        style={isPast ? { textDecoration: 'line-through', textDecorationThickness: '1px' } : undefined}
      >
        {linkText}
      </Link>
      {time ? ` • ${time}` : ''}
    </div>
  );
}
