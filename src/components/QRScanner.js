import React, { useEffect, useRef, useState } from 'react';
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

  const validateQRPayload = (payload) => {
    // Validate structure
    if (!payload.v || !payload.s || !payload.p || !payload.t) {
      throw new Error('Invalid QR code format - missing required fields');
    }

    // Validate version
    if (payload.v !== 1) {
      throw new Error('Unsupported QR code version');
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

  const startScanning = async () => {
    try {
      setError(null);
      setScanning(true);

      const html5QrCode = new Html5Qrcode('qr-reader');
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' }, // Use back camera
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        (decodedText) => {
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
        },
        (errorMessage) => {
          // Ignore scanning errors (they happen continuously while searching for QR codes)
        }
      );
    } catch (err) {
      const errorMessage = err.name === 'NotAllowedError'
        ? 'Camera access denied. Try uploading QR code image or manual entry.'
        : 'Camera not available. Use image upload or manual entry instead.';

      setError(errorMessage);
      setScanning(false);
      setUseManualEntry(true); // Auto-switch to manual entry on iOS
      if (onScanError) onScanError(new Error(errorMessage));
    }
  };

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

  const stopScanning = () => {
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
  };

  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, []);

  return (
    <div className="qr-scanner">
      {/* Hidden file input for QR code image upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        style={{ display: 'none' }}
      />
      <div id="qr-reader-file" style={{ display: 'none' }}></div>

      {!scanning && !useManualEntry && (
        <div className="pairing-options">
          <button onClick={startScanning} className="scan-button">
            SCAN WITH CAMERA
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

      {error && (
        <div className="qr-error">
          ERROR: {error}
        </div>
      )}
    </div>
  );
};

export default QRScanner;
