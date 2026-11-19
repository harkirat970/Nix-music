import { createHmac, timingSafeEqual } from 'node:crypto';
export function validateInitData(raw, token, now = Date.now()) {
  if (!raw || !token) throw new Error('Open this app from Telegram.');
  const p = new URLSearchParams(raw), hash = p.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid Telegram signature');
  p.delete('hash');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = createHmac('sha256', secret).update([...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n')).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash,'hex'))) throw new Error('Invalid Telegram signature');
  const age = now / 1000 - Number(p.get('auth_date'));
  if (!Number.isFinite(age) || age < -30 || age > 3600) throw new Error('Session expired. Reopen the Mini App.');
  const user = JSON.parse(p.get('user') || 'null');
  if (!Number.isSafeInteger(user?.id) || user.id <= 0) throw new Error('Invalid Telegram user');
  return user;
}
