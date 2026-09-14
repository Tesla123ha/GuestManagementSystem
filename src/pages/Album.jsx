import React, { useEffect, useRef, useState } from 'react';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Camera, X } from 'lucide-react';
import { db, storage } from '../firebase';

export default function Album({ uploaderName }) {
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const q = query(collection(db, 'albumPhotos'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setPhotos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  async function handleFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const fileName = `${Date.now()}-${file.name}`;
      const storagePath = `album/${fileName}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const imageUrl = await getDownloadURL(storageRef);
      await addDoc(collection(db, 'albumPhotos'), {
        imageUrl,
        storagePath,
        uploaderName: uploaderName || 'A guest',
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
      setError('That photo could not be uploaded. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div>
      <div className="album-toolbar">
        <div>
          <h2 style={{ margin: 0 }}>Shared Album</h2>
          <p style={{ margin: '4px 0 0' }}>Add a photo for everyone to see.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          disabled={uploading}
        >
          <Camera size={18} />
          {uploading ? 'Uploading...' : 'Add Photo'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>

      {error && <p className="error-text">{error}</p>}

      {photos.length === 0 ? (
        <div className="empty-state">No photos yet. Be the first to add one!</div>
      ) : (
        <div className="album-grid">
          {photos.map((photo) => (
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
