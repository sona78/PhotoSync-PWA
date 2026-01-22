import { encode, decode } from '@msgpack/msgpack';

/**
 * WebSocketClient handles authenticated WebSocket connections to PhotoSync servers
 * Automatically sends AUTH message on connect and waits for AUTH_SUCCESS
 */
class WebSocketClient {
  constructor(serverUrl, pairingToken) {
    this.serverUrl = serverUrl;
    this.pairingToken = pairingToken;
    this.ws = null;
    this.authenticated = false;
    this.messageHandlers = new Map();
    this.connectPromise = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }

  /**
   * Connect to WebSocket server and authenticate
   * @returns {Promise<void>} Resolves when authenticated, rejects on error
   */
  async connect() {
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);
        this.authenticated = false;

        // Set connection timeout (15 seconds)
        const connectTimeout = setTimeout(() => {
          if (!this.authenticated) {
            this.ws.close();
            reject(new Error('Connection timeout'));
          }
        }, 15000);

        this.ws.onopen = () => {
          console.log('[WS Client] Connected, sending AUTH...');
          
          // Immediately send AUTH message
          this.send({
            type: 'AUTH',
            pairingToken: this.pairingToken
          });
        };

        this.ws.onmessage = (event) => {
          try {
            const message = decode(event.data);
            this.handleMessage(message, connectTimeout, resolve, reject);
          } catch (error) {
            console.error('[WS Client] Message decode error:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[WS Client] WebSocket error:', error);
          clearTimeout(connectTimeout);
          reject(new Error('WebSocket connection error'));
        };

        this.ws.onclose = (event) => {
          console.log('[WS Client] Connection closed:', event.code, event.reason);
          this.authenticated = false;
          this.connectPromise = null;
          
          // Attempt reconnection if not a normal close
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`[WS Client] Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
            setTimeout(() => {
              this.connect().catch(err => {
                console.error('[WS Client] Reconnect failed:', err);
              });
            }, this.reconnectDelay * this.reconnectAttempts);
          }
        };

      } catch (error) {
        reject(error);
      }
    });

    return this.connectPromise;
  }

  /**
   * Handle incoming messages
   * @private
   */
  handleMessage(message, connectTimeout, resolve, reject) {
    const { type } = message;

    if (type === 'AUTH_SUCCESS') {
      console.log('[WS Client] Authentication successful');
      this.authenticated = true;
      clearTimeout(connectTimeout);
      if (resolve) {
        resolve();
      }
      return;
    }

    if (type === 'AUTH_FAILED') {
      console.error('[WS Client] Authentication failed:', message.message);
      clearTimeout(connectTimeout);
      this.ws.close();
      if (reject) {
        reject(new Error(message.message || 'Authentication failed'));
      }
      return;
    }

    if (type === 'ERROR') {
      console.error('[WS Client] Server error:', message.code, message.message);
      
      // Handle authentication-related errors
      if (message.code === 'NOT_AUTHENTICATED' || message.code === 'AUTH_TIMEOUT') {
        this.authenticated = false;
        this.ws.close();
      }
    }

    // Call registered message handlers
    const handler = this.messageHandlers.get(type);
    if (handler) {
      handler(message);
    } else if (type !== 'AUTH_SUCCESS' && type !== 'AUTH_FAILED') {
      // Log unhandled messages (except auth responses)
      console.log('[WS Client] Unhandled message type:', type);
    }
  }

  /**
   * Send message to server
   * @param {Object} message - Message object to send
   */
  send(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    if (!this.authenticated && message.type !== 'AUTH') {
      throw new Error('Not authenticated. Cannot send messages except AUTH.');
    }

    try {
      const encoded = encode(message);
      this.ws.send(encoded);
    } catch (error) {
      console.error('[WS Client] Send error:', error);
      throw error;
    }
  }

  /**
   * Register a message handler for a specific message type
   * @param {string} messageType - Message type to handle
   * @param {Function} handler - Handler function
   */
  onMessage(messageType, handler) {
    this.messageHandlers.set(messageType, handler);
  }

  /**
   * Remove a message handler
   * @param {string} messageType - Message type to remove handler for
   */
  offMessage(messageType) {
    this.messageHandlers.delete(messageType);
  }

  /**
   * Request photo manifest
   * @param {number} requestId - Optional request ID
   * @returns {Promise<Object>} Manifest response
   */
  async requestManifest(requestId = 0) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.offMessage('MANIFEST_RESPONSE');
        reject(new Error('Manifest request timeout'));
      }, 30000);

      this.onMessage('MANIFEST_RESPONSE', (message) => {
        clearTimeout(timeout);
        this.offMessage('MANIFEST_RESPONSE');
        resolve(message);
      });

      this.send({
        type: 'REQUEST_MANIFEST',
        requestId
      });
    });
  }

  /**
   * Request batch of compressed photos
   * @param {Array<string>} photoIds - Array of photo IDs
   * @param {number} quality - JPEG quality (1-100)
   * @param {number} maxDimension - Maximum dimension
   * @param {number} requestId - Optional request ID
   * @returns {Promise<Object>} Batch response with photo data
   */
  async requestBatch(photoIds, quality = 50, maxDimension = 1920, requestId = 0) {
    return new Promise((resolve, reject) => {
      const photos = new Map();
      let batchResponse = null;
      let totalPhotos = 0;
      let completedPhotos = 0;

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Batch request timeout'));
      }, 300000); // 5 minute timeout

      const cleanup = () => {
        clearTimeout(timeout);
        this.offMessage('BATCH_RESPONSE');
        this.offMessage('PHOTO_DATA');
        this.offMessage('PHOTO_COMPLETE');
        this.offMessage('PHOTO_ERROR');
      };

      this.onMessage('BATCH_RESPONSE', (message) => {
        batchResponse = message;
        totalPhotos = message.totalPhotos || photoIds.length;
      });

      this.onMessage('PHOTO_DATA', (message) => {
        const { photoId, chunkSeq, data } = message;
        if (!photos.has(photoId)) {
          photos.set(photoId, {
            chunks: new Map(),
            totalChunks: message.totalChunks,
            totalSize: message.totalSize
          });
        }
        const photo = photos.get(photoId);
        photo.chunks.set(chunkSeq, data);
      });

      this.onMessage('PHOTO_COMPLETE', (message) => {
        const { photoId } = message;
        completedPhotos++;
        
        if (completedPhotos === totalPhotos) {
          cleanup();
          
          // Reconstruct photos from chunks
          const photoData = {};
          for (const [id, photo] of photos.entries()) {
            const chunks = Array.from({ length: photo.totalChunks }, (_, i) => 
              photo.chunks.get(i + 1) || null
            );
            photoData[id] = {
              data: chunks.filter(Boolean),
              totalSize: photo.totalSize,
              checksum: message.checksum
            };
          }
          
          resolve({
            ...batchResponse,
            photos: photoData
          });
        }
      });

      this.onMessage('PHOTO_ERROR', (message) => {
        console.error(`[WS Client] Photo error for ${message.photoId}:`, message.error);
        completedPhotos++;
        
        if (completedPhotos === totalPhotos) {
          cleanup();
          resolve({
            ...batchResponse,
            photos: Object.fromEntries(photos),
            errors: [message]
          });
        }
      });

      this.send({
        type: 'REQUEST_BATCH',
        photoIds,
        quality,
        maxDimension,
        requestId
      });
    });
  }

  /**
   * Check if connected and authenticated
   * @returns {boolean}
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN && this.authenticated;
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.authenticated = false;
    this.connectPromise = null;
    this.messageHandlers.clear();
  }
}

export default WebSocketClient;
