import { describe, expect, it } from 'vitest';
import { routeFamilyForPath, runtimeRoutes, safeReturnTo } from './runtimeRoutes';

describe('runtime routes', () => {
  it('keeps navigation inside the matched route family', () => {
    expect(routeFamilyForPath('/new/homework')).toBe('preview');
    expect(runtimeRoutes('/new').homework).toBe('/new/homework');
    expect(runtimeRoutes('/homework').comments).toBe('/');
  });

  it('only accepts allow-listed same-family return paths', () => {
    expect(safeReturnTo('/new/homework', 'preview')).toBe('/new/homework');
    expect(safeReturnTo('/homework', 'preview')).toBeNull();
    expect(safeReturnTo('https://evil.test', 'root')).toBeNull();
  });
});
