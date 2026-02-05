import React, { useState, useEffect } from 'react';
import './Gallery.css';

const Gallery = ({ photos, connectionState, error, syncProgress, requestManifest, photoData, requestPhoto, connectionMode, folders, currentFolderId, requestFolders, requestFolderPhotos }) => {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [loadedThumbnails, setLoadedThumbnails] = useState(new Set());
  const [requestedFullSize, setRequestedFullSize] = useState(new Set()); // Track which photos we've requested at full-size
  const [currentBatch, setCurrentBatch] = useState(0);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const BATCH_SIZE = 20;
  const BATCH_DELAY = 500; // ms between batches

  // Debug: Log what we received
  console.log('[Gallery] Props received:', {
    photosCount: photos?.length,
    connectionState,
    connectionMode,
    hasPhotoData: !!photoData,
    hasRequestPhoto: !!requestPhoto,
    requestPhotoType: typeof requestPhoto,
    foldersCount: folders?.length,
    currentFolderId
  });

  // Helper: Find folder by ID
  const findFolderById = (folderId, folderList = folders) => {
    if (!folderList) return null;
    for (const folder of folderList) {
      if (folder.id === folderId) {
        return folder;
      }
      if (folder.subfolders && folder.subfolders.length > 0) {
        const found = findFolderById(folderId, folder.subfolders);
        if (found) return found;
      }
    }
    return null;
  };

  // Helper: Build breadcrumb for current folder
  const buildBreadcrumb = (folderId) => {
    if (folderId === 'all' || !folderId) {
      return [];
    }

    const crumbs = [];
    let currentFolder = findFolderById(folderId);

    while (currentFolder) {
      crumbs.unshift({
        id: currentFolder.id,
        name: currentFolder.displayName
      });

      // Find parent folder
      if (currentFolder.folderPath === '') {
        break; // This is a root folder
      }

      // For simplicity, break for now (parent lookup is complex)
      break;
    }

    return crumbs;
  };

  // Helper: Navigate to folder
  const navigateToFolder = (folderId) => {
    if (folderId === 'all') {
      // When viewing "all", request manifest but we won't show photos, just folders
      if (requestManifest) {
        requestManifest();
      }
      setBreadcrumbs([]);
    } else if (requestFolderPhotos) {
      requestFolderPhotos(folderId, false);
      setBreadcrumbs(buildBreadcrumb(folderId));
    }
  };

  // Helper: Get subfolders for current folder
  const getCurrentSubfolders = () => {
    if (!folders) return [];
    if (currentFolderId === 'all' || !currentFolderId) {
      return folders;
    }

    const currentFolder = findFolderById(currentFolderId);
    return currentFolder ? currentFolder.subfolders : [];
  };

  const handlePhotoClick = (photo) => {
    console.log('[Gallery] Photo clicked:', {
      photoId: photo.id,
      hasRequestPhoto: !!requestPhoto,
      hasPhotoData: !!photoData,
      photoLoaded: photoData?.[photo.id] ? 'Yes' : 'No',
      fullSizeRequested: requestedFullSize.has(photo.id)
    });
    setSelectedPhoto(photo);

    // Request full-size photo if not already requested (WebRTC mode only)
    if (requestPhoto && connectionMode === 'webrtc' && !requestedFullSize.has(photo.id)) {
      console.log('[Gallery] Requesting full-size photo:', photo.id, '(quality: 90, max: 4096px)');
      // Request high quality, large dimension for full-size viewing
      // quality 90, max dimension 4096px (4K)
      requestPhoto(photo.id, 90, 4096);
      setRequestedFullSize(prev => new Set(prev).add(photo.id));
    }
  };

  const handleClosePhoto = () => {
    setSelectedPhoto(null);
  };

  const handleDownload = (photo) => {
    const photoUrl = photoData && photoData[photo.id] ? photoData[photo.id] : photo.url;
    if (!photoUrl) {
      console.warn('[Gallery] Cannot download - photo not loaded');
      return;
    }

    // Create a temporary link and trigger download
    const link = document.createElement('a');
    link.href = photoUrl;
    link.download = photo.filename || 'photo.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log('[Gallery] Download initiated:', photo.filename);
  };

  // Reset batch counter when photos change
  useEffect(() => {
    if (photos && photos.length > 0) {
      setCurrentBatch(0);
      setLoadedThumbnails(new Set());
      setRequestedFullSize(new Set());
    }
  }, [photos]);

  // Auto-load thumbnails in batches
  useEffect(() => {
    if (!requestPhoto || !photos || photos.length === 0 || connectionMode !== 'webrtc' || currentFolderId === 'all') {
      console.log('[Gallery] Auto-load skipped:', {
        reason: !requestPhoto ? 'No requestPhoto function' :
                !photos ? 'No photos array' :
                photos.length === 0 ? 'Photos array empty' :
                connectionMode !== 'webrtc' ? 'Not in WebRTC mode' :
                currentFolderId === 'all' ? 'Viewing all folders' :
                'Unknown'
      });
      return;
    }

    // Calculate batch range
    const startIndex = currentBatch * BATCH_SIZE;
    const endIndex = Math.min(startIndex + BATCH_SIZE, photos.length);

    // Check if we've loaded all batches
    if (startIndex >= photos.length) {
      console.log('[Gallery] All batches loaded');
      return;
    }

    // Get photos for current batch that haven't been loaded yet
    const photosToLoad = photos.slice(startIndex, endIndex).filter(photo =>
      !loadedThumbnails.has(photo.id) && (!photoData || !photoData[photo.id])
    );

    if (photosToLoad.length > 0) {
      console.log(`[Gallery] Loading batch ${currentBatch + 1} (photos ${startIndex + 1}-${endIndex} of ${photos.length})`);

      // Request thumbnails for this batch
      photosToLoad.forEach((photo, index) => {
        console.log(`[Gallery] Requesting thumbnail ${index + 1}/${photosToLoad.length}: ${photo.filename} (${photo.id.substring(0, 8)}...)`);
        // Smaller thumbnails for faster loading: quality 40, max 300px
        requestPhoto(photo.id, 40, 300);
      });

      // Mark these photos as loaded
      setLoadedThumbnails(prev => {
        const newSet = new Set(prev);
        photosToLoad.forEach(photo => newSet.add(photo.id));
        return newSet;
      });

      // Schedule next batch after delay
      const timer = setTimeout(() => {
        setCurrentBatch(prev => prev + 1);
      }, BATCH_DELAY);

      return () => clearTimeout(timer);
    } else {
      // All photos in this batch already loaded, move to next batch immediately
      console.log(`[Gallery] Batch ${currentBatch + 1} already loaded, skipping to next`);
      setCurrentBatch(prev => prev + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBatch, photos, requestPhoto, connectionMode, currentFolderId]);

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

  // Calculate loading progress
  const loadedCount = Object.keys(photoData || {}).length;
  const totalCount = photos.length;
  const isLoading = loadedCount < totalCount && connectionMode === 'webrtc';

  return (
    <>
      {connectionState === 'connected' && (
        <>
          {/* Navigation Bar */}
          <div style={{
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            {/* Breadcrumb navigation */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontFamily: "'VT323', monospace",
              fontSize: '18px'
            }}>
              {currentFolderId === 'all' || !currentFolderId ? (
                <span style={{ fontWeight: 'bold' }}>ALL PHOTOS</span>
              ) : (
                <>
                  <span
                    onClick={() => navigateToFolder('all')}
                    style={{
                      cursor: 'pointer',
                      textDecoration: 'underline'
                    }}
                  >
                    HOME
                  </span>
                  {breadcrumbs.map(crumb => (
                    <React.Fragment key={crumb.id}>
                      <span> / </span>
                      <span
                        onClick={() => navigateToFolder(crumb.id)}
                        style={{
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                      >
                        {crumb.name}
                      </span>
                    </React.Fragment>
                  ))}
                </>
              )}
            </div>

            {/* All Photos button */}
            <button
              onClick={() => navigateToFolder('all')}
              disabled={currentFolderId === 'all' || !currentFolderId}
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: '16px',
                padding: '8px 16px',
                background: (currentFolderId === 'all' || !currentFolderId) ? '#666' : '#000',
                color: '#fff',
                border: '3px solid ' + ((currentFolderId === 'all' || !currentFolderId) ? '#666' : '#000'),
                cursor: (currentFolderId === 'all' || !currentFolderId) ? 'not-allowed' : 'pointer',
                textTransform: 'uppercase'
              }}
            >
              ALL PHOTOS
            </button>
          </div>

          {/* Refresh button and loading indicator */}
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
            {isLoading && (
              <div style={{
                marginTop: '10px',
                fontFamily: "'VT323', monospace",
                fontSize: '16px',
                color: '#666'
              }}>
                LOADING THUMBNAILS: {loadedCount}/{totalCount}
              </div>
            )}
          </div>
        </>
      )}

      <div className="gallery">
        {/* Render folders first */}
        {getCurrentSubfolders().map((folder) => (
          <div
            key={folder.id}
            className="folder-item"
            onClick={() => navigateToFolder(folder.id)}
          >
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>📁</div>
            <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{folder.displayName}</div>
            <div style={{ fontSize: '14px', opacity: 0.7 }}>
              {folder.totalPhotoCount !== undefined ? folder.totalPhotoCount : folder.photoCount} PHOTOS
            </div>
          </div>
        ))}

        {/* Render photos ONLY when not viewing "all" */}
        {currentFolderId !== 'all' && photos.map((photo) => {
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
              {connectionMode === 'webrtc' && requestedFullSize.has(selectedPhoto.id) && photoData && photoData[selectedPhoto.id] && (
                <span style={{
                  fontSize: '14px',
                  color: '#00ff00',
                  marginLeft: '10px',
                }}>
                  HIGH QUALITY
                </span>
              )}
              {connectionMode === 'webrtc' && !photoData?.[selectedPhoto.id] && (
                <span style={{
                  fontSize: '14px',
                  color: '#ffcc00',
                  marginLeft: '10px',
                }}>
                  LOADING...
                </span>
              )}
              <button
                className="close-btn"
                onClick={() => handleDownload(selectedPhoto)}
                style={{
                  marginRight: '10px',
                  background: '#00aa00',
                  borderColor: '#00aa00',
                }}
                disabled={!photoData?.[selectedPhoto.id]}
              >
                DOWNLOAD
              </button>
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
