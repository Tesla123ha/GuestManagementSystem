import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function Settings() {
  const [form, setForm] = useState({ eventName: '', eventDateText: '', venueName: '' });
  const [messages, setMessages] = useState({ welcomeMessage: '', waitingMessage: '', seatedMessage: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const registrationUrl = window.location.origin + import.meta.env.BASE_URL + '#/checkin';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(registrationUrl)}`;

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'eventSettings', 'main'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setForm({
          eventName: data.eventName || '',
          eventDateText: data.eventDateText || '',
          venueName: data.venueName || '',
        });
        setMessages({
          welcomeMessage: data.welcomeMessage || '',
          waitingMessage: data.waitingMessage || '',
          seatedMessage: data.seatedMessage || '',
        });
      }
    });
    return unsub;
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await setDoc(doc(db, 'eventSettings', 'main'), {
        eventName: form.eventName,
        eventDateText: form.eventDateText,
        venueName: form.venueName,
        welcomeMessage: messages.welcomeMessage,
        waitingMessage: messages.waitingMessage,
        seatedMessage: messages.seatedMessage,
        registrationUrl,
      });
      setSaved(true);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  function downloadQr() {
    const link = document.createElement('a');
    link.href = qrUrl;
    link.download = 'party-checkin-qr.png';
    link.target = '_blank';
    link.click();
  }

  return (
    <div>
      <div className="page-header">
        <h2>Settings</h2>
        <p>Update event details and get your check-in QR code.</p>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <form className="card" style={{ flex: 1, minWidth: 300 }} onSubmit={handleSave}>
          <h3 style={{ marginBottom: 16 }}>Event Details</h3>
          <div className="field">
            <label>Party Name</label>
            <input value={form.eventName} onChange={(e) => setForm({ ...form, eventName: e.target.value })} placeholder="e.g. Mom's 60th Birthday" />
          </div>
          <div className="field">
            <label>Date</label>
            <input value={form.eventDateText} onChange={(e) => setForm({ ...form, eventDateText: e.target.value })} placeholder="e.g. September 20, 2026" />
          </div>
          <div className="field">
            <label>Venue Name</label>
            <input value={form.venueName} onChange={(e) => setForm({ ...form, venueName: e.target.value })} placeholder="e.g. Sunshine Garden Events Hall" />
          </div>
          <h3 style={{ marginTop: 24, marginBottom: 16 }}>Guest Screen Messages</h3>
          <div className="field">
            <label>Welcome Message</label>
            <input
              value={messages.welcomeMessage}
              onChange={(e) => setMessages({ ...messages, welcomeMessage: e.target.value })}
              placeholder="Enter your name to check in and find your seat."
            />
          </div>
          <div className="field">
            <label>Waiting Message</label>
            <input
              value={messages.waitingMessage}
              onChange={(e) => setMessages({ ...messages, waitingMessage: e.target.value })}
              placeholder="Please wait while we seat you..."
            />
          </div>
          <div className="field">
            <label>Seated Message</label>
            <input
              value={messages.seatedMessage}
              onChange={(e) => setMessages({ ...messages, seatedMessage: e.target.value })}
              placeholder="You're all set, {name}! Head to Table {table}."
            />
            <p style={{ fontSize: '0.82rem', color: 'var(--ink-soft)', marginTop: 6 }}>
              You can use {'{name}'} and {'{table}'} in this message and they will be replaced with the guest's real name and table number.
            </p>
          </div>

          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
          {saved && <p style={{ color: 'var(--green)', marginTop: 10, fontWeight: 700 }}>Saved!</p>}
        </form>

        <div className="card" style={{ width: 300, textAlign: 'center' }}>
          <h3 style={{ marginBottom: 16 }}>Check-In QR Code</h3>
          <img src={qrUrl} alt="QR code guests scan to check in" style={{ width: '100%', borderRadius: 10 }} />
          <p style={{ fontSize: '0.82rem', color: 'var(--ink-soft)', wordBreak: 'break-all', marginTop: 12 }}>{registrationUrl}</p>
          <button className="btn btn-accent" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={downloadQr}>
            Download QR Code
          </button>
        </div>
      </div>
    </div>
  );
}
