import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  doc,
  collection,
  query,
  orderBy,
  where,
  getDoc,
  getDocs,
  onSnapshot,
  updateDoc,
  runTransaction,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';
import { Heart, LayoutGrid, Image, MessageSquare } from 'lucide-react';
import { db } from '../firebase';
import FloorPlan from './FloorPlan';
import Album from './Album';
import GuestMessage from './GuestMessage';

const STORAGE_KEY = 'party_checkin_id';

const DEFAULT_WELCOME_MESSAGE = 'Enter your name to check in and find your seat.';
const DEFAULT_WAITING_MESSAGE = 'Please wait while we seat you...';

// Fills in {name} and {table} inside a saved message with the guest's real details.
function fillPlaceholders(message, { name, table }) {
  return message.replace(/{name}/g, name || '').replace(/{table}/g, table || '');
}

export default function ScanPage() {
  const [eventName, setEventName] = useState('the Party');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [waitingMessage, setWaitingMessage] = useState('');
  const [seatedMessage, setSeatedMessage] = useState('');
  const [checkinId, setCheckinId] = useState(() => localStorage.getItem(STORAGE_KEY));
  const [checkin, setCheckin] = useState(null);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [allCheckins, setAllCheckins] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [tabDirection, setTabDirection] = useState('right');
  const [revealStep, setRevealStep] = useState(0); // 0 none, 1-3 tabs one by one, 4 content
  const tabOrder = ['table', 'album', 'message'];

  function switchTab(tab) {
    const from = tabOrder.indexOf(activeTab);
    const to = tabOrder.indexOf(tab);
    setTabDirection(to > from ? 'right' : 'left');
    setActiveTab(tab);
  }

  // Load event name and guest screen messages
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'eventSettings', 'main'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.eventName) setEventName(data.eventName);
        setWelcomeMessage(data.welcomeMessage || '');
        setWaitingMessage(data.waitingMessage || '');
        setSeatedMessage(data.seatedMessage || '');
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

  // Live queue position: subscribe to every check-in, ordered the same way
  // CheckIns.jsx does, so this guest's spot in line updates in real time.
  useEffect(() => {
    const q = query(collection(db, 'checkins'), orderBy('scanOrder', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setAllCheckins(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  const waitingCheckins = allCheckins.filter((c) => c.status !== 'assigned');
  const queuePosition = checkin ? waitingCheckins.findIndex((c) => c.id === checkin.id) + 1 : 0;
  const isWaiting = !checkin || checkin.status === 'waiting';

  // Once a guest is seated, let the "Welcome" card have its moment first,
  // then bring the three tabs in one at a time, and only once they're all
  // there, reveal the actual table layout / album / message content.
  useEffect(() => {
    if (isWaiting) {
      setRevealStep(0);
      setActiveTab(null);
      return undefined;
    }
    const baseDelay = 900;
    const stagger = 200;
    const timers = [
      setTimeout(() => setRevealStep(1), baseDelay),
      setTimeout(() => setRevealStep(2), baseDelay + stagger),
      setTimeout(() => setRevealStep(3), baseDelay + stagger * 2),
      setTimeout(() => {
        setRevealStep(4);
        setActiveTab('table');
      }, baseDelay + stagger * 2 + 350),
    ];
    return () => timers.forEach(clearTimeout);
  }, [isWaiting]);

  // --- Sliding tab highlight ("gooey" pill) ---
  // Tracks the pixel position/width of the active tab so a single pill can
  // animate between them: it stretches to span both the old and new tab
  // mid-flight, then settles into the new tab's exact size.
  const tabsTrackRef = useRef(null);
  const tabButtonRefs = useRef({});
  const prevTabRectRef = useRef(null);
  const [pillAnimation, setPillAnimation] = useState(null);

  function measureTabRect(tabId) {
    const btn = tabButtonRefs.current[tabId];
    if (!btn) return null;
    return { left: btn.offsetLeft, width: btn.offsetWidth };
  }

  function updatePill(tabId, { animate: shouldAnimate } = { animate: true }) {
    const target = measureTabRect(tabId);
    if (!target) return;
    const prev = prevTabRectRef.current;
    if (!prev || !shouldAnimate) {
      setPillAnimation({ left: target.left, width: target.width });
    } else {
      const spanLeft = Math.min(prev.left, target.left);
      const spanRight = Math.max(prev.left + prev.width, target.left + target.width);
      setPillAnimation({
        left: [prev.left, spanLeft, target.left],
        width: [prev.width, spanRight - spanLeft, target.width],
      });
    }
    prevTabRectRef.current = target;
  }

  // Place (or move) the pill whenever the active tab changes, and once the
  // tabs first mount (isWaiting flips to false).
  useEffect(() => {
    if (isWaiting) return undefined;
    updatePill(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isWaiting]);

  // Keep the pill aligned if the window is resized (no stretch, just snap).
  useEffect(() => {
    function handleResize() {
      if (!isWaiting) updatePill(activeTab, { animate: false });
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isWaiting]);

  // Looks for a guest list entry with a matching name that already has a table
  // assigned, and if that table has an open seat, returns the seat details to
  // pre-seat this check-in with. Returns null if there's no auto-seat to make.
  async function findAutoSeat(trimmedName) {
    const lowerName = trimmedName.toLowerCase();
    const guestListSnap = await getDocs(collection(db, 'guestList'));
    const match = guestListSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .find((g) => (g.fullName || '').trim().toLowerCase() === lowerName && g.assignedTableId);
    if (!match) return null;

    const tableSnap = await getDoc(doc(db, 'tables', match.assignedTableId));
    if (!tableSnap.exists()) return null;
    const table = { id: tableSnap.id, ...tableSnap.data() };

    const seatedSnap = await getDocs(query(collection(db, 'checkins'), where('tableId', '==', table.id)));
    const takenSeatNumbers = seatedSnap.docs.map((d) => Number(d.data().seatNumber));
    const capacity = Number(table.capacity) || 0;
    let openSeat = null;
    for (let seatNumber = 1; seatNumber <= capacity; seatNumber++) {
      if (!takenSeatNumbers.includes(seatNumber)) {
        openSeat = seatNumber;
        break;
      }
    }
    if (!openSeat) return null;

    return { table, seatNumber: openSeat };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setSubmitting(true);
    try {
      const autoSeat = await findAutoSeat(trimmedName);
      const counterRef = doc(db, 'counters', 'checkins');
      const newCheckinRef = doc(collection(db, 'checkins'));

      await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        const nextOrder = counterSnap.exists() ? (counterSnap.data().value || 0) + 1 : 1;
        transaction.set(counterRef, { value: nextOrder });
        if (autoSeat) {
          transaction.set(newCheckinRef, {
            fullName: trimmedName,
            scanOrder: nextOrder,
            status: 'assigned',
            tableId: autoSeat.table.id,
            tableNumber: autoSeat.table.tableNumber,
            seatNumber: autoSeat.seatNumber,
            scannedAt: serverTimestamp(),
            assignedAt: serverTimestamp(),
          });
        } else {
          transaction.set(newCheckinRef, {
            fullName: trimmedName,
            scanOrder: nextOrder,
            status: 'waiting',
            tableId: '',
            seatNumber: '',
            scannedAt: serverTimestamp(),
            assignedAt: null,
          });
        }
      });

      if (autoSeat) {
        await updateDoc(doc(db, 'tables', autoSeat.table.id), { occupantIds: arrayUnion(newCheckinRef.id) });
      }

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
          <div className="eyebrow-dot"><Heart size={20} /></div>
          <h1>Welcome to {eventName}!</h1>
          <p>{welcomeMessage || DEFAULT_WELCOME_MESSAGE}</p>
          <div className="field" style={{ marginTop: 20, textAlign: 'left' }}>
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={submitting}>
            {submitting ? 'Checking in...' : 'Continue'}
          </button>
        </form>
      </div>
    );
  }

  // Step 2 & 3: checked in. Show status up top, then let the guest switch
  // between the table layout and the shared album underneath.

  return (
    <div className="guest-screen" style={{ alignItems: 'flex-start', paddingTop: 40 }}>
      <div style={{ width: '100%', maxWidth: 720, margin: '0 auto' }}>
        <div className="guest-card" style={{ maxWidth: 'none', marginBottom: 24 }}>
          <div className="eyebrow-dot"><Heart size={20} /></div>
          {isWaiting ? (
            <>
              <h1>Thanks, {checkin.fullName}!</h1>
              <p>{waitingMessage || DEFAULT_WAITING_MESSAGE}</p>
              <div className="line-number">#{queuePosition || checkin.scanOrder}</div>
              <p style={{ marginTop: 0 }}>You are number {queuePosition || checkin.scanOrder} in line</p>
              <div className="spinner" />
            </>
          ) : (
            <>
              <h1>Welcome, {checkin.fullName}!</h1>
              <p>
                {seatedMessage
                  ? fillPlaceholders(seatedMessage, { name: checkin.fullName, table: checkin.tableNumber || '' })
                  : `You're seated at Table ${checkin.tableNumber || 'N/A'}.`}
              </p>
            </>
          )}
        </div>

        {!isWaiting && (
          <>
            <div className="guest-tabs" ref={tabsTrackRef}>
              {pillAnimation && (
                <motion.div
                  className="guest-tabs-pill"
                  animate={pillAnimation}
                  transition={
                    Array.isArray(pillAnimation.left)
                      ? { duration: 0.3, times: [0, 0.65, 1], ease: ['easeOut', 'easeInOut'] }
                      : { duration: 0.01 }
                  }
                />
              )}
              <button
                type="button"
                ref={(el) => { tabButtonRefs.current.table = el; }}
                className={
                  'guest-tab' + (activeTab === 'table' ? ' active' : '') +
                  ' guest-tab-reveal' + (revealStep >= 1 ? ' guest-tab-reveal--visible' : '')
                }
                onClick={() => switchTab('table')}
              >
                <LayoutGrid size={16} /> Table Layout
              </button>
              <button
                type="button"
                ref={(el) => { tabButtonRefs.current.album = el; }}
                className={
                  'guest-tab' + (activeTab === 'album' ? ' active' : '') +
                  ' guest-tab-reveal' + (revealStep >= 2 ? ' guest-tab-reveal--visible' : '')
                }
                onClick={() => switchTab('album')}
              >
                <Image size={16} /> Shared Album
              </button>
              <button
                type="button"
                ref={(el) => { tabButtonRefs.current.message = el; }}
                className={
                  'guest-tab' + (activeTab === 'message' ? ' active' : '') +
                  ' guest-tab-reveal' + (revealStep >= 3 ? ' guest-tab-reveal--visible' : '')
                }
                onClick={() => switchTab('message')}
              >
                <MessageSquare size={16} /> Leave a Message
              </button>
            </div>

            <div className={'card guest-reveal' + (revealStep >= 4 ? ' guest-reveal--visible' : '')}>
              <div key={activeTab} className={'tab-panel tab-panel--' + tabDirection}>
                {activeTab === 'table' && revealStep >= 4 && <FloorPlan highlightCheckinId={checkin.id} embedded />}
                {activeTab === 'album' && (
                  <Album uploaderName={checkin.fullName} tableNumber={checkin.tableNumber || null} />
                )}
                {activeTab === 'message' && (
                  <GuestMessage
                    uploaderName={checkin.fullName}
                    tableNumber={checkin.tableNumber || null}
                    checkinId={checkin.id}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
