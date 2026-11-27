import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Landing from './pages/Landing.jsx';
import Register from './pages/Register.jsx';
import VerifyOtp from './pages/VerifyOtp.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CaseShell from './pages/CaseShell.jsx';
import Support from './pages/Support.jsx';
import Assistant from './pages/Assistant.jsx';
import RequestWorkspace from './pages/RequestWorkspace.jsx';
import LawyerHome from './pages/LawyerHome.jsx';
import LawyerProfile from './pages/LawyerProfile.jsx';
import AdminShell from './pages/AdminShell.jsx';
import { useAuth } from './auth.jsx';
import { homeFor } from './roles.js';


function Protected({ roles, children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify" element={<VerifyOtp />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cases" element={<Protected roles={['VICTIM']}><Dashboard /></Protected>} />
        <Route path="/cases/:caseId/*" element={<Protected roles={['VICTIM']}><CaseShell /></Protected>} />
        <Route path="/support" element={<Protected roles={['VICTIM']}><Support /></Protected>} />
        <Route path="/assistant" element={<Protected roles={['VICTIM']}><Assistant /></Protected>} />
        <Route path="/requests/:requestId" element={<Protected roles={['VICTIM']}><RequestWorkspace side="VICTIM" /></Protected>} />
        <Route path="/lawyer" element={<Protected roles={['LAWYER']}><LawyerHome /></Protected>} />
        <Route path="/lawyer/profile" element={<Protected roles={['LAWYER']}><LawyerProfile /></Protected>} />
        <Route path="/lawyer/requests/:requestId" element={<Protected roles={['LAWYER']}><RequestWorkspace side="LAWYER" /></Protected>} />
        <Route path="/admin/*" element={<Protected roles={['ADMIN']}><AdminShell /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
