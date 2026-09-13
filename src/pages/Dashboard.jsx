import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export default function Dashboard() {
  const [checkins, setCheckins] = useState([]);
  const [tables, setTables] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'checkins'), (snap) => setCheckins(snap.docs.map((d) => d.data())));
    const unsubTables = onSnapshot(collection(db, 'tables'), (snap) => setTables(snap.docs.map((d) => d.data())));
    return () => {
      unsub();
      unsubTables();
    };
  }, []);

  const totalGuests = checkins.length;
  const totalAssigned = checkins.filter((c) => c.status === 'assigned').length;
  const totalTables = tables.length;
  const totalCapacity = tables.reduce((sum, t) => sum + (t.capacity || 0), 0);
  const seatsRemaining = totalCapacity - totalAssigned;

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>A quick look at how the party is filling up.</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{totalGuests}</div>
          <div className="stat-label">Guests Scanned In</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalAssigned}</div>
          <div className="stat-label">Guests Seated</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalTables}</div>
          <div className="stat-label">Tables</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{Math.max(seatsRemaining, 0)}</div>
          <div className="stat-label">Seats Remaining</div>
        </div>
      </div>

      {totalGuests > totalAssigned && (
        <div className="card" style={{ borderColor: 'var(--gold)', background: 'var(--gold-light)' }}>
          {totalGuests - totalAssigned} guest{totalGuests - totalAssigned === 1 ? '' : 's'} still waiting for a table. Head to Check-Ins to assign a seat.
        </div>
      )}
    </div>
  );
}
