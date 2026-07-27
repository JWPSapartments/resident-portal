import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHead, Card, Field, Button } from '../components/ui'

const GUARANTOR_REQUIRED = true // 客戶已確認：guarantor 必填

const BUILDING_OPTIONS = [
  { value: '1240_arthur', label: '1240 W Arthur Ave, Chicago, IL' },
  { value: '1243_arthur', label: '1243 W Arthur Ave, Chicago, IL' },
  { value: '6419_wayne', label: '6419 N Wayne Ave, Chicago, IL' },
]
const FLOOR_OPTIONS = [
  { value: 'garden', label: 'Garden Floor' },
  { value: 'first', label: 'First Floor' },
  { value: 'second', label: 'Second Floor' },
]
const ROOM_OPTIONS = ['A', 'B', 'C', 'D', 'E']
const ENROLLMENT_OPTIONS = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
]
const RELATIONSHIP_OPTIONS = ['Mom', 'Dad', 'Guardian', 'Other'] // Other → 顯示自由輸入
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']

const STEP_TITLES = [
  'Personal & contact',
  'Residency history',
  'School enrollment',
  'Guarantor / co-signer',
  'Co-applicants',
  'References & consent',
]

const SENSITIVE_COPY =
  'SSN / ITIN and ID verification are completed through our secure screening partner. They are not collected or stored in this portal.'

const EMPTY_ADDRESS = {
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  zip: '',
}

const rowStyle = { display: 'flex', flexWrap: 'wrap', gap: 14 }
const colStyle = { flex: '1 1 220px', minWidth: 0 }
const halfStyle = { flex: '1 1 0', minWidth: 0 }
const nameColStyle = { flex: '1 1 160px', minWidth: 0 }

