import React, { useEffect, useRef, useState } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  runTransaction,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export default function Tables() {
  const [tables, setTables] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ numberOfTables: 1, capacity: 10 });
  const [saving, setSaving] = useState(false);
  const [seatModal, setSeatModal] = useState(null); // { table, seatNumber, occupant }
  const [seatMode, setSeatMode] = useState('existing'); // 'existing' or 'new'
  const [selectedCheckinId, setSelectedCheckinId] = useState('');
  const [newName, setNewName] = useState('');
  const [collapsedTableIds, setCollapsedTableIds] = useState([]);
  const [guestListEntries, setGuestListEntries] = useState([]);
  const [renameName, setRenameName] = useState('');
  const [renameSearch, setRenameSearch] = useState('');
  const [editingTable, setEditingTable] = useState(null); // the table being edited, or null
  const [editSeats, setEditSeats] = useState('');
  const [editError, setEditError] = useState('');
  const seenTableIdsRef = useRef(new Set());

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tables'), (snap) =>
      setTables(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.tableNumber - b.tableNumber))
    );
    const unsubCheckins = onSnapshot(collection(db, 'checkins'), (snap) =>
      setCheckins(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubGuestList = onSnapshot(collection(db, 'guestList'), (snap) =>
      setGuestListEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsub();
      unsubCheckins();
      unsubGuestList();
    };
  }, []);

  // Every table starts collapsed. When a table id shows up for the first time
  // (first load, or a table someone just added), mark it collapsed. Tables the
  // user has already opened or closed by hand are left alone on later updates.
  useEffect(() => {
    const newIds = tables.map((t) => t.id).filter((id) => !seenTableIdsRef.current.has(id));
    if (newIds.length > 0) {
      newIds.forEach((id) => seenTableIdsRef.current.add(id));
      setCollapsedTableIds((prev) => [...prev, ...newIds]);
    }
  }, [tables]);

  async function handleAdd(e) {
    e.preventDefault();
    const count = Number(form.numberOfTables);
    if (!count || count < 1) return;
    setSaving(true);
    try {
      const highestExisting = tables.reduce((max, t) => Math.max(max, t.tableNumber || 0), 0);
      const capacity = Number(form.capacity) || 10;
      for (let i = 1; i <= count; i++) {
        await addDoc(collection(db, 'tables'), {
          tableNumber: highestExisting + i,
          capacity,
          occupantIds: [],
        });
      }
      setAdding(false);
      setForm({ numberOfTables: 1, capacity: 10 });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTable(id) {
    if (!window.confirm('Remove this table? Guests assigned to it will need to be reassigned.')) return;
    await deleteDoc(doc(db, 'tables', id));
  }

  function openEditSeats(t, e) {
    e.stopPropagation();
    setEditingTable(t);
    setEditSeats(String(t.capacity));
    setEditError('');
  }

  async function handleSaveSeats(e) {
    e.preventDefault();
    const newCapacity = Number(editSeats);
    if (!newCapacity || newCapacity < 1) return;
    const occupantCount = occupantsOf(editingTable.id).length;
    if (newCapacity < occupantCount) {
      setEditError(`This table has ${occupantCount} guest${occupantCount === 1 ? '' : 's'} seated. Move some guests first, or pick a number of seats that fits everyone.`);
      return;
    }
    setSaving(true);
    setEditError('');
    try {
      await updateDoc(doc(db, 'tables', editingTable.id), { capacity: newCapacity });
      setEditingTable(null);
    } catch (err) {
      console.error(err);
      setEditError('Something went wrong saving this. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function occupantsOf(tableId) {
    return checkins.filter((c) => c.tableId === tableId);
  }

  function toggleCollapsed(tableId) {
    setCollapsedTableIds((prev) =>
      prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId]
    );
  }

  function collapseAll() {
    setCollapsedTableIds(tables.map((t) => t.id));
  }

  function expandAll() {
    setCollapsedTableIds([]);
  }

  function occupantAtSeat(tableId, seatNumber) {
    return checkins.find((c) => c.tableId === tableId && Number(c.seatNumber) === seatNumber);
  }

  const unassignedCheckins = checkins.filter((c) => !c.tableId);

  function openSeat(table, seatNumber) {
    const occupant = occupantAtSeat(table.id, seatNumber);
    setSeatModal({ table, seatNumber, occupant });
    setSeatMode('existing');
    setSelectedCheckinId('');
    setNewName('');
    setRenameName(occupant ? occupant.fullName : '');
    setRenameSearch('');
  }

  async function handleUnassignSeat() {
    const { table, occupant } = seatModal;
    if (!occupant) return;
    await updateDoc(doc(db, 'checkins', occupant.id), {
      tableId: '',
      tableNumber: '',
      seatNumber: '',
      status: 'waiting',
    });
    await updateDoc(doc(db, 'tables', table.id), { occupantIds: arrayRemove(occupant.id) });
    setSeatModal(null);
  }

  async function handleRenameOccupant() {
    const { occupant } = seatModal;
    if (!occupant) return;
    const trimmedName = renameName.trim();
    const nameChanged = trimmedName && trimmedName !== occupant.fullName;
    if (!nameChanged) {
      setSeatModal(null);
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'checkins', occupant.id), { fullName: trimmedName });
      setSeatModal(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleSeatExisting(e) {
    e.preventDefault();
    if (!selectedCheckinId) return;
    const { table, seatNumber } = seatModal;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'checkins', selectedCheckinId), {
        tableId: table.id,
        tableNumber: table.tableNumber,
        seatNumber,
        status: 'assigned',
        assignedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'tables', table.id), { occupantIds: arrayUnion(selectedCheckinId) });
      setSeatModal(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleSeatNew(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const { table, seatNumber } = seatModal;
    setSaving(true);
    try {
      const counterRef = doc(db, 'counters', 'checkins');
      const newRef = doc(collection(db, 'checkins'));
      await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        const nextOrder = counterSnap.exists() ? (counterSnap.data().value || 0) + 1 : 1;
        transaction.set(counterRef, { value: nextOrder });
        transaction.set(newRef, {
          fullName: newName.trim(),
          scanOrder: nextOrder,
          status: 'assigned',
          tableId: table.id,
          tableNumber: table.tableNumber,
          seatNumber,
          scannedAt: serverTimestamp(),
          assignedAt: serverTimestamp(),
        });
      });
      await updateDoc(doc(db, 'tables', table.id), { occupantIds: arrayUnion(newRef.id) });
      setSeatModal(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2>Tables</h2>
          <p>Set up each table's seats ahead of time, then click a seat to fill it.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tables.length > 0 && (
            <>
              <button className="btn btn-outline" onClick={collapseAll}>Collapse All</button>
              <button className="btn btn-outline" onClick={expandAll}>Expand All</button>
            </>
          )}
          <button className="btn btn-accent" onClick={() => setAdding(true)}>Add Tables</button>
        </div>
      </div>

      {tables.length === 0 ? (
        <div className="empty-state">No tables yet. Add your first table to start seating guests.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {tables.map((t) => {
            const occupants = occupantsOf(t.id);
            const seatNumbers = Array.from({ length: t.capacity }, (_, i) => i + 1);
            const isCollapsed = collapsedTableIds.includes(t.id);
            return (
              <div key={t.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isCollapsed ? 0 : 14 }}>
                  <div
                    onClick={() => toggleCollapsed(t.id)}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', flex: 1 }}
                    title={isCollapsed ? 'Expand table' : 'Collapse table'}
                  >
                    <span style={{ fontSize: '1rem', marginTop: 4, color: 'var(--ink-soft)' }}>{isCollapsed ? '▸' : '▾'}</span>
                    <div>
                      <h3>Table {t.tableNumber}</h3>
                      <p style={{ fontWeight: 700, margin: '4px 0 0' }}>{occupants.length} / {t.capacity} seats filled</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-outline" onClick={(e) => openEditSeats(t, e)} style={{ padding: '6px 12px' }}>Edit Seats</button>
                    <button className="btn btn-outline" onClick={() => handleDeleteTable(t.id)} style={{ padding: '6px 12px' }}>Remove Table</button>
                  </div>
                </div>
                {!isCollapsed && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12 }}>
                    {seatNumbers.map((num) => {
                      const occupant = occupantAtSeat(t.id, num);
                      return (
                        <div
                          key={num}
                          onClick={() => openSeat(t, num)}
                          style={{
                            border: occupant ? '2px solid var(--blue)' : '2px dashed var(--border)',
                            background: occupant ? 'var(--blue-light)' : '#fbf7ef',
                            borderRadius: 10,
                            padding: '10px 8px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            minHeight: 64,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                          }}
                        >
                          <div style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', fontWeight: 700 }}>SEAT {num}</div>
                          <div style={{ fontSize: '0.85rem', marginTop: 4, fontWeight: occupant ? 700 : 400, color: occupant ? 'var(--ink)' : 'var(--ink-soft)' }}>
                            {occupant ? occupant.fullName : 'Open'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <div className="modal-overlay" onClick={() => setAdding(false)}>
          <form className="modal-box" onClick={(e) => e.stopPropagation()} onSubmit={handleAdd}>
            <h3>Add Tables</h3>
            <div className="field" style={{ marginTop: 16 }}>
              <label>How Many Tables Do You Want to Create?</label>
              <input type="number" min="1" value={form.numberOfTables} onChange={(e) => setForm({ ...form, numberOfTables: e.target.value })} required />
            </div>
            <div className="field">
              <label>Number of Seats</label>
              <input type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} required />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setAdding(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      {editingTable && (
        <div className="modal-overlay" onClick={() => !saving && setEditingTable(null)}>
          <form className="modal-box" onClick={(e) => e.stopPropagation()} onSubmit={handleSaveSeats}>
            <h3>Edit Table {editingTable.tableNumber}</h3>
            <div className="field" style={{ marginTop: 16 }}>
              <label>Number of Seats</label>
              <input
                autoFocus
                type="number"
                min="1"
                value={editSeats}
                onChange={(e) => setEditSeats(e.target.value)}
                required
              />
            </div>
            {editError && <p style={{ color: 'var(--red)', marginTop: 4 }}>{editError}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" disabled={saving} onClick={() => setEditingTable(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      {seatModal && (
        <div className="modal-overlay" onClick={() => setSeatModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Table {seatModal.table.tableNumber} · Seat {seatModal.seatNumber}</h3>

            {seatModal.occupant ? (
              <div style={{ marginTop: 16 }}>
                <p>Currently seated: <strong>{seatModal.occupant.fullName}</strong></p>

                <div className="field" style={{ marginTop: 16 }}>
                  <label>Rename Guest</label>
                  <input
                    placeholder="Search the guest list..."
                    value={renameSearch}
                    onChange={(e) => setRenameSearch(e.target.value)}
                  />
                  {renameSearch.trim() && (
                    <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, marginTop: 6, maxHeight: 150, overflowY: 'auto' }}>
                      {guestListEntries.filter((g) => g.fullName?.toLowerCase().includes(renameSearch.toLowerCase())).slice(0, 8).length === 0 ? (
                        <div style={{ padding: '8px 10px', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>No matches found.</div>
                      ) : (
                        guestListEntries
                          .filter((g) => g.fullName?.toLowerCase().includes(renameSearch.toLowerCase()))
                          .slice(0, 8)
                          .map((g) => (
                            <div
                              key={g.id}
                              onClick={() => {
                                setRenameName(g.fullName);
                                setRenameSearch('');
                              }}
                              style={{ padding: '8px 10px', cursor: 'pointer', borderTop: '1px solid var(--border)' }}
                            >
                              {g.fullName}
                            </div>
                          ))
                      )}
                    </div>
                  )}
                  <input
                    value={renameName}
                    onChange={(e) => setRenameName(e.target.value)}
                    placeholder="Type a new name, or pick a match above"
                    style={{ marginTop: 8 }}
                  />
                </div>

                <div className="modal-actions">
                  <button className="btn btn-outline" onClick={() => setSeatModal(null)}>Close</button>
                  <button className="btn btn-primary" style={{ background: 'var(--red)' }} onClick={handleUnassignSeat}>Remove From Seat</button>
                  <button className="btn btn-primary" disabled={saving} onClick={handleRenameOccupant}>{saving ? 'Saving...' : 'Save'}</button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <button
                    type="button"
                    className={seatMode === 'existing' ? 'btn btn-primary' : 'btn btn-outline'}
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => setSeatMode('existing')}
                  >
                    Choose Guest
                  </button>
                  <button
                    type="button"
                    className={seatMode === 'new' ? 'btn btn-primary' : 'btn btn-outline'}
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => setSeatMode('new')}
                  >
                    New Name
                  </button>
                </div>

                {seatMode === 'existing' ? (
                  <form onSubmit={handleSeatExisting}>
                    <div className="field">
                      <label>Unassigned Guests</label>
                      <select value={selectedCheckinId} onChange={(e) => setSelectedCheckinId(e.target.value)} required>
                        <option value="">Select a guest</option>
                        {unassignedCheckins.map((c) => (
                          <option key={c.id} value={c.id}>{c.fullName}</option>
                        ))}
                      </select>
                    </div>
                    {unassignedCheckins.length === 0 && (
                      <p style={{ color: 'var(--ink-soft)', fontSize: '0.88rem' }}>No unassigned guests right now. Use "New Name" to pre-seat someone.</p>
                    )}
                    <div className="modal-actions">
                      <button type="button" className="btn btn-outline" onClick={() => setSeatModal(null)}>Cancel</button>
                      <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Seat Guest'}</button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleSeatNew}>
                    <div className="field">
                      <label>Full Name</label>
                      <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
                    </div>
                    <div className="modal-actions">
                      <button type="button" className="btn btn-outline" onClick={() => setSeatModal(null)}>Cancel</button>
                      <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Seat Guest'}</button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
