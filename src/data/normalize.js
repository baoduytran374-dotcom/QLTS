// Chuẩn hóa workbook Excel → bộ dữ liệu của dashboard. Hàm thuần (không phụ thuộc DOM / SheetJS)
// nên chạy được trong trình duyệt, Node (npm run data:build) và bộ kiểm thử.
//
// Đầu vào : sheets = [{ name, rows: any[][], rowOffset?: number }]  (rows = mảng các dòng, ô trống = null)
// Đầu ra  : { dataset, report }
import { CONFIG, MAIN_FIELDS, CLASS_FIELDS, SCHEMA_VERSION, fold } from './schema.js';
import { validateDataset, summarize } from '../../shared/validate.js';

const pad = (n) => String(n).padStart(2, '0');
export const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const validYMD = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
export const fmtVN = (n) => Math.round(n).toLocaleString('en-US');
const clean = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

/** Trả về { y, m, d } hoặc null; y có thể null nếu ô chỉ có ngày/tháng. */
export function parseDateParts(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate() };
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null; // ngoài khoảng ngày Excel hợp lý (1954–2118)
    const t = new Date(Math.round((v - 25569) * 86400) * 1000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  const s = clean(v);
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validYMD(+m[1], +m[2], +m[3]) ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/);
  if (m) {
    let y = m[3] ? +m[3] : null;
    if (y != null && y < 100) y += 2000;
    const dd = +m[1], mm = +m[2];
    return validYMD(y ?? 2000, mm, dd) ? { y, m: mm, d: dd } : null;
  }
  return null;
}

