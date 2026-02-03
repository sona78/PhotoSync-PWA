import React, { useState, useEffect } from 'react';
import { usePhotoSyncWebRTC } from '../hooks/usePhotoSyncWebRTC';
import './Gallery.css';

/**
 * Simplified Gallery component for WebRTC testing
 * Directly uses the WebRTC hook instead of props
 */
const GalleryWebRTCTest = () => {
  const {
    connectionState,
    photos,
    photoData,
    requestPhoto,
    requestManifest
  } = usePhotoSyncWebRTC();

  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [requestedPhotos, setRequestedPhotos] = useState(new Set());

  // Debug logging
  useEffect(() => {
    console.log('[GalleryTest] Hook values:', {
      connectionState,
      photosCount: photos.length,
      photoDataKeys: Object.keys(photoData).length,
      hasRequestPhoto: !!requestPhoto,
      requestPhotoType: typeof requestPhoto
    });
  }, [connectionState, photos, photoData, requestPhoto]);

  // Auto-request first 20 photos when manifest arrives
  useEffect(() => {
    if (photos.length > 0 && requestPhoto) {
      console.log('[GalleryTest] Photos available, requesting thumbnails...');

      photos.slice(0, 20).forEach(photo => {
        if (!requestedPhotos.has(photo.id)) {
          console.log('[GalleryTest] Requesting:', photo.filename);
          requestPhoto(photo.id, 50, 400);
          setRequestedPhotos(prev => new Set([...prev, photo.id]));
        }
      });
    }
  }, [photos, requestPhoto]);

  // Show loading state
  if (connectionState === 'disconnected') {
    return (
      <div className="gallery-empty">
        NOT CONNECTED<br />
        Use the test button in Settings to connect
      </div>
    );
  }

  if (connectionState === 'connecting') {
    return <div className="gallery-empty">CONNECTING...</div>;
  }

  if (photos.length === 0) {
    return (
      <div className="gallery-empty">
        CONNECTED<br />
        NO PHOTOS YET<br />
        {connectionState === 'connected' && (
          <button onClick={requestManifest} style={{ marginTop: '20px', padding: '10px 20px' }}>
            REQUEST MANIFEST
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: '15px', padding: '10px', background: '#f0f0f0', border: '2px solid #000' }}>
        <strong>WebRTC Test Gallery</strong><br />
        Photos: {photos.length} | Loaded: {Object.keys(photoData).length} | State: {connectionState}
        <br />
        <button onClick={requestManifest} style={{ marginTop: '10px', padding: '8px 16px' }}>
          REFRESH MANIFEST
        </button>
      </div>

      <div className="gallery">
        {photos.map((photo, index) => {
          const photoUrl = photoData[photo.id];

          return (
            <div
              key={photo.id}
              className="photo-item"
              onClick={() => {
                console.log('[GalleryTest] Photo clicked:', photo.filename);
                setSelectedPhoto(photo);
                if (!photoUrl && requestPhoto) {
                  console.log('[GalleryTest] Requesting full photo');
                  requestPhoto(photo.id);
                }
              }}
            >
              {photoUrl ? (
                <img src={photoUrl} alt={photo.filename} loading="lazy" />
              ) : (
                <div className="photo-loading">
                  {index + 1}
                  <br />
                  <small style={{ fontSize: '10px' }}>LOADING...</small>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Photo Viewer */}
      {selectedPhoto && (
        <div className="photo-viewer" onClick={() => setSelectedPhoto(null)}>
          <div className="photo-viewer-content" onClick={(e) => e.stopPropagation()}>
            <div className="photo-viewer-header">
              <span>{selectedPhoto.filename}</span>
              <button className="close-btn" onClick={() => setSelectedPhoto(null)}>
                CLOSE
              </button>
            </div>
            <div className="photo-viewer-image">
              {photoData[selectedPhoto.id] ? (
                <img src={photoData[selectedPhoto.id]} alt={selectedPhoto.filename} />
              ) : (
                <div style={{ color: '#666', fontSize: '24px' }}>
                  LOADING PHOTO...
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default GalleryWebRTCTest;
