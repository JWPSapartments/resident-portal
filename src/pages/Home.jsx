import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatCurrency, formatDate } from '../lib/format'
import { PageHead, Card, CardHead, StatusPill, Button, EmptyState } from '../components/ui'

const STATUS_LABEL = {
  due: 'Due',
  partial: 'Partial',
  paid: 'Paid',
  overdue: 'Overdue',
  submitted: 'Submitted',
  in_progress: 'In progress',
  completed: 'Completed',
}

// Sum a numeric column across a row array, tolerating null/undefined.
function sumBy(rows, key) {
  return (rows || []).reduce((total, row) => total + Number(row[key] || 0), 0)
}

// Month name from a 'YYYY-MM-DD' date string, parsed by parts to avoid
// UTC-midnight timezone drift shifting the displayed month.
function monthNameFromDate(dateStr) {
  if (!dateStr) return ''
  const [y, m] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long' })
}

function KeyValueRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
      <span style={{ color: 'var(--ink-faint)' }}>{label}</span>
      <span>{value}</span>
    </div>
  )
}

export default function Home() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [lease, setLease] = useState(null)
  const [maintenance, setMaintenance] = useState([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [invoiceRes, leaseRes, maintRes] = await Promise.all([
          // charge_lines + payments nested so the whole balance calc comes back
          // in one round trip; RLS filters to the signed-in resident.
          supabase.from('invoices').select('*, charge_lines(*), payments(*)'),
          supabase
            .from('leases')
            .select('*')
            .eq('type', 'rent')
            .eq('status', 'active')
            .limit(1),
          supabase
            .from('maintenance_requests')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(3),
        ])

        if (invoiceRes.error) throw invoiceRes.error
        if (leaseRes.error) throw leaseRes.error
        if (maintRes.error) throw maintRes.error

        if (!cancelled) {
          setInvoices(invoiceRes.data || [])
          setLease((leaseRes.data && leaseRes.data[0]) || null)
          setMaintenance(maintRes.data || [])
        }
      } catch (e) {
        if (!cancelled) setError(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  // ── Single source of truth ────────────────────────────────────────────────
  // selectedInvoice drives BOTH the rent-cycle strip and the balance card.
  //   - if any non-paid invoice exists → the one with the latest due_date
  //   - else if all paid → the one with the latest period_month
  //   - else (no invoices at all) → null
  const selectedInvoice = (() => {
    if (!invoices.length) return null
    const unpaid = invoices.filter((i) => i.status !== 'paid')
    if (unpaid.length) {
      return unpaid.reduce((latest, i) =>
        new Date(i.due_date) > new Date(latest.due_date) ? i : latest
      )
    }
    return invoices.reduce((latest, i) =>
      new Date(i.period_month) > new Date(latest.period_month) ? i : latest
    )
  })()

  const chargeTotal = selectedInvoice ? sumBy(selectedInvoice.charge_lines, 'amount') : 0
  const paidTotal = selectedInvoice ? sumBy(selectedInvoice.payments, 'amount') : 0
  const remaining = chargeTotal - paidTotal

  // ── Rent status (date-based; replaces the visual rent-cycle strip) ─────────
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const parseLocalDate = (s) => {
    if (!s) return null
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const dueDateObj = selectedInvoice ? parseLocalDate(selectedInvoice.due_date) : null
  const daysToDue = dueDateObj
    ? Math.round((dueDateObj - startOfToday) / 86400000)
    : null
  const currentMonthLabel = today.toLocaleString('en-US', { month: 'long' })
  const rentMonthLabel = selectedInvoice
    ? monthNameFromDate(selectedInvoice.period_month)
    : currentMonthLabel

  // Headline + colored note for the rent card, derived from selectedInvoice only.
  const rentStatus = (() => {
    if (!selectedInvoice) {
      return { headline: 'No open balance', note: '', color: 'var(--ink-soft)' }
    }
    const s = selectedInvoice.status
    if (s === 'paid') {
      return { headline: `Paid for ${rentMonthLabel}`, note: '', color: 'var(--success)' }
    }
    const dueLabel = `Due ${formatDate(selectedInvoice.due_date)}`
    if (s === 'overdue' || (daysToDue !== null && daysToDue < 0)) {
      const overdueBy = daysToDue !== null ? Math.abs(daysToDue) : null
      return {
        headline: dueLabel,
        note:
          overdueBy !== null
            ? `Past due by ${overdueBy} day${overdueBy === 1 ? '' : 's'} · late fee applies`
            : 'Payment past due · late fee applies',
        color: 'var(--danger)',
      }
    }
    if (s === 'partial') {
      return {
        headline: dueLabel,
        note: `Partially paid · ${formatCurrency(remaining)} remaining`,
        color: 'var(--accent)',
      }
    }
    return {
      headline: dueLabel,
      note:
        daysToDue === 0
          ? 'Due today'
          : daysToDue > 0
          ? `Due in ${daysToDue} day${daysToDue === 1 ? '' : 's'}`
          : 'Rent due by the 5th',
      color: 'var(--accent)',
    }
  })()

  const firstName = (profile?.full_name || '').split(' ')[0]
  const greeting = firstName ? `Welcome back, ${firstName}` : 'Welcome back'

  // ── Loading / error guards (never white-screen) ───────────────────────────
  if (loading) {
    return (
      <>
        <PageHead title="Welcome back" subtitle="Loading…" />
        <div style={{ color: 'var(--ink-soft)' }}>Loading…</div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <PageHead title="Welcome back" subtitle="" />
        <Card>
          <div className="card-pad">
            <EmptyState
              title="Couldn't load your dashboard"
              body="Something went wrong while loading your information. Please refresh the page to try again."
            />
          </div>
        </Card>
      </>
    )
  }

  const hasBalance = !!selectedInvoice && remaining > 0
  const sortedChargeLines = selectedInvoice
    ? [...(selectedInvoice.charge_lines || [])].sort(
        (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
      )
    : []

  return (
    <>
      <PageHead
        title={greeting}
        subtitle={`${profile?.unit_label} · Room ${profile?.room_label}`}
      />

      {/* Rent status — date-based summary, pinned to the top */}
      <div style={{ marginBottom: '20px' }}>
        <Card>
          <div className="card-pad">
            <div style={{ color: 'var(--ink-faint)', marginBottom: '4px' }}>
              Rent · {rentMonthLabel}
            </div>
            <div style={{ fontSize: '1.25rem' }}>{rentStatus.headline}</div>
            {rentStatus.note ? (
              <div style={{ color: rentStatus.color, marginTop: '4px' }}>
                {rentStatus.note}
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      {/* Balance — visual anchor */}
      <div style={{ marginBottom: '20px' }}>
        <Card>
          <CardHead
            title="Balance"
            action={
              selectedInvoice ? (
                <StatusPill
                  kind={selectedInvoice.status}
                  label={STATUS_LABEL[selectedInvoice.status]}
                />
              ) : null
            }
          />
          <div className="card-pad">
            {hasBalance ? (
              <>
                <div className="amount amount-xl mono">{formatCurrency(remaining)}</div>
                <div
                  style={{
                    marginTop: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  {sortedChargeLines.map((line) => (
                    <div
                      key={line.id}
                      style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}
                    >
                      <span style={{ color: 'var(--ink-soft)' }}>{line.description}</span>
                      <span className="mono">{formatCurrency(line.amount)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '20px' }}>
                  <Button variant="primary" onClick={() => navigate('/payments')}>
                    Make a payment
                  </Button>
                </div>
              </>
            ) : (
              <EmptyState
                title="You're all caught up"
                body="You have no open balance right now. We'll let you know when your next statement is ready."
              />
            )}
          </div>
        </Card>
      </div>

      {/* Lease + Maintenance — side by side on desktop, stacked when narrow */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
        <div style={{ flex: '1 1 300px' }}>
          <Card>
            <CardHead title="Current lease" />
            <div className="card-pad">
              {lease ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <KeyValueRow label="Room" value={lease.room_label} />
                  <KeyValueRow label="Monthly rent" value={formatCurrency(lease.monthly_rate)} />
                  <KeyValueRow
                    label="Lease term"
                    value={`${formatDate(lease.start_date)} – ${formatDate(lease.end_date)}`}
                  />
                </div>
              ) : (
                <EmptyState
                  title="No active lease"
                  body="We don't have an active lease on file for your account yet."
                />
              )}
            </div>
          </Card>
        </div>

        <div style={{ flex: '1 1 300px' }}>
          <Card>
            <CardHead
              title="Maintenance"
              action={
                <Button variant="ghost" onClick={() => navigate('/maintenance/new')}>
                  New request
                </Button>
              }
            />
            <div className="card-pad">
              {maintenance.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {maintenance.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          minWidth: 0,
                        }}
                      >
                        <span className="mono" style={{ flexShrink: 0 }}>
                          {m.request_number}
                        </span>
                        <span
                          style={{
                            color: 'var(--ink-soft)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {m.description}
                        </span>
                      </div>
                      <StatusPill kind={m.status} label={STATUS_LABEL[m.status]} />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No maintenance requests"
                  body="When you submit a maintenance request, it'll show up here."
                  action={
                    <Button variant="primary" onClick={() => navigate('/maintenance/new')}>
                      New request
                    </Button>
                  }
                />
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
