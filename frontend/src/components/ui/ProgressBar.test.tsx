import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BatchProgressBar, ProgressBar } from './ProgressBar';

afterEach(() => {
  cleanup();
});

describe('ProgressBar', () => {
  it('renders standard progressbar with accurate percentage and aria attributes', () => {
    render(<ProgressBar value={4} max={10} variant="primary" ariaLabel="Tiến độ kiểm tra" />);
    const bar = screen.getByRole('progressbar', { name: 'Tiến độ kiểm tra' });
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    const fill = bar.querySelector('.progress-fill');
    expect(fill).toHaveStyle({ width: '40%' });
  });

  it('clamps value between 0 and 100 percent', () => {
    const { rerender } = render(<ProgressBar value={150} max={100} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    rerender(<ProgressBar value={-10} max={100} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});

describe('BatchProgressBar', () => {
  it('renders phase title, counts, percentage, and current student highlight', () => {
    render(
      <BatchProgressBar
        phaseLabel="Đang lấy điểm Random từ máy chủ"
        completed={5}
        total={9}
        successful={4}
        failureCount={1}
        currentStudentName="Nguyễn Lê Hân"
        variant="demo"
        failuresNotice="1 học sinh lỗi; quy trình vẫn tiếp tục."
      />
    );

    const card = screen.getByRole('status');
    expect(card).toBeInTheDocument();
    expect(within(card).getByText('Đang lấy điểm Random từ máy chủ')).toBeInTheDocument();
    expect(within(card).getByText(/Đã thử 5\/9/)).toBeInTheDocument();
    expect(within(card).getByText('56%')).toBeInTheDocument();
    expect(within(card).getByText('1 lỗi')).toBeInTheDocument();
    expect(within(card).getByText('Nguyễn Lê Hân')).toBeInTheDocument();
    expect(within(card).getByText('1 học sinh lỗi; quy trình vẫn tiếp tục.')).toBeInTheDocument();

    const bar = within(card).getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '56');
    expect(bar.querySelector('.progress-fill')).toHaveStyle({ width: '56%' });
  });

  it('supports custom statusText and extraMeta badges', () => {
    render(
      <BatchProgressBar
        phaseLabel="Đang tạo nhận xét AI"
        completed={10}
        total={10}
        statusText="10/10 bước • 100%"
        variant="checkpoint"
        extraMeta={<span data-testid="extra-note">Hoàn tất kiểm tra</span>}
      />
    );

    const card = screen.getByRole('status');
    expect(within(card).getByText('Đang tạo nhận xét AI')).toBeInTheDocument();
    expect(within(card).getByText('10/10 bước • 100%')).toBeInTheDocument();
    expect(within(card).getByTestId('extra-note')).toHaveTextContent('Hoàn tất kiểm tra');
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
});
