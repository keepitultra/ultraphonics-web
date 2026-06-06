import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './firebase/AuthContext.jsx';
import { initAnalytics } from './analytics.js';
import { config } from './config.js';

// Inject Google Analytics (gtag) before render so page_view + events fire.
initAnalytics(config);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
