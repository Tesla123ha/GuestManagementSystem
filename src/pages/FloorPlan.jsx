import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { collection, onSnapshot, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { Rows3, Columns3, Armchair, DoorOpen, X } from 'lucide-react';
import { db } from '../firebase';

const DEFAULT_ROWS = 4;
const DEFAULT_COLS = 4;
const SETTINGS_DOC_PATH = ['settings', 'floorPlan'];

export default function FloorPlan({ highlightCheckinId, embedded }) {
  const [tables, setTables] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [gridSize, setGridSize] = useState({ rows: DEFAULT_ROWS, cols: DEFAULT_COLS });
  const [editMode, setEditMode] = useState(false);
  const [rowsInput, setRowsInput] = useState(DEFAULT_ROWS);
  const [colsInput, setColsInput] = useState(DEFAULT_COLS);
  const [draggedTableId, setDraggedTableId] = useState(null);
  const [dragOverCell, setDragOverCell] = useState(null);
  const [justPlacedId, setJustPlacedId] = useState(null);
  const [entrancePos, setEntrancePos] = useState(null); // { row, col } | null
  const [draggingEntrance, setDraggingEntrance] = useState(false);

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
        if (data.entranceRow !== undefined && data.entranceCol !== undefined) {
          setEntrancePos({ row: data.entranceRow, col: data.entranceCol });
        }
      }
    }).catch((err) => {
      console.error('Could not load floor plan settings, using the default grid size instead.', err);
    });
  }, []);

  // Auto-place any table that has never been given a grid position yet.
  // Only the admin view does this, since guests aren't allowed to change a
  // table's position, only its occupant list.
  useEffect(() => {
    if (highlightCheckinId) return;

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
  }, [tables, gridSize, highlightCheckinId]);

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

  async function saveEntrancePosition(row, col) {
    setEntrancePos({ row, col });
    await setDoc(doc(db, ...SETTINGS_DOC_PATH), { entranceRow: row, entranceCol: col }, { merge: true });
  }

  async function clearEntrancePosition() {
    setEntrancePos(null);
    await setDoc(doc(db, ...SETTINGS_DOC_PATH), { entranceRow: null, entranceCol: null }, { merge: true });
  }

  function handleDrop(row, col) {
    if (draggingEntrance) {
      const occupied = placedTables.some((t) => t.row === row && t.col === col);
      if (!occupied) saveEntrancePosition(row, col);
      setDraggingEntrance(false);
      setDragOverCell(null);
      return;
    }
    if (!draggedTableId) return;
    const tableId = draggedTableId;
    placeTableAt(tableId, row, col).then(() => {
      setJustPlacedId(tableId);
      setTimeout(() => setJustPlacedId((id) => (id === tableId ? null : id)), 400);
    });
    setDraggedTableId(null);
    setDragOverCell(null);
  }

  const isGuestView = Boolean(highlightCheckinId);
  const selected = tables.find((t) => t.id === selectedTable);
  const placedTables = tables.filter((t) => isInBounds(t, gridSize));
  const unplacedTables = tables.filter((t) => !isInBounds(t, gridSize));

  function renderTableShape(table, options = {}) {
    const { draggable } = options;
    const occupants = occupantsOf(table.id);
    const isMine = highlightCheckinId && occupants.some((o) => o.id === highlightCheckinId);
    const isFull = occupants.length >= table.capacity;
    const isDragging = draggedTableId === table.id;
    const justPlaced = justPlacedId === table.id;
    return (
      <div
        key={table.id}
        className={
          'table-shape' +
          (isFull ? ' full' : '') +
          (isMine ? ' mine' : '') +
          (draggable ? ' editable' : '') +
          (isDragging ? ' dragging' : '') +
          (justPlaced ? ' just-placed' : '')
        }
        draggable={draggable}
        onDragStart={draggable ? () => setDraggedTableId(table.id) : undefined}
        onDragEnd={draggable ? () => setDraggedTableId(null) : undefined}
        onClick={() => {
          if (!editMode) setSelectedTable(table.id);
        }}
      >
        <div className="table-num">#{table.tableNumber}</div>
        <div className="table-seats">{occupants.length}/{table.capacity} seats</div>
      </div>
    );
  }

  function renderEntranceMarker({ draggable } = {}) {
    return (
      <div
        className={'entrance-marker' + (draggable ? ' editable' : '') + (draggingEntrance ? ' dragging' : '')}
        draggable={draggable}
        onDragStart={draggable ? () => setDraggingEntrance(true) : undefined}
        onDragEnd={draggable ? () => setDraggingEntrance(false) : undefined}
      >
        <DoorOpen size={16} />
        <span>Entrance</span>
        {draggable && (
          <button
            type="button"
            className="entrance-marker-remove"
            onClick={(e) => {
              e.stopPropagation();
              clearEntrancePosition();
            }}
            aria-label="Remove entrance marker"
          >
            <X size={12} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {!highlightCheckinId && !embedded && (
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
          <div className="floor-plan-grid-controls-heading">
            <span className="floor-plan-grid-controls-title">Grid Size</span>
            <span className="floor-plan-grid-controls-hint">Set how many rows and columns the floor plan has.</span>
          </div>
          <div className="floor-plan-grid-controls-fields">
            <label className="floor-plan-size-field">
              <span className="floor-plan-size-icon"><Rows3 size={16} /></span>
              <span className="floor-plan-size-text">
                <span className="floor-plan-size-label">Rows</span>
                <input
                  type="number"
                  min="1"
                  value={rowsInput}
                  onChange={(e) => setRowsInput(e.target.value)}
                />
              </span>
            </label>
            <span className="floor-plan-size-times">×</span>
            <label className="floor-plan-size-field">
              <span className="floor-plan-size-icon"><Columns3 size={16} /></span>
              <span className="floor-plan-size-text">
                <span className="floor-plan-size-label">Columns</span>
                <input
                  type="number"
                  min="1"
                  value={colsInput}
                  onChange={(e) => setColsInput(e.target.value)}
                />
              </span>
            </label>
            <button className="btn btn-primary" onClick={saveGridSize}>Save Grid Size</button>
          </div>
        </div>
      )}

      {editMode && (
        <div className="floor-plan-entrance-controls">
          <div className="floor-plan-grid-controls-heading">
            <span className="floor-plan-grid-controls-title">Entrance Marker</span>
            <span className="floor-plan-grid-controls-hint">
              {entrancePos
                ? 'Drag the marker on the grid to move it, or tap its × to remove it.'
                : 'Drag this onto an empty cell to mark where guests come in.'}
            </span>
          </div>
          {!entrancePos && (
            <div style={{ width: 72, flexShrink: 0 }}>
              {renderEntranceMarker({ draggable: true })}
            </div>
          )}
        </div>
      )}

      {tables.length === 0 ? (
        <div className="empty-state">No tables have been set up yet. Add tables from the Tables page.</div>
      ) : isGuestView ? (
        <>
          <div
            className="floor-plan-grid floor-plan-grid--fit"
            style={{
              gridTemplateColumns: `repeat(${gridSize.cols}, 1fr)`,
              gridTemplateRows: `repeat(${gridSize.rows}, 1fr)`,
            }}
          >
            {Array.from({ length: gridSize.rows }).map((_, row) =>
              Array.from({ length: gridSize.cols }).map((_, col) => {
                const table = placedTables.find((t) => t.row === row && t.col === col);
                const isEntranceHere = entrancePos && entrancePos.row === row && entrancePos.col === col;
                return (
                  <div key={`${row}-${col}`} className="floor-plan-cell">
                    {table
                      ? renderTableShape(table)
                      : isEntranceHere
                      ? renderEntranceMarker()
                      : <span className="floor-plan-cell-dot" />}
                  </div>
                );
              })
            )}
          </div>
          {unplacedTables.length > 0 && (
            <div className="floor-plan-unplaced">
              <div className="floor-plan-unplaced-tray">
                {unplacedTables.map((t) => renderTableShape(t))}
              </div>
            </div>
          )}
          {!entrancePos && <p className="floor-plan-entrance-label">Entrance</p>}
        </>
      ) : (
        <>
          <div className="floor-plan-canvas">
            <div className="floor-plan-scroll">
              <div
                className="floor-plan-grid"
                style={{
                  gridTemplateColumns: `repeat(${gridSize.cols}, minmax(64px, 96px))`,
                  gridTemplateRows: `repeat(${gridSize.rows}, minmax(64px, 96px))`,
                }}
              >
                {Array.from({ length: gridSize.rows }).map((_, row) =>
                  Array.from({ length: gridSize.cols }).map((_, col) => {
                    const table = placedTables.find((t) => t.row === row && t.col === col);
                    const isDragOver = dragOverCell && dragOverCell.row === row && dragOverCell.col === col;
                    const isEntranceHere = entrancePos && entrancePos.row === row && entrancePos.col === col;
                    return (
                      <div
                        key={`${row}-${col}`}
                        className={'floor-plan-cell' + (editMode ? ' editable' : '') + (isDragOver ? ' drag-over' : '')}
                        onDragOver={editMode ? (e) => e.preventDefault() : undefined}
                        onDragEnter={editMode ? () => setDragOverCell({ row, col }) : undefined}
                        onDragLeave={editMode ? () => setDragOverCell((c) => (c && c.row === row && c.col === col ? null : c)) : undefined}
                        onDrop={editMode ? () => handleDrop(row, col) : undefined}
                      >
                        {table
                          ? renderTableShape(table, { draggable: editMode })
                          : isEntranceHere
                          ? renderEntranceMarker({ draggable: editMode })
                          : <span className="floor-plan-cell-dot" />}
                      </div>
                    );
                  })
                )}
              </div>
              {gridSize.cols > 4 && <p className="floor-plan-scroll-hint">Swipe sideways to see the full layout →</p>}
            </div>
            <div className="floor-plan-legend">
              <span className="floor-plan-legend-item"><span className="floor-plan-legend-swatch swatch-open" /> Open seats</span>
              <span className="floor-plan-legend-item"><span className="floor-plan-legend-swatch swatch-full" /> Full table</span>
              <span className="floor-plan-legend-item"><Armchair size={14} /> {placedTables.length} table{placedTables.length === 1 ? '' : 's'} placed</span>
            </div>
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

      {selected && createPortal(
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
        </div>,
        document.body
      )}
    </div>
  );
}
