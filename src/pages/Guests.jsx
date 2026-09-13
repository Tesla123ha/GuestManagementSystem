import React, { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  runTransaction,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export default function Guests() {
  const [checkins, setCheckins] = useState([]);
  const [tables, setTables] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ fullName: '', tableId: '', seatNumber: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'checkins'), orderBy('scanOrder', 'asc'));
    const unsub = onSnapshot(q, (snap) => setCheckins(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const unsubTables = onSnapshot(collection(db, 'tables'), (snap) => setTables(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => {
      unsub();
      unsubTables();
    };
  }, []);

  const filtered = checkins.filter((c) => c.fullName?.toLowerCase().includes(search.toLowerCase()));

  function openEdit(c) {
    setEditing(c);
    setForm({ fullName: c.fullName, tableId: c.tableId || '', seatNumber: c.seatNumber || '' });
  }

  function openAdd() {
    setAdding(true);
    setForm({ fullName: '', tableId: '', seatNumber: '' });
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const table = tables.find((t) => t.id === form.tableId);
      await updateDoc(doc(db, 'checkins', editing.id), {
        tableId: form.tableId,
        tableNumber: table ? table.tableNumber : '',
        seatNumber: form.seatNumber ? Number(form.seatNumber) : '',
        status: form.tableId ? 'assigned' : 'waiting',
        assignedAt: form.tableId ? serverTimestamp() : null,
      });
      if (form.tableId) {
        await updateDoc(doc(db, 'tables', form.tableId), { occupantIds: arrayUnion(editing.id) });
      }
      setEditing(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.fullName.trim()) return;
    setSaving(true);
    try {
      const counterRef = doc(db, 'counters', 'checkins');
      const newRef = doc(collection(db, 'checkins'));
      const table = tables.find((t) => t.id === form.tableId);

      await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        const nextOrder = counterSnap.exists() ? (counterSnap.data().value || 0) + 1 : 1;
        transaction.set(counterRef, { value: nextOrder });
        transaction.set(newRef, {
          fullName: form.fullName.trim(),
          scanOrder: nextOrder,
          status: form.tableId ? 'assigned' : 'waiting',
          tableId: form.tableId || '',
          tableNumber: table ? table.tableNumber : '',
          seatNumber: form.seatNumber ? Number(form.seatNumber) : '',
          scannedAt: serverTimestamp(),
          assignedAt: form.tableId ? serverTimestamp() : null,
        });
      });

      if (form.tableId) {
        await updateDoc(doc(db, 'tables', form.tableId), { occupantIds: arrayUnion(newRef.id) });
      }
      setAdding(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c, e) {
    e.stopPropagation();
    if (!window.confirm(`Remove ${c.fullName}?`)) return;
    try {
      if (c.tableId) {
        await updateDoc(doc(db, 'tables', c.tableId), { occupantIds: arrayRemove(c.id) });
      }
      await deleteDoc(doc(db, 'checkins', c.id));
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2>Guests</h2>
          <p>Everyone who has checked in, plus anyone you've added manually.</p>
        </div>
        <button className="btn btn-accent" onClick={openAdd}>Add Guest</button>
      </div>

      <input
        className="search-input"
        placeholder="Search by name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {filtered.length === 0 ? (
        <div className="empty-state">No guests found.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Table</th>
              <th>Seat</th>
              <th>Checked In</th>
              <th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} onClick={() => openEdit(c)} style={{ cursor: 'pointer' }}>
                <td>{c.scanOrder}</td>
                <td>{c.fullName}</td>
                <td>{c.tableNumber || '—'}</td>
                <td>{c.seatNumber || '—'}</td>
                <td>{c.scannedAt?.toDate ? c.scannedAt.toDate().toLocaleTimeString() : '—'}</td>
                <td>
                  <button className="btn btn-outline" style={{ padding: '6px 12px', color: 'var(--red)', borderColor: 'var(--red)' }} onClick={(e) => handleDelete(c, e)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(editing || adding) && (
        <div className="modal-overlay" onClick={() => { setEditing(null); setAdding(false); }}>
          <form className="modal-box" onClick={(e) => e.stopPropagation()} onSubmit={editing ? handleSaveEdit : handleAdd}>
            <h3>{editing ? 'Edit Guest' : 'Add Guest'}</h3>
            <div className="field" style={{ marginTop: 16 }}>
              <label>Full Name</label>
              <input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                disabled={!!editing}
                required
              />
            </div>
            <div className="field">
              <label>Table</label>
              <select value={form.tableId} onChange={(e) => setForm({ ...form, tableId: e.target.value })}>
                <option value="">Unassigned</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>Table {t.tableNumber}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Seat Number</label>
              <input type="number" min="1" value={form.seatNumber} onChange={(e) => setForm({ ...form, seatNumber: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => { setEditing(null); setAdding(false); }}>Cancel</button>
              <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
