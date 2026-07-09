import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isConfigured } from './lib/supabase'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'

import Login from './pages/Login'
import Application from './pages/Application'
import PendingReview from './pages/PendingReview'
import Home from './pages/Home'
import Payments from './pages/Payments'
import MaintenanceList from './pages/MaintenanceList'
import MaintenanceNew from './pages/MaintenanceNew'
import AccountDetails from './pages/AccountDetails'
import AdminApplications from './pages/admin/Applications'

// --- Where a signed-in user belongs, given their profile ---
function homeFor(profile) {
  if (!profile) return '/login'
  if (profile.role === 'admin') return '/admin'
  if (profile.status === 'active' && profile.role === 'resident') return '/'
  return '/pending' // pending | declined
}

// --- Global states ---
function Spinner() {
  return (
    <div className="app-center">
      <div className="spinner" aria-label="Loading" role="status" />
    </div>
  )
}

function ConfigNeeded() {
  return (
    <div className="app-center">
      <div className="config-card">
        <h1>Configuration needed</h1>
        <p>
          This portal can&apos;t reach its backend yet. Set the two environment
          variables below in your hosting or local <code>.env</code> file, then
          rebuild.
        </p>
        <ul>
          <li><code>VITE_SUPABASE_URL</code></li>
          <li><code>VITE_SUPABASE_ANON_KEY</code></li>
        </ul>
        <p className="config-note">
          Both are public values, protected by Row-Level Security. Never add the
          service_role key here.
        </p>
      </div>
    </div>
  )
}

// Resolving = still loading, or signed in but profile not yet fetched
// (the brief signUp -> trigger-creates-profile window). Show a spinner.
function useResolving() {
  const { loading, session, profile } = useAuth()
  return loading || (Boolean(session) && !profile)
}

// --- Guards ---
function RequireAuth({ children }) {
  const resolving = useResolving()
  const { session } = useAuth()
  if (resolving) return <Spinner />
  if (!session) return <Navigate to="/login" replace />
  return children
}

function RequireActiveResident({ children }) {
  const resolving = useResolving()
  const { session, profile } = useAuth()
  if (resolving) return <Spinner />
  if (!session) return <Navigate to="/login" replace />
  if (profile.role === 'resident' && profile.status === 'active') return children
  return <Navigate to={homeFor(profile)} replace />
}

function RequireAdmin({ children }) {
  const resolving = useResolving()
  const { session, profile } = useAuth()
  if (resolving) return <Spinner />
  if (!session) return <Navigate to="/login" replace />
  if (profile.role === 'admin') return children
  return <Navigate to={homeFor(profile)} replace />
}

function RequireReview({ children }) {
  const resolving = useResolving()
  const { session, profile } = useAuth()
  if (resolving) return <Spinner />
  if (!session) return <Navigate to="/login" replace />
  if (profile.status !== 'active') return children
  return <Navigate to={homeFor(profile)} replace />
}

// /apply: public OR declined resident may enter; everyone else is routed home.
function RequireApplyAccess({ children }) {
  const resolving = useResolving()
  const { session, profile } = useAuth()
  if (resolving) return <Spinner />
  if (!session) return children
  if (profile.status === 'declined') return children
  return <Navigate to={homeFor(profile)} replace />
}

// /login: signed-in users are bounced to where they belong.
function LoginRoute() {
  const resolving = useResolving()
  const { session, profile } = useAuth()
  if (resolving) return <Spinner />
  if (session) return <Navigate to={homeFor(profile)} replace />
  return <Login />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route
        path="/apply"
        element={
          <RequireApplyAccess>
            <Application />
          </RequireApplyAccess>
        }
      />
      <Route
        path="/pending"
        element={
          <RequireReview>
            <PendingReview />
          </RequireReview>
        }
      />

      <Route
        path="/"
        element={
          <RequireActiveResident>
            <Layout><Home /></Layout>
          </RequireActiveResident>
        }
      />
      <Route
        path="/payments"
        element={
          <RequireActiveResident>
            <Layout><Payments /></Layout>
          </RequireActiveResident>
        }
      />
      <Route
        path="/maintenance"
        element={
          <RequireActiveResident>
            <Layout><MaintenanceList /></Layout>
          </RequireActiveResident>
        }
      />
      <Route
        path="/maintenance/new"
        element={
          <RequireActiveResident>
            <Layout><MaintenanceNew /></Layout>
          </RequireActiveResident>
        }
      />
      <Route
        path="/account"
        element={
          <RequireActiveResident>
            <Layout><AccountDetails /></Layout>
          </RequireActiveResident>
        }
      />

      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <Layout><AdminApplications /></Layout>
          </RequireAdmin>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  if (!isConfigured) return <ConfigNeeded />
  return (
    <AuthProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AuthProvider>
  )
}
