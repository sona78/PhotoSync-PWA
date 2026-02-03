import React, { useState, useEffect } from 'react';
import './Gallery.css';

const Gallery = ({ photos, connectionState, error, syncProgress, requestManifest, photoData, requestPhoto, connectionMode }) => {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [loadedThumbnails, setLoadedThumbnails] = useState(new Set());

  // Debug: Log what we received
  console.log('[Gallery] Props received:', {
    photosCount: photos?.length,
    connectionState,
    connectionMode,
    hasPhotoData: !!photoData,
    hasRequestPhoto: !!requestPhoto,
    requestPhotoType: typeof requestPhoto
  });

  const handlePhotoClick = (photo) => {
    console.log('[Gallery] Photo clicked:', {
      photoId: photo.id,
      hasRequestPhoto: !!requestPhoto,
      hasPhotoData: !!photoData,
      photoLoaded: photoData?.[photo.id] ? 'Yes' : 'No'
    });
    setSelectedPhoto(photo);
    // Request full photo if not already loaded (WebRTC mode only)
    if (requestPhoto && photoData && !photoData[photo.id]) {
      console.log('[Gallery] Requesting full photo:', photo.id);
      requestPhoto(photo.id);
    }
  };

  const handleClosePhoto = () => {
    setSelectedPhoto(null);
  };

  // Auto-load thumbnails for visible photos
  useEffect(() => {
    console.log('[Gallery] Auto-load check:', {
      hasRequestPhoto: !!requestPhoto,
      photosCount: photos?.length,
      photoDataKeys: photoData ? Object.keys(photoData).length : 0,
      loadedThumbnailsCount: loadedThumbnails.size,
      connectionMode
    });

    if (requestPhoto && photos && photos.length > 0 && connectionMode === 'webrtc') {
      console.log('[Gallery] Starting auto-load for first 20 photos');
      const photosToLoad = photos.slice(0, 20).filter(photo =>
        !loadedThumbnails.has(photo.id) && (!photoData || !photoData[photo.id])
      );

      if (photosToLoad.length > 0) {
        console.log(`[Gallery] Requesting ${photosToLoad.length} thumbnails`);
        photosToLoad.forEach((photo, index) => {
          console.log(`[Gallery] Requesting thumbnail ${index + 1}/${photosToLoad.length}: ${photo.filename} (${photo.id.substring(0, 8)}...)`);
          // Smaller thumbnails for faster loading: quality 40, max 300px
          requestPhoto(photo.id, 40, 300);
        });
        setLoadedThumbnails(prev => {
          const newSet = new Set(prev);
          photosToLoad.forEach(photo => newSet.add(photo.id));
          return newSet;
        });
      } else {
        console.log('[Gallery] All photos already requested');
      }
    } else {
      console.log('[Gallery] Auto-load skipped:', {
        reason: !requestPhoto ? 'No requestPhoto function' :
                !photos ? 'No photos array' :
                photos.length === 0 ? 'Photos array empty' :
                connectionMode !== 'webrtc' ? 'Not in WebRTC mode' :
                'Unknown'
      });
    }
  }, [photos, requestPhoto, connectionMode]); // Added connectionMode to ensure we're in WebRTC mode

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
      {connectionState === 'connected' && (
        <div style={{ marginBottom: '15px', textAlign: 'center' }}>
          <button
            onClick={requestManifest}
            style={{
              fontFamily: "'VT323', monospace",
              fontSize: '18px',
              padding: '10px 20px',
              background: '#fff',
              color: '#000',
              border: '3px solid #000',
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
            onMouseOver={(e) => {
              e.target.style.background = '#000';
              e.target.style.color = '#fff';
            }}
            onMouseOut={(e) => {
              e.target.style.background = '#fff';
              e.target.style.color = '#000';
            }}
          >
            REFRESH PHOTOS
          </button>
        </div>
      )}

      <div className="gallery">
        {photos.map((photo) => {
          // Use photoData if available (WebRTC), otherwise use photo.thumbnail (legacy)
          const photoUrl = photoData && photoData[photo.id] ? photoData[photo.id] : photo.thumbnail;

          return (
            <div
              key={photo.id}
              className="photo-item"
              onClick={() => handlePhotoClick(photo)}
            >
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={photo.filename}
                  loading="lazy"
                />
              ) : (
                <div className="photo-loading">
                  LOADING...
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Photo Viewer Modal */}
      {selectedPhoto && (
        <div className="photo-viewer" onClick={handleClosePhoto}>
          <div className="photo-viewer-content" onClick={(e) => e.stopPropagation()}>
            <div className="photo-viewer-header">
              <span>{selectedPhoto.filename}</span>
              <button className="close-btn" onClick={handleClosePhoto}>
                CLOSE
              </button>
            </div>
            <div className="photo-viewer-image">
              {(() => {
                const photoUrl = photoData && photoData[selectedPhoto.id] ? photoData[selectedPhoto.id] : selectedPhoto.url;
                return photoUrl ? (
                  <img src={photoUrl} alt={selectedPhoto.filename} />
                ) : (
                  <div style={{ color: '#666', fontSize: '24px' }}>
                    LOADING PHOTO...
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Gallery;
