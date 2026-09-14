import React, { useEffect, useRef, useState } from 'react';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { Camera, Upload, X } from 'lucide-react';
import { db } from '../firebase';
import { uploadPhotoToDrive, listPhotosFromDrive } from '../googleDrive';

export default function Album({ uploaderName }) {
  const [photos, setPhotos] = useState([]);
  const [drivePhotos, setDrivePhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState(null);
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
  // rather than through this page's upload buttons. This list only
  // refreshes on page load, not live like the ones above.
  useEffect(() => {
    listPhotosFromDrive()
      .then(setDrivePhotos)
      .catch((err) => console.error('Could not list Drive photos', err));
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
          {displayPhotos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              className="album-thumb"
              onClick={() => setViewingPhoto(photo)}
            >
              <img src={photo.imageUrl} alt={`Photo by ${photo.uploaderName}`} loading="lazy" />
              <span className="album-thumb-name">{photo.uploaderName}</span>
            </button>
          ))}
        </div>
      )}

      {viewingPhoto && (
        <div className="modal-overlay" onClick={() => setViewingPhoto(null)}>
          <div className="album-lightbox" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="album-lightbox-close" onClick={() => setViewingPhoto(null)} aria-label="Close">
              <X />
            </button>
            <img src={viewingPhoto.imageUrl} alt={`Photo by ${viewingPhoto.uploaderName}`} />
            <p>{viewingPhoto.uploaderName}</p>
          </div>
        </div>
      )}
    </div>
  );
}
