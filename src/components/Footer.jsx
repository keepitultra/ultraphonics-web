import { Link } from 'react-router-dom';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer>
      <div className="site-credits">
        <Link to="/contact" className="contact-link">
          Contact Us
        </Link>
        <br /><br />
        <p>&copy; {year} Ultraphonics, LLC</p>
        <p>Web Design by <a href="https://github.com/tdhckmn" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>Tom Hickman</a></p>
      </div>
    </footer>
  );
}
