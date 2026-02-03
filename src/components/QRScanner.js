import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import './QRScanner.css';

const QRScanner = ({ onScanSuccess, onScanError }) => {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [useManualEntry, setUseManualEntry] = useState(false);
  const [manualServer, setManualServer] = useState('');
  const [manualToken, setManualToken] = useState('');
  const html5QrCodeRef = useRef(null);
  const fileInputRef = useRef(null);
  const shouldStartCamera = useRef(false);

  const validateQRPayload = (payload) => {
    // Validate WebRTC QR code format
    if (!payload.type || payload.type !== 'webrtc') {
      throw new Error('Invalid QR code format - expected WebRTC connection');
    }

    // Validate required fields
    if (!payload.signalingServer) {
      throw new Error('Missing signaling server URL');
    }

    if (!payload.roomId) {
      throw new Error('Missing room ID');
    }

    // Validate signaling server URL format
    if (!/^wss?:\/\/.+/.test(payload.signalingServer)) {
      throw new Error('Invalid signaling server URL - must start with ws:// or wss://');
    }

    // Validate room ID format (should be hex string)
    if (!/^[a-f0-9]+$/i.test(payload.roomId)) {
      throw new Error('Invalid room ID format');
    }

    return true;
  };

  const startScanning = () => {
    setError(null);
    shouldStartCamera.current = true;
    setScanning(true);
  };

  const stopScanning = useCallback(() => {
    if (html5QrCodeRef.current) {
      html5QrCodeRef.current.stop()
        .then(() => {
          html5QrCodeRef.current = null;
          setScanning(false);
          setError(null);
        })
        .catch((err) => {
          console.error('Error stopping scanner:', err);
          setScanning(false);
        });
    }
  }, []);

  const initializeCamera = useCallback(async () => {
    try {
      const html5QrCode = new Html5Qrcode('qr-reader');
      html5QrCodeRef.current = html5QrCode;

      // iOS-compatible camera configuration
      const cameraConfig = {
        facingMode: { ideal: 'environment' },
        // Advanced constraints for iOS Safari
        advanced: [{ torch: false }]
      };

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        // Disable audio to avoid permission issues
        disableFlip: false,
        // Better for iOS
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      };

      const handleSuccess = (decodedText) => {
        // Validate QR payload
        try {
          const payload = JSON.parse(decodedText);
          validateQRPayload(payload);

          // Success - stop scanning
          stopScanning();
          onScanSuccess(payload);
        } catch (err) {
          setError(err.message);
          if (onScanError) onScanError(err);

          // Auto-clear error after 3 seconds to allow retry
          setTimeout(() => setError(null), 3000);
        }
      };

      const handleError = (errorMessage) => {
        // Ignore scanning errors (they happen continuously while searching for QR codes)
      };

      // Try to get camera devices first (better for iOS)
      try {
        const devices = await Html5Qrcode.getCameras();
        console.log('[QR] Found cameras:', devices.length);

        if (devices && devices.length > 0) {
          // Prefer back camera
          const backCamera = devices.find(d => d.label.toLowerCase().includes('back')) || devices[devices.length - 1];
          console.log('[QR] Using camera:', backCamera.label);

          await html5QrCode.start(backCamera.id, config, handleSuccess, handleError);
        } else {
          throw new Error('No cameras found');
        }
      } catch (deviceError) {
        console.log('[QR] Device enumeration failed, trying constraints:', deviceError);
        // Fallback to constraints if device enumeration fails
        await html5QrCode.start(cameraConfig, config, handleSuccess, handleError);
      }
    } catch (err) {
      console.error('[QR] Camera error:', err);
      let errorMessage;

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMessage = 'Camera permission denied. Please allow camera access in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMessage = 'No camera found on this device. Use image upload or manual entry.';
      } else if (err.name === 'NotReadableError') {
        errorMessage = 'Camera is in use by another app. Please close other apps and try again.';
      } else if (err.name === 'OverconstrainedError') {
        errorMessage = 'Camera constraints not supported. Use image upload or manual entry.';
      } else {
        errorMessage = `Camera error: ${err.message || 'Unknown error'}. Try image upload or manual entry.`;
      }

      setError(errorMessage);
      setScanning(false);
      shouldStartCamera.current = false;
      if (onScanError) onScanError(err);
    }
  }, [onScanSuccess, onScanError, stopScanning]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setError(null);
      const html5QrCode = new Html5Qrcode('qr-reader-file');

      const result = await html5QrCode.scanFile(file, true);

      // Validate QR payload
      const payload = JSON.parse(result);
      validateQRPayload(payload);

      // Success
      onScanSuccess(payload);
    } catch (err) {
      setError(err.message || 'Failed to read QR code from image');
      if (onScanError) onScanError(err);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();

    try {
      setError(null);

      // For WebRTC, manual entry requires signaling server and room ID
      if (!manualServer || !manualToken) {
        throw new Error('Both signaling server and room ID are required');
      }

      // Create WebRTC payload
      const payload = {
        type: 'webrtc',
        signalingServer: manualServer.trim(),
        roomId: manualToken.trim(),
        version: '1.0'
      };

      validateQRPayload(payload);
      onScanSuccess(payload);
    } catch (err) {
      setError(err.message);
      if (onScanError) onScanError(err);
    }
  };

  // Initialize camera when scanning becomes true
  useEffect(() => {
    if (scanning && shouldStartCamera.current) {
      shouldStartCamera.current = false;
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        initializeCamera();
      }, 100);
    }
  }, [scanning, initializeCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, [stopScanning]);

  return (
    <div className="qr-scanner">
      {/* Hidden file input for QR code image upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
      />
      <div id="qr-reader-file" style={{ display: 'none' }}></div>

      {error && !scanning && (
        <div className="qr-error" style={{ marginBottom: '15px' }}>
          <strong>ERROR:</strong> {error}
        </div>
      )}

      {!scanning && !useManualEntry && (
        <div className="pairing-options">
          <button onClick={startScanning} className="scan-button">
            {error ? 'TRY CAMERA AGAIN' : 'SCAN WITH CAMERA'}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="scan-button secondary"
          >
            UPLOAD QR IMAGE
          </button>
          <button
            onClick={() => setUseManualEntry(true)}
            className="scan-button secondary"
          >
            MANUAL ENTRY
          </button>
        </div>
      )}

      {scanning && (
        <>
          {error && (
            <div className="qr-error" style={{ marginBottom: '15px' }}>
              <strong>ERROR:</strong> {error}
              <div style={{ fontSize: '14px', marginTop: '8px' }}>
                Scanning continues... Try a different QR code or fix the issue.
              </div>
            </div>
          )}
          <div id="qr-reader" className="qr-reader"></div>
          <button onClick={stopScanning} className="stop-button">
            STOP SCANNING
          </button>
        </>
      )}

      {useManualEntry && !scanning && (
        <div className="manual-entry">
          <h3>MANUAL WEBRTC CONNECTION</h3>
          <p className="manual-instructions">
            Enter the WebRTC connection details from your Electron app terminal
          </p>
          <form onSubmit={handleManualSubmit}>
            <div className="form-group">
              <label>SIGNALING SERVER URL</label>
              <input
                type="text"
                value={manualServer}
                onChange={(e) => setManualServer(e.target.value)}
                placeholder="wss://your-signaling-server.com"
                className="manual-input"
                required
              />
              <small>Example: wss://photosync-signaling.onrender.com</small>
            </div>
            <div className="form-group">
              <label>ROOM ID</label>
              <input
                type="text"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="abc123..."
                className="manual-input"
                required
              />
              <small>Room ID shown in desktop terminal</small>
            </div>
            <div className="button-group">
              <button type="submit" className="scan-button">
                CONNECT
              </button>
              <button
                type="button"
                onClick={() => setUseManualEntry(false)}
                className="scan-button secondary"
              >
                BACK
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default QRScanner;
