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
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker for PWA functionality
serviceWorkerRegistration.register();
