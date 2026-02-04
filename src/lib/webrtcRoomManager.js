import { supabase } from './supabase';

/**
 * WebRTC Room Manager for PWA - Handles room persistence and restoration
 */

/**
 * Get the most recent active room for reconnection
 * @param {string} [userId] - User ID (optional, will use authenticated user if not provided)
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function getMostRecentRoom(userId = null) {
  try {
    let query = supabase
      .from('webrtc_rooms')
      .select('*')
      .in('status', ['active', 'disconnected'])
      .gt('expires_at', new Date().toISOString())
      .order('updated_at', { ascending: false })
      .limit(1);

    if (userId) {
      query = query.eq('user_id', userId);
    } else {
      // If no userId provided, try to get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        query = query.eq('user_id', user.id);
      }
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('[RoomManager] Error getting recent room:', error);
      return { success: false, error: error.message };
    }

    if (!data) {
      console.log('[RoomManager] No recent room found');
      return { success: true, data: null };
    }

    console.log('[RoomManager] Found recent room:', data.room_id);
    return { success: true, data };
  } catch (err) {
    console.error('[RoomManager] Unexpected error getting recent room:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get room by room ID
 * @param {string} roomId - Room ID
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function getRoom(roomId) {
  try {
    const { data, error } = await supabase
      .from('webrtc_rooms')
      .select('*')
      .eq('room_id', roomId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return { success: true, data: null };
      }
      console.error('[RoomManager] Error getting room:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    console.error('[RoomManager] Unexpected error getting room:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Subscribe to room status changes for live updates
 * @param {string} roomId - Room ID to watch
 * @param {Function} callback - Callback function(payload)
 * @returns {Object} Subscription object with unsubscribe method
 */
export function subscribeToRoomUpdates(roomId, callback) {
  console.log('[RoomManager] Subscribing to room updates:', roomId);

  const subscription = supabase
    .channel(`room-${roomId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'webrtc_rooms',
        filter: `room_id=eq.${roomId}`
      },
      (payload) => {
        console.log('[RoomManager] Room update received:', payload);
        callback(payload);
      }
    )
    .subscribe();

  return {
    unsubscribe: () => {
      console.log('[RoomManager] Unsubscribing from room updates:', roomId);
      supabase.removeChannel(subscription);
    }
  };
}

/**
 * Update transfer state for a room (client side)
 * @param {string} roomId - Room ID
 * @param {Object} transferState - Transfer state object
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function updateTransferState(roomId, transferState) {
  try {
    const { error } = await supabase
      .from('webrtc_rooms')
      .update({ transfer_state: transferState })
      .eq('room_id', roomId);

    if (error) {
      console.error('[RoomManager] Error updating transfer state:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('[RoomManager] Unexpected error updating transfer state:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Save last connected room to localStorage for quick access
 * @param {Object} roomInfo - Room information
 * @param {string} roomInfo.roomId - Room ID
 * @param {string} roomInfo.signalingServer - Signaling server URL
 */
export function saveLastRoomToLocal(roomInfo) {
  try {
    localStorage.setItem('lastWebRTCRoom', JSON.stringify({
      roomId: roomInfo.roomId,
      signalingServer: roomInfo.signalingServer,
      savedAt: Date.now()
    }));
    console.log('[RoomManager] Saved room to localStorage:', roomInfo.roomId);
  } catch (err) {
    console.error('[RoomManager] Error saving to localStorage:', err);
  }
}

/**
 * Get last connected room from localStorage
 * @returns {Object|null} Room info or null
 */
export function getLastRoomFromLocal() {
  try {
    const stored = localStorage.getItem('lastWebRTCRoom');
    if (!stored) return null;

    const roomInfo = JSON.parse(stored);

    // Check if it's not too old (24 hours)
    const age = Date.now() - roomInfo.savedAt;
    if (age > 24 * 60 * 60 * 1000) {
      localStorage.removeItem('lastWebRTCRoom');
      return null;
    }

    return roomInfo;
  } catch (err) {
    console.error('[RoomManager] Error reading from localStorage:', err);
    return null;
  }
}

/**
 * Clear last room from localStorage
 */
export function clearLastRoomFromLocal() {
  try {
    localStorage.removeItem('lastWebRTCRoom');
    console.log('[RoomManager] Cleared room from localStorage');
  } catch (err) {
    console.error('[RoomManager] Error clearing localStorage:', err);
  }
}
