import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// When either value is missing we must not crash the app. App.jsx checks
// isConfigured first and renders a "Configuration needed" screen, so the
// null client below is never actually used in that state.
export const isConfigured = Boolean(url && anonKey)

export const supabase = isConfigured ? createClient(url, anonKey) : null
