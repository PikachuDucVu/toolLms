// Mutable state for the homework page. Keeping it in one object prevents
// duplicated module-level state as the page is split into more domains.
export const state = {
    allSubmissions: [],
    filteredSubmissions: [],
    students: {},
    lessons: {},
    selectedIds: new Set(),
    sessionEmail: '',
    aiModelsCache: [],
    savedThinkingLevel: 'high'
};
