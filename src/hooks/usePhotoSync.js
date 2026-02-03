import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import CryptoJS from 'crypto-js';
import { saveDeviceConnection, loadDeviceConnection, deleteDeviceConnection, updateLastConnected } from '../lib/deviceConnections';

const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
};

export const usePhotoSync = () => {
  const [connectionState, setConnectionState] = useState(CONNECTION_STATES.DISCONNECTED);
  const [photos, setPhotos] = useState([]);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState(null);
  const [debugLogs, setDebugLogs] = useState([]);

  const socketRef = useRef(null);
  const tokenRef = useRef(null);
  const serverRef = useRef(null);
  const connectRef = useRef(null);

  // Debug logging function with enhanced metadata
  const addLog = useCallback((level, message, metadata = {}) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
      level,
      message,
      timestamp,
      ...metadata
    };

    // Also log to console with metadata
    const consoleMsg = `[PhotoSync ${timestamp}] ${message}`;
    const consoleData = Object.keys(metadata).length > 0 ? metadata : undefined;

    if (level === 'error') {
      console.error(consoleMsg, consoleData || '');
    } else if (level === 'warn') {
      console.warn(consoleMsg, consoleData || '');
    } else {
      console.log(consoleMsg, consoleData || '');
    }

    setDebugLogs(prev => [...prev.slice(-199), logEntry]); // Keep last 200 logs
  }, []);

  // Request photo batch
  const requestBatch = useCallback((photoIds, quality = 60, maxDimension = 1920) => {
    if (socketRef.current?.connected) {
      addLog('info', `Requesting batch: ${photoIds.length} photos`, {
        quality,
        maxDimension
      });

      socketRef.current.emit('photos:request-batch', {
        photoIds,
        quality,
        maxDimension
      }, (response) => {
        if (response.error) {
          addLog('error', 'Batch request failed', response.error);
          setError(response.error.message);
        }
      });
    }
  }, [addLog]);

  // Request manifest with acknowledgment
  const requestManifest = useCallback(() => {
    if (socketRef.current?.connected) {
      addLog('info', 'Requesting manifest...');
      socketRef.current.emit('manifest:request', {}, (response) => {
        if (response.error) {
          addLog('error', 'Manifest request failed', response.error);
          setError(response.error.message);
          return;
        }

        addLog('info', `Received manifest: ${response.count} photos`, {
          hash: response.hash
        });

        // Clean up old blob URLs
        setPhotos(prevPhotos => {
          prevPhotos.forEach(photo => {
            if (photo.url?.startsWith('blob:')) {
              URL.revokeObjectURL(photo.url);
            }
            if (photo.thumbnail?.startsWith('blob:') && photo.thumbnail !== photo.url) {
              URL.revokeObjectURL(photo.thumbnail);
            }
          });
          return response.photos || [];
        });

        // Auto-request thumbnails
        if (response.photos?.length > 0) {
          const photoIds = response.photos.map(p => p.id);
          requestBatch(photoIds, 60, 400); // Quality 60, max 400px for thumbnails
        }
      });
    }
  }, [addLog, requestBatch]);

  // Photo data handler - receives binary chunks
  const photoBuffersRef = useRef(new Map());

  const setupPhotoHandlers = useCallback((socket) => {
    // Photo data chunks
    socket.on('photo:data', (data) => {
      const { photoId, chunk, totalSize, checksum, mimeType } = data;

      // Initialize buffer if first chunk
      if (!photoBuffersRef.current.has(photoId)) {
        photoBuffersRef.current.set(photoId, {
          chunks: [],
          receivedSize: 0,
          totalSize,
          checksum,
          mimeType: mimeType || 'image/jpeg'
        });
        addLog('info', `Receiving photo: ${photoId}`, { totalSize, mimeType });
      }

      const buffer = photoBuffersRef.current.get(photoId);
      buffer.chunks.push(chunk);
      buffer.receivedSize += chunk.byteLength || chunk.length;

      // Update progress
      setSyncProgress({
        current: buffer.receivedSize,
        total: totalSize
      });
    });

    // Photo complete - assemble and validate
    socket.on('photo:complete', ({ photoId, totalSize, checksum }) => {
      const buffer = photoBuffersRef.current.get(photoId);

      if (!buffer) {
        addLog('error', `No buffer for completed photo: ${photoId}`);
        return;
      }

      // Concatenate chunks
      const fullData = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of buffer.chunks) {
        const uint8Chunk = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : new Uint8Array(chunk);
        fullData.set(uint8Chunk, offset);
        offset += uint8Chunk.length;
      }

      // Validate checksum
      const wordArray = CryptoJS.lib.WordArray.create(fullData);
      const hash = CryptoJS.MD5(wordArray).toString();

      if (hash !== checksum) {
        addLog('error', `Checksum mismatch for photo ${photoId}`, {
          expected: checksum,
          actual: hash
        });
        photoBuffersRef.current.delete(photoId);
        return;
      }

      // Create blob URL
      const blob = new Blob([fullData], { type: buffer.mimeType });
      const url = URL.createObjectURL(blob);

      // Update photos
      setPhotos(prev => prev.map(p =>
        p.id === photoId ? { ...p, url, thumbnail: url } : p
      ));

      addLog('info', `Photo received: ${photoId}`, {
        size: totalSize,
        checksumValid: true
      });

      // Cleanup
      photoBuffersRef.current.delete(photoId);
    });
  }, [addLog]);

  // Connect function
  const connect = useCallback(async (serverAddress, port, token, deviceName = null) => {
    if (socketRef.current?.connected) {
      addLog('warn', 'Already connected or connecting');
      return;
    }

    setConnectionState(CONNECTION_STATES.CONNECTING);
    setError(null);

    const wsUrl = `wss://${serverAddress}:${port}`;
    const actualDeviceName = deviceName || getDeviceName();

    addLog('info', 'Connecting to Socket.IO server...', {
      url: wsUrl,
      deviceName: actualDeviceName
    });

    // Save connection details
    try {
      await saveDeviceConnection(actualDeviceName, serverAddress, port, token);
      localStorage.setItem('photosync_server', JSON.stringify({
        address: serverAddress,
        port,
        token
      }));
    } catch (err) {
      addLog('warn', `Failed to save connection details: ${err.message}`);
    }

    // Create Socket.IO client
    const socket = io(wsUrl, {
      auth: {
        token,
        deviceName: actualDeviceName,
        version: '1.0.0'
      },
      transports: ['polling', 'websocket'], // Try polling first, then upgrade to websocket
      reconnection: true,
      reconnectionDelay: 5000,
      reconnectionAttempts: Infinity,
      upgrade: true, // Allow upgrade from polling to websocket
      rememberUpgrade: true // Remember successful upgrades
    });

    socketRef.current = socket;
    tokenRef.current = token;
    serverRef.current = { address: serverAddress, port };

    // Connection success
    socket.on('connect', () => {
      addLog('info', '✅ Connected and authenticated!', {
        socketId: socket.id
      });
      setConnectionState(CONNECTION_STATES.CONNECTED);
      setError(null);

      // Update last connected timestamp
      updateLastConnected().catch(err => {
        addLog('warn', `Failed to update last connected timestamp: ${err.message}`);
      });

      // Request manifest
      requestManifest();
    });

    // Connection error (auth failed or connection issue)
    socket.on('connect_error', (error) => {
      const errorMsg = error.message;
      addLog('error', 'Connection failed', { error: errorMsg });

      // Parse error codes
      if (errorMsg.startsWith('RATE_LIMIT_EXCEEDED:')) {
        const retryAfter = errorMsg.split(':')[1];
        setError(`Too many authentication attempts. Try again in ${retryAfter} seconds`);
      } else if (errorMsg === 'INVALID_TOKEN') {
        setError('Invalid authentication token. Please pair again.');
      } else if (errorMsg === 'TOKEN_EXPIRED') {
        setError('Token has expired. Please pair again.');
      } else if (errorMsg === 'TOKEN_REVOKED') {
        setError('Token has been revoked. Please pair again.');
      } else if (errorMsg === 'TOKEN_NOT_FOUND') {
        setError('Token not found. Please pair again.');
      } else {
        setError(`Cannot connect to server: ${errorMsg}`);
      }

      setConnectionState(CONNECTION_STATES.ERROR);
    });

    // Disconnection
    socket.on('disconnect', (reason) => {
      addLog('warn', 'Disconnected from server', { reason });
      setConnectionState(CONNECTION_STATES.DISCONNECTED);

      // Socket.IO handles reconnection automatically
      // Only need manual reconnect if server forced disconnect
      if (reason === 'io server disconnect') {
        addLog('info', 'Server disconnected. Will attempt to reconnect...');
        // Auto-reconnect is enabled, so it will retry
      }
    });

    // Manifest update broadcast
    socket.on('manifest:updated', (data) => {
      addLog('info', 'Manifest updated by server', data);
      requestManifest();
    });

    // Auth revoked
    socket.on('auth:revoked', (data) => {
      addLog('error', 'Token revoked by server', data);
      setError('Device token has been revoked. Please pair again.');
      setConnectionState(CONNECTION_STATES.ERROR);

      deleteDeviceConnection();
      localStorage.removeItem('photosync_server');
      socket.disconnect();
    });

    // Batch events
    socket.on('photos:batch-started', ({ totalPhotos, estimatedTime }) => {
      addLog('info', `Batch started: ${totalPhotos} photos`, {
        estimatedTime: estimatedTime + 's'
      });
    });

    socket.on('photos:batch-progress', ({ completed, total }) => {
      addLog('info', `Batch progress: ${completed}/${total}`);
    });

    // Photo events
    socket.on('photo:complete', ({ photoId, totalSize, checksum }) => {
      addLog('info', `Photo complete: ${photoId}`, {
        totalSize,
        checksum
      });
    });

    socket.on('photo:error', ({ photoId, code, message }) => {
      addLog('error', `Photo error: ${photoId}`, {
        code,
        message
      });
    });

    // Generic error event
    socket.on('error', (error) => {
      addLog('error', 'Socket error', { error: error.message || error });
    });

    // Setup photo handlers
    setupPhotoHandlers(socket);
  }, [addLog, requestManifest, setupPhotoHandlers]);

  // Disconnect function
  const disconnect = useCallback(async () => {
    if (socketRef.current) {
      addLog('info', 'Disconnecting...');
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    tokenRef.current = null;
    serverRef.current = null;

    await deleteDeviceConnection();
    localStorage.removeItem('photosync_server');

    setConnectionState(CONNECTION_STATES.DISCONNECTED);

    // Clean up blob URLs
    setPhotos(prevPhotos => {
      prevPhotos.forEach(photo => {
        if (photo.url?.startsWith('blob:')) {
          URL.revokeObjectURL(photo.url);
        }
        if (photo.thumbnail?.startsWith('blob:') && photo.thumbnail !== photo.url) {
          URL.revokeObjectURL(photo.thumbnail);
        }
      });
      return [];
    });

    setError(null);
    addLog('info', 'Disconnected');
  }, [addLog]);

  // Store connect function in ref for auto-connect
  connectRef.current = connect;

  // Auto-connect on mount
  useEffect(() => {
    const attemptAutoConnect = async () => {
      addLog('info', 'Checking for saved connection...');

      // Try Supabase first
      const supabaseResult = await loadDeviceConnection();
      if (supabaseResult.success && supabaseResult.data) {
        const { serverAddress, serverPort, authToken } = supabaseResult.data;
        addLog('info', `Found Supabase credentials for ${serverAddress}:${serverPort}`);
        connectRef.current(serverAddress, serverPort, authToken);
        return;
      }

      // Fall back to localStorage
      const saved = localStorage.getItem('photosync_server');
      if (saved) {
        try {
          const { address, port, token } = JSON.parse(saved);
          addLog('info', `Found localStorage credentials for ${address}:${port}`);
          connectRef.current(address, port, token);
        } catch (error) {
          addLog('error', `Invalid saved connection data: ${error.message}`);
          localStorage.removeItem('photosync_server');
        }
      } else {
        addLog('info', 'No saved connection found');
      }
    };

    attemptAutoConnect();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      // Cleanup blob URLs on unmount
      setPhotos(prevPhotos => {
        prevPhotos.forEach(photo => {
          if (photo.url?.startsWith('blob:')) {
            URL.revokeObjectURL(photo.url);
          }
          if (photo.thumbnail?.startsWith('blob:') && photo.thumbnail !== photo.url) {
            URL.revokeObjectURL(photo.thumbnail);
          }
        });
        return [];
      });
    };
  }, [addLog]);

  const clearLogs = useCallback(() => {
    setDebugLogs([]);
    addLog('info', 'Logs cleared');
  }, [addLog]);

  return {
    connectionState,
    photos,
    syncProgress,
    error,
    debugLogs,
    clearLogs,
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
