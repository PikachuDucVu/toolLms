import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { Header } from './Header';

afterEach(() => {
  cleanup();
});

function renderHeader(path: string, page?: 'comments' | 'homework') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Header page={page} />
    </MemoryRouter>,
  );
}

describe('Header workspace switch', () => {
  it('treats the two destinations as one switch and marks only the current page', () => {
    renderHeader('/');
    const comments = screen.getByRole('link', { name: 'Nhận xét' });
    const homework = screen.getByRole('link', { name: 'Chấm BTVN' });
    const nav = screen.getByRole('navigation', { name: 'Chuyển chế độ làm việc' });

    expect(nav).toContainElement(comments);
    expect(nav).toContainElement(homework);
    expect(comments).toHaveAttribute('aria-current', 'page');
    expect(comments).toHaveClass('active');
    expect(homework).not.toHaveAttribute('aria-current');
    expect(homework).not.toHaveClass('active');
    expect(homework).not.toHaveClass('outline');
  });

  it('selects the homework destination when that page is open', () => {
    renderHeader('/homework', 'homework');
    expect(screen.getByRole('link', { name: 'Chấm BTVN' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Nhận xét' })).not.toHaveAttribute('aria-current');
  });
});
