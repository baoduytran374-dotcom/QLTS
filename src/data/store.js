// Lớp truy cập dữ liệu. Hai chế độ (đặt khi build qua biến VITE_DATA_MODE):
//   api    (khuyến nghị) : đọc/ghi qua Cloudflare Worker, có đăng nhập, đồng bộ cho mọi người xem.
//   static               : đọc public/data/latest.json trên chính GitHub Pages (CÔNG KHAI — chỉ dùng khi chấp nhận lộ dữ liệu).
import { validateDataset } from '../../shared/validate.js';

const env = import.meta.env || {};
export const MODE = env.VITE_DATA_MODE === 'static' ? 'static' : 'api';
export const API = String(env.VITE_API_URL || '').replace(/\/+$/, '');

export class AuthError extends Error {}
export class DataError extends Error { constructor(m, details) { super(m); this.details = details; } }

// Khóa chỉ lưu trong sessionStorage (mất khi đóng tab) và không bao giờ nằm trong mã nguồn.
const ss = (() => { try { return window.sessionStorage; } catch { return null; } })();
export const keys = {
  get: (role) => (ss && ss.getItem('betma.' + role)) || '',
  set: (role, v) => { try { ss && ss.setItem('betma.' + role, v); } catch { /* bỏ qua */ } },
  clear: () => { try { ss && (ss.removeItem('betma.viewer'), ss.removeItem('betma.admin')); } catch { /* bỏ qua */ } },
};

const auth = (key) => ({ Authorization: `Bearer ${key}` });
async function readJson(r) { try { return await r.json(); } catch { return {}; } }

export async function loadData() {
  let d;
  if (MODE === 'static') {
    const base = env.BASE_URL || './';
    const ver = await fetch(`${base}data/version.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const r = await fetch(`${base}data/latest.json?v=${encodeURIComponent(ver?.version || Date.now())}`, { cache: 'no-store' });
    if (!r.ok) throw new DataError('Chưa có dữ liệu: không tìm thấy data/latest.json trên website.');
    d = await r.json();
  } else {
    if (!API) throw new DataError('Chưa cấu hình VITE_API_URL (địa chỉ Cloudflare Worker). Xem README, mục 4.');
    const key = keys.get('admin') || keys.get('viewer');
    let r;
    try { r = await fetch(`${API}/api/data`, { cache: 'no-store', headers: key ? auth(key) : {} }); }
    catch { throw new DataError('Không kết nối được máy chủ dữ liệu. Kiểm tra mạng và cấu hình ALLOWED_ORIGIN.'); }
    if (r.status === 401) throw new AuthError('Cần mật khẩu để xem dữ liệu.');
    const body = await readJson(r.clone());
    if (!r.ok) throw new DataError(body.error || `Máy chủ trả lỗi ${r.status}.`);
    d = await r.json();
  }
  const v = validateDataset(d);
  if (!v.ok) throw new DataError('Dữ liệu tải về không hợp lệ.', v.errors);
  return d;
}

export async function saveData(dataset, adminKey) {
  if (MODE !== 'api') throw new DataError('Chế độ static không ghi được dữ liệu từ trình duyệt.');
  let r;
  try { r = await fetch(`${API}/api/data`, { method: 'POST', headers: { ...auth(adminKey), 'Content-Type': 'application/json' }, body: JSON.stringify(dataset) }); }
  catch { throw new DataError('Không kết nối được máy chủ — dữ liệu hiện tại được giữ nguyên.'); }
  const body = await readJson(r);
  if (r.status === 401 || r.status === 403) throw new AuthError('Khóa quản trị không đúng hoặc không đủ quyền.');
  if (!r.ok) throw new DataError(body.error || `Máy chủ trả lỗi ${r.status}.`, body.details);
  return body;
}

export async function listVersions(adminKey) {
  const r = await fetch(`${API}/api/versions`, { headers: auth(adminKey), cache: 'no-store' });
  const b = await readJson(r);
  if (r.status === 401 || r.status === 403) throw new AuthError('Khóa quản trị không đúng.');
  if (!r.ok) throw new DataError(b.error || 'Không lấy được danh sách phiên bản.');
  return b.versions || [];
}

export async function rollback(version, adminKey) {
  const r = await fetch(`${API}/api/rollback`, { method: 'POST', headers: { ...auth(adminKey), 'Content-Type': 'application/json' }, body: JSON.stringify({ version }) });
  const b = await readJson(r);
  if (!r.ok) throw new DataError(b.error || 'Khôi phục thất bại.');
  return b;
}

export function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
