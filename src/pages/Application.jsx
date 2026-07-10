import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHead, Card, Field, Button } from '../components/ui'

const GUARANTOR_REQUIRED = true // 客戶未最終定案；true=guarantor 段必填。日後改此一處即可
const ROOM_OPTIONS = ['A', 'B', 'C', 'D', 'E']
const ENROLLMENT_OPTIONS = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
]

const STEP_TITLES = [
  'Personal & contact',
  'Residency history',
  'School enrollment',
  'Guarantor / co-signer',
  'Co-applicants',
  'References & consent',
]

const rowStyle = { display: 'flex', flexWrap: 'wrap', gap: 14 }
const colStyle = { flex: '1 1 220px', minWidth: 0 }

function SensitiveBlock({ children }) {
  return (
    <div
      style={{
        background: 'var(--paper)',
        color: 'var(--ink-faint)',
        border: '1px dashed var(--line)',
        borderRadius: 'var(--radius-sm)',
        padding: '14px 16px',
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  )
}

function friendlyError(e) {
  const msg = (e && (e.message || e.error_description || e.error)) || ''
  if (/already registered|already exists|user already/i.test(msg)) {
    return 'An account with this email already exists. Try signing in instead.'
  }
  if (/password/i.test(msg) && /8|length|short|weak/i.test(msg)) {
    return 'Please choose a password with at least 8 characters.'
  }
  if (msg) return msg
  return 'Something went wrong while submitting your application. Please try again.'
}

export default function Application() {
  const navigate = useNavigate()
  const { session, profile, signUp } = useAuth()

  const isResubmit = !!session && profile?.status === 'declined'
  const profileEmail = profile?.email || session?.user?.email || ''

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [applicationId, setApplicationId] = useState(null)
  const [existingProofUrl, setExistingProofUrl] = useState(null)

  // Step 1 — account (new applicants only)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Step 1 — personal & contact
  const [fullLegalName, setFullLegalName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [currentAddress, setCurrentAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [desiredUnit, setDesiredUnit] = useState('')
  const [desiredRoom, setDesiredRoom] = useState('')

  // Step 2 — residency history
  const [residency, setResidency] = useState({
    current_address: '',
    landlord_name: '',
    landlord_phone: '',
    monthly_rent: '',
    move_in: '',
    move_out: '',
    reason_for_leaving: '',
    prior_address: '',
  })

  // Step 3 — school enrollment
  const [schoolName, setSchoolName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [classStanding, setClassStanding] = useState('')
  const [expectedGraduation, setExpectedGraduation] = useState('')
  const [enrollmentStatus, setEnrollmentStatus] = useState('')
  const [proofFile, setProofFile] = useState(null)

  // Step 4 — guarantor
  const [guarantor, setGuarantor] = useState({
    name: '',
    relationship: '',
    address: '',
    phone: '',
    email: '',
    employer: '',
    income: '',
    typed_name_ack: '',
    ack_at: null,
  })

  // Step 5 — co-applicants
  const [coApplicants, setCoApplicants] = useState([])

  // Step 6 — references + consent
  const [prevLandlord, setPrevLandlord] = useState({ name: '', phone: '' })
  const [personalRefs, setPersonalRefs] = useState([{ name: '', phone: '', relationship: '' }])
  const [consentCredit, setConsentCredit] = useState(false)
  const [consentCriminal, setConsentCriminal] = useState(false)
  const [consentRentalHistory, setConsentRentalHistory] = useState(false)

  // Prefill for declined re-apply
  useEffect(() => {
    if (!isResubmit || !profile?.id) return
    let cancelled = false
    ;(async () => {
      const { data, error: fetchErr } = await supabase
        .from('applications')
        .select('*')
        .eq('user_id', profile.id)
        .eq('status', 'declined')
        .maybeSingle()
      if (cancelled) return
      if (fetchErr) {
        setError('We could not load your previous application. You can still fill it out below.')
        return
      }
      if (!data) return
      setApplicationId(data.id)
      setFullLegalName(data.full_legal_name || '')
      setDateOfBirth(data.date_of_birth || '')
      setCurrentAddress(data.current_address || '')
      setPhone(data.phone || '')
      setDesiredUnit(data.desired_unit_label || '')
      setDesiredRoom(data.desired_room_label || '')

      const rh = data.residency_history || {}
      setResidency({
        current_address: rh.current_address || '',
        landlord_name: rh.landlord_name || '',
        landlord_phone: rh.landlord_phone || '',
        monthly_rent: rh.monthly_rent || '',
        move_in: rh.move_in || '',
        move_out: rh.move_out || '',
        reason_for_leaving: rh.reason_for_leaving || '',
        prior_address: rh.prior_address || '',
      })

      setSchoolName(data.school_name || '')
      setStudentId(data.student_id || '')
      setClassStanding(data.class_standing || '')
      setExpectedGraduation(data.expected_graduation || '')
      setEnrollmentStatus(data.enrollment_status || '')
      setExistingProofUrl(data.proof_of_enrollment_url || null)

      const g = data.guarantor || {}
      setGuarantor({
        name: g.name || '',
        relationship: g.relationship || '',
        address: g.address || '',
        phone: g.phone || '',
        email: g.email || '',
        employer: g.employer || '',
        income: g.income || '',
        typed_name_ack: g.typed_name_ack || '',
        ack_at: g.ack_at || null,
      })

      setCoApplicants(
        Array.isArray(data.co_applicants)
          ? data.co_applicants.map((c) => ({
              full_name: c.full_name || '',
              email: c.email || '',
              note: c.note || '',
            }))
          : []
      )

      const refs = data.references || {}
      const pl = refs.previous_landlord || {}
      setPrevLandlord({ name: pl.name || '', phone: pl.phone || '' })
      const personal = Array.isArray(refs.personal) ? refs.personal : []
      setPersonalRefs(
        personal.length
          ? personal.map((p) => ({
              name: p.name || '',
              phone: p.phone || '',
              relationship: p.relationship || '',
            }))
          : [{ name: '', phone: '', relationship: '' }]
      )

      setConsentCredit(!!data.consent_credit)
      setConsentCriminal(!!data.consent_criminal)
      setConsentRentalHistory(!!data.consent_rental_history)
    })()
    return () => {
      cancelled = true
    }
  }, [isResubmit, profile?.id])

  // Guarantor typed-name acknowledgment (captures ack_at when first typed)
  const setGuarantorAck = (val) => {
    setGuarantor((g) => ({
      ...g,
      typed_name_ack: val,
      ack_at: val.trim() ? g.ack_at || new Date().toISOString() : null,
    }))
  }
  const updateGuarantor = (key, val) => setGuarantor((g) => ({ ...g, [key]: val }))
  const updateResidency = (key, val) => setResidency((r) => ({ ...r, [key]: val }))

  // Co-applicants
  const addCoApplicant = () =>
    setCoApplicants((a) => [...a, { full_name: '', email: '', note: '' }])
  const removeCoApplicant = (i) => setCoApplicants((a) => a.filter((_, idx) => idx !== i))
  const updateCoApplicant = (i, key, val) =>
    setCoApplicants((a) => a.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)))

  // Personal references
  const addPersonalRef = () =>
    setPersonalRefs((a) => [...a, { name: '', phone: '', relationship: '' }])
  const removePersonalRef = (i) => setPersonalRefs((a) => a.filter((_, idx) => idx !== i))
  const updatePersonalRef = (i, key, val) =>
    setPersonalRefs((a) => a.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)))

  function validateStep(s) {
    if (s === 1) {
      if (!isResubmit) {
        if (!email.trim()) return 'Please enter your email address.'
        if (password.length < 8) return 'Password must be at least 8 characters.'
        if (password !== confirmPassword) return 'The passwords do not match.'
      }
      if (!fullLegalName.trim()) return 'Please enter your full legal name.'
      if (!dateOfBirth) return 'Please enter your date of birth.'
      if (!currentAddress.trim()) return 'Please enter your current address.'
      if (!phone.trim()) return 'Please enter your phone number.'
      if (!desiredUnit.trim()) return 'Please enter your desired unit.'
      if (!desiredRoom) return 'Please select a desired room.'
      return null
    }
    if (s === 2) {
      if (!residency.landlord_name.trim()) return 'Please enter your current landlord name.'
      if (!residency.landlord_phone.trim()) return 'Please enter your landlord phone number.'
      if (!String(residency.monthly_rent).trim()) return 'Please enter your monthly rent.'
      if (!residency.move_in) return 'Please enter your move-in date.'
      if (!residency.reason_for_leaving.trim()) return 'Please enter your reason for leaving.'
      return null
    }
    if (s === 3) {
      if (!schoolName.trim()) return 'Please enter your school name.'
      if (!studentId.trim()) return 'Please enter your student ID.'
      if (!classStanding.trim()) return 'Please enter your year / class standing.'
      if (!expectedGraduation.trim()) return 'Please enter your expected graduation.'
      if (!enrollmentStatus) return 'Please select your enrollment status.'
      return null
    }
    if (s === 4) {
      if (GUARANTOR_REQUIRED) {
        if (!guarantor.name.trim()) return 'Please enter the guarantor name.'
        if (!guarantor.relationship.trim()) return 'Please enter the guarantor relationship.'
        if (!guarantor.phone.trim()) return 'Please enter the guarantor phone number.'
        if (!guarantor.email.trim()) return 'Please enter the guarantor email.'
        if (!guarantor.employer.trim()) return 'Please enter the guarantor employer.'
        if (!String(guarantor.income).trim()) return 'Please enter the guarantor income.'
        if (!guarantor.typed_name_ack.trim())
          return 'Please have the guarantor type their full name to acknowledge.'
      }
      return null
    }
    if (s === 5) {
      return null
    }
    if (s === 6) {
      if (!consentCredit || !consentCriminal || !consentRentalHistory)
        return 'You must authorize all three screening checks to submit your application.'
      return null
    }
    return null
  }

  function next() {
    const err = validateStep(step)
    if (err) {
      setError(err)
      return
    }
    setError('')
    setStep((s) => Math.min(6, s + 1))
  }

  function back() {
    setError('')
    setStep((s) => Math.max(1, s - 1))
  }

  async function uploadProof(userId) {
    if (!proofFile) return existingProofUrl || null
    const parts = proofFile.name.split('.')
    const ext = parts.length > 1 ? parts.pop() : 'dat'
    const path = `${userId}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('enrollment-proofs').upload(path, proofFile)
    if (upErr) throw upErr
    return path
  }

  function buildPayload(proofUrl) {
    return {
      full_legal_name: fullLegalName,
      current_address: currentAddress,
      phone,
      email: isResubmit ? profileEmail : email,
      date_of_birth: dateOfBirth,
      desired_unit_label: desiredUnit,
      desired_room_label: desiredRoom,
      residency_history: {
        current_address: residency.current_address,
        landlord_name: residency.landlord_name,
        landlord_phone: residency.landlord_phone,
        monthly_rent: residency.monthly_rent,
        move_in: residency.move_in,
        move_out: residency.move_out,
        reason_for_leaving: residency.reason_for_leaving,
        prior_address: residency.prior_address,
      },
      school_name: schoolName,
      student_id: studentId,
      class_standing: classStanding,
      expected_graduation: expectedGraduation,
      enrollment_status: enrollmentStatus,
      proof_of_enrollment_url: proofUrl,
      guarantor: {
        name: guarantor.name,
        relationship: guarantor.relationship,
        address: guarantor.address,
        phone: guarantor.phone,
        email: guarantor.email,
        employer: guarantor.employer,
        income: guarantor.income,
        typed_name_ack: guarantor.typed_name_ack,
        ack_at: guarantor.typed_name_ack.trim() ? guarantor.ack_at || new Date().toISOString() : null,
      },
      guarantor_required: GUARANTOR_REQUIRED,
      co_applicants: coApplicants,
      references: {
        previous_landlord: { name: prevLandlord.name, phone: prevLandlord.phone },
        personal: personalRefs,
      },
      consent_credit: consentCredit,
      consent_criminal: consentCriminal,
      consent_rental_history: consentRentalHistory,
      consent_at: new Date().toISOString(),
    }
  }

  async function handleSubmit() {
    const err = validateStep(6)
    if (err) {
      setError(err)
      return
    }
    setError('')
    setLoading(true)
    try {
      if (isResubmit) {
        const userId = profile.id
        const proofUrl = await uploadProof(userId)
        const payload = buildPayload(proofUrl)
        const { error: rpcErr } = await supabase.rpc('resubmit_application', {
          p_application_id: applicationId,
          p_payload: payload,
        })
        if (rpcErr) throw rpcErr
        navigate('/pending')
      } else {
        const { error: signErr } = await signUp(email, password, { full_name: fullLegalName })
        if (signErr) throw signErr
        const { data: userData, error: userErr } = await supabase.auth.getUser()
        if (userErr) throw userErr
        const userId = userData?.user?.id
        if (!userId) throw new Error('We could not confirm your new account. Please try again.')
        const proofUrl = await uploadProof(userId)
        const payload = buildPayload(proofUrl)
        const { error: insErr } = await supabase
          .from('applications')
          .insert({ ...payload, user_id: userId })
        if (insErr) throw insErr
        navigate('/pending')
      }
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--paper)',
        display: 'flex',
        justifyContent: 'center',
        padding: '32px 16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 700 }}>
        <PageHead
          title="Rental application"
          subtitle={`Step ${step} of 6 — ${STEP_TITLES[step - 1]}`}
        />

        {/* Progress indicator */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            margin: '4px 0 20px',
          }}
        >
          {STEP_TITLES.map((title, i) => {
            const n = i + 1
            const active = n === step
            const done = n < step
            return (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontFamily: 'var(--font-mono)',
                    background: active
                      ? 'var(--primary)'
                      : done
                      ? 'var(--primary-wash)'
                      : 'var(--surface)',
                    color: active ? 'var(--primary-ink)' : done ? 'var(--primary)' : 'var(--ink-faint)',
                    border: `1px solid ${active ? 'var(--primary)' : 'var(--line)'}`,
                  }}
                >
                  {n}
                </div>
                {n < 6 && (
                  <div
                    style={{
                      width: 14,
                      height: 1,
                      background: 'var(--line)',
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>

        <Card>
          <div className="card-pad">
            {/* STEP 1 */}
            {step === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {!isResubmit ? (
                  <>
                    <div style={rowStyle}>
                      <div style={colStyle}>
                        <Field label="Email" htmlFor="app-email">
                          <input
                            id="app-email"
                            className="input"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                          />
                        </Field>
                      </div>
                    </div>
                    <div style={rowStyle}>
                      <div style={colStyle}>
                        <Field label="Password" htmlFor="app-password">
                          <input
                            id="app-password"
                            className="input"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="At least 8 characters"
                          />
                        </Field>
                      </div>
                      <div style={colStyle}>
                        <Field label="Confirm password" htmlFor="app-confirm">
                          <input
                            id="app-confirm"
                            className="input"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                          />
                        </Field>
                      </div>
                    </div>
                  </>
                ) : (
                  <Field label="Email" htmlFor="app-email-ro">
                    <input id="app-email-ro" className="input" type="email" value={profileEmail} readOnly disabled />
                  </Field>
                )}

                <Field label="Full legal name" htmlFor="app-name">
                  <input
                    id="app-name"
                    className="input"
                    value={fullLegalName}
                    onChange={(e) => setFullLegalName(e.target.value)}
                  />
                </Field>

                <div style={rowStyle}>
                  <div style={colStyle}>
                    <Field label="Date of birth" htmlFor="app-dob">
                      <input
                        id="app-dob"
                        className="input"
                        type="date"
                        value={dateOfBirth}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                      />
                    </Field>
                  </div>
                  <div style={colStyle}>
                    <Field label="Phone" htmlFor="app-phone">
                      <input
                        id="app-phone"
                        className="input"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </Field>
                  </div>
                </div>

                <Field label="Current address" htmlFor="app-addr">
                  <textarea
                    id="app-addr"
                    className="textarea"
                    value={currentAddress}
                    onChange={(e) => setCurrentAddress(e.target.value)}
                  />
                </Field>

                <div style={rowStyle}>
                  <div style={colStyle}>
                    <Field label="Desired unit" htmlFor="app-unit">
                      <input
                        id="app-unit"
                        className="input"
                        value={desiredUnit}
                        onChange={(e) => setDesiredUnit(e.target.value)}
                        placeholder="Unit 2"
                      />
                    </Field>
                  </div>
                  <div style={colStyle}>
                    <Field label="Room" htmlFor="app-room">
                      <select
                        id="app-room"
                        className="select"
                        value={desiredRoom}
                        onChange={(e) => setDesiredRoom(e.target.value)}
                      >
                        <option value="">Select a room</option>
                        {ROOM_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            Room {r}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>

                <SensitiveBlock>
                  Social Security / ITIN and ID verification are collected securely during the
                  screening step and are not stored in this portal.
                </SensitiveBlock>
              </div>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Field label="Current address" htmlFor="res-addr">
                  <input
                    id="res-addr"
                    className="input"
                    value={residency.current_address}
                    onChange={(e) => updateResidency('current_address', e.target.value)}
                  />
                </Field>
                <div style={rowStyle}>
                  <div style={colStyle}>
                    <Field label="Current landlord name" htmlFor="res-ll-name">
                      <input
                        id="res-ll-name"
                        className="input"
                        value={residency.landlord_name}
                        onChange={(e) => updateResidency('landlord_name', e.target.value)}
                      />
                    </Field>
                  </div>
                  <div style={colStyle}>
                    <Field label="Landlord phone" htmlFor="res-ll-phone">
                      <input
                        id="res-ll-phone"
                        className="input"
                        value={residency.landlord_phone}
                        onChange={(e) => updateResidency('landlord_phone', e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
                <div style={rowStyle}>
                  <div style={colStyle}>
                    <Field label="Monthly rent" htmlFor="res-rent">
                      <input
                        id="res-rent"
                        className="input"
                        value={residency.monthly_rent}
                        onChange={(e) => updateResidency('monthly_rent', e.target.value)}
                      />
                    </Field>
                  </div>
                  <div style={colStyle}>
                    <Field label="Move-in date" htmlFor="res-in">
                      <input
                        id="res-in"
                        className="input"
                        type="date"
                        value={residency.move_in}
                        onChange={(e) => updateResidency('move_in', e.target.value)}
                      />
                    </Field>
                  </div>
                  <div style={colStyle}>
                    <Field label="Move-out date" htmlFor="res-out">
                      <input
                        id="res-out"
                        className="input"
                        type="date"
                        value={residency.move_out}
                        onChange={(e) => updateResidency('move_out', e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
                <Field label="Reason for leaving" htmlFor="res-reason">
                  <textarea
                    id="res-reason"
                    className="textarea"
                    value={residency.reason_for_leaving}
                    onChange={(e) => updateResidency('reason_for_leaving', e.target.value)}
                  />
                </Field>
                <Field label="Prior address (optional)" htmlFor="res-prior">
                  <textarea
                    id="res-prior"
                    className="textarea"
                    value={residency.prior_address}
                    onChange={(e) => updateResidency('prior_address', e.target.value)}
                    placeholder="Only if you've lived at your current address less than 1–2 years"
                  />
                </Field>
              </div>
            )}

            {/* STEP 3 */}
            {step === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={rowStyle}>
                  <div style={colStyle}>
                    <Field label="School name" htmlFor="sch-name">
                      <input
                        id="sch-name"
                        className="input"
                        value={schoolName}
                        onChange={(e) => setSchoolName(e.target.value)}
                      />
                    </Field>
                  </div>
                  <div style={colStyle}>
                    <Field label="Student ID" htmlFor="sch-id">
                      <input
                        id="sch-id"
                        className="input"
                        value={studentId}
                        onChange={(e) => setStudentId(e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
                <div style={rowStyle}>
                  <div style={colStyle}>
                    <Field label="Year / class standing" htmlFor="sch-standing">
                      <input
                        id="sch-standing"
                        className="input"
                        value={classStanding}
                        onChange={(e) => setClassStanding(e.target.value)}
                        placeholder="e.g. Junior"
                      />
                    </Field>
                  </div>
                  <div style={colStyle}>
                    <Field label="Expected graduation" htmlFor="sch-grad">
                      <input
                        id="sch-grad"
                        className="input"
                        value={expectedGraduation}
                        onChange={(e) => setExpectedGraduation(e.target.value)}
                        placeholder="e.g. May 2027"
                      />
                    </Field>
                  </div>
                </div>
                <Field label="Enrollment status" htmlFor="sch-status">
                  <select
                    id="sch-status"
                    className="select"
                    value={enrollmentStatus}
                    onChange={(e) => setEnrollmentStatus(e.target.value)}
                  >
                    <option value="">Select enrollment status</option>
                    {ENROLLMENT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Proof of enrollment (optional)" htmlFor="sch-proof">
                  <input
                    id="sch-proof"
                    className="input"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                  />
                </Field>
                {existingProofUrl && !proofFile && (
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                    A proof file is already on record. Choosing a new file will replace it.
                  </div>
                )}
                <div style={{ fontSize: 13, color: 'var(--ink-faint)' }}>
                  Accepts an image or PDF. This is optional and won't block your submission.
                </div>
              </div>
            )}

            {/* STEP 4 */}
            {step === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={rowStyle}>
                  <div style={colStyle}>
                    <Field label="Name" htmlFor="g-name">
                      <input
                        id="g-name"
                        className="input"
                        value={guarantor.name}
                        onChange={(e) => updateGuarantor('name', e.target.value)}
                      />
                    </Field>
                  </div>
                  <div style={colStyle}>
                    <Field label="Relationship to applicant" htmlFor="g-rel">
                      <input
                        id="g-rel"
                        className="input"
                        value={guarantor.relationship}
                        onChange={(e) => updateGuarantor('relationship', e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
                <Field label="Address" htmlFor="g-addr">
                  <textarea
                    id="g-addr"
                    className="textarea"
                    value={guarantor.address}
                    onChange={(e) => updateGuarantor('address', e.target.value)}
                  />
                </Field>
                <div style={rowStyle}>
                  <div style={colStyle}>
                    <Field label="Phone" htmlFor="g-phone">
                      <input
                        id="g-phone"
                        className="input"
                        value={guarantor.phone}
                        onChange={(e) => updateGuarantor('phone', e.target.value)}
                      />
                    </Field>
                  </div>
                  <div style={colStyle}>
                    <Field label="Email" htmlFor="g-email">
                      <input
                        id="g-email"
                        className="input"
                        type="email"
                        value={guarantor.email}
                        onChange={(e) => updateGuarantor('email', e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
                <div style={rowStyle}>
                  <div style={colStyle}>
                    <Field label="Employer" htmlFor="g-emp">
                      <input
                        id="g-emp"
                        className="input"
                        value={guarantor.employer}
                        onChange={(e) => updateGuarantor('employer', e.target.value)}
                      />
                    </Field>
                  </div>
                  <div style={colStyle}>
                    <Field label="Income" htmlFor="g-inc">
                      <input
                        id="g-inc"
                        className="input"
                        value={guarantor.income}
                        onChange={(e) => updateGuarantor('income', e.target.value)}
                      />
                    </Field>
                  </div>
                </div>

                <SensitiveBlock>
                  Social Security / ITIN and ID verification are collected securely during the
                  screening step and are not stored in this portal.
                </SensitiveBlock>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                    By typing your full name, you acknowledge your intent to guarantee this lease. (A
                    legally binding e-signature will be collected in the live version.)
                  </div>
                  <Field label="Typed-name acknowledgment" htmlFor="g-ack">
                    <input
                      id="g-ack"
                      className="input"
                      value={guarantor.typed_name_ack}
                      onChange={(e) => setGuarantorAck(e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            )}

            {/* STEP 5 */}
            {step === 5 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: 14, color: 'var(--ink-soft)' }}>
                  List anyone applying to live in the same unit. Each resident signs their own lease.
                </div>
                {coApplicants.length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--ink-faint)' }}>
                    No co-applicants added.
                  </div>
                )}
                {coApplicants.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--radius-sm)',
                      padding: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <div style={rowStyle}>
                      <div style={colStyle}>
                        <Field label="Full name" htmlFor={`ca-name-${i}`}>
                          <input
                            id={`ca-name-${i}`}
                            className="input"
                            value={c.full_name}
                            onChange={(e) => updateCoApplicant(i, 'full_name', e.target.value)}
                          />
                        </Field>
                      </div>
                      <div style={colStyle}>
                        <Field label="Email (optional)" htmlFor={`ca-email-${i}`}>
                          <input
                            id={`ca-email-${i}`}
                            className="input"
                            type="email"
                            value={c.email}
                            onChange={(e) => updateCoApplicant(i, 'email', e.target.value)}
                          />
                        </Field>
                      </div>
                    </div>
                    <Field label="Note (optional)" htmlFor={`ca-note-${i}`}>
                      <input
                        id={`ca-note-${i}`}
                        className="input"
                        value={c.note}
                        onChange={(e) => updateCoApplicant(i, 'note', e.target.value)}
                      />
                    </Field>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Button variant="ghost" onClick={() => removeCoApplicant(i)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
                <div>
                  <Button variant="ghost" onClick={addCoApplicant}>
                    + Add another
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 6 */}
            {step === 6 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--ink)' }}>
                    Previous landlord
                  </div>
                  <div style={rowStyle}>
                    <div style={colStyle}>
                      <Field label="Name" htmlFor="pl-name">
                        <input
                          id="pl-name"
                          className="input"
                          value={prevLandlord.name}
                          onChange={(e) => setPrevLandlord((p) => ({ ...p, name: e.target.value }))}
                        />
                      </Field>
                    </div>
                    <div style={colStyle}>
                      <Field label="Phone" htmlFor="pl-phone">
                        <input
                          id="pl-phone"
                          className="input"
                          value={prevLandlord.phone}
                          onChange={(e) => setPrevLandlord((p) => ({ ...p, phone: e.target.value }))}
                        />
                      </Field>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--ink)' }}>
                    Personal references
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                    Please provide one or two references who are not family members.
                  </div>
                  {personalRefs.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--radius-sm)',
                        padding: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                      }}
                    >
                      <div style={rowStyle}>
                        <div style={colStyle}>
                          <Field label="Name" htmlFor={`pr-name-${i}`}>
                            <input
                              id={`pr-name-${i}`}
                              className="input"
                              value={r.name}
                              onChange={(e) => updatePersonalRef(i, 'name', e.target.value)}
                            />
                          </Field>
                        </div>
                        <div style={colStyle}>
                          <Field label="Phone" htmlFor={`pr-phone-${i}`}>
                            <input
                              id={`pr-phone-${i}`}
                              className="input"
                              value={r.phone}
                              onChange={(e) => updatePersonalRef(i, 'phone', e.target.value)}
                            />
                          </Field>
                        </div>
                        <div style={colStyle}>
                          <Field label="Relationship" htmlFor={`pr-rel-${i}`}>
                            <input
                              id={`pr-rel-${i}`}
                              className="input"
                              value={r.relationship}
                              onChange={(e) => updatePersonalRef(i, 'relationship', e.target.value)}
                            />
                          </Field>
                        </div>
                      </div>
                      {personalRefs.length > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <Button variant="ghost" onClick={() => removePersonalRef(i)}>
                            Remove
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  {personalRefs.length < 2 && (
                    <div>
                      <Button variant="ghost" onClick={addPersonalRef}>
                        + Add reference
                      </Button>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--ink)' }}>
                    Screening consent
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                    Authorization is required to process your application. No checks are run in this
                    preview.
                  </div>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={consentCredit}
                      onChange={(e) => setConsentCredit(e.target.checked)}
                      style={{ marginTop: 3 }}
                    />
                    <span style={{ color: 'var(--ink)' }}>Authorize a credit check</span>
                  </label>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={consentCriminal}
                      onChange={(e) => setConsentCriminal(e.target.checked)}
                      style={{ marginTop: 3 }}
                    />
                    <span style={{ color: 'var(--ink)' }}>Authorize a criminal background check</span>
                  </label>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={consentRentalHistory}
                      onChange={(e) => setConsentRentalHistory(e.target.checked)}
                      style={{ marginTop: 3 }}
                    />
                    <span style={{ color: 'var(--ink)' }}>
                      Authorize verification of rental / eviction history
                    </span>
                  </label>
                </div>
              </div>
            )}

            {error && (
              <div
                style={{
                  marginTop: 18,
                  background: 'var(--danger-wash)',
                  color: 'var(--danger)',
                  border: '1px solid var(--danger)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px',
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}

            {/* Navigation */}
            <div
              style={{
                marginTop: 24,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div>
                {step > 1 && (
                  <Button variant="ghost" onClick={back} disabled={loading}>
                    Back
                  </Button>
                )}
              </div>
              <div>
                {step < 6 ? (
                  <Button variant="primary" onClick={next}>
                    Next
                  </Button>
                ) : (
                  <Button variant="primary" onClick={handleSubmit} loading={loading} disabled={loading}>
                    Submit application
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>

        <div style={{ marginTop: 18, textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)' }}>
          Already have an account?{' '}
          <a href="#/login" style={{ color: 'var(--primary)' }}>
            Sign in
          </a>
        </div>
      </div>
    </div>
  )
}
