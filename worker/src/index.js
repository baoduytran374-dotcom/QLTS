// Cloudflare Worker: API lưu & phát dữ liệu tuyển sinh. Dữ liệu nằm trong R2 (binding DATA), khóa truy cập nằm trong Secrets.
//   GET  /api/data            (VIEWER_KEY hoặc ADMIN_KEY) → bộ dữ liệu mới nhất
//   GET  /api/meta            (VIEWER_KEY hoặc ADMIN_KEY) → thông tin phiên bản
//   POST /api/data            (ADMIN_KEY)                 → kiểm tra + lưu phiên bản mới
//   GET  /api/versions        (ADMIN_KEY)                 → danh sách phiên bản đã lưu
//   POST /api/rollback        (ADMIN_KEY) {version}       → đặt một phiên bản cũ làm bản chính thức
// Biến: ALLOWED_ORIGIN (vd https://username.github.io). Secrets: ADMIN_KEY, VIEWER_KEY (tùy chọn).
import { validateDataset, summarize } from '../../shared/validate.js';

const LATEST = 'data/latest.json';
const VER = (v) => `data/versions/${v}.json`;
const MAX_BODY = 8 * 1024 * 1024;
const KEEP_VERSIONS = 60;
const VERSION_RE = /^[0-9A-Za-z_-]{6,64}$/;

const enc = new TextEncoder();
async function safeEqual(a, b) {
  if (!a || !b) return false;
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let r = 0; for (let i = 0; i < x.length; i++) r |= x[i] ^ y[i];
  return r === 0;
}

function cors(env, req) {
  const origin = req.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const h = { Vary: 'Origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (origin && allowed.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Max-Age'] = '600';
  }
  return h;
}

const json = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8' } });

async function role(env, req) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  const key = m ? m[1].trim() : '';
  if (await safeEqual(key, env.ADMIN_KEY)) return 'admin';
  if (env.VIEWER_KEY && (await safeEqual(key, env.VIEWER_KEY))) return 'viewer';
  return null;
}

async function pruneVersions(env) {
  const list = await env.DATA.list({ prefix: 'data/versions/' });
  const objs = [...list.objects].sort((a, b) => (a.key < b.key ? 1 : -1));
  for (const o of objs.slice(KEEP_VERSIONS)) await env.DATA.delete(o.key);
}

export async function handle(req, env) {
  const h = cors(env, req);
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 12) return json({ error: 'Máy chủ chưa cấu hình ADMIN_KEY (tối thiểu 12 ký tự).' }, 500, h);

  const who = await role(env, req);
  const path = url.pathname;

  if (req.method === 'GET' && (path === '/api/data' || path === '/api/meta')) {
    if (!who) return json({ error: 'Cần đăng nhập.' }, 401, h);
    const obj = await env.DATA.get(LATEST);
    if (!obj) return json({ error: 'Chưa có dữ liệu. Quản trị viên hãy tải file Excel đầu tiên.' }, 404, h);
    const text = await obj.text();
    if (path === '/api/data') return new Response(text, { status: 200, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8' } });
    const d = JSON.parse(text);
    return json({ meta: d.meta, summary: summarize(d) }, 200, h);
  }

  if (req.method === 'POST' && path === '/api/data') {
    if (who !== 'admin') return json({ error: who ? 'Không đủ quyền cập nhật.' : 'Cần đăng nhập.' }, who ? 403 : 401, h);
    const len = Number(req.headers.get('Content-Length') || 0);
    if (len > MAX_BODY) return json({ error: 'Dữ liệu quá lớn.' }, 413, h);
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ error: 'Dữ liệu quá lớn.' }, 413, h);
    let d; try { d = JSON.parse(text); } catch { return json({ error: 'JSON không hợp lệ.' }, 400, h); }
    const v = validateDataset(d);
    if (!v.ok) return json({ error: 'Dữ liệu không hợp lệ — dữ liệu hiện tại được giữ nguyên.', details: v.errors }, 400, h);
    if (!d.meta || !VERSION_RE.test(d.meta.version || '')) return json({ error: 'Thiếu meta.version hợp lệ.' }, 400, h);
    const prev = await env.DATA.get(LATEST);
    if (prev) { // sao lưu bản đang chạy trước khi thay (nếu chưa có trong versions)
      const old = JSON.parse(await prev.text());
      if (old?.meta?.version && VERSION_RE.test(old.meta.version) && !(await env.DATA.head(VER(old.meta.version)))) await env.DATA.put(VER(old.meta.version), JSON.stringify(old));
    }
    const body = JSON.stringify(d);
    await env.DATA.put(VER(d.meta.version), body);
    await env.DATA.put(LATEST, body);
    await pruneVersions(env);
    return json({ ok: true, version: d.meta.version, updatedAt: d.meta.updatedAt, students: d.students.length }, 200, h);
  }

  if (req.method === 'GET' && path === '/api/versions') {
    if (who !== 'admin') return json({ error: who ? 'Không đủ quyền.' : 'Cần đăng nhập.' }, who ? 403 : 401, h);
    const list = await env.DATA.list({ prefix: 'data/versions/' });
    const items = list.objects.map((o) => ({ version: o.key.slice('data/versions/'.length, -'.json'.length), size: o.size, uploaded: o.uploaded })).sort((a, b) => (a.version < b.version ? 1 : -1));
    return json({ versions: items }, 200, h);
  }

  if (req.method === 'POST' && path === '/api/rollback') {
    if (who !== 'admin') return json({ error: who ? 'Không đủ quyền.' : 'Cần đăng nhập.' }, who ? 403 : 401, h);
    let b; try { b = await req.json(); } catch { return json({ error: 'JSON không hợp lệ.' }, 400, h); }
    if (!b || !VERSION_RE.test(b.version || '')) return json({ error: 'Phiên bản không hợp lệ.' }, 400, h);
    const obj = await env.DATA.get(VER(b.version));
    if (!obj) return json({ error: 'Không tìm thấy phiên bản.' }, 404, h);
    const text = await obj.text();
    if (!validateDataset(JSON.parse(text)).ok) return json({ error: 'Phiên bản lưu trữ bị lỗi cấu trúc, không khôi phục.' }, 422, h);
    await env.DATA.put(LATEST, text);
    return json({ ok: true, version: b.version }, 200, h);
  }

  return json({ error: 'Không tìm thấy.' }, 404, h);
}

export default { fetch: (req, env) => handle(req, env).catch(() => new Response(JSON.stringify({ error: 'Lỗi máy chủ.' }), { status: 500, headers: { ...cors(env, req), 'Content-Type': 'application/json' } })) };
