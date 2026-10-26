#!/usr/bin/env node
// Chuyển file Excel thành JSON chuẩn hóa NGAY TRÊN MÁY BẠN (không gửi đi đâu).
//   npm run data:build -- "duong/dan/file.xlsx" [--out public/data] [--today 2026-10-26]
// Kết quả: <out>/latest.json và <out>/version.json. Thoát với mã 1 nếu file không hợp lệ.
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { readSheets } from '../src/data/excel.js';
import { normalizeWorkbook } from '../src/data/normalize.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!file) { console.error('Cách dùng: npm run data:build -- <file.xlsx> [--out public/data] [--today YYYY-MM-DD]'); process.exit(2); }

const buf = fs.readFileSync(file);
const { dataset, report } = normalizeWorkbook(readSheets(XLSX, buf), { fileName: path.basename(file), fileSize: buf.length, today: opt('--today') });
console.log(`Sheet: ${report.sheets.map((s) => `${s.name} (${s.role})`).join(' | ')}`);
console.log(`Dòng học viên đọc được: ${report.rowsRead}`);
report.warnings.forEach((w) => console.log('  ⚠', w));
if (!report.ok) { report.errors.forEach((e) => console.error('  ✗', e)); console.error('File KHÔNG hợp lệ — không ghi gì cả.'); process.exit(1); }

const out = opt('--out', 'public/data');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'latest.json'), JSON.stringify(dataset));
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ version: dataset.meta.version, updatedAt: dataset.meta.updatedAt }));
console.log(`Đã ghi ${out}/latest.json (${dataset.students.length} học viên, phiên bản ${dataset.meta.version}).`);
