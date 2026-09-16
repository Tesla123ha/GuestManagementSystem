import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { Trash2, X, ChevronLeft, ChevronRight, ChevronDown, Check } from 'lucide-react';
import { db } from '../firebase';
import { deletePhotoFromDrive, listPhotosFromDrive } from '../googleDrive';

export default function AdminAlbum() {
  const [photos, setPhotos] = useState([]);
  const [drivePhotos, setDrivePhotos] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [viewingIndex, setViewingIndex] = useState(null);
  const [confirmDeletePhoto, setConfirmDeletePhoto] = useState(null);
  const [tableFilter, setTableFilter] = useState('all'); // all | 'unknown' | a table number as a string
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const touchStartX = useRef(null);
  const swipeHintTimeoutRef = useRef(null);

  useEffect(() => {
    const q = query(collection(db, 'albumPhotos'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setPhotos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Also pick up any photo sitting in the Drive folder that never made it
  // into the database (added by hand, or an upload that failed partway).
  // Firestore already updates live, but this list doesn't, so it's
  // checked again every 5 seconds to catch anything added outside the app.
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
  // here, so every photo only ever shows up once. A photo added in roughly
  // the last 10 seconds is also skipped for now, so a photo that's still
  // mid-upload (waiting on a slow or retried reply) has time to get its
  // proper name and table recorded before it shows up unlabeled.
  const RECENT_GRACE_MS = 10000;
  const trackedFileIds = new Set(photos.map((p) => p.fileId));
  const untrackedDrivePhotos = drivePhotos
    .filter((f) => !trackedFileIds.has(f.fileId))
    .filter((f) => !f.createdAt || Date.now() - f.createdAt > RECENT_GRACE_MS)
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

  function showPrevPhoto() {
    setShowSwipeHint(false);
    setViewingIndex((i) => (i === null ? i : (i - 1 + filteredPhotos.length) % filteredPhotos.length));
  }

  function showNextPhoto() {
    setShowSwipeHint(false);
    setViewingIndex((i) => (i === null ? i : (i + 1) % filteredPhotos.length));
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
  }, [viewingIndex, filteredPhotos.length]);

  useEffect(() => {
    if (viewingIndex === null) return undefined;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [viewingIndex]);

  // The first time this photo view is opened on this device, show a quick
  // tip about swiping between photos, then remember not to show it again.
  // Only worth showing if there's actually more than one photo.
  const isViewerOpen = viewingIndex !== null;
  useEffect(() => {
    if (!isViewerOpen || filteredPhotos.length <= 1) return undefined;
    if (localStorage.getItem('adminAlbumSwipeHintSeen')) return undefined;
    localStorage.setItem('adminAlbumSwipeHintSeen', '1');
    setShowSwipeHint(true);
    swipeHintTimeoutRef.current = setTimeout(() => setShowSwipeHint(false), 3500);
    return () => clearTimeout(swipeHintTimeoutRef.current);
    // Only re-check when the viewer opens/closes, not on every swipe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isViewerOpen]);

  const SWIPE_THRESHOLD = 60;

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    setIsSwiping(true);
    setShowSwipeHint(false);
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
      if (photo.trackedInDatabase) {
        await deleteDoc(doc(db, 'albumPhotos', photo.id));
      } else {
        // No database entry to remove; drop it from view right away
        // instead of waiting for the page to be reloaded.
        setDrivePhotos((prev) => prev.filter((f) => f.fileId !== photo.fileId));
      }
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

  return (
    <div>
      <div className="page-header">
        <h2>Shared Album</h2>
        <p>Every photo guests have added. Remove any that shouldn't be here.</p>
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

      {filterModalOpen && createPortal(
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
        </div>,
        document.body
      )}

      {displayPhotos.length === 0 ? (
        <div className="empty-state">No photos have been added yet.</div>
      ) : filteredPhotos.length === 0 ? (
        <div className="empty-state">No photos for that table yet.</div>
      ) : (
        <div className="album-grid">
          {filteredPhotos.map((photo, index) => (
            <div
              key={photo.id}
              className="album-thumb album-thumb--admin"
              onClick={() => setViewingIndex(index)}
              role="button"
              tabIndex={0}
            >
              <img src={photo.imageUrl} alt={`Photo by ${photo.uploaderName}`} loading="lazy" />
              <span className="album-thumb-name">
                {photo.uploaderName}
                {!hasNoTable(photo) && ` · Table ${photo.tableNumber}`}
              </span>
              <button
                type="button"
                className="album-thumb-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  requestDelete(photo);
                }}
                disabled={deletingId === photo.id}
                aria-label="Delete photo"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {viewingPhoto && createPortal(
        <div className="modal-overlay" onClick={() => setViewingIndex(null)}>
          <div className="album-lightbox" onClick={(e) => e.stopPropagation()}>
            <div className="album-lightbox-header">
              <button
                type="button"
                className="album-lightbox-delete"
                onClick={() => requestDelete(viewingPhoto)}
                disabled={deletingId === viewingPhoto.id}
                aria-label="Delete photo"
              >
                <Trash2 size={16} />
              </button>
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
              {showSwipeHint && (
                <div className="swipe-hint">
                  <ChevronLeft size={16} />
                  Swipe to see more photos
                  <ChevronRight size={16} />
                </div>
              )}
            </div>
            <p>
              {viewingPhoto.uploaderName}
              {!hasNoTable(viewingPhoto) && ` · Table ${viewingPhoto.tableNumber}`}
            </p>
          </div>
        </div>,
        document.body
      )}

      {confirmDeletePhoto && createPortal(
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
        </div>,
        document.body
      )}
    </div>
  );
}
