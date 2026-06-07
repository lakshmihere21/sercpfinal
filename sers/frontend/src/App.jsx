import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';

import LandingPage     from './pages/public/LandingPage';
import AboutPage       from './pages/public/AboutPage';
import FeaturesPage    from './pages/public/FeaturesPage';
import ContactPage     from './pages/public/ContactPage';
import HelplinePage    from './pages/public/HelplinePage';
import LoginPage       from './pages/auth/LoginPage';
import RegisterPage    from './pages/auth/RegisterPage';

import CitizenDashboard      from './pages/citizen/Dashboard';
import SOSPage               from './pages/citizen/SOSPage';
import AlertTrackingPage     from './pages/citizen/AlertTrackingPage';
import EmergencyContactsPage from './pages/citizen/EmergencyContactsPage';
import CitizenProfilePage    from './pages/citizen/ProfilePage';

import ResponderDashboard from './pages/responder/Dashboard';
import ResponderMapPage   from './pages/responder/MapPage';

import VolunteerDashboard   from './pages/volunteer/Dashboard';
import VolunteerMapPage     from './pages/volunteer/MapPage';
import VolunteerAlertsPage  from './pages/volunteer/AlertsPage';
import VolunteerAlertDetail from './pages/volunteer/AlertDetailPage';
import VolunteerProfilePage from './pages/volunteer/ProfilePage';

import AdminDashboard    from './pages/admin/Dashboard';
import AdminAlertsPage   from './pages/admin/AlertsPage';
import AdminUsersPage    from './pages/admin/UsersPage';
import AdminAnalyticsPage from './pages/admin/AnalyticsPage';
import AdminResourcesPage from './pages/admin/ResourcesPage';

import AppLayout from './components/layout/AppLayout';

const ProtectedRoute = ({ children }) => {
  const { user, loading, initialized } = useAuth();
  if (loading || !initialized) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

const PublicRoute = ({ children }) => children;

const AppRoutes = () => (
  <Routes>
    <Route path="/"          element={<LandingPage />} />
    <Route path="/about"     element={<AboutPage />} />
    <Route path="/features"  element={<FeaturesPage />} />
    <Route path="/contact"   element={<ContactPage />} />
    <Route path="/helplines" element={<HelplinePage />} />
    <Route path="/login"     element={<PublicRoute><LoginPage /></PublicRoute>} />
    <Route path="/register"  element={<PublicRoute><RegisterPage /></PublicRoute>} />

    {/* Citizen */}
    <Route path="/citizen" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
      <Route index              element={<CitizenDashboard />} />
      <Route path="sos"         element={<SOSPage />} />
      <Route path="alerts/:id"  element={<AlertTrackingPage />} />
      <Route path="contacts"    element={<EmergencyContactsPage />} />
      <Route path="profile"     element={<CitizenProfilePage />} />
    </Route>

    {/* Responder */}
    <Route path="/responder" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
      <Route index          element={<ResponderDashboard />} />
      <Route path="map"     element={<ResponderMapPage />} />
      <Route path="profile" element={<CitizenProfilePage />} />
    </Route>

    {/* Volunteer */}
    <Route path="/volunteer" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
      <Route index               element={<VolunteerDashboard />} />
      <Route path="map"          element={<VolunteerMapPage />} />
      <Route path="alerts"       element={<VolunteerAlertsPage />} />
      <Route path="alerts/:id"   element={<VolunteerAlertDetail />} />
      <Route path="profile"      element={<VolunteerProfilePage />} />
    </Route>

    {/* Admin */}
    <Route path="/admin" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
      <Route index             element={<AdminDashboard />} />
      <Route path="alerts"     element={<AdminAlertsPage />} />
      <Route path="users"      element={<AdminUsersPage />} />
      <Route path="analytics"  element={<AdminAnalyticsPage />} />
      <Route path="resources"  element={<AdminResourcesPage />} />
    </Route>

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <AppRoutes />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
