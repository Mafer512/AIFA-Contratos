import React, { useState, useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { Screen, User, UserRole } from './types';
import { supabase } from './services/supabaseClient';

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>(Screen.LOGIN);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const forceLoginRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace('#', ''));
    const queryParams = url.searchParams;

    const confirmationType = hashParams.get('type') || queryParams.get('type');
    const confirmationMessage = hashParams.get('message') || queryParams.get('message');
    const isSignupConfirmation = confirmationType === 'signup' || confirmationMessage === 'Confirmation complete';

    if (isSignupConfirmation) {
      forceLoginRef.current = true;
      setAuthNotice('¡Tu correo fue confirmado con éxito! Ya puedes acceder al sistema.');
      setCurrentScreen(Screen.LOGIN);
      setCurrentUser(null);

      const cleanUrl = `${url.origin}${url.pathname}`;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (forceLoginRef.current) {
        if (session) {
          try {
            await supabase.auth.signOut();
          } catch (error) {
            console.error('Error closing confirmation session:', error);
          }
        }
        setLoading(false);
        forceLoginRef.current = false;
        return;
      }

      syncSession(session);
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (forceLoginRef.current) {
        if (session) {
          try {
            await supabase.auth.signOut();
          } catch (error) {
            console.error('Error closing confirmation session:', error);
          }
          return;
        }
        setCurrentUser(null);
        setCurrentScreen(Screen.LOGIN);
        setLoading(false);
        forceLoginRef.current = false;
        return;
      }

      syncSession(session);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const syncSession = async (session: Session | null) => {
    if (!session) {
      setCurrentUser(null);
      setCurrentScreen(Screen.LOGIN);
      setLoading(false);
      return;
    }

    const { user } = session;
    const meta = user.user_metadata ?? {};

    let fullName = meta.full_name || user.email?.split('@')[0] || 'Usuario';
    let role: UserRole = (meta.role as UserRole) || UserRole.OPERATOR;

    try {
      const { data: profile, error } = await supabase
        .schema('public')
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile data:', error.message);
      }

      if (profile) {
        if (profile.full_name && typeof profile.full_name === 'string') {
          fullName = profile.full_name;
        }

        if (profile.role) {
          const normalizedRole = String(profile.role).toUpperCase();
          const validRoles = Object.values(UserRole) as string[];
          if (validRoles.includes(normalizedRole)) {
            role = normalizedRole as UserRole;
          }
        }
      }
    } catch (error) {
      console.error('Unexpected error fetching profile:', error);
    }

    const appUser: User = {
      id: user.id,
      email: user.email || '',
      name: fullName,
      role,
    };

    setCurrentUser(appUser);
    setCurrentScreen(Screen.DASHBOARD);
    setAuthNotice(null);
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
        <Login onLoginSuccess={handleLoginSuccess} externalSuccessMessage={authNotice ?? undefined} />
      )}
      {currentScreen === Screen.DASHBOARD && currentUser && (
        <Dashboard user={currentUser} onLogout={handleLogout} />
      )}
    </div>
  );
};

export default App;