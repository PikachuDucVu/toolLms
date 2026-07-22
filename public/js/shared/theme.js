const STORAGE_KEY = 'lms-theme';

function currentTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function syncButtons() {
    const dark = currentTheme() === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
        button.setAttribute('aria-pressed', String(dark));
        button.setAttribute('aria-label', dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối');
        button.title = dark ? 'Giao diện sáng' : 'Giao diện tối';
    });
}

export function setTheme(theme, persist = true) {
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    if (persist) localStorage.setItem(STORAGE_KEY, next);
    syncButtons();
}

export function toggleTheme() {
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

export function initTheme() {
    syncButtons();
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
        button.addEventListener('click', toggleTheme);
    });
}
