import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from '../lib/supabase';
import './QRScanner.css';

const QRScanner = ({ onPairSuccess, onCancel }) => {
  const scannerRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!scanning && scannerRef.current) {
      setScanning(true);
      setError('');
      setSuccess('');

      const scanner = new Html5QrcodeScanner(
        scannerRef.current.id,
        {
          qrbox: { width: 250, height: 250 },
          fps: 5,
          aspectRatio: 1.0
        },
        false // verbose
      );

      scanner.render(
        async (decodedText, decodedResult) => {
          try {
            // Parse QR code JSON
            const qrData = JSON.parse(decodedText);
            
            // Validate QR code structure
            if (!qrData.ws || !qrData.http || !qrData.token) {
              throw new Error('Invalid QR code format');
            }

            // Stop scanner
            scanner.clear();
            setScanning(false);

            // Validate token via HTTP endpoint
            const validateUrl = `${qrData.http}/api/token/validate/${qrData.token}`;
            const validateResponse = await fetch(validateUrl);
            
            if (!validateResponse.ok) {
              throw new Error('Failed to validate token');
            }

            const validateResult = await validateResponse.json();
            
            if (!validateResult.valid) {
              throw new Error('Invalid pairing token');
            }

            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
              throw new Error('User not authenticated');
            }

            // Save to Supabase
            const { data, error: insertError } = await supabase
              .from('user_devices')
              .insert({
                user_id: user.id,
                pairing_token: qrData.token,
                server_url: qrData.ws,
                http_url: qrData.http
              })
              .select()
              .single();

            if (insertError) {
              throw insertError;
            }

            setSuccess('Device paired successfully!');
            
            // Call success callback after a short delay
            setTimeout(() => {
              if (onPairSuccess) {
                onPairSuccess(data);
              }
            }, 1500);

          } catch (err) {
            console.error('Pairing error:', err);
            setError(err.message || 'Failed to pair device');
            setScanning(false);
            scanner.clear();
          }
        },
        (errorMessage) => {
          // Ignore scan errors (just keep scanning)
        }
      );

      // Cleanup on unmount
      return () => {
        if (scanner) {
          scanner.clear().catch(() => {
            // Ignore cleanup errors
          });
        }
      };
    }
  }, [scanning, onPairSuccess]);

  return (
    <div className="qr-scanner-container">
      <div className="qr-scanner-header">
        <h2>SCAN QR CODE</h2>
        {onCancel && (
          <button className="qr-scanner-cancel" onClick={onCancel}>
            CANCEL
          </button>
        )}
      </div>

      {error && (
        <div className="qr-scanner-error">
          ERROR: {error}
        </div>
      )}

      {success && (
        <div className="qr-scanner-success">
          {success}
        </div>
      )}

      <div 
        id="qr-scanner" 
        ref={scannerRef}
        className="qr-scanner-view"
      />

      <div className="qr-scanner-info">
        <p>POINT YOUR CAMERA AT THE QR CODE</p>
        <p>MAKE SURE BOTH DEVICES ARE ON THE SAME NETWORK</p>
      </div>
    </div>
  );
};

export default QRScanner;
