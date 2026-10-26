// Dựng workbook giả (mảng dòng) giống cấu trúc file tuyển sinh để kiểm thử bộ chuẩn hóa.
export const MAIN_HEADER = ['Mã HV', 'Họ và tên', 'Ngày đăng ký', 'Tháng KG', 'Mã lớp', 'Khóa học', 'Học phí áp dụng', 'Ưu đãi', 'Tư vấn viên', 'Nguồn',
  'Ngày TT lần 1', 'Số tiền TT lần 1', 'Ngày TT lần 2', 'Số tiền TT lần 2', 'Còn lại', 'Ghi chú'];

export function mainRow(o = {}) {
  const d = { id: 'BM001', name: 'Nguyễn Văn A', reg: '2026-08-01', kg: 8, cls: 'B1-106', course: 'VSTEP CS 3T', fee: 3000000, promo: '', tvv: 'Thành Danh', src: 'BE',
    d1: '2026-08-01', a1: 500000, d2: '2026-08-20', a2: 2500000, remain: null, note: '', ...o };
  return [d.id, d.name, d.reg, d.kg, d.cls, d.course, d.fee, d.promo, d.tvv, d.src, d.d1, d.a1, d.d2, d.a2, d.remain, d.note];
}

export function workbook(rows, { title = true, kg } = {}) {
  const main = { name: 'TỔNG 2026', rows: [...(title ? [['DANH SÁCH TUYỂN SINH 2026'], []] : []), MAIN_HEADER, ...rows] };
  const sheets = [main, { name: 'Ghi chú khác', rows: [['không liên quan']] }];
  if (kg) sheets.push({ name: 'KHAI GIẢNG 08.2026', rows: kg });
  return sheets;
}
export const KG_HEADER = ['Mã HV', 'Họ và tên', 'Mã lớp', 'Học phí áp dụng', 'Đã thanh toán', 'Lịch học', 'Ca học', 'Giáo viên', 'Ngày khai giảng'];
