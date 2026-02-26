import cors from 'cors';
import express from 'express';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 4010);

const KB = [
  { id: 'policy_1', title: 'Clinic hours', text: 'Clinic is open Mon-Fri 09:00-17:00.' },
  { id: 'policy_2', title: 'Appointments', text: 'Appointments can be booked up to 30 days in advance.' },
];

const CONTACTS: Array<{ id: string; name: string; email: string; ts: number }> = [];
const APPOINTMENTS: Array<{
  id: string;
  name: string;
  email: string;
  datetimeISO: string;
  type?: string;
  facility?: string;
  reason?: string;
  ts: number;
}> = [];
const RETELL_EVENTS: Array<{
  id: string;
  type: string;
  payload: Record<string, unknown>;
  ts: number;
}> = [];

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/search', (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const results = !q
    ? []
    : KB.filter((x) => (x.title + ' ' + x.text).toLowerCase().includes(q)).slice(0, 5);
  res.json({ query: q, results });
});

app.post('/contact', (req, res) => {
  const { name, email } = req.body || {};
  const id = `c_${Date.now()}`;
  CONTACTS.push({ id, name, email, ts: Date.now() });
  res.json({ ok: true, id });
});

app.post('/appointments', (req, res) => {
  const { name, email, datetimeISO, reason } = req.body || {};
  const id = `a_${Date.now()}`;
  APPOINTMENTS.push({ id, name, email, datetimeISO, reason, ts: Date.now() });
  res.json({ ok: true, id });
});

function recordRetellEvent(type: string, payload: Record<string, unknown>) {
  const id = `r_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  RETELL_EVENTS.push({ id, type, payload, ts: Date.now() });
  return id;
}

app.post('/retell/send_call_summary_email', (req, res) => {
  const payload = (req.body || {}) as Record<string, unknown>;
  const id = recordRetellEvent('send_call_summary_email', payload);
  res.json({ ok: true, id, status: 'queued' });
});

app.post('/retell/transfer_call', (req, res) => {
  const payload = (req.body || {}) as Record<string, unknown>;
  const id = recordRetellEvent('transfer_call', payload);
  res.json({ ok: true, id, status: 'transferred' });
});

app.post('/retell/press_digit_medrics', (req, res) => {
  const payload = (req.body || {}) as Record<string, unknown>;
  const id = recordRetellEvent('press_digit_medrics', payload);
  res.json({ ok: true, id, digit: '5' });
});

app.post('/retell/end_call', (req, res) => {
  const payload = (req.body || {}) as Record<string, unknown>;
  const id = recordRetellEvent('end_call', payload);
  res.json({ ok: true, id, ended: true });
});

app.listen(PORT, () => {
  console.log(`db-mock http://127.0.0.1:${PORT}`);
});
