import { ClipboardCheck, LoaderCircle, MessageSquareText, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import headerQuoteUrl from '../../assets/design/header_quote_teacher.png';
import { useAuth, useTheme } from '../../app/providers';
import { Dialog } from '../ui/Dialog';
import { LoginForm } from '../../features/auth/public/LoginForm';
import { runtimeRoutes } from '../../lib/runtimeRoutes';

export function Header({ page = 'comments' }: { page?: 'comments' | 'homework' }) {
  const auth = useAuth();
  const { theme, setTheme } = useTheme();
  const routes = runtimeRoutes();
  const isHomework = page === 'homework';
  const [loginOpen, setLoginOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const authenticating = auth.loading || signingIn;

  return (
    <header className="header">
      <div className="header-left">
        <div className="brand-text">
          <h1>{isHomework ? 'Chấm Bài Tập' : 'LMS Auto Comment'}</h1>
          <p>{isHomework ? 'Chấm điểm bài tập của học sinh' : 'Tự động nhận xét học sinh bằng AI'}</p>
        </div>
      </div>

      <div className="header-status-group">
        <div className="header-status" id="loginStatus" role="status" aria-live="polite">
          <span className={`status-dot ${auth.session ? 'online' : ''}`} id="statusDot" aria-hidden="true" />
          <span id="statusText">
            {auth.loading ? 'Đang kiểm tra phiên...' : auth.session ? `Đã đăng nhập` : 'Chưa đăng nhập'}
          </span>
        </div>
        <div className="header-greeting" id="headerGreeting">
          {auth.session
            ? `Xin chào, ${auth.session.displayName || auth.session.email}!`
            : 'Vui lòng đăng nhập để bắt đầu'}
        </div>
      </div>

      {!isHomework && (
        <div className="header-center-illustration">
          <img
            src={headerQuoteUrl}
            alt="Mỗi học sinh đều có một câu chuyện đáng được ghi nhận"
            className="header-banner-img"
          />
        </div>
      )}

      <div className="header-right">
        <button
          type="button"
          className="theme-toggle"
          data-theme-toggle
          aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          aria-pressed={theme === 'dark'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        <nav className="nav-tabs" role="navigation" aria-label="Chuyển chế độ làm việc">
          <NavLink
            to={routes.comments}
            end
            className={({ isActive }) => `nav-tab-btn${isActive ? ' active' : ''}`}
          >
            <MessageSquareText size={16} aria-hidden="true" />
            Nhận xét
          </NavLink>
          <NavLink
            to={routes.homework}
            className={({ isActive }) => `nav-tab-btn${isActive ? ' active' : ''}`}
          >
            <ClipboardCheck size={16} aria-hidden="true" />
            Chấm BTVN
          </NavLink>
        </nav>

        <div className="user-profile">
          {authenticating ? (
            <div className="auth-status-loading" role="status" aria-live="polite">
              <LoaderCircle size={16} className="spin-icon" aria-hidden="true" />
              Đang đăng nhập
            </div>
          ) : auth.session ? (
            <div className="profile-info">
              <span className="profile-name" id="teacherProfileName">
                {auth.session.displayName || auth.session.email}
              </span>
              <span className="profile-role">Giáo viên</span>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm header-login-btn"
              onClick={() => setLoginOpen(true)}
            >
              Đăng nhập
            </button>
          )}
        </div>
      </div>

      <Dialog
        open={loginOpen}
        onOpenChange={(open) => {
          if (!open && signingIn) return;
          setLoginOpen(open);
        }}
        title="Đăng nhập LMS"
        contentClassName="login-dialog"
      >
        <LoginForm
          onPendingChange={setSigningIn}
          onSuccess={() => setLoginOpen(false)}
        />
      </Dialog>
    </header>
  );
}
