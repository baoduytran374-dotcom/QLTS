import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handle } from '../worker/src/index.js';
import { normalizeWorkbook } from '../src/data/normalize.js';
import { workbook, mainRow } from './helpers.js';

// R2 giả lập trong bộ nhớ
function fakeR2() {
  const m = new Map();
  return {
    _m: m,
    async get(k) { return m.has(k) ? { text: async () => m.get(k) } : null; },
    async head(k) { return m.has(k) ? { key: k } : null; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
    async list({ prefix }) { return { objects: [...m.keys()].filter((k) => k.startsWith(prefix)).map((k) => ({ key: k, size: m.get(k).length, uploaded: new Date() })) }; },
  };
}
const ORIGIN = 'https://demo.github.io';
const mkEnv = () => ({ DATA: fakeR2(), ADMIN_KEY: 'admin-key-123456', VIEWER_KEY: 'viewer-key-1234', ALLOWED_ORIGIN: ORIGIN });
const call = (env, method, path, { key, body, origin = ORIGIN } = {}) => handle(new Request('https://api.test' + path, {
  method, headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
  body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), env);
const ds = (rows, today = '2026-10-26') => normalizeWorkbook(workbook(rows), { today }).dataset;
const A = 'admin-key-123456', V = 'viewer-key-1234';

test('chưa đăng nhập → 401; sai khóa → 401', async () => {
  const env = mkEnv();
  assert.equal((await call(env, 'GET', '/api/data')).status, 401);
  assert.equal((await call(env, 'GET', '/api/data', { key: 'sai-khoa' })).status, 401);
});

test('viewer đọc được, không ghi được; admin ghi được', async () => {
  const env = mkEnv();
  const d = ds([mainRow({ id: 'A1' }), mainRow({ id: 'A2' })]);
  assert.equal((await call(env, 'POST', '/api/data', { key: V, body: d })).status, 403);
  assert.equal((await call(env, 'GET', '/api/data', { key: V })).status, 404); // chưa có dữ liệu
  const ok = await call(env, 'POST', '/api/data', { key: A, body: d });
  assert.equal(ok.status, 200);
  const got = await (await call(env, 'GET', '/api/data', { key: V })).json();
  assert.equal(got.students.length, 2);
  assert.equal((await call(env, 'GET', '/api/data', { key: V })).headers.get('Cache-Control'), 'no-store');
});

test('dữ liệu hỏng bị từ chối và KHÔNG ghi đè dữ liệu tốt', async () => {
  const env = mkEnv();
  const good = ds([mainRow({ id: 'G1' })]);
  await call(env, 'POST', '/api/data', { key: A, body: good });
  const bad = { ...good, students: [{ id: 'X' }] };
  const r = await call(env, 'POST', '/api/data', { key: A, body: bad });
  assert.equal(r.status, 400);
  assert.equal((await call(env, 'POST', '/api/data', { key: A, body: '{không phải json' })).status, 400);
  const now = await (await call(env, 'GET', '/api/data', { key: A })).json();
  assert.equal(now.meta.version, good.meta.version);
});

test('cập nhật tạo phiên bản, sao lưu bản cũ, khôi phục được', async () => {
  const env = mkEnv();
  const v1 = ds([mainRow({ id: 'V1' })]);
  const v2 = { ...ds([mainRow({ id: 'V1' }), mainRow({ id: 'V2' })]) };
  v2.meta = { ...v2.meta, version: v2.meta.version + 'b' };
  await call(env, 'POST', '/api/data', { key: A, body: v1 });
  await call(env, 'POST', '/api/data', { key: A, body: v2 });
  const list = await (await call(env, 'GET', '/api/versions', { key: A })).json();
  assert.equal(list.versions.length, 2);
  assert.equal((await call(env, 'GET', '/api/versions', { key: V })).status, 403);
  assert.equal((await (await call(env, 'GET', '/api/data', { key: A })).json()).students.length, 2);
  const rb = await call(env, 'POST', '/api/rollback', { key: A, body: { version: v1.meta.version } });
  assert.equal(rb.status, 200);
  assert.equal((await (await call(env, 'GET', '/api/data', { key: A })).json()).students.length, 1);
  assert.equal((await call(env, 'POST', '/api/rollback', { key: A, body: { version: '../../etc' } })).status, 400);
  assert.equal((await call(env, 'POST', '/api/rollback', { key: A, body: { version: 'khong-ton-tai-123' } })).status, 404);
});

test('CORS chỉ cho phép origin đã cấu hình', async () => {
  const env = mkEnv();
  const ok = await call(env, 'OPTIONS', '/api/data', { origin: ORIGIN });
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const bad = await call(env, 'OPTIONS', '/api/data', { origin: 'https://evil.example' });
  assert.equal(bad.headers.get('Access-Control-Allow-Origin'), null);
});

test('thiếu ADMIN_KEY hoặc quá ngắn → máy chủ từ chối hoạt động', async () => {
  const env = { ...mkEnv(), ADMIN_KEY: 'ngan' };
  assert.equal((await call(env, 'GET', '/api/data', { key: 'ngan' })).status, 500);
});

test('seed thật (nếu có) được Worker chấp nhận', { skip: !fs.existsSync(new URL('../seed/initial-data.json', import.meta.url)) }, async () => {
  const env = mkEnv();
  const d = JSON.parse(fs.readFileSync(new URL('../seed/initial-data.json', import.meta.url), 'utf8'));
  assert.equal((await call(env, 'POST', '/api/data', { key: A, body: d })).status, 200);
});
