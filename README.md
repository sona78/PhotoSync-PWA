# PhotoSync PWA

A Progressive Web App version of PhotoSync with retro terminal-style design.

## Features

- Retro terminal-style UI with VT323 monospace font
- Photo gallery with grid layout
- Responsive mobile design
- PWA capabilities (offline support, installable)
- Photo viewer modal
- Tab-based navigation (Gallery, Settings)
- Status bar with photo count
- Passwordless email authentication via Supabase (magic link)

## Getting Started

### Prerequisites

- Node.js and npm installed
- A Supabase account and project ([Sign up here](https://supabase.com))

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up Supabase authentication:
   - Create a new project at [Supabase](https://app.supabase.com)
   - Go to your project settings → API
   - Copy your project URL and anon/public key
   - Create a `.env` file in the root directory:
   ```
   REACT_APP_SUPABASE_URL=your_supabase_project_url
   REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
   - In Supabase Dashboard → Authentication → URL Configuration, add your app's URL to "Redirect URLs" (e.g., `http://localhost:3000` for development)

3. Start the development server:
```bash
npm start
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Build for Production

```bash
npm run build
```

This creates an optimized production build in the `build` folder.

### PWA Features

The app includes:
- Service Worker for offline functionality
- Web App Manifest for installation
- Responsive design optimized for mobile devices
- Cache-first strategy for faster loading

## Design

The PWA maintains the same retro aesthetic as the PhotoSync-Electron app:
- Black and white color scheme
- VT323 monospace font
- Terminal-style borders and buttons
- Blinking cursor indicator in status bar

## Mobile Usage

The app is optimized for mobile devices and can be installed as a standalone app on your phone:

1. Open the app in a mobile browser
2. Look for the "Add to Home Screen" or "Install" prompt
3. Follow the installation instructions
4. Launch from your home screen like a native app

## Tech Stack

- React 18
- Supabase for authentication (passwordless email login)
- Service Workers for PWA functionality
- CSS Grid for gallery layout
- Progressive enhancement for mobile devices

## Authentication

The app uses Supabase for passwordless email authentication:
- Users enter their email address
- A magic link is sent to their email
- Clicking the link automatically signs them in
- Sessions persist across browser sessions
- Sign out is available in the Settings tab
