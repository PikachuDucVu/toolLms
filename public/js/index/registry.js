import { debounce, escapeAttr, escapeHtml, escapeInlineJsAttr, sanitizeId } from '../shared/dom.js';
import { showToast } from '../shared/toast.js';
import { listSkeleton, studentWorkspaceSkeleton } from '../shared/skeleton.js';

export const app = {
    debounce,
    escapeAttr,
    escapeHtml,
    escapeInlineJsAttr,
    sanitizeId,
    showToast,
    listSkeleton,
    studentWorkspaceSkeleton,
    confirmDialog: (...args) => window.confirmDialog(...args)
};
