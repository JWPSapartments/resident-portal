import { useAuth } from '../context/AuthContext'
import NotificationBell from './NotificationBell'
import { BRAND } from '../lib/brand'
import { addressParts } from '../lib/format'

export default function Topbar() {
  const { profile } = useAuth()

  // Breadcrumb reads as the resident's address: building / floor / room.
  // Admins have no unit, so fall back to the brand name.
  const parts = addressParts(profile)
  const placeParts = parts.length ? parts : [BRAND.name]

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')
  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('')

  return (
    <header className="topbar">
      <nav className="breadcrumb" aria-label="Location">
        {placeParts.map((part, i) => (
          <span key={i} className="crumb">
            {i > 0 && <span className="crumb-sep" aria-hidden="true">/</span>}
            {part}
          </span>
        ))}
      </nav>

      <div className="topbar-right">
        <NotificationBell />
        <div className="account-chip" title={fullName}>
          <span className="account-initials">{initials || '·'}</span>
        </div>
      </div>
    </header>
  )
}
