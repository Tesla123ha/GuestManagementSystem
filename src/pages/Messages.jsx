import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { Trash2, X, ChevronDown, Check, History } from 'lucide-react';
import { db } from '../firebase';

export default function Messages() {
  const [messages, setMessages] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteMessage, setConfirmDeleteMessage] = useState(null);
  const [tableFilter, setTableFilter] = useState('all'); // all | 'unknown' | a table number as a string
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [historyMessage, setHistoryMessage] = useState(null);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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

  function openHistory(msg) {
    setHistoryMessage(msg);
    setHistoryLoading(true);
    const q = query(collection(db, 'guestMessages', msg.id, 'history'), orderBy('editedAt', 'desc'));
    getDocs(q)
      .then((snap) => setHistoryEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((err) => console.error(err))
      .finally(() => setHistoryLoading(false));
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
              <div className="message-card-actions">
                {msg.editCount > 0 && (
                  <button
                    type="button"
                    className="message-card-history"
                    onClick={() => openHistory(msg)}
                    aria-label="View edit history"
                  >
                    <History size={16} />
                  </button>
                )}
                <button
                  type="button"
                  className="message-card-delete"
                  onClick={() => requestDelete(msg)}
                  disabled={deletingId === msg.id}
                  aria-label="Delete message"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <p className="message-card-text">{msg.message}</p>
              <div className="message-card-signature">
                - {msg.guestName || 'A guest'}
                {msg.editCount > 0 && ` · Edited ${msg.editCount}x`}
              </div>
            </div>
          ))}
        </div>
      )}

      {historyMessage && (
        <div className="modal-overlay" onClick={() => setHistoryMessage(null)}>
          <div className="history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="table-filter-modal-header">
              <h3>Edit History · {historyMessage.guestName || 'A guest'}</h3>
              <button
                type="button"
                className="table-filter-modal-close"
                onClick={() => setHistoryMessage(null)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="history-entry history-entry--current">
              <p className="message-card-text">{historyMessage.message}</p>
              <span className="message-card-meta">
                Current version ·{' '}
                {historyMessage.updatedAt?.toDate ? historyMessage.updatedAt.toDate().toLocaleString() : ''}
              </span>
            </div>
            {historyLoading ? (
              <div className="empty-state">Loading...</div>
            ) : (
              historyEntries.map((entry) => (
                <div key={entry.id} className="history-entry">
                  <p className="message-card-text">{entry.message}</p>
                  <span className="message-card-meta">
                    Replaced {entry.editedAt?.toDate ? entry.editedAt.toDate().toLocaleString() : ''}
                  </span>
                </div>
              ))
            )}
          </div>
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
