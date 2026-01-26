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
    // Validate structure
    if (!payload.v || !payload.s || !payload.p || !payload.t) {
      throw new Error('Invalid QR code format - missing required fields');
    }

    // Validate version (only support v3 - WSS)
    if (payload.v !== 3) {
      throw new Error(`Unsupported QR code version: ${payload.v} (only v3/WSS supported)`);
    }

    // Validate token format (64 hex characters)
    if (!/^[a-f0-9]{64}$/i.test(payload.t)) {
      throw new Error('Invalid token format');
    }

    // Validate expiration
    if (payload.e && payload.e < Date.now()) {
      throw new Error('QR code has expired');
    }

    // Validate server address (basic)
    if (!/^[\d.]+$/.test(payload.s) && !/^[a-z0-9.-]+$/i.test(payload.s)) {
      throw new Error('Invalid server address');
    }

    // Validate port
    if (typeof payload.p !== 'number' || payload.p < 1 || payload.p > 65535) {
      throw new Error('Invalid port number');
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

      // Parse server address and port
      const serverParts = manualServer.split(':');
      const address = serverParts[0].trim();
      const port = serverParts[1] ? parseInt(serverParts[1].trim()) : 3001;

      // Validate inputs
      if (!address) {
        throw new Error('Server address is required');
      }

      if (!manualToken || manualToken.length !== 64) {
        throw new Error('Token must be 64 characters');
      }

      if (!/^[a-f0-9]{64}$/i.test(manualToken)) {
        throw new Error('Token must be hexadecimal (0-9, a-f)');
      }

      // Create payload
      const payload = {
        v: 1,
        s: address,
        p: port,
        t: manualToken.toLowerCase(),
        e: Date.now() + (90 * 24 * 60 * 60 * 1000) // 90 days from now
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
          <h3>MANUAL PAIRING</h3>
          <p className="manual-instructions">
            Enter the server address and token from your Electron app
          </p>
          <form onSubmit={handleManualSubmit}>
            <div className="form-group">
              <label>SERVER ADDRESS (IP:PORT)</label>
              <input
                type="text"
                value={manualServer}
                onChange={(e) => setManualServer(e.target.value)}
                placeholder="192.168.1.5:3001"
                className="manual-input"
                required
              />
              <small>Example: 192.168.1.5:3001 (port defaults to 3001)</small>
            </div>
            <div className="form-group">
              <label>DEVICE TOKEN</label>
              <input
                type="text"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="64-character hex token"
                className="manual-input"
                maxLength="64"
                required
              />
              <small>64 characters (0-9, a-f)</small>
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
