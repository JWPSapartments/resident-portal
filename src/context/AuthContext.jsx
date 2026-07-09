import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (uid) => {
    if (!uid) {
      setProfile(null)
      return
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle()
    if (error) {
      setProfile(null)
      return
    }
    setProfile(data ?? null)
  }, [])

  // Initial session resolution.
  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const s = data?.session ?? null
      if (!active) return
      setSession(s)
      setUser(s?.user ?? null)
      await loadProfile(s?.user?.id)
      if (active) setLoading(false)
    })()

    // React to sign-in / sign-out. On any auth change we re-resolve the
    // profile and hold `loading` true meanwhile, so guards show a spinner
    // during the brief signUp -> trigger-creates-profile window rather than
    // routing on a null profile.
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setLoading(true)
      setSession(s ?? null)
      setUser(s?.user ?? null)
      await loadProfile(s?.user?.id)
      setLoading(false)
    })

    return () => {
      active = false
      sub?.subscription?.unsubscribe?.()
    }
  }, [loadProfile])

  const signUp = useCallback((email, password, { full_name } = {}) =>
    supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name } },
    }), [])

  const signIn = useCallback((email, password) =>
    supabase.auth.signInWithPassword({ email, password }), [])

  const signOut = useCallback(() => supabase.auth.signOut(), [])

  const refreshProfile = useCallback(() => loadProfile(user?.id), [loadProfile, user])

  const value = {
    session,
    user,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
