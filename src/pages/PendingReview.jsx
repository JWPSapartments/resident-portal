import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui'

export default function PendingReview() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [app, setApp] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      if (!user?.id) {
        setLoading(false)
        return
      }
      const { data } = await supabase
        .from('applications')
        .select('status, decline_note, submitted_at')
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!active) return
      setApp(data ?? null)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [user?.id])

  const declined = app?.status === 'declined'

  return (
    <div className="review">
      <div className="review-card">
        <span className="brand-mark review-brand">Oakline</span>

        {loading ? (
          <div className="spinner review-spinner" role="status" aria-label="Loading" />
        ) : declined ? (
          <>
            <h1>Your application needs another look</h1>
            <p className="review-lead">
              We couldn&apos;t approve your application as submitted. Here&apos;s
              what the leasing team noted:
            </p>
            {app?.decline_note && (
              <blockquote className="review-note">{app.decline_note}</blockquote>
            )}
            <p className="review-lead">
              Update your details and send it back — we&apos;ll review again.
            </p>
            <Button variant="primary" onClick={() => navigate('/apply')}>
              Update &amp; re-apply
            </Button>
          </>
        ) : (
          <>
            <h1>Your application is under review</h1>
            <p className="review-lead">
              Thanks for applying to Oakline Residences. The leasing team is
              reviewing your application — you&apos;ll get an email when there&apos;s
              a decision.
            </p>
          </>
        )}

        <button type="button" className="review-signout" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}
