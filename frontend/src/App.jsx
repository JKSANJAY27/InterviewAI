import { Routes, Route, NavLink } from 'react-router-dom'
import InterviewPage from './pages/InterviewPage'
import DashboardPage from './pages/DashboardPage'

function Nav() {
  return (
    <nav className="nav">
      <span className="nav__logo">
        Interview<span>AI</span>
      </span>
      <NavLink
        to="/"
        end
        className={({ isActive }) => `nav__link${isActive ? ' active' : ''}`}
      >
        Interview
      </NavLink>
      <NavLink
        to="/dashboard"
        className={({ isActive }) => `nav__link${isActive ? ' active' : ''}`}
      >
        Analytics
      </NavLink>
    </nav>
  )
}

export default function App() {
  return (
    <div className="page">
      <Nav />
      <Routes>
        <Route path="/" element={<InterviewPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
      </Routes>
    </div>
  )
}
