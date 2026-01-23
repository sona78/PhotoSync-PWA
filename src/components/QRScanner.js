import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import './QRScanner.css';

const QRScanner = ({ onScanSuccess, onScanError }) => {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const html5QrCodeRef = useRef(null);

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
        ? 'Camera access denied. Please grant camera permissions.'
        : 'Camera not available or not supported.';

      setError(errorMessage);
      setScanning(false);
      if (onScanError) onScanError(new Error(errorMessage));
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
      {!scanning && (
        <button onClick={startScanning} className="scan-button">
          SCAN QR CODE
        </button>
      )}

      {scanning && (
        <>
          <div id="qr-reader" className="qr-reader"></div>
          <button onClick={stopScanning} className="stop-button">
            STOP SCANNING
          </button>
        </>
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
