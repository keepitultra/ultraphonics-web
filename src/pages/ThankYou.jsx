import { useEffect } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { trackEvent } from '../analytics.js';

/**
 * Shared confirmation page for the quote and contact forms.
 *
 * A real route rather than an inline status line: it gives the visitor a proper
 * end to the interaction, somewhere to go next, and a distinct URL that can be
 * used as a conversion target. gtag('config') only fires once on load, so SPA
 * navigation is not tracked automatically — the event below is what registers
 * the conversion.
 */
const VARIANTS = {
  quote: {
    icon: 'fa-calendar-check',
    title: 'Your inquiry is in',
    lead: "We've got your event details and we're already looking at the date.",
    next: [
      'One of us reads every inquiry personally — usually within a day, sooner in the evenings.',
      "We'll come back with availability, what we'd recommend for your event, and pricing.",
      'Anything you forgot to mention? Just reply to the confirmation email.',
    ],
  },
  contact: {
    icon: 'fa-paper-plane',
    title: 'Message sent',
    lead: "Thanks for getting in touch — we've got your message.",
    next: [
      "We'll get back to you within a day or so.",
      'If it turns out you want us for an event, a quote request gets you a faster, more detailed answer.',
    ],
  },
};

export default function ThankYou() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const from = searchParams.get('from') === 'contact' ? 'contact' : 'quote';
  const variant = VARIANTS[from];

  // Passed via navigate state, so it survives the redirect but not a refresh —
  // hence the fallback rather than a required value.
  const name = location.state?.name || '';
  const firstName = name.trim().split(/\s+/)[0] || '';

  useEffect(() => {
    trackEvent('generate_lead', { form: from });
  }, [from]);

  return (
    <main>
      <section className="content-section" style={{ minHeight: '70vh' }}>
        <div style={{ maxWidth: 620, margin: '0 auto', padding: '0 1rem' }}>

          <div
            style={{
              width: 84, height: 84, margin: '0 auto 1.5rem', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,221,222,0.12)', border: '2px solid rgba(0,221,222,0.4)',
            }}
          >
            <i className={`fas ${variant.icon}`} style={{ fontSize: '2rem', color: 'var(--color-accent)' }} />
          </div>

          <h1 className="section-heading" style={{ marginBottom: '0.5rem' }}>
            {firstName ? `Thanks, ${firstName}!` : 'Thank you!'}
          </h1>
          <p style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>{variant.title}</p>
          <p style={{ color: '#aaa', marginBottom: '2rem' }}>{variant.lead}</p>

          <div
            style={{
              textAlign: 'left', background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
              padding: '1.25rem 1.5rem', marginBottom: '2rem',
            }}
          >
            <p style={{
              fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase',
              color: 'var(--color-accent)', fontWeight: 700, marginBottom: '0.75rem',
            }}>
              What happens next
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {variant.next.map((line, i) => (
                <li key={i} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.6rem', color: '#ccc', lineHeight: 1.5 }}>
                  <i className="fas fa-check" style={{ color: 'var(--color-accent)', marginTop: 4, fontSize: '0.8rem' }} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Need us sooner? Email{' '}
            <a href="mailto:info@ultraphonicsmusic.com" style={{ color: 'var(--color-accent)' }}>
              info@ultraphonicsmusic.com
            </a>
          </p>

          <div className="cta-container" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <Link to="/" className="button">Back to Home</Link>
            <Link to="/#shows" className="button">Upcoming Shows</Link>
            {from === 'contact' && <Link to="/quote" className="button">Request a Quote</Link>}
            {from === 'quote' && <Link to="/band" className="button">Meet the Band</Link>}
          </div>
        </div>
      </section>
    </main>
  );
}
