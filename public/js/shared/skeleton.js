function text(widthClass = 'skeleton-text-lg') {
    return `<span class="skeleton skeleton-text ${widthClass}" aria-hidden="true"></span>`;
}

export function listSkeleton(count = 5) {
    return `<div class="skeleton-stack" aria-hidden="true">${Array.from({ length: count }, () => `
        <div class="skeleton-list-row">
            <span class="skeleton skeleton-avatar"></span>
            <span class="skeleton-list-row-copy">
                ${text('skeleton-text-lg')}
                ${text('skeleton-text-sm')}
            </span>
        </div>`).join('')}</div>`;
}

export function studentWorkspaceSkeleton(count = 6) {
    return `<div class="student-workspace" aria-hidden="true">
        ${listSkeleton(count)}
        <div class="skeleton-panel">
            ${text('skeleton-text-md')}
            <span class="skeleton skeleton-text" style="width:45%;margin-top:10px"></span>
            <span class="skeleton" style="height:84px;margin-top:22px"></span>
            <span class="skeleton" style="height:140px;margin-top:16px"></span>
        </div>
    </div>`;
}

export function tableSkeleton(rowCount = 6, columnCount = 8) {
    return `<div class="skeleton-table" aria-hidden="true">${Array.from({ length: rowCount }, () => `
        <div class="skeleton-table-row">
            ${Array.from({ length: columnCount }, () => '<span class="skeleton"></span>').join('')}
        </div>`).join('')}</div>`;
}
