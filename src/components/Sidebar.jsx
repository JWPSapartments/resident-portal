import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const RESIDENT_NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/payments', label: 'Payments' },
  { to: '/maintenance', label: 'Maintenance' },
  { to: '/account', label: 'Account' },
]

// Reserved for later phases — shown disabled to hold the layout's shape.
const COMING_SOON = ['Contact', 'Documents', 'Insurance', 'Property']

const ADMIN_NAV = [{ to: '/admin', label: 'Applications', end: true }]

export default function Sidebar() {
  const { profile, signOut } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const nav = isAdmin ? ADMIN_NAV : RESIDENT_NAV

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">Oakline</span>
        <span className="brand-sub">Oakline Residences · Champaign</span>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}

        {!isAdmin && (
          <div className="nav-soon">
            <span className="nav-soon-label">Coming soon</span>
            {COMING_SOON.map((label) => (
              <span key={label} className="nav-link is-disabled" aria-disabled="true">
                {label}
              </span>
            ))}
          </div>
        )}
      </nav>

      <div className="sidebar-foot">
        <span className="sidebar-user" title={profile?.full_name || ''}>
          {profile?.full_name || 'Resident'}
        </span>
        <button type="button" className="sidebar-signout" onClick={signOut}>
          Sign out
        </button>
      </div>
    </aside>
  )
}
