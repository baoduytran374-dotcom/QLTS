import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWorkbook, parseDateParts, parseMoney, computeStatus } from '../src/data/normalize.js';
import { validateDataset } from '../shared/validate.js';
import { workbook, mainRow, KG_HEADER } from './helpers.js';

const TODAY = '2026-10-26';
const run = (rows, extra = {}, opt = {}) => normalizeWorkbook(workbook(rows, extra), { today: TODAY, ...opt });

test('parseDateParts: serial Excel, chuỗi dd/mm/yyyy, yyyy-mm-dd, ngày/tháng không năm', () => {
  assert.deepEqual(parseDateParts(46235), { y: 2026, m: 8, d: 1 });
  assert.deepEqual(parseDateParts('05/08/2026'), { y: 2026, m: 8, d: 5 });
  assert.deepEqual(parseDateParts('2026-08-05'), { y: 2026, m: 8, d: 5 });
  assert.deepEqual(parseDateParts('28/8'), { y: null, m: 8, d: 28 });
  assert.equal(parseDateParts('31/02/2026'), null);
  assert.equal(parseDateParts('abc'), null);
});

test('parseMoney: số, chuỗi có dấu phân cách và ký hiệu tiền', () => {
  assert.equal(parseMoney(3100000), 3100000);
  assert.equal(parseMoney('3.100.000 đ'), 3100000);
  assert.equal(parseMoney('3,100,000'), 3100000);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('—'), null);
});

test('file hợp lệ: đọc đúng học viên, thanh toán, trạng thái; bỏ qua dòng tổng', () => {
  const rows = [
    mainRow({ id: 'BM001' }),
    mainRow({ id: 'BM002', name: 'Trần B', a2: 1000000 }),                       // còn nợ 1.5tr
    mainRow({ id: 'BM003', name: 'Lê C', reg: null }),                           // thiếu ngày ĐK
    ['TỔNG CỘNG', null, null, null, null, null, 9000000],
  ];
  const { dataset, report } = run(rows);
  assert.equal(report.ok, true, report.errors.join('; '));
  assert.equal(dataset.students.length, 3);
  assert.equal(report.rowsRead, 3);
  const by = Object.fromEntries(dataset.students.map((s) => [s.id, s]));
  assert.equal(by.BM001.st, 'Đã hoàn tất');
  assert.equal(by.BM002.st, 'Chưa hoàn tất');
  assert.equal(by.BM003.st, 'Chưa đủ dữ liệu');
  assert.deepEqual(by.BM001.pays, [['2026-08-01', 500000], ['2026-08-20', 2500000]]);
  assert.equal(validateDataset(dataset).ok, true);
  assert.ok(report.sheets.some((s) => s.name === 'Ghi chú khác' && s.role === 'Bỏ qua'));
  assert.ok(dataset.flags.some((f) => f[0] === 'BM003' && f[1] === 'Thiếu ngày đăng ký'));
});

test('tìm đúng dòng tiêu đề dù có dòng tiêu đề báo cáo phía trên', () => {
  const { report } = run([mainRow()], { title: true });
  assert.equal(report.ok, true);
});

test('sai năm được quy về năm chuẩn + ghi cờ; ngày tương lai bị bỏ qua + ghi cờ', () => {
  const rows = [mainRow({ id: 'A1' }), mainRow({ id: 'A2' }), mainRow({ id: 'A3' }),
    mainRow({ id: 'BM010', d2: '2027-08-24' }),            // sai năm → 2026-08-24
    mainRow({ id: 'BM011', d2: '2025-12-30' })];           // sai năm → 2026-12-30 > hôm nay → bỏ
  const { dataset, report } = run(rows);
  assert.equal(report.baseYear, 2026);
  const s10 = dataset.students.find((s) => s.id === 'BM010');
  assert.equal(s10.pays[1][0], '2026-08-24');
  const s11 = dataset.students.find((s) => s.id === 'BM011');
  assert.equal(s11.pays[1][0], null);
  assert.equal(dataset.flags.filter((f) => f[1].startsWith('Sai năm')).length, 2);
  assert.equal(dataset.flags.filter((f) => f[1].startsWith('Ngày nằm sau')).length, 1);
  // tham chiếu ô phải là "tên sheet!số dòng Excel" (2 dòng tiêu đề báo cáo + 1 dòng tiêu đề cột + vị trí dữ liệu)
  const yearFlag = dataset.flags.find((f) => f[1].startsWith('Sai năm') && f[2] === '2027-08-24');
  assert.equal(yearFlag[0], 'TỔNG 2026!7');
});

