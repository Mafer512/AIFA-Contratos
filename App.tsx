import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { Screen, User, UserRole } from './types';
import { supabase } from './services/supabaseClient';

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>(Screen.LOGIN);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check active session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        updateUserFromSession(session);
      } else {
        setLoading(false);
      }
    });

    // 2. Listen for auth changes (Login, Logout, Auto-refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        updateUserFromSession(session);
      } else {
        setCurrentUser(null);
        setCurrentScreen(Screen.LOGIN);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const updateUserFromSession = (session: any) => {
    const { user } = session;
    const meta = user.user_metadata;

    const appUser: User = {
      id: user.id,
      email: user.email || '',
      name: meta.full_name || user.email?.split('@')[0] || 'Usuario',
      role: (meta.role as UserRole) || UserRole.OPERATOR,
    };

    setCurrentUser(appUser);
    setCurrentScreen(Screen.DASHBOARD);
    setLoading(false);
  };

  const handleLoginSuccess = () => {
    // This is primarily redundant with onAuthStateChange, but kept for manual flow if needed
    // The state listener will handle the screen switch.
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // State listener will handle redirect
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="flex flex-col items-center">
          {/* NEW CONTRACT-PLANE LOGO FOR LOADING SCREEN */}
          <svg viewBox="0 0 240 120" className="h-24 w-auto mb-6 opacity-80" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="goldGradLoad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#C5A065" />
                <stop offset="100%" stopColor="#997842" />
              </linearGradient>
              <linearGradient id="greenGradLoad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#0F4C3A" />
                <stop offset="100%" stopColor="#082E23" />
              </linearGradient>
            </defs>
            <path d="M60 20 H 100 L 120 40 V 100 A 5 5 0 0 1 115 105 H 60 A 5 5 0 0 1 55 100 V 25 A 5 5 0 0 1 60 20" fill="white" stroke="url(#greenGradLoad)" strokeWidth="4"/>
            <path d="M100 20 V 40 H 120" fill="#E2E8F0" stroke="none" />
            <path d="M 90 90 C 110 90, 140 60, 160 50 L 190 45 L 180 55 L 165 60 L 195 75 L 185 85 L 150 75 C 130 85, 110 100, 90 90 Z" fill="url(#goldGradLoad)" stroke="white" strokeWidth="2"/>
          </svg>
          
          <div className="h-2 w-32 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-[#B38E5D] animate-[loading_1s_ease-in-out_infinite]"></div>
          </div>
          <style>{`
            @keyframes loading {
              0% { width: 0%; margin-left: 0; }
              50% { width: 100%; margin-left: 0; }
              100% { width: 0%; margin-left: 100%; }
            }
          `}</style>
        </div>
      </div>
    );
  }

  return (
    <div className="antialiased text-slate-900">
      {currentScreen === Screen.LOGIN && (
        <Login onLoginSuccess={handleLoginSuccess} />
      )}
      {currentScreen === Screen.DASHBOARD && currentUser && (
        <Dashboard user={currentUser} onLogout={handleLogout} />
      )}
    </div>
  );
};

export default App;