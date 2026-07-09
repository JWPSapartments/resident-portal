// Shared UI primitives. T2–T8 call these; they must not be rewritten.

export function PageHead({ title, subtitle }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </header>
  )
}

export function Card({ className = '', children }) {
  return <section className={`card ${className}`.trim()}>{children}</section>
}

export function CardHead({ title, action }) {
  return (
    <div className="card-head">
      <h2>{title}</h2>
      {action && <div className="card-head-action">{action}</div>}
    </div>
  )
}

// kind maps directly to the .pill-* classes in §9
// (due | paid | partial | overdue | submitted | in_progress | completed)
export function StatusPill({ kind, label }) {
  return <span className={`pill pill-${kind}`}>{label}</span>
}

export function Field({ label, htmlFor, children }) {
  return (
    <div className="field">
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
    </div>
  )
}

export function Button({
  variant = 'primary',
  loading = false,
  disabled = false,
  onClick,
  type = 'button',
  children,
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant}`}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

export function EmptyState({ icon, title, body, action }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon" aria-hidden="true">{icon}</div>}
      {title && <p className="empty-title">{title}</p>}
      {body && <p className="empty-body">{body}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}
