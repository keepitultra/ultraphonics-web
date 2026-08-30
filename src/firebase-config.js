// Firebase configuration for Ultraphonics
// Initialized for use across all modules

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCqMRpeWfpj3Sv2SSd3nT5GkwK7NC3Ir7s",
  authDomain: "ultraphonics-web.firebaseapp.com",
  projectId: "ultraphonics-web",
  storageBucket: "ultraphonics-web.firebasestorage.app",
  messagingSenderId: "729950319293",
  appId: "1:729950319293:web:b75843574cc5bcec813dd4",
  measurementId: "G-FEL0XX8F65"
};

// OAuth Web client ID for Google Identity Services (used by the band calendar's
// "sync my calendar" feature — see src/services/googleCalendar.js). This is a
// SEPARATE credential from apiKey above: Firebase Auth's Google sign-in never
// hands back a refresh token, so a normal GIS token client is used instead,
// reusing the Web OAuth client Firebase already created for this project
// (prefix "729950319293-" matches messagingSenderId above, confirming it's
// the Firebase-created client and not a new one). Console setup (API enabled,
// authorized origins, calendar.freebusy scope + test users) done 2026-08-30.
const GOOGLE_OAUTH_CLIENT_ID = "729950319293-31prgd3lvb2nc3kogf82niorm3plv7pm.apps.googleusercontent.com";

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

// Initialize Auth
const auth = getAuth(app);

export { app, db, auth, firebaseConfig, GOOGLE_OAUTH_CLIENT_ID };
