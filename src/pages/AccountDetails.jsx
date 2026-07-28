import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHead, Card, CardHead, Field, Button, StatusPill } from '../components/ui'
import { formatAddress } from '../lib/format'

function ReadOnlyRow({ label, value }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, color: 'var(--ink-faint)', marginBottom: 4 }}>{label}</div>
      <div style={{ color: 'var(--ink-soft)', fontSize: 15 }}>
        {value === null || value === undefined || value === '' ? '—' : value}
      </div>
    </div>
  )
}

function SaveRow({ onSave, loading, disabled, message }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
      <Button variant="primary" onClick={onSave} loading={loading} disabled={disabled}>
        Save
      </Button>
      {message && (
        <span
          style={{
            fontSize: 14,
            color: message.type === 'ok' ? 'var(--success)' : 'var(--danger)',
          }}
        >
          {message.text}
        </span>
      )}
    </div>
  )
}

export default function AccountDetails() {
  const { profile, refreshProfile } = useAuth()

  // Profile
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState(null)

  // Vehicle
  const [vMake, setVMake] = useState(profile?.vehicle_make ?? '')
  const [vModel, setVModel] = useState(profile?.vehicle_model ?? '')
  const [vColor, setVColor] = useState(profile?.vehicle_color ?? '')
  const [vPlate, setVPlate] = useState(profile?.vehicle_plate ?? '')
  const [vYear, setVYear] = useState(profile?.vehicle_year ?? '')
  const [savingVehicle, setSavingVehicle] = useState(false)
  const [vehicleMsg, setVehicleMsg] = useState(null)

  // Preferences
  const [notifyEmail, setNotifyEmail] = useState(profile?.notify_email ?? false)
  const [payMethod, setPayMethod] = useState(profile?.payment_method_label ?? '')
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [prefsMsg, setPrefsMsg] = useState(null)

  if (!profile) {
    return (
      <div className="card-pad" style={{ color: 'var(--ink-soft)' }}>
        Loading…
      </div>
    )
  }

  const profileDirty = phone !== (profile.phone ?? '')

  const vehicleDirty =
    vMake !== (profile.vehicle_make ?? '') ||
    vModel !== (profile.vehicle_model ?? '') ||
    vColor !== (profile.vehicle_color ?? '') ||
    vPlate !== (profile.vehicle_plate ?? '') ||
    String(vYear ?? '') !== String(profile.vehicle_year ?? '')

  const prefsDirty =
    notifyEmail !== (profile.notify_email ?? false) ||
    payMethod !== (profile.payment_method_label ?? '')

  async function saveProfile() {
    setSavingProfile(true)
    setProfileMsg(null)
    const { error } = await supabase
      .from('profiles')
      .update({ phone })
      .eq('id', profile.id)
    setSavingProfile(false)
    if (error) {
      setProfileMsg({ type: 'err', text: 'Could not save. Please try again.' })
      return
    }
    await refreshProfile()
    setProfileMsg({ type: 'ok', text: 'Saved.' })
  }

  async function saveVehicle() {
    setSavingVehicle(true)
    setVehicleMsg(null)
    const { error } = await supabase
      .from('profiles')
      .update({
        vehicle_make: vMake,
        vehicle_model: vModel,
        vehicle_color: vColor,
        vehicle_plate: vPlate,
        vehicle_year: vYear === '' || vYear === null ? null : vYear,
      })
      .eq('id', profile.id)
    setSavingVehicle(false)
    if (error) {
      setVehicleMsg({ type: 'err', text: 'Could not save. Please try again.' })
      return
    }
    await refreshProfile()
    setVehicleMsg({ type: 'ok', text: 'Saved.' })
  }

  async function savePreferences() {
    setSavingPrefs(true)
    setPrefsMsg(null)
    const { error } = await supabase
      .from('profiles')
      .update({
        notify_email: notifyEmail,
        payment_method_label: payMethod,
      })
      .eq('id', profile.id)
    setSavingPrefs(false)
    if (error) {
      setPrefsMsg({ type: 'err', text: 'Could not save. Please try again.' })
      return
    }
    await refreshProfile()
    setPrefsMsg({ type: 'ok', text: 'Saved.' })
  }

  // Name is stored as three columns now; middle name is optional.
  const fullName = [profile.first_name, profile.middle_name, profile.last_name]
    .filter(Boolean)
    .join(' ')

  // building / floor are codes in the DB — render them as readable labels.
  // Missing parts are dropped rather than shown as blanks.
  const residence = formatAddress(profile)

  return (
    <>
      <PageHead title="Account" subtitle="Your profile, vehicle and preferences" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Card 1: Profile (full width) */}
        <Card>
          <CardHead title="Profile" />
          <div className="card-pad">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 32px' }}>
              <div style={{ flex: '1 1 220px' }}>
                <ReadOnlyRow label="Full name" value={fullName} />
                <ReadOnlyRow label="Email" value={profile.email} />
                <ReadOnlyRow label="Residence" value={residence} />
              </div>
              <div style={{ flex: '1 1 220px' }}>
                <ReadOnlyRow label="Move-in date" value={profile.move_in_date} />
                <div style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--ink-faint)',
                      marginBottom: 4,
                    }}
                  >
                    Account status
                  </div>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '3px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--success-wash)',
                      color: 'var(--success)',
                      fontSize: 13,
                      fontWeight: 600,
                      textTransform: 'capitalize',
                    }}
                  >
                    {profile.status || 'active'}
                  </span>
                </div>
              </div>
            </div>

            <div
              style={{
                borderTop: '1px solid var(--line)',
                margin: '6px 0 18px',
              }}
            />

            <div style={{ maxWidth: 360 }}>
              <Field label="Phone" htmlFor="acct-phone">
                <input
                  id="acct-phone"
                  className="input"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(217) 555-0100"
                />
              </Field>
            </div>

            <SaveRow
              onSave={saveProfile}
              loading={savingProfile}
              disabled={savingProfile || !profileDirty}
              message={profileMsg}
            />
          </div>
        </Card>

        {/* Cards 2 & 3 side-by-side, reflow to single column on narrow screens */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
          {/* Card 2: Vehicle */}
          <div style={{ flex: '1 1 340px' }}>
            <Card>
              <CardHead title="Vehicle" />
              <div className="card-pad">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                  <div style={{ flex: '1 1 150px' }}>
                    <Field label="Make" htmlFor="v-make">
                      <input
                        id="v-make"
                        className="input"
                        value={vMake}
                        onChange={(e) => setVMake(e.target.value)}
                      />
                    </Field>
                  </div>
                  <div style={{ flex: '1 1 150px' }}>
                    <Field label="Model" htmlFor="v-model">
                      <input
                        id="v-model"
                        className="input"
                        value={vModel}
                        onChange={(e) => setVModel(e.target.value)}
                      />
                    </Field>
                  </div>
                  <div style={{ flex: '1 1 150px' }}>
                    <Field label="Color" htmlFor="v-color">
                      <input
                        id="v-color"
                        className="input"
                        value={vColor}
                        onChange={(e) => setVColor(e.target.value)}
                      />
                    </Field>
                  </div>
                  <div style={{ flex: '1 1 150px' }}>
                    <Field label="Plate" htmlFor="v-plate">
                      <input
                        id="v-plate"
                        className="input"
                        value={vPlate}
                        onChange={(e) => setVPlate(e.target.value)}
                      />
                    </Field>
                  </div>
                  <div style={{ flex: '1 1 150px' }}>
                    <Field label="Year" htmlFor="v-year">
                      <input
                        id="v-year"
                        className="input"
                        type="text"
                        inputMode="numeric"
                        value={vYear ?? ''}
                        onChange={(e) => setVYear(e.target.value)}
                      />
                    </Field>
                  </div>
                </div>

                <SaveRow
                  onSave={saveVehicle}
                  loading={savingVehicle}
                  disabled={savingVehicle || !vehicleDirty}
                  message={vehicleMsg}
                />
              </div>
            </Card>
          </div>

          {/* Card 3: Preferences */}
          <div style={{ flex: '1 1 340px' }}>
            <Card>
              <CardHead title="Preferences" />
              <div className="card-pad">
                <div style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--ink-faint)',
                      marginBottom: 10,
                    }}
                  >
                    Notifications
                  </div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={notifyEmail}
                      onChange={(e) => setNotifyEmail(e.target.checked)}
                    />
                    <span style={{ fontSize: 15, color: 'var(--ink)' }}>
                      Email notifications
                    </span>
                  </label>
                </div>

                <Field label="Payment method" htmlFor="pay-method">
                  <input
                    id="pay-method"
                    className="input"
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    placeholder="ACH •••• 4321"
                  />
                </Field>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--ink-faint)',
                    marginTop: 6,
                  }}
                >
                  Simulated — Stripe payment method in the live version.
                </div>

                <SaveRow
                  onSave={savePreferences}
                  loading={savingPrefs}
                  disabled={savingPrefs || !prefsDirty}
                  message={prefsMsg}
                />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}
