import { Link } from 'react-router-dom';

const sections = [
  {
    img: '/images/Ceremony.png',
    alt: 'The Ceremony',
    title: 'The Ceremony',
    description:
      'Set the perfect tone for your vows. We provide crystal-clear audio support and musical accompaniment for your ceremony.',
    features: [
      'Wireless lavalier microphones for the officiant and couple.',
      'Custom playlist curation for seating and processionals.',
      'Acoustic guitar or piano duo options available.',
    ],
  },
  {
    img: '/images/Cocktail.png',
    alt: 'Cocktail Hour',
    title: 'Cocktail Hour',
    description:
      'Transition smoothly from the ceremony to the party. We keep the energy light and social while your guests mingle.',
    features: [
      'Acoustic duo or jazz trio configurations.',
      'Curated background playlists (Motown, Soft Rock, Jazz).',
      'Separate sound system setup if location differs from reception.',
      'Volume management to ensure comfortable conversation.',
    ],
  },
  {
    img: '/images/Reception.png',
    alt: 'The Reception',
    title: 'The Reception',
    description:
      "This is where the memories are made. We read the room and build the energy until the dance floor is packed.",
    features: [
      'High-energy full band performance (3-4 hours).',
      'Professional stage lighting and dance floor wash.',
      "Learning your specific 'First Dance' and 'Parent Dance' songs.",
      'MC services for introductions, toasts, and cake cutting.',
    ],
  },
  {
    img: '/images/Production.png',
    alt: 'Seamless Production',
    title: 'Seamless Production',
    description: "We handle the technical details so you don't have to worry about a thing.",
    features: [
      'Early arrival and setup before guests arrive.',
      'Coordination with your wedding planner and venue staff.',
      'Top-tier professional sound equipment.',
    ],
  },
];

export default function Weddings() {
  return (
    <main style={{ position: 'relative' }}>
      <Link to="/quote?event_type=wedding" className="permanent-contact-link">
        Request a Quote
      </Link>

      <div className="page-header services-page-header">
        <Link to="/">
          <img src="/images/logo-color.png" alt="Ultraphonics Logo" className="page-logo" />
        </Link>
        <h1 className="page-title">Weddings</h1>
        <p className="page-lead">Your perfect day deserves the perfect soundtrack.</p>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <Link to="/quote?event_type=wedding" className="button">
          Check Availability
        </Link>
      </div>

      <div className="services-container">
        {sections.map((s) => (
          <div key={s.title} className="service-card">
            <div className="service-image-container">
              <img src={s.img} alt={s.alt} className="service-image" loading="lazy" />
            </div>
            <div className="service-content">
              <h2 className="service-title">{s.title}</h2>
              <p className="service-description">{s.description}</p>
              <ul className="service-features">
                {s.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {/* CTA block */}
      <div
        style={{
          width: '100%',
          maxWidth: '1100px',
          margin: '4rem auto 3rem',
          padding: '3.5rem 1rem',
          background: '#1a1a1a',
          borderRadius: '12px',
          border: '2px solid rgba(0, 255, 255, 0.3)',
          boxShadow: '0 0 20px rgba(0, 255, 255, 0.2)',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        <h2 style={{ fontSize: '2.2rem', fontWeight: 700, marginBottom: '1rem', color: '#00ddde' }}>
          Ready to book?
        </h2>
        <p style={{ fontSize: '1.2rem', color: '#ccc', marginBottom: '2rem', lineHeight: 1.6 }}>
          Let's build something memorable.
        </p>
        <Link
          to="/quote?event_type=wedding"
          className="button"
          style={{ fontSize: '1.3rem', padding: '1.2rem 2.5rem' }}
        >
          Get a Quote
        </Link>
      </div>

      {/* Download flyer */}
      <div
        style={{ maxWidth: '800px', margin: '0 auto 4rem', padding: '2.5rem', textAlign: 'center' }}
      >
        <h2 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '1rem', color: '#fff' }}>
          Take Our Info With You
        </h2>
        <p style={{ fontSize: '1.05rem', color: '#ccc', marginBottom: '2rem', lineHeight: 1.6 }}>
          Download our wedding flyer to share with your wedding planner, venue coordinator, vendors,
          or friends and family.
        </p>
        <a
          href="https://drive.google.com/uc?export=download&id=1bWRFo-jjNmDgwRvIipIfAZvL9sYcf_y6"
          className="button button-outline"
          style={{ fontSize: '1.1rem', padding: '1rem 2.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.75rem' }}
          download
        >
          <span>Download Wedding Flyer</span>
        </a>
      </div>
    </main>
  );
}
