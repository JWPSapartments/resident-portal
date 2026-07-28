import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/format'
import { PageHead, Card, CardHead, StatusPill, Button, Field, EmptyState } from '../../components/ui'

// ---- small helpers ---------------------------------------------------------

const v = (x) => (x === null || x === undefined || x === '' ? '—' : x)

const d = (x) => {
  if (!x) return '—'
  try {
    const s = formatDate(x)
    return s || '—'
  } catch {
    return String(x)
  }
}

// ---- unit label maps -------------------------------------------------------

const BUILDING_LABELS = {
  '1240_arthur': '1240 W Arthur Ave',
  '1243_arthur': '1243 W Arthur Ave',
  '6419_wayne': '6419 N Wayne Ave',
}

const FLOOR_LABELS = {
  garden: 'Garden Floor',
  first: 'First Floor',
  second: 'Second Floor',
}

const buildingLabel = (b) => (b ? BUILDING_LABELS[b] || b : null)
const floorLabel = (f) => (f ? FLOOR_LABELS[f] || f : null)
const roomLabel = (r) => (r ? `Room ${r}` : null)

// full: "1240 W Arthur Ave · First Floor · Room B"
function desiredUnitFull(app) {
  if (!app) return '—'
  const parts = [
    buildingLabel(app.desired_building),
    floorLabel(app.desired_floor),
    roomLabel(app.desired_room),
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : '—'
}

// short (list rows): "1240 W Arthur Ave · Room B"
function desiredUnitShort(app) {
  if (!app) return '—'
  const parts = [buildingLabel(app.desired_building), roomLabel(app.desired_room)].filter(Boolean)
  return parts.length ? parts.join(' · ') : '—'
}

// ---- name / address composition -------------------------------------------

function composeName(src) {
  if (!src) return '—'
  const parts = [src.first_name, src.middle_name, src.last_name]
    .map((p) => (typeof p === 'string' ? p.trim() : p))
    .filter(Boolean)
  return parts.length ? parts.join(' ') : '—'
}

function composeAddress(src) {
  if (!src) return '—'
  const line1 = [src.address_line1, src.address_line2]
    .map((p) => (typeof p === 'string' ? p.trim() : p))
    .filter(Boolean)
    .join(', ')
  const cityState = [src.city, src.state]
    .map((p) => (typeof p === 'string' ? p.trim() : p))
    .filter(Boolean)
    .join(', ')
  const tail = [cityState, src.zip ? String(src.zip).trim() : '']
    .filter(Boolean)
    .join(' ')
  const out = [line1, tail].filter(Boolean).join(' · ')
  return out || '—'
}

function statusPill(status) {
  if (status === 'approved') return <StatusPill kind="completed" label="Approved" />
  if (status === 'declined') return <StatusPill kind="overdue" label="Declined" />
  return <StatusPill kind="submitted" label="Pending" />
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--ink)',
          textTransform: 'uppercase',
          letterSpacing: '.05em',
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        padding: '6px 0',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div style={{ minWidth: 170, color: 'var(--ink-soft)', fontSize: 13 }}>{label}</div>
      <div style={{ flex: '1 1 200px', color: 'var(--ink)', fontSize: 14 }}>
        {children === null || children === undefined ? '—' : children}
      </div>
    </div>
  )
}

const check = (b) => (
  <span style={{ color: b ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
    {b ? '✓' : '✗'}
  </span>
)

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'declined', label: 'Declined' },
]

// ---- detail sections -------------------------------------------------------

