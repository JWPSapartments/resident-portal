import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatCurrency, formatDate } from '../lib/format'
import { PageHead, Card, CardHead, StatusPill, Button, EmptyState } from '../components/ui'

const PILL_LABEL = {
  due: 'Due',
  partial: 'Partial',
  paid: 'Paid',
  overdue: 'Overdue',
}

function pickInvoice(invoices) {
  if (!invoices || invoices.length === 0) return null
  const unpaid = invoices.filter((i) => i.status !== 'paid')
  if (unpaid.length > 0) {
    // nearest due_date (earliest first)
    return unpaid
      .slice()
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0]
  }
  // all paid → latest period_month
  return invoices
    .slice()
    .sort((a, b) => new Date(b.period_month) - new Date(a.period_month))[0]
}

function friendlyPayError(error) {
  const msg = (error?.message || '').toLowerCase()

  // Current record_payment error strings (most specific first)
  if (msg.includes('invoice already paid in full')) {
    return 'This invoice has already been paid in full.'
  }
  if (msg.includes('payment amount exceeds outstanding balance')) {
    return 'That amount is more than the balance due. Please enter an amount at or below the outstanding balance.'
  }
  if (msg.includes('invalid payment amount')) {
    return 'Please enter a valid amount greater than $0.'
  }

  // Legacy / loose fallbacks
  if (msg.includes('already paid') || msg.includes('paid')) {
    return 'This invoice has already been paid in full.'
  }
  if (msg.includes('amount') || msg.includes('positive') || msg.includes('> 0')) {
    return 'Please enter a valid amount greater than $0.'
  }

  return "We couldn't process this payment. Please try again."
}

