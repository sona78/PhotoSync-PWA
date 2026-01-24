import { useState, useEffect, useRef, useCallback } from 'react';
import { encode, decode } from '@msgpack/msgpack';
import { saveDeviceConnection, loadDeviceConnection, deleteDeviceConnection, updateLastConnected } from '../lib/deviceConnections';

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
          // Update last connected timestamp in Supabase
          updateLastConnected().catch(err => {
            console.warn('[PhotoSync] Failed to update last connected timestamp:', err);
          });
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

        // Clean up old blob URLs before replacing photos
        setPhotos(prevPhotos => {
          prevPhotos.forEach(photo => {
            if (photo.url && photo.url.startsWith('blob:')) {
              URL.revokeObjectURL(photo.url);
            }
            if (photo.thumbnail && photo.thumbnail.startsWith('blob:') && photo.thumbnail !== photo.url) {
              URL.revokeObjectURL(photo.thumbnail);
            }
          });
          return message.photos || [];
        });

        // Clear any pending photo buffers
        photoBuffersRef.current.clear();

        // Request batch of all photos (compressed thumbnails)
        if (message.photos && message.photos.length > 0) {
          const photoIds = message.photos.map(p => p.id);
          requestBatch(photoIds, 60, 400); // Quality 60, max 400px
        }
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
        // Remove from both Supabase and localStorage
        deleteDeviceConnection().catch(err => {
          console.warn('[PhotoSync] Failed to delete revoked connection from Supabase:', err);
        });
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

      case 'MANIFEST_UPDATE':
        console.log(`[PhotoSync] Server notified manifest update:`, message);
        console.log(`  - Reason: ${message.reason}`);
        console.log(`  - Photo count: ${message.previousCount} -> ${message.currentCount}`);

        // Automatically request fresh manifest
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          console.log('[PhotoSync] Requesting updated manifest...');
          requestManifest();
        }
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

    reconnectTimeoutRef.current = setTimeout(async () => {
      reconnectTimeoutRef.current = null;

      // Try loading from Supabase first
      const supabaseResult = await loadDeviceConnection();
      if (supabaseResult.success && supabaseResult.data && connectRef.current) {
        const { serverAddress, serverPort, authToken } = supabaseResult.data;
        console.log('[PhotoSync] Attempting reconnect with Supabase credentials...');
        connectRef.current(serverAddress, serverPort, authToken);
        return;
      }

      // Fall back to localStorage
      const saved = localStorage.getItem('photosync_server');
      if (saved && connectRef.current) {
        const { address, port, token } = JSON.parse(saved);
        console.log('[PhotoSync] Attempting reconnect with localStorage credentials...');
        connectRef.current(address, port, token);
      }
    }, 5000); // 5 second delay
  }, []);

  // Connect to server with token
  const connect = useCallback(async (serverAddress, port, token, deviceName = null) => {
    if (wsRef.current) {
      console.warn('[PhotoSync] Already connected');
      return;
    }

    // Store connection details
    tokenRef.current = token;
    serverRef.current = { address: serverAddress, port };

    // Save to Supabase for persistence across devices
    const actualDeviceName = deviceName || getDeviceName();
    const saveResult = await saveDeviceConnection(actualDeviceName, serverAddress, port, token);
    if (!saveResult.success) {
      console.warn('[PhotoSync] Failed to save connection to Supabase:', saveResult.error);
      // Continue anyway - we'll fall back to memory-only storage
    }

    // Also keep in localStorage as backup
    localStorage.setItem('photosync_server', JSON.stringify({
      address: serverAddress,
      port,
      token
    }));

    setConnectionState(CONNECTION_STATES.CONNECTING);
    setError(null);

    const wsUrl = `ws://${serverAddress}:${port}`;
    console.log('[PhotoSync] Connecting to:', wsUrl);
    console.log('[PhotoSync] Network status:', navigator.onLine ? 'Online' : 'Offline');
    console.log('[PhotoSync] Page protocol:', window.location.protocol);
    console.log('[PhotoSync] User agent:', navigator.userAgent);

    // Check for mixed content issues (HTTPS page with WS://)
    if (window.location.protocol === 'https:' && wsUrl.startsWith('ws://')) {
      console.warn('[PhotoSync] WARNING: Using insecure WebSocket (ws://) from secure page (https://). This may be blocked by the browser.');
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    // Set connection timeout
    const connectionTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.error('[PhotoSync] Connection timeout');
        const timeoutMsg = `Connection timeout to ${serverAddress}:${port}. Check that server is running and reachable from your phone's network.`;
        setError(timeoutMsg);
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

      // Provide more helpful error messages
      let errorMessage = `Cannot connect to ${serverAddress}:${port}. `;

      // Check if it's a network reachability issue
      if (!navigator.onLine) {
        errorMessage += 'No internet connection detected.';
      } else {
        errorMessage += 'Check that: (1) Server is running, (2) Phone and server are on same WiFi network, (3) Firewall allows connections.';
      }

      console.error('[PhotoSync] Error details:', errorMessage);
      setError(errorMessage);
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
  const disconnect = useCallback(async () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnect');
      wsRef.current = null;
    }

    // Remove from both Supabase and localStorage
    const deleteResult = await deleteDeviceConnection();
    if (!deleteResult.success) {
      console.warn('[PhotoSync] Failed to delete connection from Supabase:', deleteResult.error);
    }
    localStorage.removeItem('photosync_server');

    setConnectionState(CONNECTION_STATES.DISCONNECTED);

    // Cleanup blob URLs before clearing photos
    setPhotos(prevPhotos => {
      prevPhotos.forEach(photo => {
        if (photo.url && photo.url.startsWith('blob:')) {
          URL.revokeObjectURL(photo.url);
        }
        if (photo.thumbnail && photo.thumbnail.startsWith('blob:') && photo.thumbnail !== photo.url) {
          URL.revokeObjectURL(photo.thumbnail);
        }
      });
      return [];
    });

    setError(null);
  }, []);

  // Auto-connect on mount if credentials exist
  useEffect(() => {
    const attemptAutoConnect = async () => {
      // Try loading from Supabase first
      const supabaseResult = await loadDeviceConnection();
      if (supabaseResult.success && supabaseResult.data) {
        const { serverAddress, serverPort, authToken } = supabaseResult.data;
        console.log('[PhotoSync] Auto-connecting with Supabase credentials...');
        connect(serverAddress, serverPort, authToken);
        return;
      }

      // Fall back to localStorage
      const saved = localStorage.getItem('photosync_server');
      if (saved) {
        try {
          const { address, port, token } = JSON.parse(saved);
          console.log('[PhotoSync] Auto-connecting with localStorage credentials...');
          connect(address, port, token);
        } catch (error) {
          console.error('[PhotoSync] Invalid saved connection data:', error);
          localStorage.removeItem('photosync_server');
        }
      }
    };

    attemptAutoConnect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmount');
      }
      // Cleanup blob URLs on unmount
      setPhotos(prevPhotos => {
        prevPhotos.forEach(photo => {
          if (photo.url && photo.url.startsWith('blob:')) {
            URL.revokeObjectURL(photo.url);
          }
          if (photo.thumbnail && photo.thumbnail.startsWith('blob:') && photo.thumbnail !== photo.url) {
            URL.revokeObjectURL(photo.thumbnail);
          }
        });
        return [];
      });
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
