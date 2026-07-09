import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatDate } from '../lib/format'

export default function NotificationBell() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const load = async () => {
    if (!user?.id) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setItems(data ?? [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const unread = items.filter((n) => !n.read).length

  const markRead = async (id) => {
    // Owner has UPDATE on their own notifications rows via T0 RLS.
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const markAllRead = async () => {
    if (!user?.id) return
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false)
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  return (
    <div className="notif" ref={ref}>
      <button
        type="button"
        className="notif-btn"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <BellIcon />
        {unread > 0 && <span className="notif-dot" aria-hidden="true" />}
      </button>

      {open && (
        <div className="notif-panel" role="menu">
          <div className="notif-panel-head">
            <span>Notifications</span>
            {unread > 0 && (
              <button type="button" className="notif-mark-all" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="notif-empty">You&apos;re all caught up.</div>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`notif-item${n.read ? '' : ' is-unread'}`}
                  onClick={() => !n.read && markRead(n.id)}
                >
                  <div className="notif-item-title">{n.title}</div>
                  {n.body && <div className="notif-item-body">{n.body}</div>}
                  <div className="notif-item-time">{formatDate(n.created_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 19a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
