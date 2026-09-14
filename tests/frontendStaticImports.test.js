import assert from 'node:assert/strict';
import test from 'node:test';
import { crossFeatureInternalImports } from '../scripts/frontend-static-imports.mjs';

const frontendRoot = '/repo/frontend/src/';
const sourceFile = '/repo/frontend/src/features/comments/example.ts';

test('cross-feature static gate covers normal, side-effect, export-from, and dynamic imports', () => {
  for (const source of [
    "import { isPresent } from '../classes/selectors';",
    "import '../classes/register';",
    "export { isPresent } from '../classes/selectors';",
    "export const load = () => import('../classes/selectors');",
    "export const loadJson = () => import('../classes/selectors', { with: { type: 'json' } });",
  ]) {
    assert.deepEqual(crossFeatureInternalImports(sourceFile, frontendRoot, source), [{ specifier: source.match(/\.\.\/classes\/[^'\"]+/)?.[0], targetFeature: 'classes' }]);
  }

  const allowed = `
    import { isPresent } from '../classes/public/domain';
    import './selectors';
    export { useCommentStore } from './commentStore';
    export const load = () => import('../classes/public/components');
  `;
  assert.deepEqual(crossFeatureInternalImports(sourceFile, frontendRoot, allowed), []);
  assert.throws(() => crossFeatureInternalImports(sourceFile, frontendRoot, "import('../classes/' + name)"), /Unverifiable non-literal dynamic import/);
  assert.throws(() => crossFeatureInternalImports(sourceFile, frontendRoot, "import(`../classes/${name}`)"), /Unverifiable non-literal dynamic import/);
});