export function parseMoney(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = clean(v);
  if (!/\d/.test(s)) return null;
  const neg = /^\(.*\)$|^-/.test(s);
  const n = Number(s.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

const parseInt0 = (v) => { const n = parseMoney(v); return n == null ? null : Math.trunc(n); };

// ---------- nhận diện tiêu đề ----------
function matchScore(h, alias) {
  let best = 0;
  for (const a of alias) {
    if (h === a) best = Math.max(best, 100 + a.length);
    else if (a.length >= 5 && (` ${h} `).includes(` ${a} `)) best = Math.max(best, a.length);
  }
  return best;
}

function paymentSlot(h) {
  const m = h.match(/(?:^|\s)([1-9])(?:\s|$)/);
  if (!m || !/(thanh toan|\btt\b|dong|dot|lan|\bhp\b|tien)/.test(h)) return null;
  return { n: +m[1], kind: /ngay/.test(h) ? 'date' : 'amount' };
}

function mapColumns(headerRow, fields) {
  const cols = {}, pay = {}, used = new Set();
  const folded = headerRow.map(fold);
  if (fields === MAIN_FIELDS) {
    folded.forEach((h, i) => {
      const s = h && paymentSlot(h);
      if (s && s.n <= CONFIG.maxPaymentSlots) { (pay[s.n] = pay[s.n] || {})[s.kind] = i; used.add(i); }
    });
  }
  const claims = [];
  folded.forEach((h, i) => {
    if (!h || used.has(i)) return;
    let bestK = null, bestS = 0;
    for (const [k, f] of Object.entries(fields)) { const s = matchScore(h, f.alias); if (s > bestS) { bestS = s; bestK = k; } }
    if (bestK) claims.push({ i, k: bestK, s: bestS });
  });
  claims.sort((a, b) => b.s - a.s || a.i - b.i);
  for (const c of claims) if (cols[c.k] == null) { cols[c.k] = c.i; used.add(c.i); }
  const unmatched = headerRow.map((h, i) => (clean(h) && !used.has(i) ? clean(h) : null)).filter(Boolean);
  return { cols, pay, unmatched };
}

function findHeader(rows, fields) {
  let best = null;
  const limit = Math.min(rows.length, CONFIG.headerScanRows);
  for (let r = 0; r < limit; r++) {
    const row = rows[r] || [];
    if (row.filter((c) => clean(c)).length < 3) continue;
    const m = mapColumns(row, fields);
    const score = Object.keys(m.cols).length + Object.keys(m.pay).length * 0.5;
    if (!best || score > best.score) best = { r, score, ...m };
  }
  return best && best.score >= 3 ? best : null;
}

export function computeStatus({ reg, fee, paid }, hasReconcileFlag) {
  if (!reg || fee == null) return 'Chưa đủ dữ liệu';
  const owe = fee - paid;
  if (hasReconcileFlag || owe < -0.5) return 'Cần đối soát';
  if (owe > 0.5) return 'Chưa hoàn tất';
  return 'Đã hoàn tất';
}

const F = {
  year: 'Sai năm (tự quy về năm chuẩn, cần xác nhận)',
  future: 'Ngày nằm sau ngày hiện tại (bỏ qua giá trị)',
  notInMain: 'Học viên không có trong sheet TỔNG (bỏ qua)',
  feeDiff: 'Học phí áp dụng khác nhau giữa TỔNG và sheet khai giảng',
  payDiff: 'Thanh toán khác nhau giữa TỔNG và sheet khai giảng; dùng TỔNG, cần đối soát',
  remainDiff: 'Còn lại trong file ≠ HP áp dụng − tổng thanh toán',
  early: 'Thanh toán trước ngày đăng ký >3 ngày',
  dup: 'Mã học viên trùng trong sheet TỔNG',
  noClass: 'Chưa xếp lớp', noSrc: 'Thiếu nguồn tuyển sinh', noReg: 'Thiếu ngày đăng ký', noTvv: 'Thiếu tư vấn viên',
};
const RECONCILE = new Set([F.feeDiff, F.payDiff, F.remainDiff]);

function hash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }

/**
 * @param {Array} sheets
 * @param {{today?:string, fileName?:string, fileSize?:number, current?:object}} opt  current = dataset đang chạy (để cảnh báo giảm số lượng)
 */
export function normalizeWorkbook(sheets, opt = {}) {
  const today = opt.today || new Date().toISOString().slice(0, 10);
  const errors = [], warnings = [], flags = [];
  const report = { ok: false, errors, warnings, sheets: [], missingFields: [], unmatchedHeaders: [], rowsRead: 0, counts: {} };
  const out = (extra) => ({ dataset: null, report: Object.assign(report, extra) });

  const info = sheets.map((s) => ({ ...s, key: fold(s.name) }));
  const main = info.find((s) => CONFIG.mainSheet.test(s.key));
  const kgSheets = info.filter((s) => s !== main && CONFIG.classSheet.test(s.key));
  info.forEach((s) => report.sheets.push({ name: s.name, role: s === main ? 'Sheet chính' : kgSheets.includes(s) ? 'Sheet khai giảng' : 'Bỏ qua', rows: (s.rows || []).length }));
  if (!main) { errors.push('Không tìm thấy sheet chính (tên bắt đầu bằng "TỔNG", ví dụ "TỔNG 2026").'); return out(); }

  const mh = findHeader(main.rows, MAIN_FIELDS);
  if (!mh) { errors.push(`Không nhận diện được dòng tiêu đề trong sheet "${main.name}" (quét ${CONFIG.headerScanRows} dòng đầu).`); return out(); }
  report.unmatchedHeaders.push(...mh.unmatched.map((h) => `${main.name}: ${h}`));
  for (const [k, f] of Object.entries(MAIN_FIELDS)) {
    if (mh.cols[k] == null) { report.missingFields.push({ sheet: main.name, field: f.label, required: f.req }); if (f.req) errors.push(`Thiếu cột bắt buộc "${f.label}" trong sheet "${main.name}".`); else warnings.push(`Không thấy cột "${f.label}" — dữ liệu liên quan sẽ để trống.`); }
  }
  const slots = Object.keys(mh.pay).map(Number).sort((a, b) => a - b).filter((n) => mh.pay[n].amount != null);
  if (!slots.length) { report.missingFields.push({ sheet: main.name, field: 'Số tiền thanh toán (lần 1, 2…)', required: true }); errors.push(`Không tìm thấy cột "Số tiền" thanh toán từng lần trong sheet "${main.name}".`); }
  if (errors.length) return out();

  // ---- đọc sheet chính (lần 1: chỉ lấy dữ liệu thô, chưa biết năm chuẩn)
  const raw = [], dateIssues = [];
  const off = main.rowOffset || 0;
  for (let r = mh.r + 1; r < main.rows.length; r++) {
    const row = main.rows[r] || [];
    const cell = (k) => (mh.cols[k] == null ? null : row[mh.cols[k]]);
    const id = clean(cell('id')), name = clean(cell('name'));
    if (!id && !name) continue;
    if (/^(tong|total|cong)\b/.test(fold(id || name))) continue;
    if (!id || !name) { warnings.push(`${main.name}!${off + r + 1}: thiếu ${!id ? 'mã học viên' : 'họ tên'} — bỏ qua dòng.`); continue; }
    raw.push({ rowNo: off + r + 1, id, name, cells: row });
  }
  report.rowsRead = raw.length;
  if (!raw.length) { errors.push('Không có dòng học viên hợp lệ nào.'); return out(); }

  // năm chuẩn = năm xuất hiện nhiều nhất ở cột Ngày đăng ký
  const yc = new Map();
  raw.forEach((x) => { const p = parseDateParts(x.cells[mh.cols.reg]); if (p?.y) yc.set(p.y, (yc.get(p.y) || 0) + 1); });
  const baseYear = [...yc.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] || +today.slice(0, 4);
  report.baseYear = baseYear;

  const date = (v, ref) => {
    const p = parseDateParts(v); if (!p) return null;
    let { y, m, d } = p;
    if (y == null) y = baseYear;
    else if (y !== baseYear) { flags.push([ref, F.year.replace('năm chuẩn', `năm ${baseYear}`), isoOf(y, m, d)]); y = baseYear; }
    if (!validYMD(y, m, d)) return null;
    const iso = isoOf(y, m, d);
    if (iso > today) { flags.push([ref, F.future, iso]); return null; }
    return iso;
  };

  const students = [];
  raw.forEach((x) => {
    const c = (k) => (mh.cols[k] == null ? null : x.cells[mh.cols[k]]);
    const ref = `${main.name}!${x.rowNo}`;
    const pays = [];
    slots.forEach((n) => {
      const amt = parseMoney(x.cells[mh.pay[n].amount]);
      if (amt == null || amt === 0) return;
      pays.push([mh.pay[n].date != null ? date(x.cells[mh.pay[n].date], ref) : null, amt]);
    });
    students.push({
      id: x.id, name: x.name, reg: date(c('reg'), ref), kg: parseInt0(c('kg')), cls: clean(c('cls')), course: clean(c('course')),
      fee: parseMoney(c('fee')), promo: clean(c('promo')), tvv: clean(c('tvv')), src: clean(c('src')), pays, st: '', basis: main.name, note: clean(c('note')),
      _remain: parseMoney(c('remain')),
    });
  });

  // ---- sheet khai giảng: lớp, đối chiếu thanh toán
  const classes = {};
  const byId = new Map();
  students.forEach((s) => { if (!byId.has(s.id)) byId.set(s.id, s); });
  kgSheets.forEach((sh) => {
    const h = findHeader(sh.rows, CLASS_FIELDS);
    if (!h || h.cols.id == null) { warnings.push(`Sheet "${sh.name}": không nhận diện được cột mã học viên — bỏ qua đối chiếu.`); return; }
    report.unmatchedHeaders.push(...h.unmatched.map((u) => `${sh.name}: ${u}`));
    const kgMonth = (sh.name.match(/(\d{1,2})[./-]\d{4}/) || [])[1];
    const so = sh.rowOffset || 0;
    for (let r = h.r + 1; r < sh.rows.length; r++) {
      const row = sh.rows[r] || [];
      const cv = (k) => (h.cols[k] == null ? null : row[h.cols[k]]);
      const id = clean(cv('id')); if (!id) continue;
      const cls = clean(cv('cls'));
      if (cls && !classes[cls]) {
        const meta = { sched: clean(cv('sched')), shift: clean(cv('shift')), teacher: clean(cv('teacher')) };
        const op = parseDateParts(cv('open'));
        meta.open = op ? `${op.d}/${op.m}` : clean(cv('open'));
        classes[cls] = meta;
      }
      const s = byId.get(id);
      if (!s) { flags.push([`${sh.name}!${so + r + 1}`, F.notInMain, clean(cv('name')) || id]); continue; }
      if (!s.cls && cls) s.cls = cls;
      if (s.kg == null && kgMonth) s.kg = +kgMonth;
      const kfee = parseMoney(cv('fee')), kpaid = parseMoney(cv('paid'));
      if (kfee != null && s.fee != null && Math.abs(kfee - s.fee) > 0.5) flags.push([s.id, F.feeDiff, `TỔNG ${fmtVN(s.fee)} / KG ${fmtVN(kfee)}`]);
      const paid = s.pays.reduce((a, p) => a + p[1], 0);
      if (kpaid != null && Math.abs(kpaid - paid) > 0.5) flags.push([s.id, F.payDiff, `TỔNG ${fmtVN(paid)} / KG ${fmtVN(kpaid)}`]);
    }
  });

  // ---- cờ chất lượng + trạng thái
  const idCount = new Map();
  students.forEach((s) => idCount.set(s.id, (idCount.get(s.id) || 0) + 1));
  [...idCount].filter(([, n]) => n > 1).forEach(([id, n]) => flags.push([id, F.dup, `xuất hiện ${n} lần`]));
  students.forEach((s) => {
    const paid = s.pays.reduce((a, p) => a + p[1], 0);
    if (!s.cls) flags.push([s.id, F.noClass, s.name]);
    if (!s.src) flags.push([s.id, F.noSrc, s.name]);
    if (!s.reg) flags.push([s.id, F.noReg, s.name]);
    if (!s.tvv) flags.push([s.id, F.noTvv, s.name]);
    if (s.reg) {
      const early = s.pays.find((p) => p[0] && (Date.parse(s.reg) - Date.parse(p[0])) / 864e5 > CONFIG.earlyPaymentDays);
      if (early) flags.push([s.id, F.early, `ĐK ${s.reg} / TT ${early[0]}`]);
    }
    if (s._remain != null && s.fee != null && Math.abs(s._remain - (s.fee - paid)) > 0.5) flags.push([s.id, F.remainDiff, `file ${fmtVN(s._remain)} / tính ${fmtVN(s.fee - paid)}`]);
  });
  const reconcileIds = new Set(flags.filter((f) => RECONCILE.has(f[1])).map((f) => f[0]));
  students.forEach((s) => {
    s.st = computeStatus({ reg: s.reg, fee: s.fee, paid: s.pays.reduce((a, p) => a + p[1], 0) }, reconcileIds.has(s.id));
    delete s._remain;
  });

  // ---- kiểm tra an toàn trước khi cho phép cập nhật
  const missReg = students.filter((s) => !s.reg).length;
  if (missReg / students.length > CONFIG.maxMissingRegRatio) errors.push(`Hơn ${Math.round(CONFIG.maxMissingRegRatio * 100)}% dòng thiếu ngày đăng ký (${missReg}/${students.length}) — nhiều khả năng sai cột/định dạng ngày.`);
  if (!kgSheets.length) warnings.push('Không có sheet khai giảng: thông tin lịch học/giáo viên và đối chiếu thanh toán sẽ để trống.');
  const cur = opt.current?.students?.length;
  if (cur && students.length < cur * (1 - CONFIG.dropWarnRatio)) { report.needsConfirmDrop = true; warnings.push(`Số học viên giảm mạnh: ${cur} → ${students.length}. Hãy kiểm tra đúng file trước khi xác nhận.`); }

  const body = { students, classes, flags, today };
  const stamp = new Date().toISOString();
  const dataset = {
    ...body,
    meta: { schema: SCHEMA_VERSION, version: `${stamp.replace(/[-:.TZ]/g, '').slice(0, 14)}-${hash(JSON.stringify(body))}`, updatedAt: stamp,
      source: { fileName: opt.fileName || '', fileSize: opt.fileSize || 0, sheets: info.length, rows: report.rowsRead } },
  };
  const v = validateDataset(dataset);
  if (!v.ok) errors.push(...v.errors.map((e) => `Dữ liệu chuẩn hóa không hợp lệ: ${e}`));
  report.counts = { ...summarize(dataset), students: students.length, withoutClass: students.filter((s) => !s.cls).length };
  report.ok = errors.length === 0;
  return { dataset: report.ok ? dataset : null, report };
}
