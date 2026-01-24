import { supabase } from './supabase';

/**
 * Save device connection details to Supabase
 * @param {string} deviceName - Name of the device
 * @param {string} serverAddress - Server IP address
 * @param {number} serverPort - Server port
 * @param {string} authToken - Authentication token
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function saveDeviceConnection(deviceName, serverAddress, serverPort, authToken) {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Upsert the device connection (insert or update if exists)
    const { error } = await supabase
      .from('device_connections')
      .upsert({
        user_id: user.id,
        device_name: deviceName,
        server_address: serverAddress,
        server_port: serverPort,
        auth_token: authToken,
        last_connected_at: new Date().toISOString()
      }, {
        onConflict: 'user_id' // Update if user_id already exists
      });

    if (error) {
      console.error('[DeviceConnections] Error saving connection:', error);
      return { success: false, error: error.message };
    }

    console.log('[DeviceConnections] Connection saved successfully');
    return { success: true };
  } catch (err) {
    console.error('[DeviceConnections] Unexpected error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Load device connection details from Supabase
 * @returns {Promise<{success: boolean, data?: {deviceName: string, serverAddress: string, serverPort: number, authToken: string}, error?: string}>}
 */
export async function loadDeviceConnection() {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { data, error } = await supabase
      .from('device_connections')
      .select('device_name, server_address, server_port, auth_token, last_connected_at')
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found - this is not an error, just no saved connection
        console.log('[DeviceConnections] No saved connection found');
        return { success: true, data: null };
      }
      console.error('[DeviceConnections] Error loading connection:', error);
      return { success: false, error: error.message };
    }

    console.log('[DeviceConnections] Connection loaded successfully');
    return {
      success: true,
      data: {
        deviceName: data.device_name,
        serverAddress: data.server_address,
        serverPort: data.server_port,
        authToken: data.auth_token,
        lastConnectedAt: data.last_connected_at
      }
    };
  } catch (err) {
    console.error('[DeviceConnections] Unexpected error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Delete device connection from Supabase
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteDeviceConnection() {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { error } = await supabase
      .from('device_connections')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      console.error('[DeviceConnections] Error deleting connection:', error);
      return { success: false, error: error.message };
    }

    console.log('[DeviceConnections] Connection deleted successfully');
    return { success: true };
  } catch (err) {
    console.error('[DeviceConnections] Unexpected error:', err);
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
      return { success: false, error: 'User not authenticated' };
    }

    const { error } = await supabase
      .from('device_connections')
      .update({ last_connected_at: new Date().toISOString() })
      .eq('user_id', user.id);

    if (error) {
      console.error('[DeviceConnections] Error updating last connected:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('[DeviceConnections] Unexpected error:', err);
    return { success: false, error: err.message };
  }
}
