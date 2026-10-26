#!/usr/bin/env node
// Đẩy một file JSON chuẩn hóa lên Worker (ví dụ nạp dữ liệu ban đầu từ seed/initial-data.json).
//   API_URL=https://betma-dashboard-api.xxx.workers.dev ADMIN_KEY=... npm run data:push -- seed/initial-data.json
// Khóa lấy từ biến môi trường, không bao giờ ghi vào file.
import fs from 'node:fs';
import { validateDataset } from '../shared/validate.js';

const file = process.argv[2];
const { API_URL, ADMIN_KEY } = process.env;
if (!file || !API_URL || !ADMIN_KEY) { console.error('Thiếu tham số. Cần: <file.json>, biến môi trường API_URL và ADMIN_KEY.'); process.exit(2); }
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const v = validateDataset(d);
if (!v.ok) { v.errors.forEach((e) => console.error('✗', e)); process.exit(1); }
const r = await fetch(`${API_URL.replace(/\/+$/, '')}/api/data`, { method: 'POST', headers: { Authorization: `Bearer ${ADMIN_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
const b = await r.json().catch(() => ({}));
if (!r.ok) { console.error(`✗ Máy chủ trả ${r.status}:`, b.error || '', b.details || ''); process.exit(1); }
console.log(`✓ Đã lưu phiên bản ${b.version} (${b.students} học viên).`);
