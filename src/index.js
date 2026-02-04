// Polyfills for simple-peer (WebRTC library)
import process from 'process';
import { Buffer } from 'buffer';


import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App-WebRTC';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

// Make available globally for packages that need them
window.process = process;
window.Buffer = Buffer;


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  // Temporarily disabled StrictMode to debug connection issues
  // <React.StrictMode>
    <App />
  // </React.StrictMode>
);

/**
 * Service Worker Disabled
 *
 * Service workers have been disabled because they were interfering with:
 * - Supabase authentication requests (causing "Failed to fetch" errors)
 * - WebRTC signaling connections
 * - Dynamic API calls
 *
 * The app still works without a service worker. PhotoSync requires an active
 * connection to the desktop app anyway, so offline mode isn't needed.
 *
 * If you're experiencing issues (constant refresh, auth errors):
 * 1. Navigate to: /cleanup.html
 * 2. Wait for cleanup to complete
 * 3. Click "Continue to App"
 */

// Silent service worker check - don't do anything to avoid reload loops
// The cleanup.html page handles initial cleanup if needed
console.log('[PhotoSync] Service workers disabled - no offline caching');
