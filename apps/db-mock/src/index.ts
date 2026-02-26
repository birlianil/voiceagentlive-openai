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

app.post('/calendar/availability', (req, res) => {
  const { dateFromISO, dateToISO, preferredTimeOfDay } = req.body || {};
  const from = dateFromISO ? new Date(String(dateFromISO)) : new Date();
  const to = dateToISO ? new Date(String(dateToISO)) : new Date(from.getTime() + 2 * 86400_000);
  const pref = String(preferredTimeOfDay || 'any').toLowerCase();

  const startHour = pref === 'afternoon' ? 13 : 9;
  const endHour = pref === 'morning' ? 12 : 17;
  const slots: Array<{ datetimeISO: string; available: boolean }> = [];

  for (let dayMs = from.getTime(); dayMs <= to.getTime() && slots.length < 12; dayMs += 86400_000) {
    const day = new Date(dayMs);
    for (let hour = startHour; hour < endHour && slots.length < 12; hour += 1) {
      const slot = new Date(day);
      slot.setHours(hour, 0, 0, 0);
      slots.push({ datetimeISO: slot.toISOString(), available: true });
    }
  }

  res.json({
    ok: true,
    query: {
      dateFromISO: from.toISOString(),
      dateToISO: to.toISOString(),
      preferredTimeOfDay: pref,
    },
    slots,
  });
});

app.post('/calendar/book', (req, res) => {
  const { name, email, datetimeISO, appointmentType, facility, reason } = req.body || {};
  if (!datetimeISO) {
    return res.status(400).json({ ok: false, error: 'datetimeISO is required' });
  }

  const id = `a_${Date.now()}`;
  APPOINTMENTS.push({
    id,
    name: String(name || 'unknown'),
    email: String(email || 'unknown@example.com'),
    datetimeISO: String(datetimeISO),
    type: appointmentType ? String(appointmentType) : undefined,
    facility: facility ? String(facility) : undefined,
    reason: reason ? String(reason) : undefined,
    ts: Date.now(),
  });

  return res.json({ ok: true, id, datetimeISO, appointmentType, facility });
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

app.post('/retell/press_digit_get', (req, res) => {
  const payload = (req.body || {}) as Record<string, unknown>;
  const id = recordRetellEvent('press_digit_get', payload);
  res.json({ ok: true, id, action: 'ask_for_keypad_input' });
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
