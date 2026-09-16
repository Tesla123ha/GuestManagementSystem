import React, { useEffect, useRef, useState } from 'react';
import { collection, addDoc, deleteDoc, doc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { Camera, Upload, X, ChevronLeft, ChevronRight, ChevronDown, Check, Trash2 } from 'lucide-react';
import { db } from '../firebase';
import { uploadPhotoToDrive, listPhotosFromDrive, deletePhotoFromDrive } from '../googleDrive';

export default function Album({ uploaderName, tableNumber }) {
  const [photos, setPhotos] = useState([]);
  const [drivePhotos, setDrivePhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [viewingIndex, setViewingIndex] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeletePhoto, setConfirmDeletePhoto] = useState(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(null);
  const [tableFilter, setTableFilter] = useState('all'); // all | 'unknown' | a table number as a string
  const [filterModalOpen, setFilterModalOpen] = useState(false);
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
  // 5 seconds to catch anything added outside the app. Checking too often
  // can overload Google's servers when several guests have the album open
  // at the same time, which can cause uploads to fail, so this isn't set
  // any faster than that.
  useEffect(() => {
    function refreshDrivePhotos() {
      listPhotosFromDrive()
        .then(setDrivePhotos)
        .catch((err) => console.error('Could not list Drive photos', err));
    }
    refreshDrivePhotos();
    const interval = setInterval(refreshDrivePhotos, 5000);
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
      trackedInDatabase: false,
    }));
  const displayPhotos = [
    ...photos.map((p) => ({ ...p, trackedInDatabase: true })),
    ...untrackedDrivePhotos,
  ];

  // Photos added before this filter existed, or found straight in the
  // Drive folder, don't know which table they came from. Those are
  // grouped under "Unknown Table" instead of being hidden.
  function hasNoTable(photo) {
    return photo.tableNumber === undefined || photo.tableNumber === null || photo.tableNumber === '';
  }
  const availableTables = Array.from(
    new Set(displayPhotos.filter((p) => !hasNoTable(p)).map((p) => p.tableNumber))
  ).sort((a, b) => a - b);
  const hasUnknownTablePhotos = displayPhotos.some(hasNoTable);
  const tableFilterOptions = [
    { value: 'all', label: 'All Tables' },
    ...availableTables.map((n) => ({ value: String(n), label: `Table ${n}` })),
    ...(hasUnknownTablePhotos ? [{ value: 'unknown', label: 'Unknown Table' }] : []),
  ];
  const currentTableFilterLabel = (tableFilterOptions.find((o) => o.value === tableFilter) || tableFilterOptions[0]).label;
  const filteredPhotos = displayPhotos.filter((p) => {
    if (tableFilter === 'all') return true;
    if (tableFilter === 'unknown') return hasNoTable(p);
    return String(p.tableNumber) === tableFilter;
  });
  const viewingPhoto = viewingIndex !== null ? filteredPhotos[viewingIndex] : null;

  // A guest can only delete a photo that's tracked in the database and
  // whose stored uploader name matches their own name from check-in.
  function isOwnPhoto(photo) {
    if (!photo.trackedInDatabase || !uploaderName) return false;
    return photo.uploaderName.trim().toLowerCase() === uploaderName.trim().toLowerCase();
  }

  function showPrevPhoto() {
    setViewingIndex((i) => (i === null ? i : (i - 1 + filteredPhotos.length) % filteredPhotos.length));
  }

  function showNextPhoto() {
    setViewingIndex((i) => (i === null ? i : (i + 1) % filteredPhotos.length));
  }

  useEffect(() => {
    if (viewingIndex === null) return undefined;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [viewingIndex]);

  useEffect(() => {
    if (viewingIndex === null) return undefined;
    function handleKeyDown(e) {
      if (e.key === 'ArrowLeft') showPrevPhoto();
      if (e.key === 'ArrowRight') showNextPhoto();
      if (e.key === 'Escape') setViewingIndex(null);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewingIndex, filteredPhotos.length]);

  // Lets a guest swipe left/right on the photo itself to move between
  // photos, the same way a phone's own photo gallery works.
  const SWIPE_THRESHOLD = 60;

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    setIsSwiping(true);
  }

  function handleTouchMove(e) {
    if (touchStartX.current === null) return;
    setSwipeOffset(e.touches[0].clientX - touchStartX.current);
  }

  function handleTouchEnd() {
    if (swipeOffset > SWIPE_THRESHOLD) {
      showPrevPhoto();
    } else if (swipeOffset < -SWIPE_THRESHOLD) {
      showNextPhoto();
    }
    setSwipeOffset(0);
    setIsSwiping(false);
    touchStartX.current = null;
  }

  function requestDelete(photo) {
    setConfirmDeletePhoto(photo);
  }

  async function confirmDelete() {
    const photo = confirmDeletePhoto;
    if (!photo) return;
    setConfirmDeletePhoto(null);
    setDeletingId(photo.id);
    try {
      if (photo.fileId) {
        await deletePhotoFromDrive(photo.fileId).catch(() => {});
      }
      await deleteDoc(doc(db, 'albumPhotos', photo.id));
      // If the photo being deleted is open in the preview, close it too.
      if (viewingPhoto && viewingPhoto.id === photo.id) {
        setViewingIndex(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    // Files are uploaded one at a time, on purpose, rather than all at once.
    // Sending them all together puts more load on Google's servers, which
    // is exactly what causes the broken-reply problem this app already
    // retries around.
    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ current: i + 1, total: files.length });
      try {
        const { imageUrl, fileId } = await uploadPhotoToDrive(files[i], uploaderName);
        await addDoc(collection(db, 'albumPhotos'), {
          imageUrl,
          fileId,
          uploaderName: uploaderName || 'A guest',
          tableNumber: tableNumber || null,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.error(err);
      }
    }
    setUploading(false);
    setUploadProgress(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (filesInputRef.current) filesInputRef.current.value = '';
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
            {uploading
              ? (uploadProgress ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...` : 'Uploading...')
              : 'Take Photo'}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => filesInputRef.current && filesInputRef.current.click()}
            disabled={uploading}
          >
            <Upload size={18} />
            {uploading
              ? (uploadProgress ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...` : 'Uploading...')
              : 'Upload from Files'}
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
          multiple
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>

      {(availableTables.length > 0 || hasUnknownTablePhotos) && (
        <div className="filter-select-wrap" style={{ marginBottom: 16 }}>
          <label className="filter-select-label">Table</label>
          <button
            type="button"
            className={'filter-select-button' + (tableFilter !== 'all' ? ' filter-select-button--active' : '')}
            onClick={() => setFilterModalOpen(true)}
          >
            {currentTableFilterLabel}
            <ChevronDown size={16} />
          </button>
        </div>
      )}

      {filterModalOpen && (
        <div className="modal-overlay" onClick={() => setFilterModalOpen(false)}>
          <div className="table-filter-modal" onClick={(e) => e.stopPropagation()}>
            <div className="table-filter-modal-header">
              <h3>Filter by Table</h3>
              <button
                type="button"
                className="table-filter-modal-close"
                onClick={() => setFilterModalOpen(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="table-filter-options">
              {tableFilterOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={'table-filter-option' + (tableFilter === opt.value ? ' table-filter-option--active' : '')}
                  onClick={() => {
                    setTableFilter(opt.value);
                    setFilterModalOpen(false);
                  }}
                >
                  {opt.label}
                  {tableFilter === opt.value && <Check size={16} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {displayPhotos.length === 0 ? (
        <div className="empty-state">No photos yet. Be the first to add one!</div>
      ) : filteredPhotos.length === 0 ? (
        <div className="empty-state">No photos for that table yet.</div>
      ) : (
        <div className="album-grid">
          {filteredPhotos.map((photo, index) => (
            <div
              key={photo.id}
              className="album-thumb"
              onClick={() => setViewingIndex(index)}
              role="button"
              tabIndex={0}
            >
              <img src={photo.imageUrl} alt={`Photo by ${photo.uploaderName}`} loading="lazy" />
              <span className="album-thumb-name">
                {photo.uploaderName}
                {!hasNoTable(photo) && ` · Table ${photo.tableNumber}`}
              </span>
              {isOwnPhoto(photo) && (
                <button
                  type="button"
                  className="album-thumb-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    requestDelete(photo);
                  }}
                  disabled={deletingId === photo.id}
                  aria-label="Delete your photo"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {viewingPhoto && (
        <div className="modal-overlay" onClick={() => setViewingIndex(null)}>
          <div className="album-lightbox" onClick={(e) => e.stopPropagation()}>
            <div className="album-lightbox-header">
              {isOwnPhoto(viewingPhoto) ? (
                <button
                  type="button"
                  className="album-lightbox-delete"
                  onClick={() => requestDelete(viewingPhoto)}
                  disabled={deletingId === viewingPhoto.id}
                  aria-label="Delete your photo"
                >
                  <Trash2 size={16} />
                </button>
              ) : (
                <span />
              )}
              <button type="button" className="album-lightbox-close" onClick={() => setViewingIndex(null)} aria-label="Close">
                <X />
              </button>
            </div>
            <div className="album-lightbox-media">
              {filteredPhotos.length > 1 && (
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
              <img
                src={viewingPhoto.imageUrl}
                alt={`Photo by ${viewingPhoto.uploaderName}`}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{
                  transform: `translateX(${swipeOffset}px)`,
                  transition: isSwiping ? 'none' : 'transform 0.2s ease',
                  opacity: isSwiping ? Math.max(1 - Math.abs(swipeOffset) / 300, 0.5) : 1,
                  touchAction: 'pan-y',
                }}
              />
            </div>
            <p>
              {viewingPhoto.uploaderName}
              {!hasNoTable(viewingPhoto) && ` · Table ${viewingPhoto.tableNumber}`}
            </p>
          </div>
        </div>
      )}

      {confirmDeletePhoto && (
        <div className="modal-overlay" onClick={() => setConfirmDeletePhoto(null)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete this photo?</h3>
            <p>This will remove it for everyone. This cannot be undone.</p>
            <div className="confirm-modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setConfirmDeletePhoto(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
