import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Field, Button } from '../components/ui'
import { BRAND } from '../lib/brand'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setError('')
    if (!email || !password) {
      setError('Enter your email and password.')
      return
    }
    setLoading(true)
    const { error: signInError } = await signIn(email.trim(), password)
    setLoading(false)
    if (signInError) {
      setError('That email and password don\u2019t match. Try again.')
      return
    }
    // On success the route guards redirect based on status/role.
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') submit()
  }

  return (
    <div className="auth">
      <aside className="auth-brand">
        <div className="auth-brand-inner">
          <span className="brand-mark auth-brand-mark">{BRAND.name}</span>
          <p className="auth-brand-line">Resident Portal</p>
          <p className="auth-brand-sub">
            Rent, maintenance, and your lease — in one place.
          </p>
        </div>
      </aside>

      <div className="auth-form-wrap">
        <div className="auth-form">
          <h1 className="auth-title">Sign in</h1>
          <p className="auth-lead">Welcome back to {BRAND.name}.</p>

          {error && <div className="auth-error" role="alert">{error}</div>}

          <Field label="Email" htmlFor="login-email">
            <input
              id="login-email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </Field>

          <Field label="Password" htmlFor="login-password">
            <input
              id="login-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </Field>

          <Button variant="primary" loading={loading} onClick={submit}>
            Sign in
          </Button>

          <p className="auth-alt">
            New to {BRAND.name}? <Link to="/apply">Create account</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
