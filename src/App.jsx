import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Navigation from './components/Navigation.jsx';
import Footer from './components/Footer.jsx';
import ScrollToTop from './components/ScrollToTop.jsx';

// Public pages
import Home from './pages/Home.jsx';
import Services from './pages/Services.jsx';
import Weddings from './pages/Weddings.jsx';
import Contact from './pages/Contact.jsx';
import QuoteRequest from './pages/QuoteRequest.jsx';
import MediaKit from './pages/MediaKit.jsx';
import LiveViewer from './pages/LiveViewer.jsx';

// Admin
import AdminRouter from './pages/admin/index.jsx';
import SetlistManager from './pages/SetlistManager.jsx';
import SongManager from './pages/SongManager.jsx';
import ClientManager from './pages/ClientManager.jsx';

const APP_ROUTES = ['/setlists', '/songs', '/clients'];

function PublicLayout() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin');
  const isLive = pathname === '/live';
  const isApp = APP_ROUTES.some(r => pathname.startsWith(r));
  const hideChrome = isAdmin || isLive || isApp;

  return (
    <>
      <ScrollToTop />
      {!hideChrome && (
        <div style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden="true">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="hero-orb hero-orb-3" />
        </div>
      )}
      {!hideChrome && <Navigation />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<Services />} />
        <Route path="/weddings" element={<Weddings />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/quote" element={<QuoteRequest />} />
        <Route path="/media-kit" element={<MediaKit />} />
        <Route path="/live" element={<LiveViewer />} />
        <Route path="/admin/*" element={<AdminRouter />} />
        <Route path="/setlists" element={<SetlistManager />} />
        <Route path="/songs" element={<SongManager />} />
        <Route path="/clients" element={<ClientManager />} />
      </Routes>
      {!hideChrome && <Footer />}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <PublicLayout />
    </BrowserRouter>
  );
}
