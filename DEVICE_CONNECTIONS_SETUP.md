# Device Connections - Supabase Integration Setup

This document explains how to set up and use the new Supabase-based device connection storage feature.

## Overview

Device authentication credentials (server address, port, and token) are now stored in Supabase instead of just localStorage. This provides:

- **Cross-device sync**: Access your paired devices from any browser where you're logged in
- **Persistent storage**: Your connections are backed up in the cloud
- **Better security**: Row-level security ensures users can only access their own connections
- **Fallback mechanism**: Still works with localStorage as backup

## Setup Instructions

### 1. Run the Database Migration

1. Log in to your [Supabase Dashboard](https://app.supabase.com)
2. Navigate to your project
3. Go to the **SQL Editor** (in the left sidebar)
4. Copy the contents of `supabase_migration_device_connections.sql`
5. Paste it into a new query in the SQL Editor
6. Click **Run** to execute the migration

This will create:
- A `device_connections` table
- Row-level security policies
- Indexes for performance
- Automatic timestamp updates

### 2. Verify Table Creation

After running the migration:

1. Go to **Table Editor** in your Supabase dashboard
2. You should see a new table called `device_connections`
3. Click on it to verify the schema has these columns:
   - `id` (UUID, primary key)
   - `user_id` (UUID, foreign key to auth.users)
   - `device_name` (text)
   - `server_address` (text)
   - `server_port` (integer)
   - `auth_token` (text)
   - `created_at` (timestamp)
   - `updated_at` (timestamp)
   - `last_connected_at` (timestamp)

### 3. Test the Integration

The code is already integrated into your app. To test:

1. **Sign in** to the PhotoSync PWA
2. **Scan a QR code** to pair with a device
3. The connection will be automatically saved to Supabase
4. **Refresh the page** - the app should auto-reconnect using Supabase credentials
5. Try **logging in on a different browser** - your connection should sync there too
6. Click **Disconnect** - the connection will be removed from both Supabase and localStorage

### 4. Verify in Supabase

To verify connections are being saved:

1. Go to **Table Editor** > `device_connections`
2. You should see your connection entries
3. Each user will have one row (by default, enforced by UNIQUE constraint on `user_id`)

## How It Works

### When Connecting to a Device:

1. User scans QR code with server details
2. App saves connection to **both** Supabase and localStorage
3. WebSocket connection is established
4. On successful auth, `last_connected_at` timestamp is updated

### When Auto-Connecting:

1. App tries to load credentials from **Supabase first**
2. If not found or error, falls back to **localStorage**
3. Establishes connection with the retrieved credentials

### When Disconnecting:

1. WebSocket connection is closed
2. Connection is removed from **both** Supabase and localStorage

### When Token is Revoked:

1. Server sends `AUTH_REVOKED` message
2. App removes connection from **both** Supabase and localStorage
3. User must re-pair the device

## Multiple Devices Support

By default, the table uses a UNIQUE constraint on `user_id`, meaning **one device per user**.

If you want to support **multiple devices per user**:

1. Run this SQL in your Supabase SQL Editor:
   ```sql
   ALTER TABLE device_connections DROP CONSTRAINT device_connections_user_id_key;
   ```

2. Update the `saveDeviceConnection` function in `src/lib/deviceConnections.js` to remove the `onConflict` logic:
   ```javascript
   // Change from upsert to insert
   const { error } = await supabase
     .from('device_connections')
     .insert({
       user_id: user.id,
       device_name: deviceName,
       server_address: serverAddress,
       server_port: serverPort,
       auth_token: authToken,
       last_connected_at: new Date().toISOString()
     });
   ```

3. Update the UI to show a list of devices and allow selecting which one to connect to

## Security Notes

- **Row-level security** is enabled - users can only access their own connections
- Auth tokens are stored encrypted at rest by Supabase
- Consider implementing token rotation on the server side for additional security
- The `auth_token` field could be encrypted client-side before storage for extra protection

## Troubleshooting

### Connection not saving to Supabase

- Check browser console for errors
- Verify the user is authenticated (check `supabase.auth.getUser()`)
- Verify RLS policies are set up correctly in Supabase dashboard

### Auto-connect not working

- Check if the migration was run successfully
- Verify the table has data (check Table Editor in Supabase)
- Check browser console for error messages

### Multiple tabs/browsers fighting

- This is expected with auto-reconnect enabled
- Each instance tries to maintain its own WebSocket connection
- Consider implementing a "single connection" lock mechanism if needed

## Files Modified

- `src/lib/deviceConnections.js` - New API functions for Supabase operations
- `src/hooks/usePhotoSync.js` - Updated to use Supabase for storage
- `supabase_migration_device_connections.sql` - Database schema and policies

## Next Steps

Consider implementing:
- Device management UI (list, rename, delete devices)
- Last connected timestamp display
- Multiple device support with device selection
- Push notifications when new photos are available (using Supabase Realtime)
