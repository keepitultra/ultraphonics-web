import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { config } from '../config.js';

// Map old .html links → React Router paths
const PAGE_ROUTES = {
  'index.html': '/',
  'index.html#shows': '/#shows',
  'index.html#newsletter': '/#newsletter',
  'weddings.html': '/weddings',
  'services.html': '/services',
  'quote-request.html': '/quote',
  'contact.html': '/contact',
  'media-kit.html': '/media-kit',
  'live-viewer.html': '/live',
};

function resolveHref(link) {
  return PAGE_ROUTES[link] ?? link;
}

export default function Navigation() {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    setOpen((o) => {
      document.body.classList.toggle('modal-open', !o);
      return !o;
    });
  };

  const close = () => {
    setOpen(false);
    document.body.classList.remove('modal-open');
  };

  const pages = Object.values(config.pages).filter(
    (p) => !p.hide && p.link && p.label && !p.staging
  );

  return (
    <>
      <div className={`nav-overlay${open ? ' open' : ''}`} id="nav-overlay">
        <ul className="nav-list" id="nav-list">
          {pages.map((page) => {
            const href = resolveHref(page.link);
            const isInternal = href.startsWith('/');
            return (
              <li key={page.label} className="nav-item">
                {isInternal ? (
                  <Link to={href} className="nav-link" onClick={close}>
                    {page.label}
                  </Link>
                ) : (
                  <a href={href} className="nav-link" onClick={close}>
                    {page.label}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <button
        className={`hamburger-btn${open ? ' open' : ''}`}
        id="nav-toggle"
        aria-label="Toggle navigation"
        onClick={toggle}
      >
        <span className="hamburger-line" />
        <span className="hamburger-line" />
        <span className="hamburger-line" />
      </button>
    </>
  );
}
