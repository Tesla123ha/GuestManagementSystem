import React, { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export default function CheckIns() {
  const [checkins, setCheckins] = useState([]);
  const [tables, setTables] = useState([]);
  const [guestListEntries, setGuestListEntries] = useState([]);
  const [assigning, setAssigning] = useState(null);
  const [tableId, setTableId] = useState('');
  const [seatNumber, setSeatNumber] = useState('');
  const [matchedName, setMatchedName] = useState('');
  const [guestSearch, setGuestSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'checkins'), orderBy('scanOrder', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setCheckins(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubTables = onSnapshot(collection(db, 'tables'), (snap) => {
      setTables(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubGuestList = onSnapshot(collection(db, 'guestList'), (snap) => {
      setGuestListEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsub();
      unsubTables();
      unsubGuestList();
    };
  }, []);

  function openAssign(c) {
    setAssigning(c);
    setTableId(c.tableId || '');
    setSeatNumber(c.seatNumber || '');
    setMatchedName(c.fullName || '');
    setGuestSearch('');
  }

  // Finds the first open seat number (1..capacity) at a table, using the same
  // "who's sitting where" logic Tables.jsx uses. currentCheckinId is excluded
  // from the taken list so a guest already sitting at that table doesn't
  // block themselves out.
  function firstOpenSeat(table, currentCheckinId) {
    const takenSeatNumbers = checkins
      .filter((c) => c.tableId === table.id && c.id !== currentCheckinId)
      .map((c) => Number(c.seatNumber));
    const capacity = Number(table.capacity) || 0;
    for (let seatNum = 1; seatNum <= capacity; seatNum++) {
      if (!takenSeatNumbers.includes(seatNum)) return seatNum;
    }
    return '';
  }

  function chooseMatch(g) {
    setMatchedName(g.fullName);
    setGuestSearch('');
    // If this guest list entry already has a predetermined table, pre-fill
    // the table and the first open seat so the admin doesn't have to look
    // it up and set it manually.
    if (g.assignedTableId) {
      const table = tables.find((t) => t.id === g.assignedTableId);
      if (table) {
        setTableId(table.id);
        setSeatNumber(firstOpenSeat(table, assigning?.id));
      }
    }
  }

  async function handleAssign(e) {
    e.preventDefault();
    const trimmedMatch = matchedName.trim();
    const nameChanged = trimmedMatch && trimmedMatch !== assigning.fullName;
    if (!tableId && !nameChanged) return;
    setSaving(true);
    try {
      const updates = {};
      if (nameChanged) {
        updates.fullName = trimmedMatch;
      }
      if (tableId) {
        const table = tables.find((t) => t.id === tableId);
        updates.tableId = tableId;
        updates.tableNumber = table ? table.tableNumber : '';
        updates.seatNumber = seatNumber ? Number(seatNumber) : '';
        updates.status = 'assigned';
        updates.assignedAt = serverTimestamp();
      }
      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, 'checkins', assigning.id), updates);
      }

      if (tableId) {
        const previousTableId = assigning.tableId;
        if (previousTableId && previousTableId !== tableId) {
          await updateDoc(doc(db, 'tables', previousTableId), { occupantIds: arrayRemove(assigning.id) });
        }
        await updateDoc(doc(db, 'tables', tableId), { occupantIds: arrayUnion(assigning.id) });
      }
      setAssigning(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  function openDelete(c, e) {
    e.stopPropagation();
    setDeleteError('');
    setDeleting(c);
  }

  async function confirmDelete() {
    const c = deleting;
    if (!c) return;
    setSaving(true);
    setDeleteError('');
    try {
      if (c.tableId) {
        // Clear this guest off their table too. Wrapped in its own try/catch so that
        // a table that no longer exists (or any other issue here) can never stop the
        // guest's check-in record from being deleted below.
        try {
          await updateDoc(doc(db, 'tables', c.tableId), { occupantIds: arrayRemove(c.id) });
        } catch (tableErr) {
          console.error('Could not update the table, continuing with delete:', tableErr);
        }
      }
      await deleteDoc(doc(db, 'checkins', c.id));
      setDeleting(null);
    } catch (err) {
      console.error(err);
      setDeleteError('Something went wrong deleting this guest. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const waitingCheckins = checkins.filter((c) => c.status !== 'assigned');
  const seatedCheckins = checkins.filter((c) => c.status === 'assigned');
  const filteredGuestList = guestSearch.trim()
    ? guestListEntries
        .filter((g) => g.fullName?.toLowerCase().includes(guestSearch.toLowerCase()))
        .slice(0, 8)
    : [];

  function renderTable(rows, { numberForRow } = {}) {
    return (
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Scanned At</th>
            <th>Status</th>
            <th style={{ width: 90 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, index) => (
            <tr key={c.id} onClick={() => openAssign(c)} style={{ cursor: 'pointer' }}>
              <td>{numberForRow ? numberForRow(c, index) : c.scanOrder}</td>
              <td>{c.fullName}</td>
              <td>{c.scannedAt?.toDate ? c.scannedAt.toDate().toLocaleTimeString() : '—'}</td>
              <td>
                <span className={'badge ' + (c.status === 'assigned' ? 'badge-assigned' : 'badge-waiting')}>
                  {c.status === 'assigned' ? 'Assigned' : 'Waiting'}
                </span>
              </td>
              <td>
                <button className="btn btn-outline" style={{ padding: '6px 12px', color: 'var(--red)', borderColor: 'var(--red)' }} onClick={(e) => openDelete(c, e)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Check-Ins</h2>
        <p>Guests appear here the moment they scan the QR code, in the order they arrived. Click a row to assign or change their table.</p>
      </div>

      {checkins.length === 0 ? (
        <div className="empty-state">No one has checked in yet.</div>
      ) : (
        <>
          <h3 style={{ marginBottom: 10 }}>Waiting for a Table</h3>
          {waitingCheckins.length === 0 ? (
            <div className="empty-state" style={{ marginBottom: 24 }}>Everyone who has checked in has a table.</div>
          ) : (
            <div style={{ marginBottom: 24 }}>{renderTable(waitingCheckins, { numberForRow: (c, index) => index + 1 })}</div>
          )}

          <h3 style={{ marginBottom: 10 }}>Already Checked In</h3>
          {seatedCheckins.length === 0 ? (
            <div className="empty-state">No one has been seated yet.</div>
          ) : (
            renderTable(seatedCheckins, { numberForRow: (c, index) => index + 1 })
          )}
        </>
      )}

      {assigning && (
        <div className="modal-overlay" onClick={() => setAssigning(null)}>
          <form className="modal-box" onClick={(e) => e.stopPropagation()} onSubmit={handleAssign}>
            <h3>Assign a seat</h3>
            <p style={{ color: 'var(--ink-soft)', marginTop: 4 }}>
              Checked in as: <strong>{assigning.fullName}</strong>
            </p>

            <div className="field" style={{ marginTop: 16 }}>
              <label>Match to Guest List (optional)</label>
              <input
                placeholder="Search the guest list..."
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
              />
              {guestSearch.trim() && (
                <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, marginTop: 6, maxHeight: 150, overflowY: 'auto' }}>
                  {filteredGuestList.length === 0 ? (
                    <div style={{ padding: '8px 10px', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>No matches found.</div>
                  ) : (
                    filteredGuestList.map((g) => (
                      <div
                        key={g.id}
                        onClick={() => chooseMatch(g)}
                        style={{ padding: '8px 10px', cursor: 'pointer', borderTop: '1px solid var(--border)' }}
                      >
                        {g.fullName}
                        {g.assignedTableNumber ? (
                          <span style={{ color: 'var(--ink-soft)' }}> - Table {g.assignedTableNumber}</span>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              )}
              {matchedName.trim() && matchedName.trim() !== assigning.fullName && (
                <p style={{ color: 'var(--blue)', fontSize: '0.85rem', marginTop: 6 }}>
                  Will rename to <strong>{matchedName}</strong>.{' '}
                  <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => setMatchedName(assigning.fullName)}>
                    Undo
                  </span>
                </p>
              )}
            </div>

            <div className="field">
              <label>Table</label>
              <select value={tableId} onChange={(e) => setTableId(e.target.value)}>
                <option value="">Don't change table</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    Table {t.tableNumber} ({(t.occupantIds || []).length}/{t.capacity})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Seat Number (optional)</label>
              <input type="number" min="1" value={seatNumber} onChange={(e) => setSeatNumber(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setAssigning(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      {deleting && (
        <div className="modal-overlay" onClick={() => !saving && setDeleting(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Remove Guest</h3>
            <p style={{ marginTop: 12 }}>
              Remove <strong>{deleting.fullName}</strong> from check-ins? This cannot be undone.
            </p>
            {deleteError && <p style={{ color: 'var(--red)', marginTop: 10 }}>{deleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" disabled={saving} onClick={() => setDeleting(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: 'var(--red)' }} disabled={saving} onClick={confirmDelete}>
                {saving ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
