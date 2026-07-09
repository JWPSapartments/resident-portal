import { Link } from 'react-router-dom'

// Public stub (no Layout) — full multi-step application form lands in T8.
export default function Application() {
  return (
    <div className="auth">
      <div className="auth-form-wrap">
        <div className="auth-form">
          <h1 className="auth-title">Apply to Oakline</h1>
          <p className="auth-lead">Application form — built in T8.</p>
          <p className="auth-alt">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
