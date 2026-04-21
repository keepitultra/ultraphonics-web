import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { config } from '../config.js';

const { emailjs: ejs } = config.ids;
const TOTAL_STEPS = 5;

export default function QuoteRequest() {
  const formRef = useRef(null);
  const [step, setStep] = useState(1);
  const [showOther, setShowOther] = useState(false);
  const [status, setStatus] = useState({ text: '', color: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [searchParams] = useSearchParams();

  // Auto-select event type from URL param
  useEffect(() => {
    const eventType = searchParams.get('event_type');
    if (eventType && formRef.current) {
      const val = eventType.charAt(0).toUpperCase() + eventType.slice(1).toLowerCase();
      const radio = formRef.current.querySelector(`input[name="event_type"][value="${val}"]`);
      if (radio) radio.checked = true;
    }
  }, [searchParams]);

  // Load EmailJS
  useEffect(() => {
    if (window.emailjs) {
      window.emailjs.init({ publicKey: ejs.publicKey });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
    script.onload = () => window.emailjs.init({ publicKey: ejs.publicKey });
    document.head.appendChild(script);
  }, []);

  function validateStep(stepNum) {
    if (!formRef.current) return true;
    const stepEl = formRef.current.querySelector(`#step-${stepNum}`);
    if (!stepEl) return true;

    let valid = true;
    stepEl.querySelectorAll('input[required], select[required]').forEach((input) => {
      if (!input.value.trim()) {
        valid = false;
        input.style.borderColor = 'red';
        input.addEventListener('input', () => { input.style.borderColor = ''; }, { once: true });
      }
    });

    if (stepNum === 2) {
      const checked = stepEl.querySelector('input[name="event_type"]:checked');
      const radios = stepEl.querySelectorAll('input[name="event_type"]');
      if (radios.length > 0 && !checked) {
        valid = false;
        alert('Please select an event type.');
      }
    }
    return valid;
  }

  function goNext() {
    if (validateStep(step)) {
      setStep((s) => Math.min(s + 1, TOTAL_STEPS));
      window.scrollTo(0, 0);
    }
  }

  function goPrev() {
    setStep((s) => Math.max(s - 1, 1));
    window.scrollTo(0, 0);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!window.emailjs) {
      setStatus({ text: 'Error: EmailJS not configured.', color: 'red' });
      return;
    }
    setSubmitting(true);
    setStatus({ text: '', color: '' });
    try {
      await window.emailjs.sendForm(ejs.serviceId, ejs.quoteTemplateId, formRef.current);
      setStatus({
        text: 'Thank you! We have received your inquiry and will be in touch shortly.',
        color: 'var(--color-accent)',
      });
      formRef.current.reset();
      setSubmitted(true);
    } catch (err) {
      console.error('EmailJS error:', err);
      setStatus({ text: 'Oops! There was a problem submitting your form.', color: 'red' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ position: 'relative' }}>
      <Link to="/contact" className="permanent-contact-link">
        Need general info? Contact Us
      </Link>

      <div className="quote-container">
        <div className="page-header">
          <Link to="/">
            <img src="/images/logo-color.png" alt="Ultraphonics Logo" className="page-logo" />
          </Link>
          <h1 className="page-title">Event Inquiry</h1>
          <p className="page-lead">Tell us about your event to get a fast, accurate quote.</p>
        </div>

        {/* Progress dots */}
        <div className="progress-indicator">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`progress-step${i < step ? ' active' : ''}`}
              id={`p-${i + 1}`}
            />
          ))}
        </div>

        <form
          ref={formRef}
          id="quote-form"
          className="contact-form"
          style={{ background: 'transparent', boxShadow: 'none', padding: 0 }}
          onSubmit={handleSubmit}
        >
          {/* Step 1 */}
          <div className={`step-content${step === 1 ? ' active' : ''}`} id="step-1">
            <div className="form-section">
              <h3>Step 1: Contact Details</h3>
              <div className="input-row">
                <div className="input-group">
                  <label className="text-label" htmlFor="name">Name *</label>
                  <input type="text" id="name" name="name" required placeholder="Your Name" />
                </div>
                <div className="input-group">
                  <label className="text-label" htmlFor="email">Email *</label>
                  <input type="email" id="email" name="email" required placeholder="you@example.com" />
                </div>
              </div>
              <div className="input-group">
                <label className="text-label" htmlFor="phone">Phone Number</label>
                <input type="tel" id="phone" name="phone" placeholder="(555) 555-5555" />
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className={`step-content${step === 2 ? ' active' : ''}`} id="step-2">
            <div className="form-section">
              <h3>Step 2: Event Basics</h3>
              <label className="text-label">Event Type *</label>
              <div className="options-grid">
                {[
                  { id: 'et_wedding', value: 'Wedding', label: 'Wedding' },
                  { id: 'et_corporate', value: 'Corporate', label: 'Corporate' },
                  { id: 'et_party', value: 'Private Party', label: 'Private Party' },
                  { id: 'et_festival', value: 'Festival', label: 'Festival / Public' },
                  { id: 'et_other', value: 'Other', label: 'Other' },
                ].map(({ id, value, label }) => (
                  <span key={id}>
                    <input
                      type="radio"
                      name="event_type"
                      id={id}
                      value={value}
                      className="tile-input"
                      required={value === 'Wedding'}
                      onChange={(e) => setShowOther(e.target.value === 'Other')}
                    />
                    <label htmlFor={id} className="tile-label">{label}</label>
                  </span>
                ))}
              </div>
              {showOther && (
                <div className="other-input-container">
                  <input type="text" name="event_type_other" placeholder="Please specify event type" />
                </div>
              )}

              <div className="input-row" style={{ marginTop: '1.5rem' }}>
                <div className="input-group">
                  <label className="text-label" htmlFor="date">Event Date *</label>
                  <input type="date" id="date" name="date" required />
                </div>
                <div className="input-group">
                  <label className="text-label" htmlFor="city">City &amp; State *</label>
                  <input type="text" id="city" name="location" required placeholder="e.g. Detroit, MI" />
                </div>
              </div>
              <div className="input-group">
                <label className="text-label" htmlFor="venue">Venue Name (Optional)</label>
                <input type="text" id="venue" name="venue" placeholder="e.g. The Fillmore" />
              </div>

              <label className="text-label">Setting</label>
              <div className="options-grid">
                {[
                  { id: 'set_indoor', value: 'Indoor', label: 'Indoor' },
                  { id: 'set_outdoor', value: 'Outdoor', label: 'Outdoor' },
                  { id: 'set_both', value: 'Both', label: 'Both' },
                ].map(({ id, value, label }) => (
                  <span key={id}>
                    <input type="radio" name="setting" id={id} value={value} className="tile-input" />
                    <label htmlFor={id} className="tile-label">{label}</label>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className={`step-content${step === 3 ? ' active' : ''}`} id="step-3">
            <div className="form-section">
              <h3>Step 3: Logistics &amp; Size</h3>
              <label className="text-label">Estimated Guest Count</label>
              <div className="options-grid">
                {[
                  { id: 'g_50', value: 'Under 50', label: 'Under 50' },
                  { id: 'g_100', value: '50-100', label: '50-100' },
                  { id: 'g_200', value: '100-200', label: '100-200' },
                  { id: 'g_300', value: '200+', label: '200+' },
                ].map(({ id, value, label }) => (
                  <span key={id}>
                    <input type="radio" name="guests" id={id} value={value} className="tile-input" />
                    <label htmlFor={id} className="tile-label">{label}</label>
                  </span>
                ))}
              </div>

              <div className="input-row" style={{ marginTop: '1.5rem' }}>
                <div className="input-group">
                  <label className="text-label">Total Entertainment Time</label>
                  <select name="duration">
                    <option value="" disabled>Select duration...</option>
                    <option value="1-2 hrs">1-2 hrs</option>
                    <option value="3-4 hrs">3-4 hrs</option>
                    <option value="4-5 hrs">4-5 hrs</option>
                    <option value="5+ hrs">5+ hrs</option>
                  </select>
                </div>
                <div className="input-group">
                  <label className="text-label">Is there a hard stop time?</label>
                  <select name="hard_stop">
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                    <option value="Unsure">Unsure</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div className={`step-content${step === 4 ? ' active' : ''}`} id="step-4">
            <div className="form-section">
              <h3>Step 4: Band &amp; Music Preferences</h3>
              <label className="text-label">Preferred Band Size</label>
              <div className="options-grid">
                {[
                  { id: 'bs_duo', value: 'Solo/Duo', label: 'Solo / Duo' },
                  { id: 'bs_small', value: 'Small (3-4)', label: 'Small (3-4)' },
                  { id: 'bs_med', value: 'Medium (5-6)', label: 'Medium (5-6)', defaultChecked: true },
                  { id: 'bs_large', value: 'Large (7+)', label: 'Large (7+)' },
                ].map(({ id, value, label, defaultChecked }) => (
                  <span key={id}>
                    <input type="radio" name="band_size" id={id} value={value} className="tile-input" defaultChecked={defaultChecked} />
                    <label htmlFor={id} className="tile-label">{label}</label>
                  </span>
                ))}
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <input type="checkbox" name="open_to_rec" id="open_to_rec" value="Yes" />
                <label htmlFor="open_to_rec" style={{ color: '#ccc', fontSize: '0.9rem' }}>
                  I'm open to recommendations based on my venue/budget.
                </label>
              </div>

              <label className="text-label" style={{ marginTop: '1.5rem' }}>Services Needed</label>
              <div className="options-grid">
                {[
                  { id: 'svc_band', value: 'Live Band', label: 'Live Band', defaultChecked: true },
                  { id: 'svc_cocktail', value: 'Cocktail Hour', label: 'Cocktail Hour' },
                  { id: 'svc_ceremony', value: 'Ceremony', label: 'Ceremony Music' },
                  { id: 'svc_mc', value: 'MC Services', label: 'MC Services' },
                ].map(({ id, value, label, defaultChecked }) => (
                  <span key={id}>
                    <input type="checkbox" name="services" id={id} value={value} className="tile-input" defaultChecked={defaultChecked} />
                    <label htmlFor={id} className="tile-label">{label}</label>
                  </span>
                ))}
              </div>

              <label className="text-label" style={{ marginTop: '1.5rem' }}>Preferred Genres</label>
              <div className="options-grid">
                {[
                  { id: 'gen_rock', value: 'Rock', label: 'Classic Rock' },
                  { id: 'gen_pop', value: 'Pop', label: 'Pop / Top 40' },
                  { id: 'gen_motown', value: 'Motown', label: 'Motown / Soul' },
                  { id: 'gen_country', value: 'Country', label: 'Country' },
                  { id: 'gen_90s', value: '90s', label: '90s / 2000s' },
                ].map(({ id, value, label }) => (
                  <span key={id}>
                    <input type="checkbox" name="genres" id={id} value={value} className="tile-input" />
                    <label htmlFor={id} className="tile-label">{label}</label>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Step 5 */}
          <div className={`step-content${step === 5 ? ' active' : ''}`} id="step-5">
            <div className="form-section">
              <h3>Step 5: Production &amp; Budget</h3>
              <div className="input-row">
                <div className="input-group">
                  <label className="text-label">Sound System</label>
                  <select name="sound">
                    <option value="Band Provides">Band Provides</option>
                    <option value="Venue Provides">Venue Provides</option>
                    <option value="Unsure">Unsure</option>
                  </select>
                </div>
                <div className="input-group">
                  <label className="text-label">Lighting</label>
                  <select name="lighting">
                    <option value="Basic">Basic (Stage Wash)</option>
                    <option value="Enhanced">Enhanced (Party Lights)</option>
                    <option value="None">None</option>
                  </select>
                </div>
              </div>
              <div className="input-row">
                <div className="input-group">
                  <label className="text-label">Estimated Budget</label>
                  <select name="budget">
                    <option value="Under $2k">Under $2,000</option>
                    <option value="$2k-$4k">$2,000 - $4,000</option>
                    <option value="$4k-$6k">$4,000 - $6,000</option>
                    <option value="$6k+">$6,000+</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
                <div className="input-group">
                  <label className="text-label">Urgency</label>
                  <select name="urgency">
                    <option value="Information Gathering">Just gathering info</option>
                    <option value="Ready to Book">Ready to book soon</option>
                    <option value="Immediate">Immediate</option>
                  </select>
                </div>
              </div>
              <div className="input-group">
                <label className="text-label" htmlFor="notes">Final Notes / Specific Requests</label>
                <textarea id="notes" name="notes" rows="4" placeholder="Anything else we should know?" />
              </div>
            </div>
          </div>

          {/* Navigation */}
          {!submitted && (
            <div className="form-navigation">
              {step > 1 && (
                <button type="button" className="nav-btn btn-back" onClick={goPrev}>
                  Back
                </button>
              )}
              {step < TOTAL_STEPS && (
                <button type="button" className="nav-btn btn-next" onClick={goNext}>
                  Next
                </button>
              )}
              {step === TOTAL_STEPS && (
                <button
                  type="submit"
                  className="button submit-button"
                  style={{ width: 'auto', minWidth: '150px' }}
                  disabled={submitting}
                >
                  {submitting ? 'Sending...' : 'Request Quote'}
                </button>
              )}
            </div>
          )}

          {status.text && (
            <p className="form-status" style={{ color: status.color, marginTop: '1rem', textAlign: 'center' }}>
              {status.text}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
