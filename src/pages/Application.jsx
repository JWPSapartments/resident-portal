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

                <div
