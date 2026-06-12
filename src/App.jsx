import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Navigation from './components/Navigation.jsx';
import Footer from './components/Footer.jsx';
import ScrollToTop from './components/ScrollToTop.jsx';
import { AdminDrawerProvider } from './components/admin/AdminShell.jsx';

// Public pages
import Home from './pages/Home.jsx';
import Services from './pages/Services.jsx';
import Weddings from './pages/Weddings.jsx';
import Contact from './pages/Contact.jsx';
import QuoteRequest from './pages/QuoteRequest.jsx';
import MediaKit from './pages/MediaKit.jsx';
import LiveViewer from './pages/LiveViewer.jsx';
import EventPage from './pages/EventPage.jsx';
import SongRequest from './pages/SongRequest.jsx';

// Admin
import AdminRouter from './pages/admin/index.jsx';
import SetlistManager from './pages/SetlistManager.jsx';
import SongManager from './pages/SongManager.jsx';
import ClientManager from './pages/ClientManager.jsx';
import ShowManager from './pages/ShowManager.jsx';
import SongRequestsManager from './pages/SongRequestsManager.jsx';

const APP_ROUTES = ['/setlists', '/songs', '/clients', '/shows', '/events', '/requests', '/request'];

function PublicLayout() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin');
  const isLive = pathname === '/live';
  const isApp = APP_ROUTES.some(r => pathname.startsWith(r));
  const isEvent = pathname.startsWith('/events');
  const hideChrome = isAdmin || isLive || isApp;
  const hideOrbs = isAdmin || isLive || (isApp && !isEvent);

  return (
    <>
      <ScrollToTop />
      {!hideOrbs && (
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
        <Route path="/events/:id" element={<EventPage />} />
        <Route path="/request" element={<SongRequest />} />
        <Route path="/admin/*" element={<AdminRouter />} />
        <Route path="/setlists" element={<AdminDrawerProvider><SetlistManager /></AdminDrawerProvider>} />
        <Route path="/songs" element={<AdminDrawerProvider><SongManager /></AdminDrawerProvider>} />
        <Route path="/clients" element={<AdminDrawerProvider><ClientManager /></AdminDrawerProvider>} />
        <Route path="/shows" element={<AdminDrawerProvider><ShowManager /></AdminDrawerProvider>} />
        <Route path="/requests" element={<AdminDrawerProvider><SongRequestsManager /></AdminDrawerProvider>} />
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
