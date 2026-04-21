import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { config } from '../config.js';

const { emailjs: ejs } = config.ids;

export default function Contact() {
  const formRef = useRef(null);
  const [status, setStatus] = useState({ text: '', type: '' });
  const [submitting, setSubmitting] = useState(false);

  // Load EmailJS SDK
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

  async function handleSubmit(e) {
    e.preventDefault();
    if (!window.emailjs) {
      setStatus({ text: 'Error: EmailJS not configured.', type: 'error' });
      return;
    }
    setSubmitting(true);
    setStatus({ text: '', type: '' });
    try {
      await window.emailjs.sendForm(ejs.serviceId, ejs.contactTemplateId, formRef.current);
      setStatus({ text: "Thanks! We've received your message and will follow up soon.", type: 'success' });
      formRef.current.reset();
    } catch (err) {
      console.error('EmailJS error:', err);
      setStatus({ text: 'Oops! There was a problem. Please try again or email us directly.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ position: 'relative' }}>
      <Link to="/quote" className="permanent-contact-link">
        Ready to book? Request a Quote
      </Link>

      <div className="contact-container">
        <div className="page-header">
          <Link to="/">
            <img src="/images/logo-color.png" alt="Ultraphonics Logo" className="page-logo" />
          </Link>
          <h1 className="page-title">Contact Us</h1>
          <p className="page-lead">Have a general question? Send us a message below.</p>
        </div>

        <form className="contact-form" id="contact-form" ref={formRef} onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input type="text" id="name" name="name" required placeholder="Your Name" />
          </div>
          <div className="form-group">
            <label htmlFor="phone">Phone Number</label>
            <input type="tel" id="phone" name="phone" placeholder="(555) 555-5555" />
          </div>
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input type="email" id="email" name="email" required placeholder="you@example.com" />
          </div>
          <div className="form-group">
            <label htmlFor="message">Message</label>
            <textarea id="message" name="message" rows="5" required placeholder="How can we help you?" />
          </div>
          <button type="submit" className="button submit-button" disabled={submitting}>
            {submitting ? 'Sending...' : status.type === 'success' ? 'Message Sent' : 'Send Message'}
          </button>
          {status.text && (
            <p className={`form-status ${status.type}`}>{status.text}</p>
          )}
        </form>

        <div className="contact-links">
          <h3>Other Ways to Connect</h3>
          <div className="contact-links-grid">
            <a href="mailto:info@ultraphonicsmusic.com" className="contact-link-item">
              <img src="/images/email.svg" alt="Email" className="button-logo" />
              info@ultraphonicsmusic.com
            </a>
            <a
              href="https://www.facebook.com/UltraphonicsMusic"
              target="_blank"
              rel="noopener noreferrer"
              className="contact-link-item"
            >
              <img src="/images/facebook-white.png" alt="Facebook" className="button-logo" />
              Message us on Facebook
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
