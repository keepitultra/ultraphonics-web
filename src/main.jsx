import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './firebase/AuthContext.jsx';
import { initAnalyticsIfConsented } from './analytics.js';
import { config } from './config.js';

// Inject Google Analytics (gtag) only if the visitor already granted cookie consent.
initAnalyticsIfConsented(config);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
