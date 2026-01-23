import React, { useState, useEffect } from 'react';
import './App.css';
import Gallery from './components/Gallery';
import Auth from './components/Auth';
import QRScanner from './components/QRScanner';
import { supabase } from './lib/supabase';
import { usePhotoSync } from './hooks/usePhotoSync';

function App() {
  const [activeTab, setActiveTab] = useState('gallery');
  const [photoCount, setPhotoCount] = useState(0);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showQRScanner, setShowQRScanner] = useState(false);

  // Photo sync connection
  const { connectionState, connect, disconnect, error: syncError } = usePhotoSync();

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    // Handle OTP callback from email link
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    
    if (accessToken && refreshToken) {
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      }).then(() => {
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      });
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setUser(null);
    }
  };

  const handleQRScanSuccess = (payload) => {
    console.log('QR scanned successfully:', payload);
    connect(payload.s, payload.p, payload.t);
    setShowQRScanner(false);
  };

  const handleQRScanError = (error) => {
    console.error('QR scan error:', error);
  };

  const handleDisconnect = () => {
    if (window.confirm('Disconnect from server? You will need to scan the QR code again to reconnect.')) {
      disconnect();
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="header">PHOTOSYNC</div>
        <div className="content">
          <div className="section-title">LOADING...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container">
        <div className="header">PHOTOSYNC</div>
        <div className="content">
          <Auth />
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">PHOTOSYNC</div>

      <div className="content">
        {/* Gallery Tab */}
        <div className={`tab-content ${activeTab === 'gallery' ? 'active' : ''}`}>
          <div className="section-title">PHOTO GALLERY</div>
          <Gallery onPhotoCountChange={setPhotoCount} />
        </div>

        {/* Settings Tab */}
        <div className={`tab-content ${activeTab === 'settings' ? 'active' : ''}`}>
          <div className="section-title">DEVICE PAIRING</div>
          <div className="settings-content">
            {connectionState === 'disconnected' && !showQRScanner && (
              <div style={{ marginBottom: '30px' }}>
                <p className="info-text" style={{ marginBottom: '15px' }}>
                  NOT CONNECTED TO SERVER<br />
                  SCAN QR CODE FROM ELECTRON APP TO PAIR
                </p>
                <button
                  onClick={() => setShowQRScanner(true)}
                  style={{
                    fontFamily: "'VT323', monospace",
                    fontSize: '20px',
                    padding: '14px 24px',
                    background: '#fff',
                    color: '#000',
                    border: '3px solid #000',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    width: '100%',
                  }}
                  onMouseOver={(e) => {
                    e.target.style.background = '#000';
                    e.target.style.color = '#fff';
                  }}
                  onMouseOut={(e) => {
                    e.target.style.background = '#fff';
                    e.target.style.color = '#000';
                  }}
                >
                  PAIR NEW DEVICE
                </button>
              </div>
            )}

            {showQRScanner && (
              <div style={{ marginBottom: '30px' }}>
                <QRScanner
                  onScanSuccess={handleQRScanSuccess}
                  onScanError={handleQRScanError}
                />
                <button
                  onClick={() => setShowQRScanner(false)}
                  style={{
                    fontFamily: "'VT323', monospace",
                    fontSize: '18px',
                    padding: '10px 20px',
                    background: '#fff',
                    color: '#000',
                    border: '2px solid #000',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    marginTop: '10px',
                    width: '100%',
                  }}
                >
                  CANCEL
                </button>
              </div>
            )}

            {(connectionState === 'connected' || connectionState === 'connecting' || connectionState === 'authenticating') && (
              <div style={{ marginBottom: '30px' }}>
                <div style={{
                  padding: '20px',
                  border: '3px solid #000',
                  background: '#fff',
                  marginBottom: '15px',
                }}>
                  <p className="info-text" style={{ marginBottom: '10px' }}>
                    <strong>CONNECTION STATUS:</strong>
                  </p>
                  <p className="info-text" style={{
                    marginBottom: '10px',
                    color: connectionState === 'connected' ? '#00aa00' : '#666',
                  }}>
                    {connectionState.toUpperCase()}
                  </p>
                  {connectionState === 'connected' && (
                    <p className="info-text" style={{ fontSize: '16px' }}>
                      PHOTOS SYNCED: {photoCount}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleDisconnect}
                  style={{
                    fontFamily: "'VT323', monospace",
                    fontSize: '18px',
                    padding: '12px 20px',
                    background: '#ff0000',
                    color: '#fff',
                    border: '3px solid #ff0000',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    width: '100%',
                  }}
                  onMouseOver={(e) => {
                    e.target.style.background = '#aa0000';
                    e.target.style.borderColor = '#aa0000';
                  }}
                  onMouseOut={(e) => {
                    e.target.style.background = '#ff0000';
                    e.target.style.borderColor = '#ff0000';
                  }}
                >
                  DISCONNECT
                </button>
              </div>
            )}

            {syncError && (
              <div style={{
                padding: '15px',
                background: '#ff0000',
                color: '#fff',
                border: '3px solid #aa0000',
                marginBottom: '20px',
              }}>
                <p className="info-text">ERROR: {syncError}</p>
              </div>
            )}

            <div className="section-title" style={{ marginTop: '30px' }}>ACCOUNT</div>
            <div style={{ marginTop: '20px' }}>
              <p className="info-text" style={{ marginBottom: '10px' }}>
                LOGGED IN AS: {user.email}
              </p>
              <button
                onClick={handleSignOut}
                style={{
                  fontFamily: "'VT323', monospace",
                  fontSize: '18px',
                  padding: '10px 20px',
                  background: '#000',
                  color: '#fff',
                  border: '2px solid #fff',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                }}
                onMouseOver={(e) => {
                  e.target.style.background = '#fff';
                  e.target.style.color = '#000';
                }}
                onMouseOut={(e) => {
                  e.target.style.background = '#000';
                  e.target.style.color = '#fff';
                }}
              >
                SIGN OUT
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="tab-bar">
        <div
          className={`tab ${activeTab === 'gallery' ? 'active' : ''}`}
          onClick={() => setActiveTab('gallery')}
        >
          GALLERY
        </div>
        <div
          className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          SETTINGS
        </div>
      </div>

      {/* Status Bar */}
      <div className="status-bar">
        <div className="status-item">
          <span>STATUS:</span>
          <span id="status">READY</span>
        </div>
        <div className="status-item">
          <span>PHOTOS:</span>
          <span id="photo-count">{photoCount}</span>
        </div>
        <div className="status-item">
          <span className="blink">█</span>
        </div>
      </div>
    </div>
  );
}

export default App;
