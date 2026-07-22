// Shared DOM and string utilities.

/** Escape HTML entities to prevent XSS. */
export function escapeHtml(value) {
    if (!value) return '';
    const div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
}

/** Escape a string for use inside HTML attribute values and inline handler arguments. */
export function escapeAttr(value) {
    if (!value) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/'/g, '&#39;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\\/g, '\\\\');
}

/** Escape a value embedded in a single-quoted JS argument inside an HTML attribute. */
export function escapeInlineJsAttr(value) {
    if (!value) return '';
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** Sanitize an arbitrary value for use as a DOM id fragment. */
export function sanitizeId(value) {
    return String(value).replace(/[^a-zA-Z0-9]/g, '_');
}

/** Return a debounced function. */
export function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}
