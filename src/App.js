import React, { useState, useEffect } from 'react';
import './App.css';
import Gallery from './components/Gallery';
import Auth from './components/Auth';
import QRScanner from './components/QRScanner';
import DebugLog from './components/DebugLog';
import ConnectionDiagnostics from './components/ConnectionDiagnostics';
import { supabase } from './lib/supabase';
import { usePhotoSyncWebRTC } from './hooks/usePhotoSyncWebRTC';

function App() {
  const [activeTab, setActiveTab] = useState('gallery');
  const [photoCount, setPhotoCount] = useState(0);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showDebugLogs, setShowDebugLogs] = useState(false);

  // WebRTC P2P connection (only connection method)
  const activeSync = usePhotoSyncWebRTC();

  const {
    connectionState,
    photos,
    photoData,
    connect,
    disconnect,
    requestManifest,
    requestPhoto,
    error: syncError,
    syncProgress,
    debugLogs,
    folders,
    currentFolderId,
    requestFolders,
    requestFolderPhotos,
  } = activeSync;

  // Update photo count when photos change
  useEffect(() => {
    setPhotoCount(photos.length);
  }, [photos]);

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
    setShowQRScanner(false);

    // WebRTC P2P connection
    console.log('Connecting with WebRTC P2P');
    activeSync.connect(payload.signalingServer, payload.roomId);
  };

  const handleQRScanError = (error) => {
    console.error('QR scan error:', error);
  };

  const handleDisconnect = () => {
    if (window.confirm('Disconnect from server? You will need to scan the QR code again to reconnect.')) {
      disconnect();
    }
  };

  const clearLogs = () => {
    // Clear logs if available
    if (activeSync.clearLogs) {
      activeSync.clearLogs();
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
      <div className="header">
        PHOTOSYNC
        {connectionState === 'connected' && (
          <span style={{
            fontSize: '12px',
            marginLeft: '10px',
            padding: '4px 8px',
            background: '#00ff00',
            color: '#000',
            borderRadius: '4px',
          }}>
            🔗 WebRTC P2P
          </span>
        )}
      </div>

      <div className="content">
        {/* Gallery Tab */}
        <div className={`tab-content ${activeTab === 'gallery' ? 'active' : ''}`}>
          <div className="section-title">PHOTO GALLERY</div>
          <Gallery
            photos={photos}
            connectionState={connectionState}
            error={syncError}
            syncProgress={syncProgress}
            requestManifest={requestManifest}
            photoData={photoData}
            requestPhoto={requestPhoto}
            connectionMode="webrtc"
            folders={folders}
            currentFolderId={currentFolderId}
            requestFolders={requestFolders}
            requestFolderPhotos={requestFolderPhotos}
          />
        </div>

        {/* Settings Tab */}
        <div className={`tab-content ${activeTab === 'settings' ? 'active' : ''}`}>
          <div className="section-title">DEVICE PAIRING</div>
          <div className="settings-content">
            {/* Debug Logs */}
            <DebugLog
              logs={debugLogs}
              visible={showDebugLogs}
              onToggle={() => setShowDebugLogs(!showDebugLogs)}
              onClear={clearLogs}
            />

            {/* Connection Diagnostics */}
            <ConnectionDiagnostics
              debugLogs={debugLogs}
              connectionState={connectionState}
              serverInfo={activeSync.connectionInfo ? {
                address: activeSync.connectionInfo.signalingServer,
                port: null,
                mode: 'WebRTC P2P'
              } : null}
            />

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
                  <p className="info-text" style={{ marginBottom: '10px', fontSize: '14px' }}>
                    MODE: WebRTC P2P
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
              <>
                <div style={{
                  padding: '15px',
                  background: '#ff0000',
                  color: '#fff',
                  border: '3px solid #aa0000',
                  marginBottom: '15px',
                }}>
                  <p className="info-text" style={{ marginBottom: '12px' }}>ERROR: {syncError}</p>
                  <button
                    onClick={() => setShowQRScanner(true)}
                    style={{
                      fontFamily: "'VT323', monospace",
                      fontSize: '18px',
                      padding: '10px 20px',
                      background: '#fff',
                      color: '#000',
                      border: '2px solid #fff',
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
                    TRY AGAIN
                  </button>
                </div>
              </>
            )}

            {/* User Account Info */}
            {user && (
              <div style={{
                padding: '15px',
                background: '#f0f0f0',
                border: '2px solid #666',
                marginTop: '20px',
              }}>
                <p className="info-text" style={{ marginBottom: '10px' }}>
                  <strong>SIGNED IN AS:</strong>
                </p>
                <p className="info-text" style={{ marginBottom: '15px', fontSize: '14px' }}>
                  {user.email}
                </p>
                <button
                  onClick={handleSignOut}
                  style={{
                    fontFamily: "'VT323', monospace",
                    fontSize: '16px',
                    padding: '8px 16px',
                    background: '#666',
                    color: '#fff',
                    border: '2px solid #666',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    width: '100%',
                  }}
                  onMouseOver={(e) => {
                    e.target.style.background = '#000';
                    e.target.style.borderColor = '#000';
                  }}
                  onMouseOut={(e) => {
                    e.target.style.background = '#666';
                    e.target.style.borderColor = '#666';
                  }}
                >
                  SIGN OUT
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="bottom-nav">
        <button
          className={`nav-button ${activeTab === 'gallery' ? 'active' : ''}`}
          onClick={() => setActiveTab('gallery')}
        >
          GALLERY
        </button>
        <button
          className={`nav-button ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          SETTINGS
        </button>
      </div>
    </div>
  );
}

export default App;
