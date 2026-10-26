import './styles/dashboard.css';
import './styles/updater.css';
import { createDashboard } from './dashboard/dashboard.js';
import { loadData, AuthError, DataError, keys, MODE } from './data/store.js';
import { openUpdater } from './ui/updater.js';
import { showBoot, hideBoot, showError, askViewerKey } from './ui/login.js';

let dash = null;
let current = null;

function mount(dataset) {
  const tab = dash ? dash.tab() : 't1';
  if (dash) dash.destroy();      // huỷ biểu đồ/sự kiện cũ — không giữ lại số liệu cũ
  current = dataset;
  dash = createDashboard(dataset, { tab });
  hideBoot();
}

async function boot() {
  showBoot('Đang tải dữ liệu…');
  try {
    mount(await loadData());
  } catch (e) {
    if (e instanceof AuthError) {
      let msg = keys.get('viewer') ? 'Mật khẩu chưa đúng, vui lòng thử lại.' : '';
      for (;;) {
        await askViewerKey(msg);
        try { mount(await loadData()); return; }
        catch (err) {
          if (err instanceof AuthError) { keys.clear(); msg = 'Mật khẩu chưa đúng, vui lòng thử lại.'; continue; }
          showError(err.message, err.details, boot); return;
        }
      }
    }
    showError(e instanceof DataError ? e.message : 'Đã xảy ra lỗi khi tải dữ liệu.', e.details, boot);
  }
}

if (MODE === 'static') {
  const w = document.getElementById('pubWarn');
  w.hidden = false;
  w.textContent = '⚠ Chế độ dữ liệu tĩnh: file dữ liệu nằm trên website công khai — bất kỳ ai có đường dẫn đều xem được danh sách học viên và công nợ.';
}

document.getElementById('upBtn').onclick = () => openUpdater({ getCurrent: () => current, onApplied: mount });
boot();
