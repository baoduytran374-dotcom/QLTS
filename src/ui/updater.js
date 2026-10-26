// Khu vực "CẬP NHẬT DỮ LIỆU TUYỂN SINH": chọn Excel → kiểm tra → xem trước → xác nhận → đồng bộ cho mọi người xem.
import * as XLSX from 'xlsx';
import { readSheets } from '../data/excel.js';
import { normalizeWorkbook } from '../data/normalize.js';
import { summarize } from '../../shared/validate.js';
import { MODE, AuthError, saveData, listVersions, rollback, loadData, downloadJson, keys } from '../data/store.js';

const MAX_BYTES = 15 * 1024 * 1024;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const vnd = (n) => Math.round(n || 0).toLocaleString('vi-VN') + ' ₫';
const num = (n) => Math.round(n || 0).toLocaleString('vi-VN');
const when = (t) => (t ? new Date(t).toLocaleString('vi-VN') : '—');
const size = (b) => (b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
const tagFor = (st) => ({ 'Đã hoàn tất': 't-ok', 'Chưa hoàn tất': 't-bad', 'Cần đối soát': 't-w' }[st] || 't-g');

export function openUpdater({ getCurrent, onApplied }) {
  const modal = document.getElementById('upModal');
  const box = document.getElementById('upBox');
  const S = { file: null, uploadedAt: null, result: null, busy: false, msg: null };
  const cur = () => getCurrent();
  const close = () => modal.classList.remove('on');
  const q = (sel) => box.querySelector(sel);

  function kpiRow(label, a, b, fmt) {
    const d = b - a;
    return `<tr><td>${label}</td><td class="n">${fmt(a)}</td><td class="n">${b == null ? '—' : fmt(b)}</td><td class="n ${d > 0 ? 'up' : d < 0 ? 'dn' : ''}">${b == null ? '—' : (d > 0 ? '+' : '') + fmt(d)}</td></tr>`;
  }

  function renderReport() {
    const r = S.result; if (!r) return '';
    const rep = r.report, ds = r.dataset;
    const recognized = rep.sheets.filter((s) => s.role !== 'Bỏ qua').length;
    let h = `<div class="kv">
      <div>Tên file</div><div>${esc(S.file.name)}</div><div>Dung lượng</div><div>${size(S.file.size)}</div>
      <div>Tải lên lúc</div><div>${when(S.uploadedAt)}</div>
      <div>Số sheet nhận diện</div><div>${recognized} / ${rep.sheets.length} sheet (${rep.sheets.map((s) => `${esc(s.name)}: ${esc(s.role)}`).join('; ')})</div>
      <div>Số dòng dữ liệu đã đọc</div><div>${num(rep.rowsRead)} dòng học viên</div></div>`;
    if (rep.errors.length) h += `<div class="upmsg bad"><b>Không thể cập nhật — dữ liệu đang hoạt động được giữ nguyên.</b><ul>${rep.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
    if (rep.warnings.length) h += `<div class="upmsg warn"><b>Cảnh báo</b><ul>${rep.warnings.slice(0, 12).map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
    if (rep.missingFields.length) h += `<div class="card"><h3>Trường dữ liệu thiếu / sai cấu trúc</h3><div class="tw"><table><thead><tr><th>Sheet</th><th>Trường</th><th>Mức độ</th></tr></thead><tbody>${rep.missingFields.map((m) => `<tr><td>${esc(m.sheet)}</td><td>${esc(m.field)}</td><td><span class="tag ${m.required ? 't-bad' : 't-w'}">${m.required ? 'Bắt buộc' : 'Tùy chọn'}</span></td></tr>`).join('')}</tbody></table></div></div>`;
    if (rep.unmatchedHeaders.length) h += `<details class="na"><summary>${rep.unmatchedHeaders.length} cột không dùng đến</summary>${rep.unmatchedHeaders.map(esc).join(' · ')}</details>`;
    if (ds) {
      const a = cur() ? summarize(cur()) : { students: 0, revenue: 0, paid: 0, owe: 0, flags: 0 }, b = summarize(ds);
      h += `<div class="card"><h3>So sánh với dữ liệu đang chạy</h3><div class="tw"><table><thead><tr><th></th><th class="n">Hiện tại</th><th class="n">File mới</th><th class="n">Chênh lệch</th></tr></thead><tbody>
        ${kpiRow('Học viên', a.students, b.students, num)}${kpiRow('Doanh thu đăng ký', a.revenue, b.revenue, vnd)}${kpiRow('Thực thu', a.paid, b.paid, vnd)}${kpiRow('Công nợ (chưa hoàn tất)', a.owe, b.owe, vnd)}${kpiRow('Điểm cần đối soát', a.flags, b.flags, num)}</tbody></table></div></div>`;
      const paid = (s) => s.pays.reduce((x, p) => x + p[1], 0);
      h += `<div class="card"><h3>Xem trước dữ liệu (15 dòng đầu / ${num(ds.students.length)})</h3><div class="tw"><table><thead><tr><th>Mã HV</th><th>Họ và tên</th><th>Ngày ĐK</th><th>Khóa học</th><th>Lớp</th><th class="n">Học phí</th><th class="n">Đã thu</th><th>Tình trạng</th></tr></thead><tbody>
        ${ds.students.slice(0, 15).map((s) => `<tr><td>${esc(s.id)}</td><td>${esc(s.name)}</td><td>${esc(s.reg ? s.reg.split('-').reverse().join('/') : '—')}</td><td>${esc(s.course)}</td><td>${esc(s.cls)}</td><td class="n">${s.fee == null ? '—' : num(s.fee)}</td><td class="n">${num(paid(s))}</td><td><span class="tag ${tagFor(s.st)}">${esc(s.st)}</span></td></tr>`).join('')}</tbody></table></div></div>`;
    }
    return h;
  }

  function renderActions() {
    const r = S.result, ok = !!(r && r.report.ok);
    const adm = MODE === 'api';
    let h = '<div class="upact">';
    if (ok && r.report.needsConfirmDrop) h += `<label class="upchk"><input type="checkbox" id="upDrop"> Tôi đã kiểm tra: số học viên giảm mạnh là đúng</label>`;
    if (adm) h += `<label class="upkey">Khóa quản trị<input id="upKey" type="password" autocomplete="off" placeholder="ADMIN_KEY" value="${esc(keys.get('admin'))}"></label>`;
    h += `<span class="sp"></span>`;
    if (ok) h += `<button class="btn" id="upDl">Tải bản dữ liệu đã chuẩn hóa (.json)</button>`;
    if (ok && adm) h += `<button class="btn p" id="upOk"${S.busy ? ' disabled' : ''}>Xác nhận cập nhật dữ liệu</button>`;
    if (ok && !adm) h += `<button class="btn p" id="upPub">Tải file để xuất bản (latest.json + version.json)</button>`;
    return h + '</div>';
  }

  function render() {
    const c = cur();
    box.innerHTML = `<h2><span>CẬP NHẬT DỮ LIỆU TUYỂN SINH</span><button class="btn" id="upClose">Đóng</button></h2>
      <div class="na">Cập nhật gần nhất: <b>${when(c?.meta?.updatedAt)}</b>${c?.meta?.source?.fileName ? ` · từ file ${esc(c.meta.source.fileName)}` : ''} · ${c ? num(c.students.length) : 0} học viên · phiên bản <code>${esc(c?.meta?.version || '—')}</code></div>
      ${MODE === 'static' ? '<div class="upmsg warn">Chế độ tĩnh: trình duyệt không tự ghi được lên GitHub. Sau khi kiểm tra, tải file dữ liệu và đưa vào <code>public/data/</code> của repository (xem README, mục 6B).</div>' : ''}
      <div class="updrop"><input type="file" id="upFile" accept=".xlsx,.xls,.xlsm" hidden><button class="btn p" id="upPick">Chọn file Excel mới (.xlsx / .xls)</button> <span class="na">${S.file ? esc(S.file.name) : 'Chưa chọn file. File Excel chỉ được đọc trong trình duyệt của bạn, không được tải lên GitHub.'}</span></div>
      <div id="upBody">${renderReport()}</div>
      <div id="upMsg">${S.msg ? `<div class="upmsg ${S.msg.kind}">${S.msg.html}</div>` : ''}</div>
      ${S.result ? renderActions() : ''}
      ${MODE === 'api' ? '<details class="updet"><summary>Phiên bản đã lưu & khôi phục</summary><div class="na">Nhập khóa quản trị ở trên (sau khi chọn file) hoặc bấm nút dưới.</div><div class="upact"><input id="upKey2" type="password" placeholder="ADMIN_KEY" autocomplete="off"><button class="btn" id="upVers">Xem phiên bản</button></div><div id="upVerList"></div></details>' : ''}`;
    bind();
  }

  function setMsg(kind, html) { S.msg = { kind, html }; const m = q('#upMsg'); if (m) m.innerHTML = `<div class="upmsg ${kind}">${html}</div>`; }

  async function onFile(f) {
    S.msg = null; S.result = null; S.file = f; S.uploadedAt = new Date();
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!['xlsx', 'xls', 'xlsm'].includes(ext)) { S.result = { dataset: null, report: { ok: false, errors: ['Chỉ hỗ trợ file .xlsx, .xls hoặc .xlsm.'], warnings: [], sheets: [], missingFields: [], unmatchedHeaders: [], rowsRead: 0 } }; return render(); }
    if (f.size > MAX_BYTES) { S.result = { dataset: null, report: { ok: false, errors: [`File quá lớn (${size(f.size)}); tối đa ${size(MAX_BYTES)}.`], warnings: [], sheets: [], missingFields: [], unmatchedHeaders: [], rowsRead: 0 } }; return render(); }
    try {
      const sheets = readSheets(XLSX, await f.arrayBuffer());
      S.result = normalizeWorkbook(sheets, { fileName: f.name, fileSize: f.size, current: cur() });
    } catch (e) {
      S.result = { dataset: null, report: { ok: false, errors: ['Không đọc được file Excel (file hỏng hoặc có mật khẩu): ' + (e && e.message ? e.message : e)], warnings: [], sheets: [], missingFields: [], unmatchedHeaders: [], rowsRead: 0 } };
    }
    render();
  }

  async function confirm() {
    const r = S.result;
    if (!r?.report.ok || S.busy) return;
    const drop = q('#upDrop'); if (drop && !drop.checked) return setMsg('warn', 'Hãy tích xác nhận số học viên giảm trước khi cập nhật.');
    const key = q('#upKey').value.trim(); if (!key) return setMsg('warn', 'Nhập khóa quản trị (ADMIN_KEY) để cập nhật.');
    S.busy = true; q('#upOk').disabled = true; keys.set('admin', key); setMsg('info', 'Đang lưu dữ liệu…');
    try {
      const res = await saveData(r.dataset, key);
      const fresh = await loadData();           // đọc lại từ nguồn chính thức → dashboard tính lại từ dữ liệu vừa lưu
      onApplied(fresh);
      S.busy = false; S.result = null; S.file = null;
      render();
      setMsg('ok', `<b>Cập nhật thành công.</b> Đã xử lý ${num(res.students)} học viên lúc ${when(res.updatedAt)}. Những người mở website từ bây giờ sẽ thấy dữ liệu mới.`);
    } catch (e) {
      S.busy = false; render();
      setMsg('bad', `<b>Cập nhật thất bại — dữ liệu hiện tại được giữ nguyên.</b><br>${esc(e.message)}${e.details ? `<ul>${e.details.slice(0, 5).map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}`);
      if (e instanceof AuthError) keys.set('admin', '');
    }
  }

  async function showVersions() {
    const key = (q('#upKey')?.value || q('#upKey2').value).trim() || q('#upKey2').value.trim();
    const out = q('#upVerList');
    if (!key) { out.innerHTML = '<div class="na">Nhập khóa quản trị.</div>'; return; }
    out.innerHTML = '<div class="na">Đang tải…</div>';
    try {
      const vs = await listVersions(key);
      const live = cur()?.meta?.version;
      out.innerHTML = `<div class="tw"><table><thead><tr><th>Phiên bản</th><th>Lưu lúc</th><th class="n">Dung lượng</th><th></th></tr></thead><tbody>${vs.map((v) => `<tr><td><code>${esc(v.version)}</code></td><td>${when(v.uploaded)}</td><td class="n">${size(v.size)}</td><td>${v.version === live ? '<span class="tag t-ok">Đang dùng</span>' : `<button class="btn" data-rb="${esc(v.version)}">Khôi phục</button>`}</td></tr>`).join('')}</tbody></table></div>`;
      out.querySelectorAll('[data-rb]').forEach((b) => b.onclick = async () => {
        if (!confirmDialog(`Khôi phục phiên bản ${b.dataset.rb}? Dashboard của mọi người sẽ chuyển về dữ liệu này.`)) return;
        try { await rollback(b.dataset.rb, key); keys.set('admin', key); onApplied(await loadData()); render(); setMsg('ok', `Đã khôi phục phiên bản <code>${esc(b.dataset.rb)}</code>.`); }
        catch (e) { setMsg('bad', esc(e.message)); }
      });
    } catch (e) { out.innerHTML = `<div class="upmsg bad">${esc(e.message)}</div>`; }
  }
  const confirmDialog = (m) => window.confirm(m);

  function bind() {
    q('#upClose').onclick = close;
    q('#upPick').onclick = () => q('#upFile').click();
    q('#upFile').onchange = (e) => { const f = e.target.files[0]; if (f) onFile(f); };
    q('#upOk') && (q('#upOk').onclick = confirm);
    q('#upDl') && (q('#upDl').onclick = () => downloadJson(S.result.dataset, 'latest.json'));
    q('#upPub') && (q('#upPub').onclick = () => { downloadJson(S.result.dataset, 'latest.json'); downloadJson({ version: S.result.dataset.meta.version, updatedAt: S.result.dataset.meta.updatedAt }, 'version.json'); setMsg('info', 'Đã tải 2 file. Đưa chúng vào thư mục <code>public/data/</code> của repository rồi commit để xuất bản.'); });
    q('#upVers') && (q('#upVers').onclick = showVersions);
  }

  modal.onclick = (e) => { if (e.target === modal) close(); };
  modal.classList.add('on');
  render();
}
