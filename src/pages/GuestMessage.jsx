import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { MessageSquare } from 'lucide-react';
import { db } from '../firebase';

const MAX_LENGTH = 500;

// Lets a checked-in guest write a note for the celebrant. Messages are
// write-only from the guest's side on purpose, there's no reading them
// back here, they're kept for the celebrant and admin to read later.
export default function GuestMessage({ uploaderName, tableNumber, checkinId }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [justSent, setJustSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setJustSent(false);
    try {
      await addDoc(collection(db, 'guestMessages'), {
        message: trimmed,
        guestName: uploaderName || 'A guest',
        tableNumber: tableNumber || null,
        checkinId: checkinId || null,
        createdAt: serverTimestamp(),
      });
      setText('');
      setJustSent(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Leave a Message</h2>
        <p style={{ margin: '4px 0 0' }}>Write a note for the celebrant. They'll get to read it later.</p>
      </div>

      <form onSubmit={handleSubmit} className="field">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setJustSent(false);
          }}
          placeholder="Write your message here..."
          maxLength={MAX_LENGTH}
          rows={5}
          required
        />
        <div className="message-form-footer">
          <span className="message-char-count">{text.length}/{MAX_LENGTH}</span>
          <button type="submit" className="btn btn-primary" disabled={submitting || !text.trim()}>
            <MessageSquare size={18} />
            {submitting ? 'Sending...' : 'Send Message'}
          </button>
        </div>
      </form>

      {justSent && <p className="message-sent-note">Thanks! Your message was sent.</p>}
    </div>
  );
}
