import React, { useState, useEffect } from 'react';
import './App.css';
import Gallery from './components/Gallery';
import Auth from './components/Auth';
import QRScanner from './components/QRScanner';
import DebugLog from './components/DebugLog';
import ConnectionDiagnostics from './components/ConnectionDiagnostics';
import { supabase } from './lib/supabase';
import { usePhotoSync } from './hooks/usePhotoSync';
import { usePhotoSyncWebRTC } from './hooks/usePhotoSyncWebRTC';
import {
  saveWebRTCConnection,
  loadWebRTCConnection,
  deleteWebRTCConnection,
  updateLastConnected
} from './lib/webrtcConnection';

// Signaling server configuration
// For local testing: ws://localhost:3002
// For production: wss://your-signaling-server.onrender.com
const SIGNALING_SERVER = process.env.REACT_APP_SIGNALING_SERVER || 'ws://localhost:3002';

function App() {
  const [activeTab, setActiveTab] = useState('gallery');
  const [photoCount, setPhotoCount] = useState(0);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showDebugLogs, setShowDebugLogs] = useState(false);
  const [connectionMode, setConnectionMode] = useState('webrtc'); // Always use WebRTC in this app

  // Debug: Log connectionMode changes
  useEffect(() => {
    console.log('[App] connectionMode changed to:', connectionMode);
  }, [connectionMode]);

  // Check for active service workers on mount
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        if (registrations.length > 0) {
          console.warn('[App] ⚠️ WARNING: Active service workers detected!');
          console.warn('[App] This may cause authentication issues.');
          console.warn('[App] Please visit /cleanup.html to remove them.');
          registrations.forEach((reg) => {
            console.warn('[App] - Active SW:', reg.scope);
          });
        } else {
          console.log('[App] ✓ No active service workers (good!)');
        }
      });
    }
  }, []);

  // WebRTC P2P connection (primary mode for this app)
  const webrtcSync = usePhotoSyncWebRTC();

  // Legacy Socket.IO connection (disabled - use App.js if you need legacy mode)
  // const legacySync = usePhotoSync();
  const legacySync = {
    connectionState: 'disconnected',
    photos: [],
    disconnect: () => {},
    requestManifest: () => {},
    error: null,
    syncProgress: { current: 0, total: 0 },
    debugLogs: [],
    photoData: {},
    requestPhoto: () => {},
    connect: () => console.warn('[App] Legacy mode disabled in WebRTC app')
  };

  // Debug: Log what webrtcSync contains IMMEDIATELY
  console.log('[App] webrtcSync IMMEDIATE check:', {
    hookResult: webrtcSync,
    hasConnect: !!webrtcSync?.connect,
    hasRequestPhoto: !!webrtcSync?.requestPhoto,
    hasPhotoData: !!webrtcSync?.photoData,
    requestPhotoType: typeof webrtcSync?.requestPhoto,
    photoDataType: typeof webrtcSync?.photoData,
    photoDataValue: webrtcSync?.photoData,
    connectionState: webrtcSync?.connectionState
  });

  // Use the active connection mode
  const activeSync = connectionMode === 'webrtc' ? webrtcSync : legacySync;

  // Debug connectionMode
  useEffect(() => {
    console.log('[App] Connection mode:', connectionMode);
    console.log('[App] Using:', connectionMode === 'webrtc' ? 'WebRTC' : 'Legacy');
    console.log('[App] webrtcSync.requestPhoto exists:', !!webrtcSync.requestPhoto);
    console.log('[App] legacySync.requestPhoto exists:', !!legacySync.requestPhoto);
  }, [connectionMode, webrtcSync, legacySync]);

  const {
    connectionState,
    photos,
    disconnect,
    requestManifest,
    error: syncError,
    syncProgress,
    debugLogs,
    photoData,
    requestPhoto,
    connectionInfo,
  } = activeSync;

  // Debug: Log props being passed to Gallery
  useEffect(() => {
    if (connectionState === 'connected') {
      console.log('[App] Gallery props:', {
        connectionMode,
        photosCount: photos?.length,
        hasPhotoData: !!photoData,
        photoDataKeys: photoData ? Object.keys(photoData).length : 0,
        hasRequestPhoto: !!requestPhoto
      });
    }
  }, [connectionState, connectionMode, photos, photoData, requestPhoto]);

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

  // Auto-reconnect to saved connection
  useEffect(() => {
    const attemptAutoReconnect = async () => {
      // Only auto-reconnect if not already connected
      if (connectionState !== 'disconnected' || loading) {
        return;
      }

      console.log('[App] Checking for saved WebRTC connection...');
      const result = await loadWebRTCConnection();

      if (result.success && result.data) {
        const { signalingServer, roomId, deviceName } = result.data;
        console.log('[App] Found saved connection:', { signalingServer, roomId, deviceName });
        console.log('[App] Auto-reconnecting...');

        // Connect using saved credentials
        webrtcSync.connect(signalingServer, roomId);
      } else {
        console.log('[App] No saved connection found');
      }
    };

    // Run after loading is complete
    if (!loading) {
      attemptAutoReconnect();
    }
  }, [loading, connectionState, webrtcSync]);

  // Update last connected timestamp when connection is established
  useEffect(() => {
    if (connectionState === 'connected') {
      updateLastConnected().then((result) => {
        if (result.success) {
          console.log('[App] Updated last connected timestamp');
        }
      });
    }
  }, [connectionState]);

  const handleSignOut = async () => {
    // Clear saved connection on sign out
    await deleteWebRTCConnection();
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setUser(null);
    }
  };

  const handleQRScanSuccess = async (payload) => {
    console.log('QR scanned successfully:', payload);
    setShowQRScanner(false);

    // WebRTC mode only
    if (payload.type === 'webrtc') {
      console.log('[App] Connecting via WebRTC:', payload.signalingServer, payload.roomId);

      // Save connection info for auto-reconnect
      const saveResult = await saveWebRTCConnection({
        signalingServer: payload.signalingServer,
        roomId: payload.roomId,
        deviceName: payload.deviceName || 'Desktop'
      });

      if (saveResult.success) {
        console.log('[App] Connection info saved for auto-reconnect');
      }

      // Connect
      webrtcSync.connect(payload.signalingServer, payload.roomId);
    } else {
      console.error('[App] Legacy connection mode not supported in WebRTC app');
      alert('This QR code is for legacy mode. Please use the WebRTC QR code from your desktop.');
    }
  };

  const handleQRScanError = (error) => {
    console.error('QR scan error:', error);
  };

  const handleDisconnect = async () => {
    if (window.confirm('Disconnect and forget this device?\n\nNote: Your desktop uses a persistent QR code, so you can re-scan the same QR code later to reconnect.')) {
      // Delete saved connection
      await deleteWebRTCConnection();
      console.log('[App] Saved connection cleared');

      // Disconnect
      disconnect();
      setConnectionMode(null);
    }
  };

  const clearLogs = () => {
    // Clear logs is not available on webrtcSync, only on legacySync
    if (legacySync.clearLogs) {
      legacySync.clearLogs();
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
        {connectionMode && (
          <span style={{
            fontSize: '12px',
            marginLeft: '10px',
            padding: '4px 8px',
            background: connectionMode === 'webrtc' ? '#00ff00' : '#ffff00',
            color: '#000',
            borderRadius: '4px',
          }}>
            {connectionMode === 'webrtc' ? '🔗 WebRTC' : '📡 Direct'}
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
            connectionMode={connectionMode}
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
              serverInfo={(() => {
                if (connectionMode === 'webrtc' && webrtcSync.connectionInfo) {
                  return {
                    address: webrtcSync.connectionInfo.signalingServer,
                    port: null,
                    mode: 'WebRTC P2P'
                  };
                }
                try {
                  const saved = localStorage.getItem('photosync_server');
                  if (saved) {
                    const { address, port } = JSON.parse(saved);
                    return { address, port, mode: 'Direct' };
                  }
                } catch (e) {}
                return null;
              })()}
            />

            {connectionState === 'disconnected' && !showQRScanner && (
              <div style={{ marginBottom: '30px' }}>
                <p className="info-text" style={{ marginBottom: '15px' }}>
                  NOT CONNECTED TO SERVER<br />
                  SCAN QR CODE FROM ELECTRON APP TO PAIR
                </p>
                <div style={{
                  padding: '12px',
                  background: '#f0fff0',
                  border: '2px solid #28a745',
                  borderRadius: '4px',
                  marginBottom: '15px'
                }}>
                  <p className="info-text" style={{
                    fontSize: '13px',
                    color: '#28a745',
                    marginBottom: '6px',
                    fontWeight: 'bold'
                  }}>
                    💡 Persistent QR Codes
                  </p>
                  <p className="info-text" style={{
                    fontSize: '12px',
                    color: '#666',
                    margin: 0,
                    lineHeight: '1.5'
                  }}>
                    Your desktop's QR code stays the same every time. Scan it once and this app will remember it for easy reconnection!
                  </p>
                </div>
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

                {/* TEMPORARY TEST BUTTON FOR WEBRTC */}
                <button
                  onClick={async () => {
                    const roomId = prompt('Enter Room ID from desktop terminal:\n\nLook for:\n[WebRTC] Room ID: xxxxxxxxxx');
                    if (roomId && roomId.trim()) {
                      console.log('🧪 TEST: Setting connection mode to WebRTC');
                      console.log('🧪 TEST: Signaling server:', SIGNALING_SERVER);
                      console.log('🧪 TEST: webrtcSync object:', webrtcSync);
                      console.log('🧪 TEST: webrtcSync.connect type:', typeof webrtcSync.connect);
                      console.log('🧪 TEST: webrtcSync.requestPhoto type:', typeof webrtcSync.requestPhoto);
                      console.log('🧪 TEST: webrtcSync.photoData type:', typeof webrtcSync.photoData);

                      // Set mode FIRST, then connect
                      await new Promise(resolve => {
                        setConnectionMode('webrtc');
                        setTimeout(resolve, 100); // Give React time to update state
                      });

                      console.log('🧪 TEST: ConnectionMode set, now connecting to room:', roomId.trim());
                      webrtcSync.connect(SIGNALING_SERVER, roomId.trim());
                    }
                  }}
                  style={{
                    fontFamily: "'VT323', monospace",
                    fontSize: '18px',
                    padding: '12px 20px',
                    background: '#ffff00',
                    color: '#000',
                    border: '3px solid #000',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    width: '100%',
                    marginTop: '15px',
                  }}
                  onMouseOver={(e) => {
                    e.target.style.background = '#ffcc00';
                  }}
                  onMouseOut={(e) => {
                    e.target.style.background = '#ffff00';
                  }}
                >
                  🧪 TEST WEBRTC (MANUAL CONNECT)
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
                  {connectionMode && (
                    <p className="info-text" style={{ marginBottom: '10px', fontSize: '14px' }}>
                      MODE: {connectionMode === 'webrtc' ? 'WebRTC P2P' : 'Direct Connection'}
                    </p>
                  )}
                  {connectionInfo && connectionInfo.roomId && (
                    <div style={{
                      marginTop: '12px',
                      padding: '12px',
                      background: '#f0fff0',
                      border: '2px solid #28a745',
                      borderRadius: '4px'
                    }}>
                      <p className="info-text" style={{
                        fontSize: '13px',
                        color: '#28a745',
                        marginBottom: '8px',
                        fontWeight: 'bold'
                      }}>
                        🔒 PERSISTENT CONNECTION
                      </p>
                      <p className="info-text" style={{
                        fontSize: '12px',
                        marginBottom: '6px',
                        wordBreak: 'break-all'
                      }}>
                        Room ID: {connectionInfo.roomId}
                      </p>
                      <p className="info-text" style={{
                        fontSize: '11px',
                        color: '#666',
                        margin: 0
                      }}>
                        This connection will remain valid and you can reconnect anytime.
                      </p>
                    </div>
                  )}
                  {connectionState === 'connected' && (
                    <p className="info-text" style={{ fontSize: '16px', marginTop: '12px' }}>
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
    </div>
  );
}

export default App;
