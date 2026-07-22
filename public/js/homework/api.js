import { goToLogin } from './session.js';

export async function apiCall(url, body = null, method = 'POST') {
            const opts = { method, headers: {'Content-Type': 'application/json'} };
            if (body) opts.body = JSON.stringify(body);
            const resp = await fetch(url, method === 'GET' ? {} : opts);
            if (resp.status === 401) {
                goToLogin();
                throw new Error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
            }
            if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
            return resp.json();
        }
