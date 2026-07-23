/* ============================================================
   confirm.js — confirm modal dùng chung (Promise-based)
   Thay thế window.confirm() bằng modal custom đồng nhất.
   Dùng: const ok = await confirmDialog({ title, message, ... });
   ============================================================ */
(function () {
    const ICONS = {
        warning: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>',
        danger: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>',
        info: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
    };

    let overlayEl = null;
    let resolver = null;
    let returnFocusElement = null;

    function ensureMarkup() {
        if (overlayEl) return overlayEl;
        overlayEl = document.createElement('div');
        overlayEl.className = 'modal-overlay hidden';
        overlayEl.id = 'appConfirmModal';
        overlayEl.innerHTML = `
            <div class="modal-box" role="alertdialog" aria-modal="true" aria-labelledby="appConfirmTitle" aria-describedby="appConfirmMessage">
                <div class="modal-icon warning" id="appConfirmIcon" aria-hidden="true"></div>
                <div class="modal-title" id="appConfirmTitle"></div>
                <div class="modal-message" id="appConfirmMessage"></div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline" id="appConfirmCancel"></button>
                    <button type="button" class="btn btn-primary" id="appConfirmOk"></button>
                </div>
            </div>`;
        document.body.appendChild(overlayEl);

        overlayEl.addEventListener('click', (e) => {
            if (e.target === overlayEl) settle(false);
        });
        overlayEl.querySelector('#appConfirmCancel').addEventListener('click', () => settle(false));
        overlayEl.querySelector('#appConfirmOk').addEventListener('click', () => settle(true));
        document.addEventListener('keydown', (e) => {
            if (!overlayEl || overlayEl.classList.contains('hidden')) return;
            if (e.key === 'Escape') { e.preventDefault(); settle(false); }
            if (e.key === 'Enter') { e.preventDefault(); settle(true); }
        });
        return overlayEl;
    }

    function settle(value) {
        if (!overlayEl) return;
        overlayEl.classList.add('hidden');
        const r = resolver;
        const focusTarget = returnFocusElement;
        resolver = null;
        returnFocusElement = null;
        if (r) r(value);
        requestAnimationFrame(() => {
            if (focusTarget?.isConnected) focusTarget.focus();
        });
    }

    /**
     * Hiện confirm modal, trả về Promise<boolean>.
     * @param {Object} opts
     * @param {string} opts.title - Tiêu đề
     * @param {string} opts.message - Nội dung (cho phép \n)
     * @param {string} [opts.confirmText='Xác nhận']
     * @param {string} [opts.cancelText='Hủy']
     * @param {'warning'|'danger'|'info'} [opts.tone='warning']
     * @param {boolean} [opts.dangerConfirm=false] - nút xác nhận màu đỏ
     */
    window.confirmDialog = function (opts) {
        const {
            title = 'Xác nhận',
            message = '',
            confirmText = 'Xác nhận',
            cancelText = 'Hủy',
            tone = 'warning',
            dangerConfirm = false
        } = opts || {};

        returnFocusElement = document.activeElement;
        ensureMarkup();
        // Nếu đang mở một modal khác, coi như cancel cái cũ
        if (resolver) settle(false);

        overlayEl.querySelector('#appConfirmTitle').textContent = title;
        const msgEl = overlayEl.querySelector('#appConfirmMessage');
        msgEl.textContent = message;
        msgEl.style.whiteSpace = message.includes('\n') ? 'pre-line' : '';

        const iconEl = overlayEl.querySelector('#appConfirmIcon');
        iconEl.className = 'modal-icon ' + tone;
        iconEl.innerHTML = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">${ICONS[tone] || ICONS.warning}</svg>`;

        const okBtn = overlayEl.querySelector('#appConfirmOk');
        okBtn.textContent = confirmText;
        okBtn.className = 'btn ' + (dangerConfirm ? 'btn-danger' : 'btn-primary');
        overlayEl.querySelector('#appConfirmCancel').textContent = cancelText;

        overlayEl.classList.remove('hidden');
        // Focus vào nút xác nhận để accessibility
        setTimeout(() => okBtn.focus(), 30);

        return new Promise((resolve) => { resolver = resolve; });
    };
})();
