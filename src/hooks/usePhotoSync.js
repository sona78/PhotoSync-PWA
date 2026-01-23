import { useState, useEffect, useRef, useCallback } from 'react';
import { encode, decode } from '@msgpack/msgpack';

const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  AUTHENTICATING: 'authenticating',
  CONNECTED: 'connected',
  ERROR: 'error'
};

export const usePhotoSync = () => {
  const [connectionState, setConnectionState] = useState(CONNECTION_STATES.DISCONNECTED);
  const [photos, setPhotos] = useState([]);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const tokenRef = useRef(null);
  const serverRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const photoBuffersRef = useRef(new Map());

  // Photo chunk reassembly
  const handlePhotoChunk = useCallback((message) => {
    const { photoId, chunkSeq, totalChunks, totalSize, data } = message;

    if (!photoBuffersRef.current.has(photoId)) {
      photoBuffersRef.current.set(photoId, {
        chunks: new Array(totalChunks),
        expectedChunks: totalChunks,
        receivedChunks: 0,
        totalSize
      });
    }

    const buffer = photoBuffersRef.current.get(photoId);
    buffer.chunks[chunkSeq] = data;
    buffer.receivedChunks++;

    // Update progress
    setSyncProgress({
      current: buffer.receivedChunks,
      total: totalChunks
    });
  }, []);

  const handlePhotoComplete = useCallback((message) => {
    const { photoId, totalSize } = message;
    const buffer = photoBuffersRef.current.get(photoId);

    if (!buffer) {
      console.error('[PhotoSync] No buffer for completed photo:', photoId);
      return;
    }

    // Concatenate chunks
    const fullData = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of buffer.chunks) {
      if (chunk) {
        fullData.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }
    }

    // Create blob and object URL
    const blob = new Blob([fullData], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);

    // Update photos array with actual image data
    setPhotos(prev => prev.map(p =>
      p.id === photoId ? { ...p, url, thumbnail: url } : p
    ));

    // Cleanup
    photoBuffersRef.current.delete(photoId);
  }, []);

  // Request manifest
  const requestManifest = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message = encode({
        type: 'REQUEST_MANIFEST',
        requestId: Date.now(),
        timestamp: Date.now()
      });
      wsRef.current.send(message);
    }
  }, []);

  // Request photo batch
  const requestBatch = useCallback((photoIds, quality = 60, maxDimension = 1920) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message = encode({
        type: 'REQUEST_BATCH',
        requestId: Date.now(),
        photoIds,
        quality,
        maxDimension,
        timestamp: Date.now()
      });
      wsRef.current.send(message);
    }
  }, []);

  // Handle incoming messages
  const handleMessage = useCallback((message) => {
    switch (message.type) {
      case 'AUTH_RESPONSE':
        if (message.success) {
          console.log('[PhotoSync] Authenticated successfully');
          setConnectionState(CONNECTION_STATES.CONNECTED);
          setError(null);
          // Request manifest
          requestManifest();
        } else {
          console.error('[PhotoSync] Auth failed:', message.reason);
          const errorMessages = {
            'INVALID_FORMAT': 'Invalid token format',
            'TOKEN_NOT_FOUND': 'Token not found or invalid',
            'TOKEN_REVOKED': 'Token has been revoked',
            'TOKEN_EXPIRED': 'Token has expired',
            'RATE_LIMIT_EXCEEDED': `Too many attempts. Try again in ${message.retryAfter} seconds`,
            'MISSING_TOKEN': 'Missing authentication token'
          };
          setError(errorMessages[message.reason] || `Authentication failed: ${message.reason}`);
          setConnectionState(CONNECTION_STATES.ERROR);
          wsRef.current?.close(1000, 'Auth failed');
        }
        break;

      case 'MANIFEST_RESPONSE':
        console.log(`[PhotoSync] Received manifest: ${message.count} photos`);
        // Request batch of all photos (compressed thumbnails)
        if (message.photos && message.photos.length > 0) {
          const photoIds = message.photos.map(p => p.id);
          requestBatch(photoIds, 60, 400); // Quality 60, max 400px
        }
        setPhotos(message.photos || []);
        break;

      case 'PHOTO_DATA':
        handlePhotoChunk(message);
        break;

      case 'PHOTO_COMPLETE':
        handlePhotoComplete(message);
        break;

      case 'AUTH_REVOKED':
        console.warn('[PhotoSync] Token revoked:', message.reason);
        setError('Device token has been revoked');
        setConnectionState(CONNECTION_STATES.ERROR);
        localStorage.removeItem('photosync_server');
        break;

      case 'ERROR':
        console.error('[PhotoSync] Server error:', message.code, message.message);
        if (message.code === 'AUTH_REQUIRED' || message.code === 'AUTH_TIMEOUT') {
          setError('Authentication failed');
          setConnectionState(CONNECTION_STATES.ERROR);
        } else {
          setError(message.message);
        }
        break;

      case 'PONG':
        // Heartbeat response
        break;

      default:
        console.warn('[PhotoSync] Unknown message type:', message.type);
    }
  }, [handlePhotoChunk, handlePhotoComplete, requestBatch, requestManifest]);

  // Store connect function in ref to avoid circular dependency
  const connectRef = useRef(null);

  // Auto-reconnect logic
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) return;

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      const saved = localStorage.getItem('photosync_server');
      if (saved && connectRef.current) {
        const { address, port, token } = JSON.parse(saved);
        console.log('[PhotoSync] Attempting reconnect...');
        connectRef.current(address, port, token);
      }
    }, 5000); // 5 second delay
  }, []);

  // Connect to server with token
  const connect = useCallback((serverAddress, port, token) => {
    if (wsRef.current) {
      console.warn('[PhotoSync] Already connected');
      return;
    }

    // Store connection details
    tokenRef.current = token;
    serverRef.current = { address: serverAddress, port };

    // Save to localStorage for reconnection
    localStorage.setItem('photosync_server', JSON.stringify({
      address: serverAddress,
      port,
      token
    }));

    setConnectionState(CONNECTION_STATES.CONNECTING);
    setError(null);

    const ws = new WebSocket(`ws://${serverAddress}:${port}`);
    wsRef.current = ws;

    // Set connection timeout
    const connectionTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.error('[PhotoSync] Connection timeout');
        setError('Connection timeout');
        setConnectionState(CONNECTION_STATES.ERROR);
        ws.close();
      }
    }, 10000); // 10 second timeout

    ws.onopen = () => {
      clearTimeout(connectionTimeout);
      console.log('[PhotoSync] Connected, authenticating...');
      setConnectionState(CONNECTION_STATES.AUTHENTICATING);

      // Send AUTH message (MessagePack encoded)
      const authMessage = encode({
        type: 'AUTH',
        token: token,
        deviceName: getDeviceName(),
        version: '1.0.0'
      });

      ws.send(authMessage);
    };

    ws.onmessage = (event) => {
      try {
        // Decode MessagePack
        event.data.arrayBuffer().then(buffer => {
          const message = decode(new Uint8Array(buffer));
          handleMessage(message);
        });
      } catch (err) {
        console.error('[PhotoSync] Message decode error:', err);
      }
    };

    ws.onerror = (err) => {
      clearTimeout(connectionTimeout);
      console.error('[PhotoSync] WebSocket error:', err);
      setError('Connection error');
      setConnectionState(CONNECTION_STATES.ERROR);
    };

    ws.onclose = (event) => {
      clearTimeout(connectionTimeout);
      console.log('[PhotoSync] Disconnected:', event.code, event.reason);
      wsRef.current = null;
      setConnectionState(CONNECTION_STATES.DISCONNECTED);

      // Auto-reconnect if not intentional disconnect
      if (event.code !== 1000) { // Not normal closure
        scheduleReconnect();
      }
    };
  }, [handleMessage, scheduleReconnect]);

  // Store connect in ref for scheduleReconnect
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnect');
      wsRef.current = null;
    }
    localStorage.removeItem('photosync_server');
    setConnectionState(CONNECTION_STATES.DISCONNECTED);
    setPhotos([]);
    setError(null);
  }, []);

  // Auto-connect on mount if credentials exist
  useEffect(() => {
    const saved = localStorage.getItem('photosync_server');
    if (saved) {
      try {
        const { address, port, token } = JSON.parse(saved);
        connect(address, port, token);
      } catch (error) {
        console.error('[PhotoSync] Invalid saved connection data:', error);
        localStorage.removeItem('photosync_server');
      }
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmount');
      }
    };
  }, [connect]);

  // Heartbeat
  useEffect(() => {
    if (connectionState !== CONNECTION_STATES.CONNECTED) return;

    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const ping = encode({
          type: 'PING',
          requestId: Date.now(),
          timestamp: Date.now()
        });
        wsRef.current.send(ping);
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [connectionState]);

  return {
    connectionState,
    photos,
    syncProgress,
    error,
    connect,
    disconnect,
    requestManifest,
    requestBatch
  };
};

// Helper: Generate device name from browser info
function getDeviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Win/.test(ua)) return 'Windows PC';
  return 'Web Browser';
}