function Detail({ app }) {
  const rh = app.residency_history || null
  const g = app.guarantor || null
  const co = Array.isArray(app.co_applicants) ? app.co_applicants : []
  const refs = app.references || {}
  const personal = Array.isArray(refs.personal) ? refs.personal : []

  return (
    <div>
      {app.status === 'approved' && (
        <div
          style={{
            background: 'var(--success-wash)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            padding: 12,
            marginTop: 12,
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Approved {d(app.reviewed_at)}</div>
        </div>
      )}

      {app.status === 'declined' && (
        <div
          style={{
            background: 'var(--danger-wash)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            padding: 12,
            marginTop: 12,
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Declined {d(app.reviewed_at)}</div>
          <div style={{ color: 'var(--ink-soft)', marginTop: 4, fontSize: 14 }}>
            {v(app.decline_note)}
          </div>
        </div>
      )}

      <Section title="Applicant">
        <Row label="Full legal name">{composeName(app)}</Row>
        <Row label="Date of birth">{d(app.date_of_birth)}</Row>
        <Row label="Email">{v(app.email)}</Row>
        <Row label="Phone">{v(app.phone)}</Row>
        <Row label="Address">{composeAddress(app)}</Row>
        <Row label="Desired unit / room">{desiredUnitFull(app)}</Row>
        <Row label="Submitted">{d(app.submitted_at)}</Row>
        <div
          style={{
            color: 'var(--ink-faint)',
            fontSize: 13,
            fontStyle: 'italic',
            marginTop: 8,
          }}
        >
          SSN / ID collected through screening partner — not stored in this portal.
        </div>
      </Section>

      <Section title="Applicant acknowledgment">
        <Row label="Printed name">{v(app.applicant_print_name_ack)}</Row>
        <Row label="Acknowledged on">{d(app.applicant_ack_date)}</Row>
      </Section>

      <Section title="Residency history">
        {rh ? (
          <>
            <Row label="Landlord name">{v(rh.landlord_name)}</Row>
            <Row label="Landlord phone">{v(rh.landlord_phone)}</Row>
            <Row label="Monthly rent">{v(rh.monthly_rent)}</Row>
            <Row label="Move in">{d(rh.move_in)}</Row>
            <Row label="Move out">{d(rh.move_out)}</Row>
            <Row label="Reason for leaving">{v(rh.reason_for_leaving)}</Row>
            <Row label="Prior address">{v(rh.prior_address)}</Row>
          </>
        ) : (
          <div style={{ color: 'var(--ink-faint)' }}>None provided</div>
        )}
      </Section>

      <Section title="School">
        <Row label="School name">{v(app.school_name)}</Row>
        <Row label="Student ID">{v(app.student_id)}</Row>
        <Row label="Class standing">{v(app.class_standing)}</Row>
        <Row label="Expected graduation">{v(app.expected_graduation)}</Row>
        <Row label="Enrollment status">{v(app.enrollment_status)}</Row>
        <Row label="Proof of enrollment">
          {app.proof_of_enrollment_url ? 'Proof attached' : 'Not provided'}
        </Row>
      </Section>

      <Section title="Guarantor">
        <Row label="Guarantor required">{app.guarantor_required ? 'Yes' : 'No'}</Row>
        {g ? (
          <>
            <Row label="Name">{composeName(g)}</Row>
            <Row label="Relationship">{v(g.relationship)}</Row>
            <Row label="Address">{composeAddress(g)}</Row>
            <Row label="Phone">{v(g.phone)}</Row>
            <Row label="Email">{v(g.email)}</Row>
            <Row label="Employer">{v(g.employer)}</Row>
            <Row label="Income">{v(g.income)}</Row>
            <Row label="Printed name">{v(g.print_name_ack)}</Row>
            <Row label="Acknowledged on">{d(g.ack_date)}</Row>
          </>
        ) : (
          <div style={{ color: 'var(--ink-faint)' }}>No guarantor on file.</div>
        )}
      </Section>

      <Section title="Co-applicants">
        {co.length > 0 ? (
          co.map((c, i) => (
            <div
              key={i}
              style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}
            >
              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{v(c.full_name)}</div>
              <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{v(c.email)}</div>
              {c.note ? (
                <div style={{ color: 'var(--ink-faint)', fontSize: 13, marginTop: 2 }}>
                  {c.note}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div style={{ color: 'var(--ink-faint)' }}>None listed</div>
        )}
      </Section>

      <Section title="References">
        <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 4 }}>
          Personal references
        </div>
        {personal.length > 0 ? (
          personal.map((p, i) => (
            <div
              key={i}
              style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}
            >
              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{v(p.name)}</div>
              <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
                {v(p.phone)}
                {p.relationship ? ` · ${p.relationship}` : ''}
              </div>
            </div>
          ))
        ) : (
          <div style={{ color: 'var(--ink-faint)' }}>None listed</div>
        )}
      </Section>

      <Section title="Screening consent">
        <Row label="Credit check">{check(!!app.consent_credit)}</Row>
        <Row label="Criminal background">{check(!!app.consent_criminal)}</Row>
        <Row label="Rental history">{check(!!app.consent_rental_history)}</Row>
        <Row label="Consented at">{d(app.consent_at)}</Row>
      </Section>
    </div>
  )
}

// ---- page ------------------------------------------------------------------

export default function Applications() {
  const [apps, setApps] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [tab, setTab] = useState('pending')
  const [selectedId, setSelectedId] = useState(null)

  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [toast, setToast] = useState(null)

  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineNote, setDeclineNote] = useState('')

  async function fetchApps() {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('applications')
      .select('*')
      .order('submitted_at', { ascending: false })
    if (err) {
      setError('Could not load applications. Please try again.')
      setApps([])
      setLoading(false)
      return
    }
    setApps(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => {
    fetchApps()
  }, [])

  const list = apps.filter((a) => a.status === tab)
  const pendingCount = apps.filter((a) => a.status === 'pending').length
  const selected = apps.find((a) => a.id === selectedId) || null

  // keep a valid selection within the active tab
  useEffect(() => {
    if (list.length === 0) {
      if (selectedId !== null) setSelectedId(null)
      return
    }
    if (!list.some((a) => a.id === selectedId)) {
      setSelectedId(list[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, tab])

  function resetActionUI() {
    setDeclineOpen(false)
    setDeclineNote('')
    setActionError(null)
  }

  function selectApp(id) {
    setSelectedId(id)
    resetActionUI()
    setToast(null)
  }

  function changeTab(t) {
    setTab(t)
    setSelectedId(null)
    resetActionUI()
    setToast(null)
  }

  async function handleApprove(id) {
    setActionLoading(true)
    setActionError(null)
    const { error: err } = await supabase.rpc('approve_application', { p_application_id: id })
    if (err) {
      setActionError('Could not approve this application. Please try again.')
      setActionLoading(false)
      return
    }
    setActionLoading(false)
    setToast('Application approved.')
    await fetchApps()
  }

  async function handleDecline(id) {
    const note = declineNote.trim()
    if (!note) {
      setActionError('A decline note is required.')
      return
    }
    setActionLoading(true)
    setActionError(null)
    const { error: err } = await supabase.rpc('decline_application', {
      p_application_id: id,
      p_note: note,
    })
    if (err) {
      setActionError('Could not decline this application. Please try again.')
      setActionLoading(false)
      return
    }
    setActionLoading(false)
    resetActionUI()
    setToast('Application declined.')
    await fetchApps()
  }

  return (
    <div>
      <PageHead title="Applications" subtitle="Review and decide on rental applications" />

      <div
        style={{
          background: 'var(--accent-wash)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 16px',
          margin: '16px 0',
          color: 'var(--ink-soft)',
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: 'var(--ink)' }}>Fair Housing reminder:</strong> evaluate every
        application on the same objective criteria. Do not consider race, color, religion, national
        origin, sex, familial status, or disability.
      </div>

      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '1px solid var(--line)',
          marginBottom: 16,
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.key
          const suffix = t.key === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => changeTab(t.key)}
              style={{
                appearance: 'none',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '10px 16px',
                fontSize: 14,
                fontFamily: 'var(--font-body)',
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--primary)' : 'var(--ink-soft)',
                borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
              }}
            >
              {t.label}
              {suffix}
            </button>
          )
        })}
      </div>

      {toast && (
        <div
          style={{
            background: 'var(--success-wash)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 14px',
            marginBottom: 16,
            color: 'var(--ink)',
            fontSize: 14,
          }}
        >
          {toast}
        </div>
      )}

      {loading ? (
        <Card>
          <div className="card-pad" style={{ color: 'var(--ink-soft)' }}>
            Loading applications…
          </div>
        </Card>
      ) : error ? (
        <Card>
          <div className="card-pad">
            <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>
            <Button variant="primary" onClick={fetchApps}>
              Retry
            </Button>
          </div>
        </Card>
      ) : (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            alignItems: 'flex-start',
          }}
        >
          {/* left: list */}
          <div style={{ flex: '1 1 280px', minWidth: 260 }}>
            <Card>
              <div className="card-pad">
                {list.length === 0 ? (
                  <EmptyState
                    title="No applications"
                    body={
                      tab === 'pending'
                        ? 'No applications waiting for review'
                        : tab === 'approved'
                        ? 'No approved applications yet'
                        : 'No declined applications yet'
                    }
                  />
                ) : (
                  list.map((a) => {
                    const active = a.id === selectedId
                    return (
                      <div
                        key={a.id}
                        onClick={() => selectApp(a.id)}
                        style={{
                          padding: '12px 14px',
                          cursor: 'pointer',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid',
                          borderColor: active ? 'var(--primary)' : 'var(--line)',
                          background: active ? 'var(--primary-wash)' : 'var(--surface)',
                          marginBottom: 8,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                            {composeName(a)}
                          </div>
                          {statusPill(a.status)}
                        </div>
                        <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 4 }}>
                          {desiredUnitShort(a)}
                        </div>
                        <div style={{ color: 'var(--ink-faint)', fontSize: 12, marginTop: 2 }}>
                          {d(a.submitted_at)}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </Card>
          </div>

          {/* right: detail */}
          <div style={{ flex: '2 1 360px', minWidth: 300 }}>
            <Card>
              <div className="card-pad">
                {!selected ? (
                  <div style={{ color: 'var(--ink-faint)' }}>
                    Select an application to view details.
                  </div>
                ) : (
                  <>
                    <CardHead
                      title={composeName(selected)}
                      action={statusPill(selected.status)}
                    />

                    <Detail app={selected} />

                    {tab === 'pending' && (
                      <div
                        style={{
                          marginTop: 24,
                          paddingTop: 16,
                          borderTop: '1px solid var(--line)',
                        }}
                      >
                        {actionError && (
                          <div style={{ color: 'var(--danger)', marginBottom: 12, fontSize: 14 }}>
                            {actionError}
                          </div>
                        )}

                        {!declineOpen ? (
                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            <Button
                              variant="primary"
                              onClick={() => handleApprove(selected.id)}
                              loading={actionLoading}
                              disabled={actionLoading}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setDeclineOpen(true)
                                setActionError(null)
                              }}
                              disabled={actionLoading}
                            >
                              Decline
                            </Button>
                          </div>
                        ) : (
                          <div>
                            <Field label="Reason for decline (required)" htmlFor="decline-note">
                              <textarea
                                id="decline-note"
                                className="textarea"
                                rows={4}
                                value={declineNote}
                                onChange={(e) => setDeclineNote(e.target.value)}
                                placeholder="Explain the basis for this decision using objective criteria only."
                              />
                            </Field>
                            <div
                              style={{
                                display: 'flex',
                                gap: 12,
                                marginTop: 12,
                                flexWrap: 'wrap',
                              }}
                            >
                              <Button
                                variant="primary"
                                onClick={() => handleDecline(selected.id)}
                                loading={actionLoading}
                                disabled={actionLoading || !declineNote.trim()}
                              >
                                Confirm decline
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setDeclineOpen(false)
                                  setDeclineNote('')
                                  setActionError(null)
                                }}
                                disabled={actionLoading}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
