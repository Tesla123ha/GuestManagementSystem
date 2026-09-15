import React, { useEffect, useState } from 'react';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { db } from '../firebase';

const MAX_LENGTH = 500;

// Lets a checked-in guest write a note for the celebrant. Each guest gets
// exactly one message, stored under their own check-in id. Once it's
// saved, this shows the message as read-only with an Edit button, rather
// than leaving the text box sitting open. Editing keeps the old wording
// in a history list that only admins can see, the guest never sees it.
export default function GuestMessage({ uploaderName, tableNumber, checkinId }) {
  const [loaded, setLoaded] = useState(false);
  const [existingMessage, setExistingMessage] = useState(null);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [wasFirstSaveJustNow, setWasFirstSaveJustNow] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!checkinId) return undefined;
    let cancelled = false;
    getDoc(doc(db, 'guestMessages', checkinId))
      .then((snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data();
          setExistingMessage(data.message || '');
          setText(data.message || '');
        } else {
          // No message yet, open straight to the text box.
          setEditing(true);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [checkinId]);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || submitting || !checkinId) return;
    const isFirstSave = existingMessage === null;
    setSubmitting(true);
    setJustSaved(false);
    try {
      const messageRef = doc(db, 'guestMessages', checkinId);
      if (!isFirstSave) {
        // Keep what the message used to say before overwriting it, so
        // admins can look back at earlier versions.
        await addDoc(collection(db, 'guestMessages', checkinId, 'history'), {
          message: existingMessage,
          editedAt: serverTimestamp(),
        });
        await updateDoc(messageRef, {
          message: trimmed,
          updatedAt: serverTimestamp(),
          editCount: increment(1),
        });
      } else {
        await setDoc(messageRef, {
          message: trimmed,
          guestName: uploaderName || 'A guest',
          tableNumber: tableNumber || null,
          checkinId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          editCount: 0,
        });
      }
      setExistingMessage(trimmed);
      setWasFirstSaveJustNow(isFirstSave);
      setJustSaved(true);
      setEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  function startEditing() {
    setText(existingMessage || '');
    setJustSaved(false);
    setEditing(true);
  }

  function cancelEditing() {
    setText(existingMessage || '');
    setEditing(false);
  }

  async function handleDelete() {
    if (!checkinId) return;
    setConfirmingDelete(false);
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'guestMessages', checkinId));
      setExistingMessage(null);
      setText('');
      setJustSaved(false);
      setEditing(true);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  }

  if (!loaded) return null;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Leave a Message</h2>
        <p style={{ margin: '4px 0 0' }}>
          Write a note for the celebrant. You can only leave one message, but you can come back here and
          edit it anytime.
        </p>
      </div>

      {editing ? (
        <form onSubmit={handleSubmit} className="field">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write your message here..."
            maxLength={MAX_LENGTH}
            rows={5}
            required
          />
          <div className="message-form-footer">
            <span className="message-char-count">{text.length}/{MAX_LENGTH}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {existingMessage !== null && (
                <button type="button" className="btn btn-outline" onClick={cancelEditing} disabled={submitting}>
                  Cancel
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={submitting || !text.trim()}>
                <MessageSquare size={18} />
                {submitting ? 'Saving...' : existingMessage !== null ? 'Update Message' : 'Save Message'}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="message-view">
          {justSaved && (
            <p className="message-sent-note">
              {wasFirstSaveJustNow ? 'Thanks! Your message was saved.' : 'Your message was updated.'}
            </p>
          )}
          <p className="message-view-text">{existingMessage}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-outline" onClick={startEditing} disabled={deleting}>
              <Pencil size={16} />
              Edit Message
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setConfirmingDelete(true)}
              disabled={deleting}
            >
              <Trash2 size={16} />
              {deleting ? 'Deleting...' : 'Delete Message'}
            </button>
          </div>
        </div>
      )}

      {confirmingDelete && (
        <div className="modal-overlay" onClick={() => setConfirmingDelete(false)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete your message?</h3>
            <p>This removes it for good. You can always write a new one after.</p>
            <div className="confirm-modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
