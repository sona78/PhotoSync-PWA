import React, { useState, useEffect } from 'react';
import './App.css';
import Gallery from './components/Gallery';
import Auth from './components/Auth';
import QRScanner from './components/QRScanner';
import { supabase } from './lib/supabase';

function App() {
  const [activeTab, setActiveTab] = useState('gallery');
  const [photoCount, setPhotoCount] = useState(0);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [pairedDevices, setPairedDevices] = useState([]);
  const [devicesLoading, setDevicesLoading] = useState(false);

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

  // Load paired devices when user is available
  useEffect(() => {
    if (user) {
      loadPairedDevices();
    }
  }, [user]);

  const loadPairedDevices = async () => {
    if (!user) return;

    try {
      setDevicesLoading(true);
      const { data, error } = await supabase
        .from('user_devices')
        .select('*')
        .eq('user_id', user.id)
        .order('paired_at', { ascending: false });

      if (error) {
        console.error('Error loading devices:', error);
        return;
      }

      setPairedDevices(data || []);
    } catch (err) {
      console.error('Error loading devices:', err);
    } finally {
      setDevicesLoading(false);
    }
  };

  const handlePairSuccess = (device) => {
    setShowQRScanner(false);
    loadPairedDevices();
    // Refresh gallery if on gallery tab
    if (activeTab === 'gallery') {
      window.location.reload();
    }
  };

  const handleUnpairDevice = async (deviceId) => {
    if (!confirm('UNPAIR THIS DEVICE?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('user_devices')
        .delete()
        .eq('id', deviceId)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

      loadPairedDevices();
      
      // Refresh gallery if device was being used
      if (activeTab === 'gallery') {
        window.location.reload();
      }
    } catch (err) {
      console.error('Error unpairing device:', err);
      alert('Failed to unpair device: ' + err.message);
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setUser(null);
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
          <div className="section-title">SETTINGS</div>
          <div className="settings-content">
            {/* Device Pairing Section */}
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ 
                fontFamily: "'VT323', monospace", 
                fontSize: '20px', 
                marginBottom: '15px',
                color: '#000'
              }}>
                PAIRED DEVICES
              </h3>
              
              {showQRScanner ? (
                <QRScanner 
                  onPairSuccess={handlePairSuccess}
                  onCancel={() => setShowQRScanner(false)}
                />
              ) : (
                <>
                  <button
                    onClick={() => setShowQRScanner(true)}
                    style={{
                      fontFamily: "'VT323', monospace",
                      fontSize: '18px',
                      padding: '12px 20px',
                      background: '#000',
                      color: '#fff',
                      border: '2px solid #000',
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                      width: '100%',
                      marginBottom: '20px'
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
                    PAIR NEW DEVICE
                  </button>

                  {devicesLoading ? (
                    <p className="info-text">LOADING DEVICES...</p>
                  ) : pairedDevices.length === 0 ? (
                    <p className="info-text">NO PAIRED DEVICES</p>
                  ) : (
                    <div style={{ border: '2px solid #000', padding: '10px' }}>
                      {pairedDevices.map((device) => (
                        <div
                          key={device.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px',
                            borderBottom: '1px solid #ccc',
                            fontFamily: "'VT323', monospace",
                            fontSize: '16px'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                              {device.http_url}
                            </div>
                            <div style={{ fontSize: '14px', color: '#666' }}>
                              Paired: {new Date(device.paired_at).toLocaleString()}
                            </div>
                          </div>
                          <button
                            onClick={() => handleUnpairDevice(device.id)}
                            style={{
                              fontFamily: "'VT323', monospace",
                              fontSize: '14px',
                              padding: '6px 12px',
                              background: '#fff',
                              color: '#000',
                              border: '2px solid #000',
                              cursor: 'pointer',
                              textTransform: 'uppercase'
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
                            UNPAIR
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* User Info Section */}
            <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '2px solid #000' }}>
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
                  border: '2px solid #000',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  width: '100%'
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
