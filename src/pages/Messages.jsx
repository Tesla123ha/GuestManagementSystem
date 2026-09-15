import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { Trash2, X, ChevronDown, Check } from 'lucide-react';
import { db } from '../firebase';

export default function Messages() {
  const [messages, setMessages] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteMessage, setConfirmDeleteMessage] = useState(null);
  const [tableFilter, setTableFilter] = useState('all'); // all | 'unknown' | a table number as a string
  const [filterModalOpen, setFilterModalOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'guestMessages'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Messages left before this filter existed, or with no table on record,
  // are grouped under "Unknown Table" instead of being hidden.
  function hasNoTable(msg) {
    return msg.tableNumber === undefined || msg.tableNumber === null || msg.tableNumber === '';
  }
  const availableTables = Array.from(
    new Set(messages.filter((m) => !hasNoTable(m)).map((m) => m.tableNumber))
  ).sort((a, b) => a - b);
  const hasUnknownTableMessages = messages.some(hasNoTable);
  const tableFilterOptions = [
    { value: 'all', label: 'All Tables' },
    ...availableTables.map((n) => ({ value: String(n), label: `Table ${n}` })),
    ...(hasUnknownTableMessages ? [{ value: 'unknown', label: 'Unknown Table' }] : []),
  ];
  const currentTableFilterLabel = (tableFilterOptions.find((o) => o.value === tableFilter) || tableFilterOptions[0]).label;
  const filteredMessages = messages.filter((m) => {
    if (tableFilter === 'all') return true;
    if (tableFilter === 'unknown') return hasNoTable(m);
    return String(m.tableNumber) === tableFilter;
  });

  function requestDelete(msg) {
    setConfirmDeleteMessage(msg);
  }

  async function confirmDelete() {
    const msg = confirmDeleteMessage;
    if (!msg) return;
    setConfirmDeleteMessage(null);
    setDeletingId(msg.id);
    try {
      await deleteDoc(doc(db, 'guestMessages', msg.id));
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Messages</h2>
        <p>Every note guests have left for the celebrant.</p>
      </div>

      {(availableTables.length > 0 || hasUnknownTableMessages) && (
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

      {messages.length === 0 ? (
        <div className="empty-state">No messages have been left yet.</div>
      ) : filteredMessages.length === 0 ? (
        <div className="empty-state">No messages for that table yet.</div>
      ) : (
        <div className="message-grid">
          {filteredMessages.map((msg) => (
            <div key={msg.id} className="message-card">
              <button
                type="button"
                className="message-card-delete"
                onClick={() => requestDelete(msg)}
                disabled={deletingId === msg.id}
                aria-label="Delete message"
              >
                <Trash2 size={16} />
              </button>
              <p className="message-card-text">{msg.message}</p>
              <div className="message-card-meta">
                <span>{msg.guestName || 'A guest'}</span>
                {!hasNoTable(msg) && <span>Table {msg.tableNumber}</span>}
                <span>{msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleString() : ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDeleteMessage && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteMessage(null)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete this message?</h3>
            <p>This will remove it for everyone. This cannot be undone.</p>
            <div className="confirm-modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setConfirmDeleteMessage(null)}>
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
