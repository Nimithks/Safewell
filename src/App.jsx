import React, { useState, useEffect } from 'react';
import SafeWellAuthPage from './components/safewell-auth.jsx';
import SafeWellDashboard from './components/safewell-dashboard.jsx';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Check login status on mount
  useEffect(() => {
    const token = window.sessionStorage.getItem('safewell-session-token');
    setIsLoggedIn(!!token);
  }, []);

  const handleLoginSuccess = () => {
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    window.sessionStorage.removeItem('safewell-session-token');
    window.sessionStorage.removeItem('safewell-active-profile');
    setIsLoggedIn(false);
  };

  return (
    <div className="app-root">
      {isLoggedIn ? (
        <SafeWellDashboard onSignOut={handleLogout} />
      ) : (
        <SafeWellAuthPage onLoginSuccess={handleLoginSuccess} />
      )}
    </div>
  );
}
