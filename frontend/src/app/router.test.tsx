import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RouteLoadingFallback } from './App';

describe('lazy route fallback', () => {
  it('exposes one named, busy live status while a route tree loads', () => {
    render(<RouteLoadingFallback />);
    const status = screen.getByRole('status', { name: 'Đang tải trang' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });
});
