import { Link } from 'react-router-dom';
import { trackEvent } from '../analytics.js';

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
  const time = show.startTime?.replace(':00', '') || '';
  const linkText = `${venueText}, ${city}${state ? ', ' + state : ''}`;

  const handleClick = () => {
    trackEvent('view_show_details', {
      event_category: 'Schedule',
      event_label: show.venue?.trim(),
      show_date: show.date,
    });
  };

  return (
    <div>
      {formattedDate} •{' '}
      <Link to={`/events/${show.id}`} className="venue-link" onClick={handleClick}>
        {linkText}
      </Link>
      {time ? ` • ${time}` : ''}
    </div>
  );
}
