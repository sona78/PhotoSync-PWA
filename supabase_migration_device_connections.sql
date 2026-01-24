-- Migration: Create device_connections table for storing PhotoSync device authentication data
-- Run this in your Supabase SQL Editor

-- Create device_connections table
CREATE TABLE IF NOT EXISTS device_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  server_address TEXT NOT NULL,
  server_port INTEGER NOT NULL,
  auth_token TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_connected_at TIMESTAMP WITH TIME ZONE,

  -- Ensure one connection per user (modify if you want multiple devices per user)
  UNIQUE(user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_device_connections_user_id ON device_connections(user_id);

-- Enable Row Level Security
ALTER TABLE device_connections ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Users can only see their own device connections
CREATE POLICY "Users can view their own device connections"
  ON device_connections
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own device connections
CREATE POLICY "Users can insert their own device connections"
  ON device_connections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own device connections
CREATE POLICY "Users can update their own device connections"
  ON device_connections
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own device connections
CREATE POLICY "Users can delete their own device connections"
  ON device_connections
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_device_connections_updated_at
  BEFORE UPDATE ON device_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Note: If you want to support multiple devices per user, remove the UNIQUE constraint:
-- ALTER TABLE device_connections DROP CONSTRAINT device_connections_user_id_key;
