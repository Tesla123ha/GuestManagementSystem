import React, { useEffect, useRef, useState } from 'react';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { Camera, Upload, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '../firebase';
import { uploadPhotoToDrive, listPhotosFromDrive } from '../googleDrive';

export default function Album({ uploaderName }) {
  const [photos, setPhotos] = useState([]);
  const [drivePhotos, setDrivePhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [viewingIndex, setViewingIndex] = useState(null);
  const cameraInputRef = useRef(null);
  const filesInputRef = useRef(null);

  useEffect(() => {
    const q = query(collection(db, 'albumPhotos'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setPhotos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Also pick up any photo that was added straight to the Drive folder
  // rather than through this page's upload buttons. Firestore already
  // updates live, but this list doesn't, so it's checked again every
  // 20 seconds to catch anything added outside the app.
  useEffect(() => {
    function refreshDrivePhotos() {
      listPhotosFromDrive()
        .then(setDrivePhotos)
        .catch((err) => console.error('Could not list Drive photos', err));
    }
    refreshDrivePhotos();
    const interval = setInterval(refreshDrivePhotos, 20000);
    return () => clearInterval(interval);
  }, []);

  // Drive photos that already have a matching database entry are skipped
  // here, so every photo only ever shows up once.
  const trackedFileIds = new Set(photos.map((p) => p.fileId));
  const untrackedDrivePhotos = drivePhotos
    .filter((f) => !trackedFileIds.has(f.fileId))
    .map((f) => ({
      id: f.fileId,
      fileId: f.fileId,
      imageUrl: f.url,
      // Our own uploads are named "Name-1234567890.jpg"; strip the file
      // extension and that trailing timestamp so just the name is left.
      uploaderName: f.name.replace(/\.[a-zA-Z0-9]+$/, '').replace(/-\d+$/, ''),
    }));
  const displayPhotos = [...photos, ...untrackedDrivePhotos];
  const viewingPhoto = viewingIndex !== null ? displayPhotos[viewingIndex] : null;

  function showPrevPhoto() {
    setViewingIndex((i) => (i === null ? i : (i - 1 + displayPhotos.length) % displayPhotos.length));
  }

  function showNextPhoto() {
    setViewingIndex((i) => (i === null ? i : (i + 1) % displayPhotos.length));
  }

  useEffect(() => {
    if (viewingIndex === null) return undefined;
    function handleKeyDown(e) {
      if (e.key === 'ArrowLeft') showPrevPhoto();
      if (e.key === 'ArrowRight') showNextPhoto();
      if (e.key === 'Escape') setViewingIndex(null);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewingIndex, displayPhotos.length]);

  async function handleFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { imageUrl, fileId } = await uploadPhotoToDrive(file, uploaderName);
      await addDoc(collection(db, 'albumPhotos'), {
        imageUrl,
        fileId,
        uploaderName: uploaderName || 'A guest',
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      // Upload failed silently on purpose; nothing is shown to the guest.
      console.error(err);
    } finally {
      setUploading(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (filesInputRef.current) filesInputRef.current.value = '';
    }
  }

  return (
    <div>
      <div className="album-toolbar">
        <div>
          <h2 style={{ margin: 0 }}>Shared Album</h2>
          <p style={{ margin: '4px 0 0' }}>Add a photo for everyone to see.</p>
        </div>
        <div className="album-toolbar-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => cameraInputRef.current && cameraInputRef.current.click()}
            disabled={uploading}
          >
            <Camera size={18} />
            {uploading ? 'Uploading...' : 'Take Photo'}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => filesInputRef.current && filesInputRef.current.click()}
            disabled={uploading}
          >
            <Upload size={18} />
            {uploading ? 'Uploading...' : 'Upload from Files'}
          </button>
        </div>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <input
          ref={filesInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>

      {displayPhotos.length === 0 ? (
        <div className="empty-state">No photos yet. Be the first to add one!</div>
      ) : (
        <div className="album-grid">
          {displayPhotos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              className="album-thumb"
              onClick={() => setViewingIndex(index)}
            >
              <img src={photo.imageUrl} alt={`Photo by ${photo.uploaderName}`} loading="lazy" />
              <span className="album-thumb-name">{photo.uploaderName}</span>
            </button>
          ))}
        </div>
      )}

      {viewingPhoto && (
        <div className="modal-overlay" onClick={() => setViewingIndex(null)}>
          <div className="album-lightbox" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="album-lightbox-close" onClick={() => setViewingIndex(null)} aria-label="Close">
              <X />
            </button>
            {displayPhotos.length > 1 && (
              <>
                <button
                  type="button"
                  className="album-lightbox-nav album-lightbox-nav--prev"
                  onClick={showPrevPhoto}
                  aria-label="Previous photo"
                >
                  <ChevronLeft />
                </button>
                <button
                  type="button"
                  className="album-lightbox-nav album-lightbox-nav--next"
                  onClick={showNextPhoto}
                  aria-label="Next photo"
                >
                  <ChevronRight />
                </button>
              </>
            )}
            <img src={viewingPhoto.imageUrl} alt={`Photo by ${viewingPhoto.uploaderName}`} />
            <p>{viewingPhoto.uploaderName}</p>
          </div>
        </div>
      )}
    </div>
  );
}
