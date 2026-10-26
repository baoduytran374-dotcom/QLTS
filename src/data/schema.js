// Cấu hình nhận diện cột. Muốn hỗ trợ tiêu đề cột mới, chỉ cần thêm cụm từ vào `alias` (viết thường, không dấu).
export const SCHEMA_VERSION = 1;

export const CONFIG = {
  mainSheet: /^tong/,            // sheet chính, vd "TỔNG 2026"
  classSheet: /khai\s*giang/,    // sheet khai giảng, vd "KHAI GIẢNG 08.2026"
  headerScanRows: 25,            // số dòng đầu được quét để tìm dòng tiêu đề
  maxPaymentSlots: 8,            // số lần thanh toán tối đa đọc được
  earlyPaymentDays: 3,           // cảnh báo nếu thanh toán sớm hơn ngày đăng ký quá số ngày này
  dropWarnRatio: 0.3,            // cảnh báo khi số học viên giảm quá 30% so với dữ liệu đang chạy
  maxMissingRegRatio: 0.5,       // nếu >50% dòng thiếu ngày đăng ký, coi như sai cột → từ chối
};

export const fold = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// req: true → thiếu cột này thì TỪ CHỐI file (giữ nguyên dữ liệu cũ)
export const MAIN_FIELDS = {
  id:     { label: 'Mã học viên', req: true,  alias: ['ma hv', 'ma hoc vien', 'ma so hoc vien', 'mshv', 'id'] },
  name:   { label: 'Họ và tên', req: true,   alias: ['ho va ten', 'ho ten', 'ten hoc vien', 'ho ten hoc vien', 'hoc vien'] },
  reg:    { label: 'Ngày đăng ký', req: true, alias: ['ngay dang ky', 'ngay dk', 'ngay ghi danh', 'dang ky'] },
  fee:    { label: 'Học phí áp dụng', req: true, alias: ['hoc phi ap dung', 'hp ap dung', 'hoc phi', 'hoc phi sau uu dai', 'hoc phi phai dong'] },
  kg:     { label: 'Tháng khai giảng', req: false, alias: ['thang khai giang', 'thang kg', 'kg'] },
  cls:    { label: 'Mã lớp', req: false,     alias: ['ma lop', 'lop', 'lop hoc'] },
  course: { label: 'Khóa học', req: false,   alias: ['khoa hoc', 'khoa', 'chuong trinh hoc'] },
  promo:  { label: 'Ưu đãi', req: false,     alias: ['uu dai', 'chuong trinh uu dai', 'khuyen mai', 'promo'] },
  tvv:    { label: 'Tư vấn viên', req: false, alias: ['tu van vien', 'tvv', 'nhan vien tu van', 'nguoi tu van'] },
  src:    { label: 'Nguồn tuyển sinh', req: false, alias: ['nguon', 'nguon tuyen sinh', 'nguon hv'] },
  remain: { label: 'Còn lại', req: false,    alias: ['con lai', 'hoc phi con lai', 'con no', 'cong no'] },
  note:   { label: 'Ghi chú', req: false,    alias: ['ghi chu', 'note'] },
};

export const CLASS_FIELDS = {
  id:      { label: 'Mã học viên', alias: MAIN_FIELDS.id.alias },
  name:    { label: 'Họ và tên', alias: MAIN_FIELDS.name.alias },
  cls:     { label: 'Mã lớp', alias: MAIN_FIELDS.cls.alias },
  fee:     { label: 'Học phí áp dụng', alias: MAIN_FIELDS.fee.alias },
  paid:    { label: 'Đã thanh toán', alias: ['tong thanh toan', 'da thanh toan', 'da dong', 'tong da dong', 'tong tien da dong'] },
  sched:   { label: 'Lịch học', alias: ['lich hoc', 'thu hoc', 'lich'] },
  shift:   { label: 'Ca học', alias: ['ca hoc', 'gio hoc', 'ca'] },
  teacher: { label: 'Giáo viên', alias: ['giao vien', 'gv', 'giang vien'] },
  open:    { label: 'Ngày khai giảng', alias: ['ngay khai giang', 'khai giang'] },
};
