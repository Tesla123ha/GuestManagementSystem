import React, { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const DEFAULT_ROWS = 4;
const DEFAULT_COLS = 4;
const SETTINGS_DOC_PATH = ['settings', 'floorPlan'];

export default function FloorPlan({ highlightCheckinId }) {
  const [tables, setTables] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [gridSize, setGridSize] = useState({ rows: DEFAULT_ROWS, cols: DEFAULT_COLS });
  const [editMode, setEditMode] = useState(false);
  const [rowsInput, setRowsInput] = useState(DEFAULT_ROWS);
  const [colsInput, setColsInput] = useState(DEFAULT_COLS);
  const [draggedTableId, setDraggedTableId] = useState(null);

  const autoAssignedIds = useRef(new Set());

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

  useEffect(() => {
    const settingsRef = doc(db, ...SETTINGS_DOC_PATH);
    getDoc(settingsRef).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const rows = Number(data.rows) || DEFAULT_ROWS;
        const cols = Number(data.cols) || DEFAULT_COLS;
        setGridSize({ rows, cols });
        setRowsInput(rows);
        setColsInput(cols);
      }
    });
  }, []);

  // Auto-place any table that has never been given a grid position yet.
  useEffect(() => {
    const occupied = new Set();
    tables.forEach((t) => {
      if (isInBounds(t, gridSize)) {
        occupied.add(`${t.row}-${t.col}`);
      }
    });

    tables.forEach((t) => {
      const hasPosition = t.row !== undefined && t.col !== undefined;
      if (hasPosition || autoAssignedIds.current.has(t.id)) return;

      const spot = findFirstOpenCell(gridSize, occupied);
      if (!spot) return;

      occupied.add(`${spot.row}-${spot.col}`);
      autoAssignedIds.current.add(t.id);
      updateDoc(doc(db, 'tables', t.id), { row: spot.row, col: spot.col }).catch(() => {});
    });
  }, [tables, gridSize]);

  function isInBounds(table, size) {
    return (
      table.row !== undefined &&
      table.col !== undefined &&
      table.row >= 0 &&
      table.col >= 0 &&
      table.row < size.rows &&
      table.col < size.cols
    );
  }

  function findFirstOpenCell(size, occupied) {
    for (let r = 0; r < size.rows; r++) {
      for (let c = 0; c < size.cols; c++) {
        if (!occupied.has(`${r}-${c}`)) return { row: r, col: c };
      }
    }
    return null;
  }

  function occupantsOf(tableId) {
    return checkins.filter((c) => c.tableId === tableId);
  }

  async function saveGridSize() {
    const rows = Math.max(1, Number(rowsInput) || DEFAULT_ROWS);
    const cols = Math.max(1, Number(colsInput) || DEFAULT_COLS);
    setGridSize({ rows, cols });
    await setDoc(doc(db, ...SETTINGS_DOC_PATH), { rows, cols }, { merge: true });
  }

  async function placeTableAt(tableId, row, col) {
    const occupant = placedTables.find((t) => t.row === row && t.col === col && t.id !== tableId);
    const moving = tables.find((t) => t.id === tableId);
    if (!moving) return;

    if (occupant) {
      // Swap positions with whatever table is already sitting in that cell.
      await updateDoc(doc(db, 'tables', occupant.id), { row: moving.row, col: moving.col });
    }
    await updateDoc(doc(db, 'tables', tableId), { row, col });
  }

  function handleDrop(row, col) {
    if (!draggedTableId) return;
    placeTableAt(draggedTableId, row, col);
    setDraggedTableId(null);
  }

  const selected = tables.find((t) => t.id === selectedTable);
  const placedTables = tables.filter((t) => isInBounds(t, gridSize));
  const unplacedTables = tables.filter((t) => !isInBounds(t, gridSize));

  function renderTableShape(table, options = {}) {
    const { draggable } = options;
    const occupants = occupantsOf(table.id);
    const isMine = highlightCheckinId && occupants.some((o) => o.id === highlightCheckinId);
    const isFull = occupants.length >= table.capacity;
    return (
      <div
        key={table.id}
        className={'table-shape' + (isFull ? ' full' : '') + (isMine ? ' mine' : '') + (draggable ? ' editable' : '')}
        draggable={draggable}
        onDragStart={draggable ? () => setDraggedTableId(table.id) : undefined}
        onClick={() => {
          if (!editMode) setSelectedTable(table.id);
        }}
      >
        <div className="table-num">#{table.tableNumber}</div>
        <div className="table-seats">{occupants.length}/{table.capacity} seats</div>
      </div>
    );
  }

  return (
    <div>
      {!highlightCheckinId && (
        <div className="page-header">
          <h2>Live Floor Plan</h2>
          <p>Tap a table to see who is seated there. Updates instantly.</p>
          {tables.length > 0 && (
            <button className="btn btn-outline" style={{ marginTop: 10 }} onClick={() => setEditMode((v) => !v)}>
              {editMode ? 'Done Editing' : 'Edit Layout'}
            </button>
          )}
        </div>
      )}

      {editMode && (
        <div className="floor-plan-grid-controls">
          <label>
            Rows
            <input
              type="number"
              min="1"
              value={rowsInput}
              onChange={(e) => setRowsInput(e.target.value)}
            />
          </label>
          <label>
            Columns
            <input
              type="number"
              min="1"
              value={colsInput}
              onChange={(e) => setColsInput(e.target.value)}
            />
          </label>
          <button className="btn btn-primary" onClick={saveGridSize}>Save Grid Size</button>
        </div>
      )}

      {tables.length === 0 ? (
        <div className="empty-state">No tables have been set up yet. Add tables from the Tables page.</div>
      ) : (
        <>
          <div
            className="floor-plan-grid"
            style={{
              gridTemplateColumns: `repeat(${gridSize.cols}, 1fr)`,
              gridTemplateRows: `repeat(${gridSize.rows}, 1fr)`,
            }}
          >
            {Array.from({ length: gridSize.rows }).map((_, row) =>
              Array.from({ length: gridSize.cols }).map((_, col) => {
                const table = placedTables.find((t) => t.row === row && t.col === col);
                return (
                  <div
                    key={`${row}-${col}`}
                    className={'floor-plan-cell' + (editMode ? ' editable' : '')}
                    onDragOver={editMode ? (e) => e.preventDefault() : undefined}
                    onDrop={editMode ? () => handleDrop(row, col) : undefined}
                  >
                    {table ? renderTableShape(table, { draggable: editMode }) : null}
                  </div>
                );
              })
            )}
          </div>

          {editMode && unplacedTables.length > 0 && (
            <div className="floor-plan-unplaced">
              <p className="floor-plan-unplaced-label">
                These tables don't fit in the current grid size. Drag them into an open cell above.
              </p>
              <div className="floor-plan-unplaced-tray">
                {unplacedTables.map((t) => renderTableShape(t, { draggable: true }))}
              </div>
            </div>
          )}

          {!editMode && unplacedTables.length > 0 && (
            <div className="floor-plan-unplaced">
              <p className="floor-plan-unplaced-label">More tables (outside the current grid size):</p>
              <div className="floor-plan-unplaced-tray">
                {unplacedTables.map((t) => renderTableShape(t))}
              </div>
            </div>
          )}
        </>
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