test('thiếu cột bắt buộc → từ chối, không có dataset', () => {
  const sheets = workbook([mainRow()]);
  sheets[0].rows[2] = sheets[0].rows[2].map((h) => (h === 'Học phí áp dụng' ? 'Cột lạ' : h));
  const { dataset, report } = normalizeWorkbook(sheets, { today: TODAY });
  assert.equal(dataset, null);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((e) => e.includes('Học phí áp dụng')));
  assert.ok(report.missingFields.some((m) => m.required));
});

test('không có sheet TỔNG → từ chối', () => {
  const { dataset, report } = normalizeWorkbook([{ name: 'Sheet1', rows: [['a', 'b', 'c']] }], { today: TODAY });
  assert.equal(dataset, null);
  assert.match(report.errors[0], /sheet chính/);
});

test('hơn 50% dòng thiếu ngày đăng ký → từ chối (nghi sai cột)', () => {
  const rows = [mainRow({ id: 'X1', reg: 'không phải ngày' }), mainRow({ id: 'X2', reg: 'n/a' }), mainRow({ id: 'X3' })];
  const { dataset, report } = run(rows);
  assert.equal(dataset, null);
  assert.ok(report.errors.some((e) => e.includes('thiếu ngày đăng ký')));
});

test('mã trùng, thanh toán sớm, còn lại lệch → cờ + Cần đối soát', () => {
  const rows = [mainRow({ id: 'D1' }), mainRow({ id: 'D1', name: 'Người khác' }),
    mainRow({ id: 'E1', d1: '2026-06-01' }),
    mainRow({ id: 'R1', remain: 999 })];
  const { dataset } = run(rows);
  const f = (id, t) => dataset.flags.some((x) => x[0] === id && x[1].startsWith(t));
  assert.ok(f('D1', 'Mã học viên trùng'));
  assert.ok(f('E1', 'Thanh toán trước ngày đăng ký'));
  assert.ok(f('R1', 'Còn lại trong file'));
  assert.equal(dataset.students.find((s) => s.id === 'R1').st, 'Cần đối soát');
});

test('sheet khai giảng: lấy lớp, đối chiếu thanh toán/học phí, cờ học viên không có trong TỔNG', () => {
  const kg = [KG_HEADER,
    ['BM001', 'A', 'B1-106', 3000000, 3000000, '246', '17h45', 'Cô Vy', '28/08/2026'],
    ['BM002', 'B', 'B1-106', 3300000, 3100000, '246', '17h45', 'Cô Vy', '28/08/2026'],
    ['ZZ999', 'Người lạ', 'B1-106', 1, 1, '', '', '', '']];
  const rows = [mainRow({ id: 'BM001' }), mainRow({ id: 'BM002', name: 'B' })];
  const { dataset } = run(rows, { kg });
  assert.deepEqual(dataset.classes['B1-106'], { sched: '246', shift: '17h45', teacher: 'Cô Vy', open: '28/8' });
  assert.ok(dataset.flags.some((f) => f[0] === 'BM002' && f[1].startsWith('Học phí áp dụng khác')));
  assert.ok(dataset.flags.some((f) => f[0] === 'BM002' && f[1].startsWith('Thanh toán khác nhau')));
  assert.ok(dataset.flags.some((f) => f[0].startsWith('KHAI GIẢNG 08.2026!') && f[2] === 'Người lạ'));
  assert.equal(dataset.students.find((s) => s.id === 'BM002').st, 'Cần đối soát');
  assert.equal(dataset.students.find((s) => s.id === 'BM001').st, 'Đã hoàn tất');
});

test('số học viên giảm mạnh so với dữ liệu đang chạy → yêu cầu xác nhận thêm', () => {
  const current = { students: new Array(100).fill(0) };
  const { report } = run([mainRow()], {}, { current });
  assert.equal(report.needsConfirmDrop, true);
});

test('computeStatus', () => {
  assert.equal(computeStatus({ reg: null, fee: 1, paid: 1 }, false), 'Chưa đủ dữ liệu');
  assert.equal(computeStatus({ reg: '2026-01-01', fee: 100, paid: 100 }, true), 'Cần đối soát');
  assert.equal(computeStatus({ reg: '2026-01-01', fee: 100, paid: 150 }, false), 'Cần đối soát');
  assert.equal(computeStatus({ reg: '2026-01-01', fee: 100, paid: 40 }, false), 'Chưa hoàn tất');
  assert.equal(computeStatus({ reg: '2026-01-01', fee: 100, paid: 100 }, false), 'Đã hoàn tất');
});
