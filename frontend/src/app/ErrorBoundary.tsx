import { Component, Fragment, type ReactNode } from 'react';
import { createClientIncidentId, safeClientErrorEvent, safeClientRequestId } from '../lib/clientErrorReporting';

type ErrorBoundaryProps = { children: ReactNode; reload?: () => void };
type ErrorBoundaryState = { hasError: boolean; error: unknown; incidentId: string; recoveryKey: number; retryCount: number };

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null, incidentId: '', recoveryKey: 0, retryCount: 0 };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { hasError: true, error, incidentId: createClientIncidentId() };
  }

  componentDidCatch(error: unknown) {
    console.error(JSON.stringify(safeClientErrorEvent('react-boundary', error, this.state.incidentId)));
  }

  private retry = () => {
    this.setState((state) => ({ hasError: false, error: null, incidentId: '', recoveryKey: state.recoveryKey + 1, retryCount: state.retryCount + 1 }));
  };

  private reload = () => {
    if (this.props.reload) this.props.reload();
    else window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const requestId = safeClientRequestId(this.state.error);
      return <main className="app-container">
        <section role="alert" aria-labelledby="client-error-title" className="state-card state-error">
          <h2 id="client-error-title">Ứng dụng gặp sự cố</h2>
          <p>Không thể hiển thị nội dung này. Bạn có thể thử khôi phục mà không tải lại trang.</p>
          <p><small>Mã sự cố: <code>{this.state.incidentId}</code>{requestId ? <> · Request ID: <code>{requestId}</code></> : null}</small></p>
          <div className="error-boundary-actions">
            <button type="button" className="btn btn-primary" onClick={this.retry}>Thử lại</button>
            {this.state.retryCount > 0 && <button type="button" className="btn btn-outline" onClick={this.reload}>Tải lại trang</button>}
          </div>
        </section>
      </main>;
    }
    return <Fragment key={this.state.recoveryKey}>{this.props.children}</Fragment>;
  }
}
