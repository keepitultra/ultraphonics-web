import { Link } from 'react-router-dom';

const services = [
  {
    img: '/images/Weddings.png',
    alt: 'Weddings & Private Events',
    title: 'Weddings & Private Events',
    description:
      'Make your special day unforgettable with a playlist that spans generations. We provide the perfect soundtrack for every moment, from the first dance to the final encore.',
    features: [
      'Customized setlists including your special requests.',
      'MC services to handle announcements and flow.',
      'Full sound and lighting tailored to the venue size.',
      'Options for cocktail hour and ceremony music.',
    ],
    cta: <Link to="/weddings" className="button service-card-btn" style={{ fontSize: '1rem', padding: '0.5rem 1rem' }}>Learn more</Link>,
  },
  {
    img: '/images/Corporate.png',
    alt: 'Corporate Parties & Holiday Events',
    attribution: 'Photo: Justin Collins-Domansky',
    title: 'Corporate Parties & Holiday Events',
    description:
      'Professional, high-energy entertainment for your company gatherings. We understand the balance between providing a background atmosphere and creating dance-floor energy when the time is right.',
    features: [
      'Scalable band sizes to fit your budget and space.',
      'Professional attire and demeanor.',
      'Wireless microphone availability for speeches and awards.',
      'Flexible scheduling to match your itinerary.',
    ],
  },
  {
    img: '/images/UltraphonicsLivePromoPic3.png',
    alt: 'Bar & Brewery Sets',
    attribution: 'Photo: Emily Yates',
    title: 'Bar & Brewery Sets',
    description:
      "Keep the drinks flowing and the patrons dancing. We bring a 'night out' vibe that keeps customers engaged and staying longer.",
    features: [
      '3-4 hour marathon sets with minimal breaks.',
      'Crowd-interactive sing-alongs (Rock, Pop, Country, Soul).',
      'Social media promotion to our local following.',
      'Volume control appropriate for the venue.',
    ],
  },
  {
    img: '/images/UltraphonicsLivePromoPic5.jpg',
    alt: 'Music Halls & Festivals',
    attribution: 'Photo: Karin Maurer',
    title: 'Music Halls & Festivals',
    description:
      'Big stage energy for larger crowds. We have the experience to handle professional stage plots, quick changeovers, and high-fidelity sound requirements.',
    features: [
      'Tight, rehearsed show tailored to specific time slots.',
      'Professional gear compatible with festival backlines.',
      'Original music options available upon request.',
      'Promo materials available for marketing.',
    ],
  },
];

export default function Services() {
  return (
    <main style={{ position: 'relative' }}>
      <Link to="/quote" className="permanent-contact-link">
        Request a Quote
      </Link>

      <div className="page-header services-page-header">
        <Link to="/">
          <img src="/images/logo-color.png" alt="Ultraphonics Logo" className="page-logo" />
        </Link>
        <h1 className="page-title">Our Services</h1>
        <p className="page-lead">High-energy live entertainment tailored to your specific event needs.</p>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <Link to="/quote" className="button">
          Start Your Inquiry
        </Link>
      </div>

      <div className="services-container">
        {services.map((svc) => (
          <div key={svc.title} className="service-card">
            <div className="service-image-container">
              <img src={svc.img} alt={svc.alt} className="service-image" loading="lazy" />
              {svc.attribution && <div className="photo-attribution">{svc.attribution}</div>}
            </div>
            <div className="service-content">
              <h2 className="service-title">{svc.title}</h2>
              <p className="service-description">{svc.description}</p>
              <ul className="service-features">
                {svc.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {svc.cta && <div style={{ marginTop: '1rem' }}>{svc.cta}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="cta-container" style={{ marginBottom: '4rem' }}>
        <Link to="/quote" className="button" style={{ fontSize: '1.2rem', padding: '1rem 2rem' }}>
          Book Now
        </Link>
      </div>
    </main>
  );
}
