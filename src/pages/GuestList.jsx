import React, { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export default function GuestList() {
  const [entries, setEntries] = useState([]);
  const [tables, setTables] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [checkedInFilter, setCheckedInFilter] = useState('all'); // all | checkedIn | notCheckedIn
  const [tableFilter, setTableFilter] = useState('all'); // all | 'none' | a table id
  const [pasteText, setPasteText] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // the entry being edited, or null
  const [editingName, setEditingName] = useState('');
  const [editingTableId, setEditingTableId] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleting, setDeleting] = useState(null); // { ids: [...], names: [...] }
  const [deleteError, setDeleteError] = useState('');
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'guestList'), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
      setEntries(rows);
    });
    const unsubTables = onSnapshot(collection(db, 'tables'), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (a.tableNumber || 0) - (b.tableNumber || 0));
      setTables(rows);
    });
    const unsubCheckins = onSnapshot(collection(db, 'checkins'), (snap) => {
      setCheckins(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsub();
      unsubTables();
      unsubCheckins();
    };
  }, []);

  // A guest counts as checked in if their name matches a check-in record.
  // Check-ins aren't linked to a guest list id, so we match on the trimmed,
  // lowercased name, the same way the rest of the app already does.
  const checkedInNames = new Set(
    checkins.map((c) => (c.fullName || '').trim().toLowerCase()).filter(Boolean)
  );
  function isCheckedIn(entry) {
    return checkedInNames.has((entry.fullName || '').trim().toLowerCase());
  }

  // Splits pasted text on new lines OR commas, trims blanks, and drops empty entries.
  // If a line ends with "- Table 5" (or just "- 5"), that becomes the guest's table number.
  function parseNames(text) {
    return text
      .split(/[\n,]/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const match = line.match(/^(.*?)\s*-\s*(?:table\s*#?\s*)?(\d+)\s*$/i);
        if (match) {
          return { name: match[1].trim(), tableNumber: parseInt(match[2], 10) };
        }
        return { name: line, tableNumber: null };
      })
      .filter((entry) => entry.name.length > 0);
  }

  async function handleAddPasted() {
    const parsed = parseNames(pasteText);
    if (parsed.length === 0) return;
    setAdding(true);
    try {
      const batch = writeBatch(db);
      parsed.forEach(({ name, tableNumber }) => {
        const ref = doc(collection(db, 'guestList'));
        const data = { fullName: name, addedAt: serverTimestamp() };
        if (tableNumber !== null) {
          const table = tables.find((t) => t.tableNumber === tableNumber);
          if (table) {
            data.assignedTableId = table.id;
            data.assignedTableNumber = table.tableNumber;
          }
        }
        batch.set(ref, data);
      });
      await batch.commit();
      setPasteText('');
    } catch (err) {
      console.error(err);
    } finally {
      setAdding(false);
    }
  }

  function startEdit(entry) {
    setEditing(entry);
    setEditingName(entry.fullName || '');
    setEditingTableId(entry.assignedTableId || '');
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editing || !editingName.trim()) return;
    setSavingEdit(true);
    try {
      const table = editingTableId ? tables.find((t) => t.id === editingTableId) : null;
      await updateDoc(doc(db, 'guestList', editing.id), {
        fullName: editingName.trim(),
        assignedTableId: editingTableId || '',
        assignedTableNumber: table ? table.tableNumber : '',
      });
      setEditing(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingEdit(false);
    }
  }

  function openDeleteOne(entry) {
    setDeleteError('');
    setDeleting({ ids: [entry.id], names: [entry.fullName] });
  }

  function openDeleteSelected() {
    if (selectedIds.length === 0) return;
    const names = entries.filter((e) => selectedIds.includes(e.id)).map((e) => e.fullName);
    setDeleteError('');
    setDeleting({ ids: selectedIds, names });
  }

  async function confirmDelete() {
    if (!deleting) return;
    setRemoving(true);
    setDeleteError('');
    try {
      const batch = writeBatch(db);
      deleting.ids.forEach((id) => batch.delete(doc(db, 'guestList', id)));
      await batch.commit();
      setSelectedIds((prev) => prev.filter((id) => !deleting.ids.includes(id)));
      setDeleting(null);
    } catch (err) {
      console.error(err);
      setDeleteError('Something went wrong removing these guests. Please try again.');
    } finally {
      setRemoving(false);
    }
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAll(filteredIds) {
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  }

  const filtered = entries.filter((e) => {
    if (!e.fullName?.toLowerCase().includes(search.toLowerCase())) return false;
    if (checkedInFilter === 'checkedIn' && !isCheckedIn(e)) return false;
    if (checkedInFilter === 'notCheckedIn' && isCheckedIn(e)) return false;
    if (tableFilter === 'none' && e.assignedTableId) return false;
    if (tableFilter !== 'all' && tableFilter !== 'none' && e.assignedTableId !== tableFilter) return false;
    return true;
  });

  return (
    <div>
      <div className="page-header">
        <h2>Guest List</h2>
        <p>Keep a planning list of everyone invited. Paste a full list at once, or add and edit names one by one.</p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 10 }}>Paste Names</h3>
        <p style={{ color: 'var(--ink-soft)', marginTop: 0, marginBottom: 12 }}>
          Copy a list of names from anywhere (a spreadsheet, a note, a message) and paste it below.
          Each name on its own line, or separated by commas, will be added as a separate guest.
          To seat someone right away, add a dash and the table number after their name, like
          "Juan Dela Cruz - Table 5". The table must already exist in Tables.
        </p>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={'Juan Dela Cruz\nMaria Santos - Table 5\nPedro Reyes'}
          rows={5}
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: 10,
            border: '1.5px solid var(--border)',
            fontFamily: 'inherit',
            fontSize: '1rem',
            resize: 'vertical',
          }}
        />
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={handleAddPasted} disabled={adding || !pasteText.trim()}>
          {adding ? 'Adding...' : 'Add Names'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="search-input"
          placeholder="Search the guest list..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
        <select value={checkedInFilter} onChange={(e) => setCheckedInFilter(e.target.value)}>
          <option value="all">All Guests</option>
          <option value="checkedIn">Checked In</option>
          <option value="notCheckedIn">Not Checked In</option>
        </select>
        <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)}>
          <option value="all">All Tables</option>
          <option value="none">No Table Yet</option>
          {tables.map((t) => (
            <option key={t.id} value={t.id}>Table {t.tableNumber}</option>
          ))}
        </select>
        {selectedIds.length > 0 && (
          <button className="btn btn-outline" style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={openDeleteSelected}>
            Delete Selected ({selectedIds.length})
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">No one is on the guest list yet. Paste a list above to get started.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((e) => selectedIds.includes(e.id))}
                  onChange={() => toggleSelectAll(filtered.map((e) => e.id))}
                  style={{ width: 20, height: 20 }}
                />
              </th>
              <th>Name</th>
              <th style={{ width: 140 }}>Status</th>
              <th style={{ width: 160 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(entry.id)}
                    onChange={() => toggleSelected(entry.id)}
                    style={{ width: 20, height: 20 }}
                  />
                </td>
                <td onClick={() => startEdit(entry)} style={{ cursor: 'pointer' }}>
                  {entry.fullName}
                  {entry.assignedTableNumber ? (
                    <span style={{ color: 'var(--ink-soft)' }}> - Table {entry.assignedTableNumber}</span>
                  ) : null}
                </td>
                <td>
                  <span className={'badge ' + (isCheckedIn(entry) ? 'badge-assigned' : 'badge-muted')}>
                    {isCheckedIn(entry) ? 'Checked In' : 'Not Checked In'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                    <button className="btn btn-outline" style={{ padding: '6px 12px', color: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => openDeleteOne(entry)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => !savingEdit && setEditing(null)}>
          <form className="modal-box" onClick={(e) => e.stopPropagation()} onSubmit={saveEdit}>
            <h3>Edit Guest</h3>
            <div className="field" style={{ marginTop: 16 }}>
              <label>Name</label>
              <input
                autoFocus
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Assigned Table</label>
              <select value={editingTableId} onChange={(e) => setEditingTableId(e.target.value)}>
                <option value="">No table yet</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>Table {t.tableNumber}</option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" disabled={savingEdit} onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      {deleting && (
        <div className="modal-overlay" onClick={() => !removing && setDeleting(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Remove {deleting.ids.length === 1 ? 'Guest' : 'Guests'}</h3>
            <p style={{ marginTop: 12 }}>
              {deleting.ids.length === 1 ? (
                <>Remove <strong>{deleting.names[0]}</strong> from the list? This cannot be undone.</>
              ) : (
                <>Remove <strong>{deleting.ids.length} guests</strong> from the list? This cannot be undone.</>
              )}
            </p>
            {deleteError && <p style={{ color: 'var(--red)', marginTop: 10 }}>{deleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" disabled={removing} onClick={() => setDeleting(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: 'var(--red)' }} disabled={removing} onClick={confirmDelete}>
                {removing ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
