/**
 * PhotoSync WebRTC Hook
 *
 * Uses WebRTC P2P connection instead of direct HTTP/Socket.IO.
 * Benefits:
 * - No firewall issues (both sides connect out)
 * - Works through VPNs
 * - Direct P2P connection (private and fast)
 * - No certificate complexity
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import SimplePeer from 'simple-peer';
import { io } from 'socket.io-client';

export const usePhotoSyncWebRTC = () => {
  // Connection state
  const [connectionState, setConnectionState] = useState('disconnected'); // disconnected, connecting, connected, error
  const [error, setError] = useState(null);

  // Photo data
  const [photos, setPhotos] = useState([]);
  const [photoData, setPhotoData] = useState({}); // photoId -> blob URL

  // Progress tracking
  const [syncProgress, ] = useState({ current: 0, total: 0 });

  // Connection info
  const [connectionInfo, setConnectionInfo] = useState(null); // { signalingServer, roomId }

  // Refs for persistent connections
  const signalingSocketRef = useRef(null);
  const peerRef = useRef(null);
  const photoBufferRef = useRef(null); // Buffer for receiving photo chunks
  const currentPhotoRef = useRef(null); // Current photo being received

  // Debug logs
  const [debugLogs, setDebugLogs] = useState([]);
  const maxLogs = 200;

  const addLog = useCallback((message, level = 'info') => {
    const timestamp = new Date().toISOString();
    const log = { timestamp, message, level };
    setDebugLogs(prev => [...prev.slice(-maxLogs + 1), log]);
    console.log(`[WebRTC ${level.toUpperCase()}]`, message);
  }, []);

  /**
   * Connect to desktop via WebRTC
   */
  const connect = useCallback(async (signalingServer, roomId) => {
    try {
      addLog(`Connecting to signaling server: ${signalingServer}`);
      setConnectionState('connecting');
      setError(null);
      setConnectionInfo({ signalingServer, roomId });

      // Connect to signaling server
      const socket = io(signalingServer, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 10
      });

      signalingSocketRef.current = socket;

      socket.on('connect', () => {
        addLog('Connected to signaling server');
        // Join room
        socket.emit('join-room', { roomId });
      });

      socket.on('room-joined', ({ roomId: joinedRoomId, desktopId }) => {
        addLog(`Joined room: ${joinedRoomId}, desktop: ${desktopId}`);
        // Create peer connection (desktop is initiator, we are not)
        createPeerConnection(false, desktopId);
      });

      socket.on('offer', ({ from, offer }) => {
        addLog(`Received offer from ${from}`);
        if (!peerRef.current) {
          createPeerConnection(false, from);
        }
        if (peerRef.current) {
          peerRef.current.signal(offer);
        }
      });

      socket.on('answer', ({ from, answer }) => {
        addLog(`Received answer from ${from}`);
        if (peerRef.current) {
          peerRef.current.signal(answer);
        }
      });

      socket.on('ice-candidate', ({ from, candidate }) => {
        addLog(`Received ICE candidate from ${from}`);
        if (peerRef.current) {
          peerRef.current.signal({ candidate });
        }
      });

      socket.on('signal', ({ from, signal }) => {
        addLog(`Received signal from ${from}`);
        if (peerRef.current) {
          peerRef.current.signal(signal);
        }
      });

      socket.on('desktop-disconnected', () => {
        addLog('Desktop disconnected', 'warn');
        setError('Desktop disconnected');
        setConnectionState('disconnected');
        cleanup();
      });

      socket.on('error', (err) => {
        addLog(`Signaling error: ${err.message || JSON.stringify(err)}`, 'error');
        setError(err.message || 'Signaling error');
        setConnectionState('error');
      });

      socket.on('disconnect', () => {
        addLog('Disconnected from signaling server', 'warn');
        if (connectionState !== 'disconnected') {
          setConnectionState('connecting'); // Will auto-reconnect
        }
      });

      // Create peer connection
      const createPeerConnection = (initiator, desktopId) => {
        addLog(`Creating peer connection (initiator: ${initiator})`);

        const peer = new SimplePeer({
          initiator,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' }
            ]
          }
        });

        peer.on('signal', (signal) => {
          addLog('Sending signal to desktop');

          if (signal.type === 'offer') {
            socket.emit('offer', { to: desktopId, offer: signal });
          } else if (signal.type === 'answer') {
            socket.emit('answer', { to: desktopId, answer: signal });
          } else if (signal.candidate) {
            socket.emit('ice-candidate', { to: desktopId, candidate: signal.candidate });
          } else {
            socket.emit('signal', { to: desktopId, signal });
          }
        });

        peer.on('connect', () => {
          addLog('P2P connection established! 🎉');
          setConnectionState('connected');
          setError(null);

          // Request manifest
          requestManifest();
        });

        peer.on('data', (data) => {
          handlePeerData(data);
        });

        peer.on('error', (err) => {
          addLog(`Peer error: ${err.message}`, 'error');
          setError(err.message);
          setConnectionState('error');
        });

        peer.on('close', () => {
          addLog('P2P connection closed', 'warn');
          setConnectionState('disconnected');
        });

        peerRef.current = peer;
      };

    } catch (err) {
      addLog(`Connection error: ${err.message}`, 'error');
      setError(err.message);
      setConnectionState('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionState, addLog]);

  /**
   * Finish photo download and create blob URL
   */
  const finishPhotoDownload = useCallback(() => {
    if (!currentPhotoRef.current || !photoBufferRef.current) {
      return;
    }

    try {
      const photoInfo = currentPhotoRef.current;
      const blob = new Blob(photoBufferRef.current, { type: photoInfo.mimeType });
      const url = URL.createObjectURL(blob);

      setPhotoData(prev => ({
        ...prev,
        [photoInfo.id]: url
      }));

      addLog(`Photo ${photoInfo.id} ready for display`);

      // Cleanup
      currentPhotoRef.current = null;
      photoBufferRef.current = null;
    } catch (err) {
      addLog(`Error finishing photo download: ${err.message}`, 'error');
    }
  }, [addLog]);

  /**
   * Handle data from peer
   */
  const handlePeerData = useCallback((data) => {
    try {
      // Try to parse as JSON
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'manifest':
          addLog(`Received manifest: ${message.photos.length} photos`);
          // Transform photos to match Gallery component expectations
          const transformedPhotos = message.photos.map(photo => ({
            id: photo.id,
            filename: photo.name,
            thumbnail: null, // Will be loaded on demand
            url: null, // Will be loaded on demand
            size: photo.size,
            width: photo.width,
            height: photo.height,
            modified: photo.modified,
            created: photo.created
          }));
          setPhotos(transformedPhotos);
          break;

        case 'photo-start':
          addLog(`Starting photo download: ${message.photoId} (${message.size} bytes)`);
          currentPhotoRef.current = {
            id: message.photoId,
            name: message.name,
            size: message.size,
            mimeType: message.mimeType
          };
          photoBufferRef.current = [];
          break;

        case 'photo-complete':
          addLog(`Photo download complete: ${message.photoId}`);
          finishPhotoDownload();
          break;

        case 'pong':
          // Ping response
          break;

        case 'error':
          addLog(`Error: ${message.error}`, 'error');
          setError(message.error);
          break;

        default:
          addLog(`Unknown message type: ${message.type}`, 'warn');
      }
    } catch (e) {
      // Binary data (photo chunk)
      if (currentPhotoRef.current) {
        photoBufferRef.current.push(data);
      }
    }
  }, [addLog, finishPhotoDownload]);

  /**
   * Send message to peer
   */
  const sendToPeer = useCallback((message) => {
    if (peerRef.current && !peerRef.current.destroyed) {
      peerRef.current.send(JSON.stringify(message));
    }
  }, []);

  /**
   * Request photo manifest
   */
  const requestManifest = useCallback(() => {
    addLog('Requesting photo manifest');
    sendToPeer({ type: 'request-manifest' });
  }, [sendToPeer, addLog]);

  /**
   * Request specific photo
   */
  const requestPhoto = useCallback((photoId, quality = 60, maxDimension = 1920) => {
    addLog(`Requesting photo: ${photoId}`);
    sendToPeer({
      type: 'request-photo',
      photoId,
      quality,
      maxDimension
    });
  }, [sendToPeer, addLog]);

  /**
   * Request multiple photos (batch)
   */
  const requestPhotos = useCallback((photoIds) => {
    addLog(`Requesting ${photoIds.length} photos`);
    photoIds.forEach(id => requestPhoto(id));
  }, [requestPhoto, addLog]);

  /**
   * Cleanup connections
   */
  const cleanup = useCallback(() => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }

    if (signalingSocketRef.current) {
      signalingSocketRef.current.disconnect();
      signalingSocketRef.current = null;
    }

    // Clean up blob URLs
    Object.values(photoData).forEach(url => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
  }, [photoData]);

  /**
   * Disconnect
   */
  const disconnect = useCallback(() => {
    addLog('Disconnecting...');
    cleanup();
    setConnectionState('disconnected');
  }, [addLog, cleanup]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    // Connection
    connect,
    disconnect,
    connectionState,
    connectionInfo,
    error,

    // Photos
    photos,
    photoData,
    requestManifest,
    requestPhoto,
    requestPhotos,

    // Progress
    syncProgress,

    // Debug
    debugLogs
  };
};

export default usePhotoSyncWebRTC;
