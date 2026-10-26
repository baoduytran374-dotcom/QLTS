// Cầu nối SheetJS → định dạng đầu vào của normalizeWorkbook. Nhận XLSX làm tham số để dùng chung cho trình duyệt và Node.
export function readSheets(XLSX, data) {
  const wb = XLSX.read(data, { type: data instanceof ArrayBuffer || ArrayBuffer.isView(data) ? 'array' : 'buffer', cellDates: false });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) return { name, rows: [], rowOffset: 0 };
    const rowOffset = XLSX.utils.decode_range(ws['!ref']).s.r;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    return { name, rows, rowOffset };
  });
}
