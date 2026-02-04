import { supabase } from './supabase';

/**
 * WebRTC Connection Manager for PWA
 * Handles saving and loading WebRTC connection info to/from Supabase
 *
 * NOTE: Supports persistent QR codes where room IDs remain valid indefinitely
 * (Electron desktop app generates permanent room IDs that don't change on restart)
 */

/**
 * Save WebRTC connection info to Supabase
 * @param {Object} connectionInfo
 * @param {string} connectionInfo.signalingServer - Signaling server URL
 * @param {string} connectionInfo.roomId - Room ID
 * @param {string} connectionInfo.deviceName - Optional device name
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function saveWebRTCConnection(connectionInfo) {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.log('[WebRTCConnection] No authenticated user, using localStorage only');
      saveToLocalStorage(connectionInfo);
      return { success: true };
    }

    // Save to Supabase
    const { error } = await supabase
      .from('webrtc_connections')
      .upsert({
        user_id: user.id,
        signaling_server: connectionInfo.signalingServer,
        room_id: connectionInfo.roomId,
        device_name: connectionInfo.deviceName || 'Desktop',
        last_connected_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('[WebRTCConnection] Error saving to Supabase:', error);
      // Still save to localStorage as fallback
      saveToLocalStorage(connectionInfo);
      return { success: false, error: error.message };
    }

    console.log('[WebRTCConnection] Connection saved to Supabase');
    // Also save to localStorage for offline access
    saveToLocalStorage(connectionInfo);
    return { success: true };
  } catch (err) {
    console.error('[WebRTCConnection] Unexpected error saving connection:', err);
    saveToLocalStorage(connectionInfo);
    return { success: false, error: err.message };
  }
}

/**
 * Load saved WebRTC connection info
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function loadWebRTCConnection() {
  try {
    // Try Supabase first if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data, error } = await supabase
        .from('webrtc_connections')
        .select('signaling_server, room_id, device_name, last_connected_at')
        .eq('user_id', user.id)
        .order('last_connected_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[WebRTCConnection] Error loading from Supabase:', error);
      } else if (data) {
        // Check if connection is not too old (90 days - persistent QR codes remain valid)
        // Extended from 24 hours to support persistent room IDs that don't change
        const lastConnected = new Date(data.last_connected_at);
        const age = Date.now() - lastConnected.getTime();
        const maxAge = 90 * 24 * 60 * 60 * 1000; // 90 days

        if (age < maxAge) {
          const ageInDays = Math.floor(age / (24 * 60 * 60 * 1000));
          console.log(`[WebRTCConnection] Found saved connection in Supabase (${ageInDays} days old)`);
          return {
            success: true,
            data: {
              signalingServer: data.signaling_server,
              roomId: data.room_id,
              deviceName: data.device_name,
              lastConnectedAt: data.last_connected_at,
              persistent: true // Flag indicating this is a persistent QR code
            }
          };
        } else {
          console.log('[WebRTCConnection] Supabase connection too old (>90 days), ignoring');
        }
      }
    }

    // Fallback to localStorage
    const localData = loadFromLocalStorage();
    if (localData) {
      console.log('[WebRTCConnection] Found connection in localStorage');
      return { success: true, data: localData };
    }

    console.log('[WebRTCConnection] No saved connection found');
    return { success: true, data: null };
  } catch (err) {
    console.error('[WebRTCConnection] Unexpected error loading connection:', err);
    // Try localStorage as fallback
    const localData = loadFromLocalStorage();
    if (localData) {
      return { success: true, data: localData };
    }
    return { success: false, error: err.message };
  }
}

/**
 * Delete saved WebRTC connection
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteWebRTCConnection() {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { error } = await supabase
        .from('webrtc_connections')
        .delete()
        .eq('user_id', user.id);

      if (error) {
        console.error('[WebRTCConnection] Error deleting from Supabase:', error);
      } else {
        console.log('[WebRTCConnection] Connection deleted from Supabase');
      }
    }

    // Always clear localStorage
    clearLocalStorage();
    return { success: true };
  } catch (err) {
    console.error('[WebRTCConnection] Unexpected error deleting connection:', err);
    clearLocalStorage();
    return { success: false, error: err.message };
  }
}

/**
 * Update last connected timestamp
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function updateLastConnected() {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { error } = await supabase
      .from('webrtc_connections')
      .update({ last_connected_at: new Date().toISOString() })
      .eq('user_id', user.id);

    if (error) {
      console.error('[WebRTCConnection] Error updating timestamp:', error);
      return { success: false, error: error.message };
    }

    console.log('[WebRTCConnection] Last connected timestamp updated');
    return { success: true };
  } catch (err) {
    console.error('[WebRTCConnection] Unexpected error updating timestamp:', err);
    return { success: false, error: err.message };
  }
}

// ========== LocalStorage Helpers ==========

const STORAGE_KEY = 'photosync_webrtc_connection';

function saveToLocalStorage(connectionInfo) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      signalingServer: connectionInfo.signalingServer,
      roomId: connectionInfo.roomId,
      deviceName: connectionInfo.deviceName,
      savedAt: Date.now()
    }));
    console.log('[WebRTCConnection] Saved to localStorage');
  } catch (err) {
    console.error('[WebRTCConnection] Error saving to localStorage:', err);
  }
}

function loadFromLocalStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const data = JSON.parse(stored);

    // Check if not too old (90 days - persistent QR codes remain valid)
    // Extended from 24 hours to support persistent room IDs
    const age = Date.now() - data.savedAt;
    const maxAge = 90 * 24 * 60 * 60 * 1000; // 90 days

    if (age > maxAge) {
      console.log('[WebRTCConnection] localStorage connection too old (>90 days), clearing');
      clearLocalStorage();
      return null;
    }

    const ageInDays = Math.floor(age / (24 * 60 * 60 * 1000));
    console.log(`[WebRTCConnection] Found connection in localStorage (${ageInDays} days old)`);

    return {
      signalingServer: data.signalingServer,
      roomId: data.roomId,
      deviceName: data.deviceName,
      lastConnectedAt: new Date(data.savedAt).toISOString(),
      persistent: true // Flag indicating this is a persistent QR code
    };
  } catch (err) {
    console.error('[WebRTCConnection] Error loading from localStorage:', err);
    return null;
  }
}

function clearLocalStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[WebRTCConnection] Cleared localStorage');
  } catch (err) {
    console.error('[WebRTCConnection] Error clearing localStorage:', err);
  }
}
