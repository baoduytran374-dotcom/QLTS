import { keys } from '../data/store.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function showBoot(html) { document.getElementById('boot').style.display = 'flex'; document.getElementById('bootbox').innerHTML = html; }
export function hideBoot() { document.getElementById('boot').style.display = 'none'; }

export function showError(message, details, onRetry) {
  showBoot(`<h2>Không tải được dữ liệu</h2><p>${esc(message)}</p>${(details || []).length ? `<ul class="na">${details.slice(0, 6).map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}<button class="btn p" id="bootRetry">Thử lại</button>`);
  document.getElementById('bootRetry').onclick = onRetry;
}

/** Hiện form mật khẩu xem dashboard; trả về khi người dùng gửi. */
export function askViewerKey(msg) {
  return new Promise((resolve) => {
    showBoot(`<h2>BETMA ENGLISH</h2><p>Dashboard tuyển sinh &amp; tài chính 2026 chứa dữ liệu nội bộ. Nhập mật khẩu để xem.</p>
      <input id="bootKey" type="password" autocomplete="current-password" placeholder="Mật khẩu xem dashboard" style="width:100%">
      <div id="bootMsg" class="na" style="color:var(--red)">${esc(msg || '')}</div><button class="btn p" id="bootGo">Xem dashboard</button>`);
    const go = () => { const v = document.getElementById('bootKey').value.trim(); if (!v) return; keys.set('viewer', v); resolve(v); };
    document.getElementById('bootGo').onclick = go;
    document.getElementById('bootKey').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    document.getElementById('bootKey').focus();
  });
}
