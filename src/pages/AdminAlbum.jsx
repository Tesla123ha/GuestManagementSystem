import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { Trash2 } from 'lucide-react';
import { db } from '../firebase';
import { deletePhotoFromDrive, listPhotosFromDrive } from '../googleDrive';

export default function AdminAlbum() {
  const [photos, setPhotos] = useState([]);
  const [drivePhotos, setDrivePhotos] = useState([]);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'albumPhotos'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setPhotos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Also pick up any photo sitting in the Drive folder that never made it
  // into the database (added by hand, or an upload that failed partway).
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
      trackedInDatabase: false,
    }));
  const displayPhotos = [
    ...photos.map((p) => ({ ...p, trackedInDatabase: true })),
    ...untrackedDrivePhotos,
  ];

  async function handleDelete(photo) {
    if (!window.confirm('Delete this photo for everyone?')) return;
    setDeletingId(photo.id);
    try {
      if (photo.fileId) {
        await deletePhotoFromDrive(photo.fileId).catch(() => {});
      }
      if (photo.trackedInDatabase) {
        await deleteDoc(doc(db, 'albumPhotos', photo.id));
      } else {
        // No database entry to remove; drop it from view right away
        // instead of waiting for the page to be reloaded.
        setDrivePhotos((prev) => prev.filter((f) => f.fileId !== photo.fileId));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Shared Album</h2>
        <p>Every photo guests have added. Remove any that shouldn't be here.</p>
      </div>

      {displayPhotos.length === 0 ? (
        <div className="empty-state">No photos have been added yet.</div>
      ) : (
        <div className="album-grid">
          {displayPhotos.map((photo) => (
            <div key={photo.id} className="album-thumb album-thumb--admin">
              <img src={photo.imageUrl} alt={`Photo by ${photo.uploaderName}`} loading="lazy" />
              <span className="album-thumb-name">{photo.uploaderName}</span>
              <button
                type="button"
                className="album-thumb-delete"
                onClick={() => handleDelete(photo)}
                disabled={deletingId === photo.id}
                aria-label="Delete photo"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
