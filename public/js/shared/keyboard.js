function isTextControl(element) {
    return element instanceof HTMLElement && Boolean(element.closest('input, textarea, select, [contenteditable="true"]'));
}

function focusStudentSearch() {
    const search = document.getElementById('searchStudent');
    if (!search) return false;
    search.focus();
    if (typeof search.select === 'function') search.select();
    return true;
}

function moveStudentSelection(direction) {
    const items = Array.from(document.querySelectorAll('#studentList .student-list-item'))
        .filter(item => item.offsetParent !== null && !item.disabled);
    if (!items.length) return false;

    const current = items.findIndex(item => item.classList.contains('active'));
    const nextIndex = current < 0
        ? 0
        : Math.max(0, Math.min(items.length - 1, current + direction));
    const next = items[nextIndex];
    next.click();
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return true;
}

function submitFocusedEditor(activeElement) {
    const detail = activeElement?.closest?.('#regularStudentDetail');
    if (!detail) return false;

    if (activeElement.matches('.regular-note-editor textarea')) {
        const saveButton = detail.querySelector('[id^="save-note-"]');
        if (saveButton && !saveButton.disabled) {
            saveButton.click();
            return true;
        }
    }

    if (activeElement.matches('.comment-edit')) {
        const submitButton = detail.querySelector('[id^="submit-btn-"]');
        if (submitButton && !submitButton.disabled) {
            submitButton.click();
            return true;
        }
    }
    return false;
}

export function initKeyboardShortcuts() {
    const search = document.getElementById('searchStudent');
    if (search) search.setAttribute('aria-keyshortcuts', 'Control+K Meta+K');

    document.addEventListener('keydown', event => {
        const command = event.ctrlKey || event.metaKey;
        if (command && event.key.toLowerCase() === 'k') {
            if (focusStudentSearch()) event.preventDefault();
            return;
        }

        if (command && event.key === 'Enter') {
            if (submitFocusedEditor(document.activeElement)) event.preventDefault();
            return;
        }

        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !isTextControl(document.activeElement)) {
            if (moveStudentSelection(event.key === 'ArrowDown' ? 1 : -1)) event.preventDefault();
        }
    });
}
