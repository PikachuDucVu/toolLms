import { state } from './state.js';

export function updateSessionBar(status, detail = '') {
            const bar = document.getElementById('sessionBar');
            const dot = document.getElementById('sessionDot');
            const text = document.getElementById('sessionText');
            const btn = document.getElementById('reloginBtn');
            if (!bar || !dot || !text || !btn) return;
            bar.className = 'session-bar ' + status;
            dot.className = 'session-dot ' + status;
            const email = state.sessionEmail || localStorage.getItem('lms_email') || '';
            const messages = {
                checking: 'Đang kiểm tra phiên đăng nhập...',
                ok: email ? `Đã đăng nhập: ${email}` : 'Đã đăng nhập',
                expired: 'Phiên đã hết hạn — cần đăng nhập lại',
                error: detail || 'Không kết nối được máy chủ',
            };
            text.textContent = messages[status] || '';
            btn.style.display = (status === 'ok' || status === 'checking') ? 'none' : 'inline-flex';
        }

export function goToLogin() {
            window.location.assign('/?return_to=/homework');
        }

export async function checkServerSession() {
            try {
                const resp = await fetch('/api/auth/me', { credentials: 'same-origin' });
                const data = await resp.json().catch(() => ({}));
                if (resp.status === 401) {
                    updateSessionBar('expired');
                    return false;
                }
                if (!resp.ok) {
                    updateSessionBar('error', data.error || `Không thể kiểm tra phiên: ${resp.status}`);
                    return null;
                }
                if (!data.authenticated) {
                    updateSessionBar('expired');
                    return false;
                }
                state.sessionEmail = data.email || '';
                return true;
            } catch (e) {
                updateSessionBar('error', 'Lỗi mạng khi kiểm tra phiên');
                return null;
            }
        }

export async function loadClasses() {
            try {
                const resp = await fetch('/api/classes');
                if (!resp.ok) {
                    if (resp.status === 401) {
                        goToLogin();
                        return false;
                    }
                    updateSessionBar('error');
                    return false;
                }
                const data = await resp.json();
                updateSessionBar('ok');
                const select = document.getElementById('classSelect');
                select.innerHTML = '<option value="">-- Chọn lớp --</option>';

                const activeClasses = data.classes.filter(c => !c.recentlyEnded);
                const endedClasses = data.classes.filter(c => c.recentlyEnded);

                activeClasses.forEach(cls => {
                    const opt = document.createElement('option');
                    opt.value = cls.id;
                    opt.textContent = cls.name;
                    select.appendChild(opt);
                });

                if (endedClasses.length > 0) {
                    const optgroup = document.createElement('optgroup');
                    optgroup.label = '── Đã kết thúc gần đây ──';
                    endedClasses.forEach(cls => {
                        const opt = document.createElement('option');
                        opt.value = cls.id;
                        const endDate = cls.endDate ? new Date(cls.endDate).toLocaleDateString('vi-VN') : '';
                        opt.textContent = cls.name + ' (Kết thúc' + (endDate ? ': ' + endDate : '') + ')';
                        optgroup.appendChild(opt);
                    });
                    select.appendChild(optgroup);
                }
                return true;
            } catch (e) {
                updateSessionBar('error');
                return false;
            }
        }
