import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export default function FloorPlan({ highlightCheckinId }) {
  const [tables, setTables] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);

  useEffect(() => {
    const unsubTables = onSnapshot(collection(db, 'tables'), (snap) => {
      setTables(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubCheckins = onSnapshot(collection(db, 'checkins'), (snap) => {
      setCheckins(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubTables();
      unsubCheckins();
    };
  }, []);

  function occupantsOf(tableId) {
    return checkins.filter((c) => c.tableId === tableId);
  }

  const selected = tables.find((t) => t.id === selectedTable);

  return (
    <div>
      {!highlightCheckinId && (
        <div className="page-header">
          <h2>Live Floor Plan</h2>
          <p>Tap a table to see who is seated there. Updates instantly.</p>
        </div>
      )}

      {tables.length === 0 ? (
        <div className="empty-state">No tables have been set up yet. Add tables from the Tables page.</div>
      ) : (
        <div className="floor-plan-grid">
          {tables.map((table) => {
            const occupants = occupantsOf(table.id);
            const isMine = highlightCheckinId && occupants.some((o) => o.id === highlightCheckinId);
            const isFull = occupants.length >= table.capacity;
            return (
              <div
                key={table.id}
                className={'table-shape' + (isFull ? ' full' : '') + (isMine ? ' mine' : '')}
                onClick={() => setSelectedTable(table.id)}
              >
                <div className="table-num">#{table.tableNumber}</div>
                <div className="table-seats">{occupants.length}/{table.capacity} seats</div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelectedTable(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Table #{selected.tableNumber}</h3>
            <div style={{ marginTop: 14 }}>
              {occupantsOf(selected.id).length === 0 ? (
                <p style={{ color: 'var(--ink-soft)' }}>No guests seated here yet.</p>
              ) : (
                occupantsOf(selected.id).map((g) => (
                  <div key={g.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                    {g.fullName} {g.seatNumber ? <span style={{ color: 'var(--ink-soft)' }}>· Seat {g.seatNumber}</span> : null}
                  </div>
                ))
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setSelectedTable(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
