import Sidebar from './Sidebar'
import Topbar from './Topbar'

// Shell used by resident and admin pages alike. Sidebar/Topbar read
// profile.role internally to switch navigation, so the same Layout serves
// both the resident five pages and the admin console.
export default function Layout({ children }) {
  return (
    <div className="shell">
      <Sidebar />
      <div className="shell-main">
        <Topbar />
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
