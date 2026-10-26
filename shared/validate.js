// Kiểm tra cấu trúc bộ dữ liệu đã chuẩn hóa. Dùng chung cho trình duyệt, script CLI và Cloudflare Worker.
export const STATUSES = ['Đã hoàn tất', 'Chưa hoàn tất', 'Cần đối soát', 'Chưa đủ dữ liệu'];
export const MAX_STUDENTS = 20000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const isStr = (v) => typeof v === 'string';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isDate = (v) => isStr(v) && ISO.test(v) && !Number.isNaN(Date.parse(v));

/** @returns {{ok:boolean, errors:string[]}} */
export function validateDataset(d) {
  const errors = [];
  const fail = (m) => { if (errors.length < 25) errors.push(m); };
  if (!d || typeof d !== 'object') return { ok: false, errors: ['Dữ liệu không phải đối tượng JSON.'] };
  if (!Array.isArray(d.students)) fail('Thiếu mảng students.');
  if (!d.classes || typeof d.classes !== 'object' || Array.isArray(d.classes)) fail('Thiếu đối tượng classes.');
  if (!Array.isArray(d.flags)) fail('Thiếu mảng flags.');
  if (!isDate(d.today)) fail('Trường today phải có dạng YYYY-MM-DD.');
  if (errors.length) return { ok: false, errors };
  if (d.students.length === 0) fail('Danh sách học viên rỗng.');
  if (d.students.length > MAX_STUDENTS) fail(`Quá ${MAX_STUDENTS} học viên.`);
  d.students.forEach((s, i) => {
    const at = `students[${i}]`;
    if (!s || typeof s !== 'object') return fail(`${at} không hợp lệ.`);
    if (!isStr(s.id) || !s.id) fail(`${at}: thiếu mã học viên.`);
    if (!isStr(s.name)) fail(`${at}: thiếu họ tên.`);
    if (s.reg !== null && !isDate(s.reg)) fail(`${at}: ngày đăng ký sai định dạng.`);
    if (s.fee !== null && !isNum(s.fee)) fail(`${at}: học phí không phải số.`);
    if (!Array.isArray(s.pays) || s.pays.some((p) => !Array.isArray(p) || p.length !== 2 || (p[0] !== null && !isDate(p[0])) || !isNum(p[1]))) fail(`${at}: danh sách thanh toán sai cấu trúc.`);
    ['cls', 'course', 'promo', 'tvv', 'src', 'basis', 'note'].forEach((k) => { if (!isStr(s[k])) fail(`${at}: trường ${k} phải là chuỗi.`); });
    if (s.kg !== null && !isNum(s.kg)) fail(`${at}: tháng khai giảng phải là số hoặc null.`);
    if (!STATUSES.includes(s.st)) fail(`${at}: tình trạng không hợp lệ.`);
  });
  Object.entries(d.classes).forEach(([k, v]) => {
    if (!v || typeof v !== 'object' || Object.values(v).some((x) => !isStr(x))) fail(`classes[${k}] sai cấu trúc.`);
  });
  d.flags.forEach((f, i) => { if (!Array.isArray(f) || f.length !== 3 || f.some((x) => !isStr(x))) fail(`flags[${i}] sai cấu trúc.`); });
  return { ok: errors.length === 0, errors };
}

/** Tóm tắt nhanh để so sánh trước/sau khi cập nhật. */
export function summarize(d) {
  const S = d.students || [];
  const sum = (f) => S.reduce((a, s) => a + (f(s) || 0), 0);
  const paid = (s) => s.pays.reduce((a, p) => a + p[1], 0);
  return {
    students: S.length,
    revenue: sum((s) => s.fee),
    paid: sum(paid),
    owe: sum((s) => (s.st === 'Chưa hoàn tất' ? (s.fee || 0) - paid(s) : 0)),
    flags: (d.flags || []).length,
  };
}
