import React, { useEffect, useState } from 'react';
import {
  doc,
  collection,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import FloorPlan from './FloorPlan';

const STORAGE_KEY = 'party_checkin_id';

export default function ScanPage() {
  const [eventName, setEventName] = useState('the Party');
  const [checkinId, setCheckinId] = useState(() => localStorage.getItem(STORAGE_KEY));
  const [checkin, setCheckin] = useState(null);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load event name for the welcome message
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'eventSettings', 'main'), (snap) => {
      if (snap.exists() && snap.data().eventName) {
        setEventName(snap.data().eventName);
      }
    });
    return unsub;
  }, []);

  // Listen live to this guest's own checkin document
  useEffect(() => {
    if (!checkinId) return;
    const unsub = onSnapshot(doc(db, 'checkins', checkinId), (snap) => {
      if (snap.exists()) {
        setCheckin({ id: snap.id, ...snap.data() });
      } else {
        // The record was removed; let the guest start over
        localStorage.removeItem(STORAGE_KEY);
        setCheckinId(null);
        setCheckin(null);
      }
    });
    return unsub;
  }, [checkinId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const counterRef = doc(db, 'counters', 'checkins');
      const newCheckinRef = doc(collection(db, 'checkins'));

      await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        const nextOrder = counterSnap.exists() ? (counterSnap.data().value || 0) + 1 : 1;
        transaction.set(counterRef, { value: nextOrder });
        transaction.set(newCheckinRef, {
          fullName: name.trim(),
          scanOrder: nextOrder,
          status: 'waiting',
          tableId: '',
          seatNumber: '',
          scannedAt: serverTimestamp(),
          assignedAt: null,
        });
      });

      localStorage.setItem(STORAGE_KEY, newCheckinRef.id);
      setCheckinId(newCheckinRef.id);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  // Step 1: no check-in yet, ask for name
  if (!checkinId || !checkin) {
    return (
      <div className="guest-screen">
        <form className="guest-card" onSubmit={handleSubmit}>
          <div className="eyebrow-dot">🎉</div>
          <h1>Welcome to {eventName}!</h1>
          <p>Enter your name to check in and find your seat.</p>
          <div className="field" style={{ marginTop: 20, textAlign: 'left' }}>
            <label>Full Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" required />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={submitting}>
            {submitting ? 'Checking in...' : 'Continue'}
          </button>
        </form>
      </div>
    );
  }

  // Step 2: waiting for admin to assign a table
  if (checkin.status === 'waiting') {
    return (
      <div className="guest-screen">
        <div className="guest-card">
          <div className="eyebrow-dot">🎈</div>
          <h1>Thanks, {checkin.fullName}!</h1>
          <p>Please wait while we seat you...</p>
          <div className="line-number">#{checkin.scanOrder}</div>
          <p style={{ marginTop: 0 }}>You are number {checkin.scanOrder} in line</p>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  // Step 3: assigned, show table and highlight it on the floor plan
  return (
    <div className="guest-screen" style={{ alignItems: 'flex-start', paddingTop: 40 }}>
      <div style={{ width: '100%', maxWidth: 720, margin: '0 auto' }}>
        <div className="guest-card" style={{ maxWidth: 'none', marginBottom: 24 }}>
          <div className="eyebrow-dot">🥳</div>
          <h1>Welcome, {checkin.fullName}!</h1>
          <p>You're seated at Table {checkin.tableNumber || '—'}{checkin.seatNumber ? `, Seat ${checkin.seatNumber}` : ''}.</p>
        </div>
        <div className="card">
          <FloorPlan highlightCheckinId={checkin.id} />
        </div>
      </div>
    </div>
  );
}
