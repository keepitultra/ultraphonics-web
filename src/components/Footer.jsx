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
        <p>Web Design by Tom Hickman</p>
      </div>
    </footer>
  );
}
