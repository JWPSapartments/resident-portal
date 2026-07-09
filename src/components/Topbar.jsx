import { useAuth } from '../context/AuthContext'
import NotificationBell from './NotificationBell'

export default function Topbar() {
  const { profile } = useAuth()

  const unit = profile?.unit_label
  const room = profile?.room_label
  const placeParts = ['Oakline Residences']
  if (unit) placeParts.push(unit)
  if (room) placeParts.push(room)

  const initials = (profile?.full_name || '')
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
        <div className="account-chip" title={profile?.full_name || ''}>
          <span className="account-initials">{initials || '·'}</span>
        </div>
      </div>
    </header>
  )
}
