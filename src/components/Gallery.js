import React, { useState, useEffect } from 'react';
import './Gallery.css';
import { usePhotoSync } from '../hooks/usePhotoSync';

const Gallery = ({ onPhotoCountChange }) => {
  const { photos, connectionState, error, syncProgress } = usePhotoSync();
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  useEffect(() => {
    onPhotoCountChange(photos.length);
  }, [photos, onPhotoCountChange]);

  const handlePhotoClick = (photo) => {
    setSelectedPhoto(photo);
  };

  const handleClosePhoto = () => {
    setSelectedPhoto(null);
  };

  // Show connection/error states
  if (connectionState === 'disconnected' && photos.length === 0) {
    return (
      <div className="gallery-empty">
        NOT CONNECTED TO SERVER<br />
        PAIR YOUR DEVICE IN SETTINGS TO VIEW PHOTOS
      </div>
    );
  }

  if (connectionState === 'connecting') {
    return (
      <div className="gallery-empty">
        CONNECTING TO SERVER...
      </div>
    );
  }

  if (connectionState === 'authenticating') {
    return (
      <div className="gallery-empty">
        AUTHENTICATING...
      </div>
    );
  }

  if (connectionState === 'error' && error) {
    return (
      <div className="gallery-empty">
        CONNECTION ERROR<br />
        {error}<br />
        <br />
        GO TO SETTINGS TO PAIR AGAIN
      </div>
    );
  }

  if (connectionState === 'connected' && photos.length === 0) {
    return (
      <div className="gallery-empty">
        CONNECTED<br />
        NO PHOTOS FOUND ON SERVER<br />
        {syncProgress.total > 0 && `LOADING ${syncProgress.current}/${syncProgress.total}`}
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
              src={photo.thumbnail}
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
              <img src={selectedPhoto.url} alt={selectedPhoto.filename} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Gallery;
