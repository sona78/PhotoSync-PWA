import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import WebSocketClient from '../lib/WebSocketClient';
import './Gallery.css';

const Gallery = ({ onPhotoCountChange }) => {
  const [photos, setPhotos] = useState([]);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const wsClientRef = useRef(null);
  const deviceRef = useRef(null);

  useEffect(() => {
    loadPhotos();
    
    // Cleanup on unmount
    return () => {
      if (wsClientRef.current) {
        wsClientRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    onPhotoCountChange(photos.length);
  }, [photos, onPhotoCountChange]);

  const loadPhotos = async () => {
    try {
      setLoading(true);
      setError('');

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      // Fetch paired devices
      const { data: devices, error: devicesError } = await supabase
        .from('user_devices')
        .select('*')
        .eq('user_id', user.id)
        .order('paired_at', { ascending: false })
        .limit(1);

      if (devicesError) {
        throw devicesError;
      }

      if (!devices || devices.length === 0) {
        setError('No paired devices. Please pair a device in Settings.');
        setLoading(false);
        return;
      }

      const device = devices[0];
      deviceRef.current = device;

      // Connect to WebSocket
      const wsClient = new WebSocketClient(device.server_url, device.pairing_token);
      wsClientRef.current = wsClient;

      await wsClient.connect();

      // Request manifest
      const manifest = await wsClient.requestManifest();
      
      if (manifest && manifest.photos) {
        // Transform manifest photos to gallery format
        const galleryPhotos = manifest.photos.map(photo => ({
          id: photo.id,
          filename: photo.filename,
          size: photo.size,
          modified: photo.modified,
          width: photo.width,
          height: photo.height,
          thumbnailUrl: `${device.http_url}/api/photo/${photo.id}?quality=60&maxDimension=200`,
          fullUrl: `${device.http_url}/api/photo/${photo.id}?quality=80&maxDimension=1920`
        }));

        setPhotos(galleryPhotos);
      } else {
        setPhotos([]);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading photos:', err);
      setError(err.message || 'Failed to load photos');
      setLoading(false);
      
      // Cleanup on error
      if (wsClientRef.current) {
        wsClientRef.current.disconnect();
        wsClientRef.current = null;
      }
    }
  };

  const handlePhotoClick = (photo) => {
    setSelectedPhoto(photo);
  };

  const handleClosePhoto = () => {
    setSelectedPhoto(null);
  };

  if (loading) {
    return (
      <div className="gallery-empty">
        LOADING PHOTOS...
      </div>
    );
  }

  if (error) {
    return (
      <div className="gallery-empty">
        ERROR: {error}
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="gallery-empty">
        NO PHOTOS FOUND<br />
        PAIR A DEVICE IN SETTINGS
      </div>
    );
  }

  return (
    <>
      <div className="gallery">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="photo-item"
            onClick={() => handlePhotoClick(photo)}
          >
            <img
              src={photo.thumbnailUrl}
              alt={photo.filename}
              loading="lazy"
            />
          </div>
        ))}
      </div>

      {/* Photo Viewer Modal */}
      {selectedPhoto && (
        <div className="photo-viewer" onClick={handleClosePhoto}>
          <div className="photo-viewer-content">
            <div className="photo-viewer-header">
              <span>{selectedPhoto.filename}</span>
              <button className="close-btn" onClick={handleClosePhoto}>
                CLOSE
              </button>
            </div>
            <div className="photo-viewer-image">
              <img src={selectedPhoto.fullUrl} alt={selectedPhoto.filename} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Gallery;