function todayIsoDate() {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function todayLabel() {
  return new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

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

function SectionTitle({ children }) {
  return (
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--ink)' }}>
      {children}
    </div>
  )
}

/**
 * Normalized US address block: line1 / line2 / city / state / zip.
 * `value` is an object shaped like EMPTY_ADDRESS; `onChange(key, val)`.
 */
function AddressFields({ idPrefix, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Address line 1" htmlFor={`${idPrefix}-line1`}>
        <input
          id={`${idPrefix}-line1`}
          className="input"
          value={value.address_line1}
          onChange={(e) => onChange('address_line1', e.target.value)}
          placeholder="Street address"
        />
      </Field>
      <Field label="Address line 2 (optional)" htmlFor={`${idPrefix}-line2`}>
        <input
          id={`${idPrefix}-line2`}
          className="input"
          value={value.address_line2}
          onChange={(e) => onChange('address_line2', e.target.value)}
          placeholder="Apartment, suite, unit"
        />
      </Field>
      <div style={rowStyle}>
        <div style={colStyle}>
          <Field label="City" htmlFor={`${idPrefix}-city`}>
            <input
              id={`${idPrefix}-city`}
              className="input"
              value={value.city}
              onChange={(e) => onChange('city', e.target.value)}
            />
          </Field>
        </div>
        <div style={colStyle}>
          <Field label="State" htmlFor={`${idPrefix}-state`}>
            <select
              id={`${idPrefix}-state`}
              className="select"
              value={value.state}
              onChange={(e) => onChange('state', e.target.value)}
            >
              <option value="">Select a state</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div style={colStyle}>
          <Field label="ZIP" htmlFor={`${idPrefix}-zip`}>
            <input
              id={`${idPrefix}-zip`}
              className="input"
              value={value.zip}
              onChange={(e) => onChange('zip', e.target.value)}
              placeholder="60626"
            />
          </Field>
        </div>
      </div>
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
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState({ ...EMPTY_ADDRESS })
  const [desiredBuilding, setDesiredBuilding] = useState('')
  const [desiredFloor, setDesiredFloor] = useState('')
  const [desiredRoom, setDesiredRoom] = useState('')

  // Step 2 — residency history (no current address — collected in step 1)
  const [residency, setResidency] = useState({
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
    first_name: '',
    middle_name: '',
    last_name: '',
    relationship: '',
    relationship_other: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    zip: '',
    phone: '',
    email: '',
    employer: '',
    income: '',
    print_name_ack: '',
  })

  // Step 5 — co-applicants
  const [coApplicants, setCoApplicants] = useState([])

  // Step 6 — references + consent (no previous landlord)
  const [personalRefs, setPersonalRefs] = useState([{ name: '', phone: '', relationship: '' }])
  const [consentCredit, setConsentCredit] = useState(false)
  const [consentCriminal, setConsentCriminal] = useState(false)
  const [consentRentalHistory, setConsentRentalHistory] = useState(false)
  const [applicantPrintNameAck, setApplicantPrintNameAck] = useState('')

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

      setFirstName(data.first_name || '')
      setMiddleName(data.middle_name || '')
      setLastName(data.last_name || '')
      setDateOfBirth(data.date_of_birth || '')
      setPhone(data.phone || '')
      setAddress({
        address_line1: data.address_line1 || '',
        address_line2: data.address_line2 || '',
        city: data.city || '',
        state: data.state || '',
        zip: data.zip || '',
      })
      setDesiredBuilding(data.desired_building || '')
      setDesiredFloor(data.desired_floor || '')
      setDesiredRoom(data.desired_room || '')

      const rh = data.residency_history || {}
      setResidency({
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
      const storedRel = g.relationship || ''
      const isKnownRel = RELATIONSHIP_OPTIONS.includes(storedRel)
      setGuarantor({
        first_name: g.first_name || '',
        middle_name: g.middle_name || '',
        last_name: g.last_name || '',
        relationship: storedRel ? (isKnownRel ? storedRel : 'Other') : '',
        relationship_other: storedRel && !isKnownRel ? storedRel : '',
        address_line1: g.address_line1 || '',
        address_line2: g.address_line2 || '',
        city: g.city || '',
        state: g.state || '',
        zip: g.zip || '',
        phone: g.phone || '',
        email: g.email || '',
        employer: g.employer || '',
        income: g.income || '',
        print_name_ack: g.print_name_ack || '',
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
      // 重新送出時必須重新確認一次，不預填舊的 acknowledgment
      setApplicantPrintNameAck('')
    })()
    return () => {
      cancelled = true
    }
  }, [isResubmit, profile?.id])

  const updateAddress = (key, val) => setAddress((a) => ({ ...a, [key]: val }))
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

  // Proof of enrollment (required)
  const hasProof = !!proofFile || !!existingProofUrl

  function onProofChange(e) {
    const file = e.target.files?.[0] || null
    if (!file) {
      setProofFile(null)
      return
    }
    const type = file.type || ''
    const isAllowed = type.startsWith('image/') || type === 'application/pdf'
    if (!isAllowed) {
      setProofFile(null)
      e.target.value = ''
      setError('Please upload an image or a PDF file.')
      return
    }
    setError('')
    setProofFile(file)
  }

  function resolvedGuarantorRelationship() {
    return guarantor.relationship === 'Other'
      ? guarantor.relationship_other.trim()
      : guarantor.relationship
  }

  function validateStep(s) {
    if (s === 1) {
      if (!isResubmit) {
        if (!email.trim()) return 'Please enter your email address.'
        if (password.length < 8) return 'Password must be at least 8 characters.'
        if (password !== confirmPassword) return 'The passwords do not match.'
      }
      if (!firstName.trim()) return 'Please enter your first name.'
      if (!lastName.trim()) return 'Please enter your last name.'
      if (!dateOfBirth) return 'Please enter your date of birth.'
      if (!address.address_line1.trim()) return 'Please enter your address line 1.'
      if (!address.city.trim()) return 'Please enter your city.'
      if (!address.state) return 'Please select your state.'
      if (!address.zip.trim()) return 'Please enter your ZIP code.'
      if (!phone.trim()) return 'Please enter your phone number.'
      if (!desiredBuilding) return 'Please select the building you would like to apply for.'
      if (!desiredFloor) return 'Please select a floor.'
      if (!desiredRoom) return 'Please select a room.'
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
      if (!hasProof) return 'Please upload your proof of enrollment (image or PDF).'
      return null
    }
    if (s === 4) {
      if (GUARANTOR_REQUIRED) {
        if (!guarantor.first_name.trim()) return 'Please enter the guarantor first name.'
        if (!guarantor.last_name.trim()) return 'Please enter the guarantor last name.'
        if (!guarantor.relationship) return 'Please select the guarantor relationship.'
        if (guarantor.relationship === 'Other' && !guarantor.relationship_other.trim())
          return 'Please describe the guarantor relationship.'
        if (!guarantor.address_line1.trim()) return 'Please enter the guarantor address line 1.'
        if (!guarantor.city.trim()) return 'Please enter the guarantor city.'
        if (!guarantor.state) return 'Please select the guarantor state.'
        if (!guarantor.zip.trim()) return 'Please enter the guarantor ZIP code.'
        if (!guarantor.phone.trim()) return 'Please enter the guarantor phone number.'
        if (!guarantor.email.trim()) return 'Please enter the guarantor email.'
        if (!guarantor.employer.trim()) return 'Please enter the guarantor employer.'
        if (!String(guarantor.income).trim()) return 'Please enter the guarantor income.'
        if (!guarantor.print_name_ack.trim())
          return 'Please have the guarantor print their full name to acknowledge.'
      }
      return null
    }
    if (s === 5) {
      return null
    }
    if (s === 6) {
      if (!consentCredit || !consentCriminal || !consentRentalHistory)
        return 'You must authorize all three screening checks to submit your application.'
      if (!applicantPrintNameAck.trim())
        return 'Please print your full name to acknowledge and submit your application.'
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
    if (!proofFile) {
      if (existingProofUrl) return existingProofUrl
      throw new Error('Proof of enrollment is required. Please upload an image or PDF.')
    }
    const parts = proofFile.name.split('.')
    const ext = parts.length > 1 ? parts.pop() : 'dat'
    const path = `${userId}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('enrollment-proofs').upload(path, proofFile)
    if (upErr) throw upErr
    return path
  }

  function buildPayload(proofUrl) {
    const ackDate = todayIsoDate()
    return {
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      address_line1: address.address_line1,
      address_line2: address.address_line2,
      city: address.city,
      state: address.state,
      zip: address.zip,
      phone,
      email: isResubmit ? profileEmail : email,
      date_of_birth: dateOfBirth,
      desired_building: desiredBuilding,
      desired_floor: desiredFloor,
      desired_room: desiredRoom,
      // 敏感欄位（ssn_or_itin / drivers_license）永不蒐集、永不出現在 payload
      residency_history: {
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
        first_name: guarantor.first_name,
        middle_name: guarantor.middle_name,
        last_name: guarantor.last_name,
        relationship: resolvedGuarantorRelationship(),
        address_line1: guarantor.address_line1,
        address_line2: guarantor.address_line2,
        city: guarantor.city,
        state: guarantor.state,
        zip: guarantor.zip,
        phone: guarantor.phone,
        email: guarantor.email,
        employer: guarantor.employer,
        income: guarantor.income,
        print_name_ack: guarantor.print_name_ack,
        ack_date: guarantor.print_name_ack.trim() ? ackDate : null,
        // guarantor_ssn 永不蒐集、永不出現在 payload
      },
      guarantor_required: GUARANTOR_REQUIRED,
      co_applicants: coApplicants,
      references: {
        personal: personalRefs,
      },
      consent_credit: consentCredit,
      consent_criminal: consentCriminal,
      consent_rental_history: consentRentalHistory,
      consent_at: new Date().toISOString(),
      applicant_print_name_ack: applicantPrintNameAck,
      applicant_ack_date: applicantPrintNameAck.trim() ? ackDate : null,
    }
  }

  async function handleSubmit() {
    for (let s = 1; s <= 6; s += 1) {
      const stepErr = validateStep(s)
      if (stepErr) {
        setError(stepErr)
        setStep(s)
        return
      }
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
        const { error: signErr } = await signUp(email, password, {
          first_name: firstName,
          last_name: lastName,
        })
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

                <div style={rowStyle}>
                  <div style={nameColStyle}>
                    <Field label="First name" htmlFor="app-first">
                      <input
                        id="app-first"
                        className="input"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                      />
                    </Field>
                  </div>
                  <div style={nameColStyle}>
                    <Field label="Middle name (optional)" htmlFor="app-middle">
                      <input
                        id="app-middle"
                        className="input"
                        value={middleName}
                        onChange={(e) => setMiddleName(e.target.value)}
                      />
                    </Field>
                  </div>
                  <div style={nameColStyle}>
                    <Field label="Last name" htmlFor="app-last">
                      <input
                        id="app-last"
                        className="input"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                      />
                    </Field>
                  </div>
                </div>

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

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <SectionTitle>Current address</SectionTitle>
                  <AddressFields idPrefix="app-addr" value={address} onChange={updateAddress} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <SectionTitle>Where you'd like to live</SectionTitle>
                  <Field label="Building" htmlFor="app-building">
                    <select
                      id="app-building"
                      className="select"
                      value={desiredBuilding}
                      onChange={(e) => setDesiredBuilding(e.target.value)}
                    >
                      <option value="">Select a building</option>
                      {BUILDING_OPTIONS.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div style={rowStyle}>
                    <div style={colStyle}>
                      <Field label="Floor" htmlFor="app-floor">
                        <select
                          id="app-floor"
                          className="select"
                          value={desiredFloor}
                          onChange={(e) => setDesiredFloor(e.target.value)}
                        >
                          <option value="">Select a floor</option>
                          {FLOOR_OPTIONS.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </select>
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
                </div>

                <SensitiveBlock>{SENSITIVE_COPY}</SensitiveBlock>
              </div>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

                <Field label="Monthly rent" htmlFor="res-rent">
                  <input
                    id="res-rent"
                    className="input"
                    value={residency.monthly_rent}
                    onChange={(e) => updateResidency('monthly_rent', e.target.value)}
                    placeholder="e.g. 850"
                  />
                </Field>

                <div style={rowStyle}>
                  <div style={halfStyle}>
                    <Field label="Move-in date (current residence)" htmlFor="res-in">
                      <input
                        id="res-in"
                        className="input"
                        type="date"
                        value={residency.move_in}
                        onChange={(e) => updateResidency('move_in', e.target.value)}
                      />
                    </Field>
                  </div>
                  <div style={halfStyle}>
                    <Field
                      label="Move-out date (leave blank if you still live here)"
                      htmlFor="res-out"
                    >
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

                <Field
                  label="Prior address (only if you've lived at your current address less than 2 years)"
                  htmlFor="res-prior"
                >
                  <textarea
                    id="res-prior"
                    className="textarea"
                    value={residency.prior_address}
                    onChange={(e) => updateResidency('prior_address', e.target.value)}
                    placeholder="Street, city, state, ZIP — optional"
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
                <Field label="Proof of enrollment" htmlFor="sch-proof">
                  <input
                    id="sch-proof"
                    className="input"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={onProofChange}
                  />
                </Field>
                {proofFile && (
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                    Selected: {proofFile.name}
                  </div>
                )}
                {existingProofUrl && !proofFile && (
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                    A proof file is already on record. Choosing a new file will replace it.
                  </div>
                )}
                <div style={{ fontSize: 13, color: 'var(--ink-faint)' }}>
                  Required. Upload a class schedule, enrollment verification letter, or student
                  account screenshot as an image or PDF.
                </div>
              </div>
            )}

            {/* STEP 4 */}
            {step === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: 14, color: 'var(--ink-soft)' }}>
                  A guarantor is required for every applicant.
                </div>

                <div style={rowStyle}>
                  <div style={nameColStyle}>
                    <Field label="First name" htmlFor="g-first">
                      <input
                        id="g-first"
                        className="input"
                        value={guarantor.first_name}
                        onChange={(e) => updateGuarantor('first_name', e.target.value)}
                      />
                    </Field>
                  </div>
                  <div style={nameColStyle}>
                    <Field label="Middle name (optional)" htmlFor="g-middle">
                      <input
                        id="g-middle"
                        className="input"
                        value={guarantor.middle_name}
                        onChange={(e) => updateGuarantor('middle_name', e.target.value)}
                      />
                    </Field>
                  </div>
                  <div style={nameColStyle}>
                    <Field label="Last name" htmlFor="g-last">
                      <input
                        id="g-last"
                        className="input"
                        value={guarantor.last_name}
                        onChange={(e) => updateGuarantor('last_name', e.target.value)}
                      />
                    </Field>
                  </div>
                </div>

                <div style={rowStyle}>
                  <div style={colStyle}>
                    <Field label="Relationship to applicant" htmlFor="g-rel">
                      <select
                        id="g-rel"
                        className="select"
                        value={guarantor.relationship}
                        onChange={(e) => updateGuarantor('relationship', e.target.value)}
                      >
                        <option value="">Select a relationship</option>
                        {RELATIONSHIP_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  {guarantor.relationship === 'Other' && (
                    <div style={colStyle}>
                      <Field label="Please describe" htmlFor="g-rel-other">
                        <input
                          id="g-rel-other"
                          className="input"
                          value={guarantor.relationship_other}
                          onChange={(e) => updateGuarantor('relationship_other', e.target.value)}
                          placeholder="e.g. Aunt"
                        />
                      </Field>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <SectionTitle>Guarantor address</SectionTitle>
                  <AddressFields
                    idPrefix="g-addr"
                    value={{
                      address_line1: guarantor.address_line1,
                      address_line2: guarantor.address_line2,
                      city: guarantor.city,
                      state: guarantor.state,
                      zip: guarantor.zip,
                    }}
                    onChange={updateGuarantor}
                  />
                </div>

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
                        placeholder="Annual income"
                      />
                    </Field>
                  </div>
                </div>

                <SensitiveBlock>{SENSITIVE_COPY}</SensitiveBlock>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                    By printing your full name below, you acknowledge your intent to guarantee this
                    lease. (A legally binding e-signature will be collected in the live version.)
                  </div>
                  <Field label="Print name for acknowledgment" htmlFor="g-ack">
                    <input
                      id="g-ack"
                      className="input"
                      value={guarantor.print_name_ack}
                      onChange={(e) => updateGuarantor('print_name_ack', e.target.value)}
                      placeholder="Guarantor full name"
                    />
                  </Field>
                  <div style={{ fontSize: 13, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>
                    Date: {todayLabel()}
                  </div>
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
                  <SectionTitle>Personal references</SectionTitle>
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
                  <SectionTitle>Screening consent</SectionTitle>
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <SectionTitle>Acknowledgment</SectionTitle>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                    By printing your full name below, you confirm that the information in this
                    application is true and complete, and you agree to the authorizations above.
                  </div>
                  <Field label="Print name for acknowledgment" htmlFor="app-ack">
                    <input
                      id="app-ack"
                      className="input"
                      value={applicantPrintNameAck}
                      onChange={(e) => setApplicantPrintNameAck(e.target.value)}
                      placeholder="Your full name"
                    />
                  </Field>
                  <div style={{ fontSize: 13, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>
                    Date: {todayLabel()}
                  </div>
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
