// Kiểm tra quy tắc tính "Tình trạng" tái tạo đúng 100% trạng thái của dashboard gốc (316 học viên).
// File seed/initial-data.json bị .gitignore nên test tự bỏ qua khi chạy trên CI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeStatus } from '../src/data/normalize.js';
import { validateDataset } from '../shared/validate.js';

const file = new URL('../seed/initial-data.json', import.meta.url);
const has = fs.existsSync(file);

test('dữ liệu seed hợp lệ theo schema', { skip: !has }, () => {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const v = validateDataset(d);
  assert.deepEqual(v.errors, []);
});

test('computeStatus khớp trạng thái gốc của mọi học viên trong seed', { skip: !has }, () => {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const recon = new Set(d.flags.filter((f) => /^(Thanh toán khác nhau|Học phí áp dụng khác|Còn lại trong file)/.test(f[1])).map((f) => f[0]));
  const bad = d.students.filter((s) => computeStatus({ reg: s.reg, fee: s.fee, paid: s.pays.reduce((a, p) => a + p[1], 0) }, recon.has(s.id)) !== s.st);
  assert.deepEqual(bad.map((s) => s.id), []);
});
