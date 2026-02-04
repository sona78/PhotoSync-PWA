-- WebRTC Connections Table for PWA
-- Run this in Supabase SQL Editor to create the table

-- Create webrtc_connections table
CREATE TABLE IF NOT EXISTS webrtc_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User association
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  -- Connection details
  signaling_server TEXT NOT NULL,
  room_id TEXT NOT NULL,
  device_name TEXT DEFAULT 'Desktop',

  -- Timestamps
  last_connected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_webrtc_connections_user_id ON webrtc_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_connections_last_connected ON webrtc_connections(last_connected_at);

-- Enable Row Level Security
ALTER TABLE webrtc_connections ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own connection
CREATE POLICY "Users can read own connection"
  ON webrtc_connections FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own connection
CREATE POLICY "Users can insert own connection"
  ON webrtc_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own connection
CREATE POLICY "Users can update own connection"
  ON webrtc_connections FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own connection
CREATE POLICY "Users can delete own connection"
  ON webrtc_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_webrtc_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER webrtc_connections_updated_at
  BEFORE UPDATE ON webrtc_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_webrtc_connections_updated_at();

-- Function to cleanup old connections (optional)
CREATE OR REPLACE FUNCTION cleanup_old_webrtc_connections()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM webrtc_connections
  WHERE last_connected_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Note: You can set up a cron job in Supabase to run cleanup_old_webrtc_connections() weekly
