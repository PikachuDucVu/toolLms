// Runs synchronously in <head> to avoid a light-theme flash.
(function () {
    try {
        const saved = localStorage.getItem('lms-theme');
        const theme = saved === 'light' || saved === 'dark'
            ? saved
            : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
    } catch (_) {
        document.documentElement.dataset.theme = 'light';
    }
})();
