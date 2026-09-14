import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Loader2, User } from "lucide-react";
import { cn } from "./cn";

export interface ProgressBarProps {
  value: number;
  max?: number;
  variant?: "primary" | "demo" | "checkpoint" | "success" | "warning";
  size?: "sm" | "md" | "lg";
  animated?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function ProgressBar({
  value,
  max = 100,
  variant = "primary",
  size = "md",
  animated = true,
  className = "",
  ariaLabel,
}: ProgressBarProps) {
  const percent = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  return (
    <div
      className={cn(
        "progress-track",
        `variant-${variant}`,
        size === "sm" && "size-sm",
        size === "lg" && "size-lg",
        animated && "is-animated",
        className,
      )}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel || `Tiến độ ${percent}%`}
    >
      <span className="progress-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}

export interface BatchProgressBarProps {
  phaseLabel: string;
  completed: number;
  total: number;
  percent?: number;
  successful?: number;
  failureCount?: number;
  currentStudentName?: string | null;
  statusText?: string;
  failuresNotice?: ReactNode;
  extraMeta?: ReactNode;
  variant?: "primary" | "demo" | "checkpoint" | "success";
  compact?: boolean;
  className?: string;
  role?: string;
  "aria-label"?: string;
  "aria-live"?: "polite" | "assertive" | "off";
}

export function BatchProgressBar({
  phaseLabel,
  completed,
  total,
  percent: customPercent,
  successful,
  failureCount = 0,
  currentStudentName,
  statusText,
  failuresNotice,
  extraMeta,
  variant = "primary",
  compact = false,
  className = "",
  role = "status",
  "aria-label": ariaLabel,
  "aria-live": ariaLive = "polite",
}: BatchProgressBarProps) {
  const percent =
    customPercent !== undefined
      ? customPercent
      : total
        ? Math.min(100, Math.max(0, Math.round((completed / total) * 100)))
        : 0;

  const defaultStatus =
    statusText ||
    (successful !== undefined
      ? `Đã thử ${completed}/${total} • Thành công ${successful}`
      : `${completed}/${total} (${percent}%)`);

  return (
    <div
      className={cn("batch-progress-card", `variant-${variant}`, compact && "is-compact", className)}
      role={role}
      aria-live={ariaLive}
      aria-label={ariaLabel || `${phaseLabel}: ${completed}/${total}`}
    >
      <div className="batch-progress-header">
        <div className="batch-progress-title-group">
          <Loader2 size={16} className="batch-progress-spinner" aria-hidden="true" />
          <strong>{phaseLabel}</strong>
        </div>
        <div className="batch-progress-badges">
          <span className="batch-progress-stat-text">{defaultStatus}</span>
          <span className="progress-pill progress-pill-percent">{percent}%</span>
          {successful !== undefined && (
            <span className="progress-pill progress-pill-success">
              <CheckCircle2 size={12} aria-hidden="true" />
              Thành công {successful}
            </span>
          )}
          {failureCount > 0 && (
            <span className="progress-pill progress-pill-danger">
              <AlertCircle size={12} aria-hidden="true" />
              {failureCount} lỗi
            </span>
          )}
        </div>
      </div>

      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Tiến độ ${percent}%`}
      >
        <span className="progress-fill" style={{ width: `${percent}%` }} />
      </div>

      {(currentStudentName || failuresNotice || extraMeta) && (
        <div className="batch-progress-footer">
          {currentStudentName && (
            <div className="progress-student-highlight">
              <User size={13} className="progress-student-icon" aria-hidden="true" />
              <small>
                Học sinh hiện tại: <strong>{currentStudentName}</strong>
              </small>
            </div>
          )}
          {failuresNotice && (
            <div className="progress-notice progress-notice-danger">
              <AlertCircle size={13} aria-hidden="true" />
              <small>{failuresNotice}</small>
            </div>
          )}
          {extraMeta}
        </div>
      )}
    </div>
  );
}
