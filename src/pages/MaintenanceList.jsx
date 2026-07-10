import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/format'
import { PageHead, Card, CardHead, StatusPill, Button, EmptyState } from '../components/ui'

const CATEGORY_LABELS = {
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  hvac: 'HVAC',
  appliance: 'Appliance',
  general: 'General',
}

const STATUS_LABELS = {
  submitted: 'Submitted',
  in_progress: 'In progress',
  completed: 'Completed',
}

export default function MaintenanceList() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [requests, setRequests] = useState([])
  const [thumbs, setThumbs] = useState({}) // id -> signedUrl

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')

      const { data, error: qErr } = await supabase
        .from('maintenance_requests')
        .select('*')
        .order('created_at', { ascending: false })

      if (!active) return

      if (qErr) {
        setError('We couldn’t load your maintenance requests. Please try again.')
        setLoading(false)
        return
      }

      const rows = data || []
      setRequests(rows)
      setLoading(false)

      const withPhotos = rows.filter((r) => r.photo_url)
      const entries = await Promise.all(
        withPhotos.map(async (r) => {
          const { data: signed } = await supabase.storage
            .from('maintenance-photos')
            .createSignedUrl(r.photo_url, 3600)
          return [r.id, signed?.signedUrl || null]
        })
      )

      if (!active) return
      setThumbs(Object.fromEntries(entries))
    }

    load()
    return () => {
      active = false
    }
  }, [])

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <PageHead title="Maintenance" subtitle="Your requests and their status" />
        <div style={{ paddingTop: 4 }}>
          <Button variant="primary" onClick={() => navigate('/maintenance/new')}>
            New request
          </Button>
        </div>
      </div>

      <Card>
        <CardHead title="Requests" />
        <div className="card-pad">
          {loading ? (
            <p style={{ color: 'var(--ink-soft)', margin: 0 }}>Loading your requests…</p>
          ) : error ? (
            <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>
          ) : requests.length === 0 ? (
            <EmptyState
              title="No maintenance requests"
              body="Submit your first request and track its status here."
              action={
                <Button variant="primary" onClick={() => navigate('/maintenance/new')}>
                  New request
                </Button>
              }
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 56 }}></th>
                    <th>Request</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.photo_url && thumbs[r.id] ? (
                          <img
                            src={thumbs[r.id]}
                            alt=""
                            style={{
                              width: 40,
                              height: 40,
                              objectFit: 'cover',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--line)',
                              display: 'block',
                            }}
                          />
                        ) : r.photo_url ? (
                          <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Photo</span>
                        ) : null}
                      </td>
                      <td>
                        <span className="mono">{r.request_number}</span>
                      </td>
                      <td>{CATEGORY_LABELS[r.category] || r.category}</td>
                      <td
                        style={{
                          maxWidth: 320,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: 'var(--ink-soft)',
                        }}
                        title={r.description}
                      >
                        {r.description}
                      </td>
                      <td>
                        <StatusPill kind={r.status} label={STATUS_LABELS[r.status] || r.status} />
                      </td>
                      <td style={{ color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                        {formatDate(r.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </>
  )
}