export default function Payments() {
  const { profile } = useAuth()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])

  // Payment area
  const [payAmount, setPayAmount] = useState('')
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')
  // Independent — survives refetch so the confirmation "receipt" stays visible
  const [paymentSuccess, setPaymentSuccess] = useState(null)

  // Autopay (local state — useAuth().profile does not auto-refresh)
  const [autopay, setAutopay] = useState(!!profile?.autopay_enabled)
  const [autopaySaving, setAutopaySaving] = useState(false)
  const [autopayError, setAutopayError] = useState('')

  async function loadData() {
    setLoadError('')
    const [invRes, payRes] = await Promise.all([
      supabase.from('invoices').select('*, charge_lines(*)'),
      supabase.from('payments').select('*').order('created_at', { ascending: false }),
    ])
    if (invRes.error || payRes.error) {
      setLoadError("We couldn't load your billing info. Please refresh the page.")
      setLoading(false)
      return
    }
    setInvoices(invRes.data || [])
    setPayments(payRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedInvoice = useMemo(() => pickInvoice(invoices), [invoices])

  const lines = useMemo(() => {
    if (!selectedInvoice) return []
    return (selectedInvoice.charge_lines || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
  }, [selectedInvoice])

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + Number(l.amount || 0), 0),
    [lines]
  )

  const invoicePaid = useMemo(() => {
    if (!selectedInvoice) return 0
    return payments
      .filter((p) => p.invoice_id === selectedInvoice.id)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0)
  }, [payments, selectedInvoice])

  // Balance due = Total − payments applied to this invoice (== Total when none)
  const balanceDue = Math.max(total - invoicePaid, 0)
  const isSettled = !selectedInvoice || selectedInvoice.status === 'paid' || balanceDue <= 0

  // Prefill amount with the balance due; re-runs after a payment lands (balance changes)
  useEffect(() => {
    if (selectedInvoice && balanceDue > 0) {
      setPayAmount(balanceDue.toFixed(2))
    } else {
      setPayAmount('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvoice?.id, balanceDue])

  const parsedAmount = parseFloat(payAmount)
  const validAmount = !isNaN(parsedAmount) && parsedAmount > 0

  function onAmountChange(e) {
    let v = e.target.value
    if (v !== '' && !/^\d*\.?\d*$/.test(v)) return // digits + single dot only
    const n = parseFloat(v)
    if (!isNaN(n) && balanceDue > 0 && n > balanceDue) {
      v = balanceDue.toFixed(2) // clamp — no overpay
    }
    setPayAmount(v)
    if (payError) setPayError('')
  }

  async function handlePay() {
    if (!validAmount || !selectedInvoice || paying) return
    setPaying(true)
    setPayError('')
    const { data, error } = await supabase.rpc('record_payment', {
      p_invoice_id: selectedInvoice.id,
      p_amount: parsedAmount,
    })
    if (error) {
      setPayError(friendlyPayError(error))
      setPaying(false)
      return
    }
    setPaymentSuccess({ confirmation: data.confirmation_code, amount: parsedAmount })
    await loadData()
    setPaying(false)
  }

  async function toggleAutopay() {
    if (autopaySaving) return
    const next = !autopay
    setAutopay(next) // optimistic
    setAutopaySaving(true)
    setAutopayError('')
    const { error } = await supabase
      .from('profiles')
      .update({ autopay_enabled: next })
      .eq('id', profile.id)
    if (error) {
      setAutopay(!next) // rollback
      setAutopayError('Could not update autopay. Please try again.')
    }
    setAutopaySaving(false)
  }

  if (loading) {
    return (
      <>
        <PageHead title="Payments" subtitle="Rent, utilities & payment history" />
        <Card>
          <div className="card-pad" style={{ color: 'var(--ink-soft)' }}>
            Loading your billing details…
          </div>
        </Card>
      </>
    )
  }

  const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 16,
    padding: '6px 0',
  }

  return (
    <>
      <PageHead title="Payments" subtitle="Rent, utilities & payment history" />

      {loadError && (
        <Card>
          <div className="card-pad" style={{ color: 'var(--danger)' }}>{loadError}</div>
        </Card>
      )}

      {/* 1. Current bill — primary card */}
      <Card>
        <CardHead
          title="Current bill"
          action={
            selectedInvoice ? (
              <StatusPill
                kind={selectedInvoice.status}
                label={PILL_LABEL[selectedInvoice.status] || selectedInvoice.status}
              />
            ) : null
          }
        />
        <div className="card-pad">
          {/* Success receipt — independent of the payment area, survives refetch */}
          {paymentSuccess && (
            <div
              style={{
                background: 'var(--success-wash)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 14px',
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--success)' }}>
                Payment received — {formatCurrency(paymentSuccess.amount)}
              </div>
              <div style={{ marginTop: 4, color: 'var(--ink-soft)', fontSize: 14 }}>
                Confirmation:{' '}
                <span className="mono" style={{ color: 'var(--ink)' }}>
                  {paymentSuccess.confirmation}
                </span>
              </div>
            </div>
          )}

          {!selectedInvoice ? (
            <EmptyState
              title="No current bill"
              body="Your invoices will appear here once they're issued."
            />
          ) : (
            <>
              {/* Charge lines */}
              {lines.map((line) => (
                <div key={line.id} style={rowStyle}>
                  <span style={{ color: 'var(--ink-soft)' }}>{line.description}</span>
                  <span className="mono">{formatCurrency(line.amount)}</span>
                </div>
              ))}

              <div style={{ borderTop: '1px solid var(--line)', margin: '10px 0' }} />

              {/* Total */}
              <div style={rowStyle}>
                <span style={{ fontWeight: 600 }}>Total</span>
                <span className="amount mono">{formatCurrency(total)}</span>
              </div>

              {/* Partial payment breakdown */}
              {invoicePaid > 0 && (
                <>
                  <div style={rowStyle}>
                    <span style={{ color: 'var(--ink-soft)' }}>Paid</span>
                    <span className="amount mono" style={{ color: 'var(--success)' }}>
                      −{formatCurrency(invoicePaid)}
                    </span>
                  </div>
                  <div style={rowStyle}>
                    <span style={{ fontWeight: 600 }}>Balance due</span>
                    <span className="amount mono">{formatCurrency(balanceDue)}</span>
                  </div>
                </>
              )}

              {/* Due date */}
              <div style={{ marginTop: 14, color: 'var(--ink-soft)' }}>
                Due {formatDate(selectedInvoice.due_date)}
              </div>

              {/* Late fee note (rate TBD — no figure printed) */}
              <div style={{ marginTop: 4, fontSize: 13, color: 'var(--ink-faint)' }}>
                Late fees may apply after the due date. (Final rate TBD.)
              </div>

              {/* Payment area */}
              {isSettled ? (
                <div
                  style={{
                    marginTop: 18,
                    padding: '14px 16px',
                    background: 'var(--success-wash)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--success)',
                    fontWeight: 600,
                  }}
                >
                  You're all caught up — nothing due right now.
                </div>
              ) : (
                <div style={{ marginTop: 18 }}>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'flex-end',
                      gap: 12,
                    }}
                  >
                    <div className="field" style={{ flex: '1 1 200px', minWidth: 180 }}>
                      <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--ink-soft)' }}>
                        Payment amount
                      </label>
                      <input
                        className="input"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={payAmount}
                        onChange={onAmountChange}
                        disabled={paying}
                      />
                    </div>
                    <Button
                      variant="primary"
                      onClick={handlePay}
                      loading={paying}
                      disabled={!validAmount || paying}
                    >
                      Pay {formatCurrency(validAmount ? parsedAmount : 0)}
                    </Button>
                  </div>

                  {payError && (
                    <div style={{ marginTop: 10, color: 'var(--danger)', fontSize: 14 }}>
                      {payError}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {/* Row: Autopay + History (side by side on desktop, stacked when narrow) */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'flex-start',
          marginTop: 16,
        }}
      >
        {/* 2. Autopay */}
        <div style={{ flex: '1 1 260px', minWidth: 240 }}>
          <Card>
            <CardHead title="Autopay" />
            <div className="card-pad">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autopay}
                  onClick={toggleAutopay}
                  disabled={autopaySaving}
                  style={{
                    position: 'relative',
                    width: 46,
                    height: 26,
                    flexShrink: 0,
                    borderRadius: 999,
                    border: '1px solid var(--line)',
                    background: autopay ? 'var(--primary)' : 'var(--surface)',
                    cursor: autopaySaving ? 'default' : 'pointer',
                    transition: 'background 0.15s ease',
                    padding: 0,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: autopay ? 22 : 2,
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: 'var(--paper)',
                      boxShadow: 'var(--shadow)',
                      transition: 'left 0.15s ease',
                    }}
                  />
                </button>
                <span style={{ fontWeight: 600 }}>
                  Autopay {autopay ? 'On' : 'Off'}
                </span>
              </div>

              {autopayError && (
                <div style={{ marginTop: 10, color: 'var(--danger)', fontSize: 14 }}>
                  {autopayError}
                </div>
              )}

              <div style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-faint)' }}>
                Autopay will use Stripe Billing in the live version. (Simulated in this preview.)
              </div>
            </div>
          </Card>
        </div>

        {/* 3. Payment history */}
        <div style={{ flex: '2 1 380px', minWidth: 300 }}>
          <Card>
            <CardHead title="Payment history" />
            <div className="card-pad">
              {payments.length === 0 ? (
                <EmptyState
                  title="No payments yet"
                  body="Your payment history will appear here."
                />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Confirmation</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td>{formatDate(p.created_at)}</td>
                        <td className="mono">{p.confirmation_number}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>
                          {formatCurrency(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
