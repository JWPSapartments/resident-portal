import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHead, Card, Button, Field } from '../components/ui'

const CATEGORIES = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'appliance', label: 'Appliance' },
  { value: 'general', label: 'General' },
]

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export default function MaintenanceNew() {
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [category, setCategory] = useState('plumbing')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function onPickFile(e) {
    setError('')
    const f = e.target.files && e.target.files[0]
    if (!f) return

    if (!f.type.startsWith('image/')) {
      setError('Please choose an image file.')
      e.target.value = ''
      return
    }
    if (f.size > MAX_BYTES) {
      setError('That image is a bit large. Please choose one under 10 MB.')
      e.target.value = ''
      return
    }

    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
  }

  function clearPhoto() {
    setFile(null)
    setPreviewUrl('')
  }

  async function handleSubmit() {
    setError('')

    const trimmed = description.trim()
    if (!trimmed) {
      setError('Please describe the issue before submitting.')
      return
    }

    if (!profile?.id) {
      setError('Your session isn’t ready yet. Please refresh and try again.')
      return
    }

    setSubmitting(true)

    let photoPath = null
    if (file) {
      const ext = file.name.split('.').pop()
      const path = `${profile.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('maintenance-photos')
        .upload(path, file)

      if (upErr) {
        setSubmitting(false)
        setError('We couldn’t upload your photo. Please try again.')
        return
      }
      photoPath = path
    }

    const { error: insErr } = await supabase.from('maintenance_requests').insert({
      resident_id: profile.id,
      category,
      description: trimmed,
      photo_url: photoPath,
      status: 'submitted',
    })

    if (insErr) {
      setSubmitting(false)
      setError('We couldn’t submit your request. Please try again.')
      return
    }

    navigate('/maintenance')
  }

  return (
    <>
      <PageHead title="New maintenance request" subtitle="Tell us what needs fixing" />

      <div style={{ maxWidth: 560 }}>
        <Card>
          <div className="card-pad">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <Field label="Category" htmlFor="mnt-category">
                <select
                  id="mnt-category"
                  className="select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Description" htmlFor="mnt-description">
                <textarea
                  id="mnt-description"
                  className="textarea"
                  rows={5}
                  placeholder="Describe the issue and its location"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>

              <Field label="Photo (optional)" htmlFor="mnt-photo">
                {previewUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <img
                      src={previewUrl}
                      alt="Selected"
                      style={{
                        width: 64,
                        height: 64,
                        objectFit: 'cover',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--line)',
                        display: 'block',
                      }}
                    />
                    <Button variant="ghost" onClick={clearPhoto}>
                      Remove
                    </Button>
                  </div>
                ) : (
                  <input
                    id="mnt-photo"
                    className="input"
                    type="file"
                    accept="image/*"
                    onChange={onPickFile}
                  />
                )}
              </Field>

              {error ? <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p> : null}

              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                <Button variant="primary" onClick={handleSubmit} loading={submitting}>
                  Submit request
                </Button>
                <Button variant="ghost" onClick={() => navigate('/maintenance')} disabled={submitting}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  )
}
