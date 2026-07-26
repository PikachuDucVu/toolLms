import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // tests/*.test.js are node:test suites run by `npm test`; vitest owns the .ts suites
        include: ['tests/**/*.test.ts']
    }
});
