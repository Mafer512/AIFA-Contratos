import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, User, Lock, Mail, UserPlus, AlertTriangle, CheckCircle, Key, Eye, EyeOff, ShieldCheck, Info } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

// === CONFIGURACIÓN DE IMÁGENES ===
const AIFA_ASSETS = {
  // Tu imagen de fondo aérea
  background: "https://images.unsplash.com/photo-1626116189797-4482f44a6499?q=80&w=1974&auto=format&fit=crop",
  
  // Escudo de Slots (Placeholder)
  badge: "https://via.placeholder.com/150/000000/FFFFFF/?text=SLOTS" 
};

// === COMPONENTE DE LOGO (IMAGEN PNG) ===
const AifaLogo = ({ className = "h-32 w-auto" }: { className?: string }) => (
  <img
    src="/images/aifa-logo.png"
    alt="Logotipo AIFA"
    className={className}
    loading="lazy"
  />
);

type HighlightItem = {
  icon: React.ElementType;
  title: string;
};

const LOGIN_HIGHLIGHTS: HighlightItem[] = [
  {
    icon: ShieldCheck,
    title: 'Control Estratégico'
  },
  {
    icon: CheckCircle,
    title: 'Procesos Integrados'
  },
  {
    icon: Info,
    title: 'Insights Inteligentes'
  }
];

interface LoginProps {
  onLoginSuccess: () => void;
  externalSuccessMessage?: string;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess, externalSuccessMessage }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState(''); 
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const planeGradientId = useMemo(() => `login-plane-gradient-${Math.random().toString(36).slice(2, 10)}`, []);
  const planeGlowId = useMemo(() => `login-plane-glow-${Math.random().toString(36).slice(2, 10)}`, []);
  const planeSparkId = useMemo(() => `login-plane-spark-${Math.random().toString(36).slice(2, 10)}`, []);
  
  // Estado para mensajes de error más detallados
  const [errorHeader, setErrorHeader] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  
  const [successMessage, setSuccessMessage] = useState('');
  const [successTitle, setSuccessTitle] = useState('Registro Exitoso');
  const [showApiKeyHelp, setShowApiKeyHelp] = useState(false);

  useEffect(() => {
    if (!externalSuccessMessage) return;
    setSuccessMessage(externalSuccessMessage);
    setSuccessTitle('Cuenta confirmada');
    setIsRegistering(false);
    setErrorHeader('');
    setErrorDetail('');
    setShowApiKeyHelp(false);
  }, [externalSuccessMessage]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorHeader('');
    setErrorDetail('');
    setSuccessMessage('');
    setShowApiKeyHelp(false);

    const normalizedEmail = email.trim().toLowerCase();

    try {
      if (isRegistering) {
        const currentUrl = window.location.origin;
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: currentUrl,
            data: {
              full_name: fullName,
              role: 'OPERATOR'
            }
          }
        });

        if (error) throw error;
        
        if (data.user) {
          try {
            await supabase
              .schema('public')
              .from('profiles')
              .upsert(
                {
                  id: data.user.id,
                  full_name: fullName,
                  role: 'OPERATOR'
                },
                { onConflict: 'id' }
              );
          } catch (profileError) {
            console.error('Error syncing profile record:', profileError);
          }
        }

        if (data.user && !data.session) {
          setSuccessTitle('Registro enviado');
          setSuccessMessage('¡Cuenta creada con éxito! Por favor, revise su correo electrónico (y la carpeta de Spam) para confirmar su cuenta antes de iniciar sesión.');
          setIsRegistering(false);
        } else if (data.session) {
          onLoginSuccess();
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (error) throw error;
        
        if (data.session) {
          onLoginSuccess();
        }
      }
    } catch (err: any) {
      console.error("Auth error full object:", err);
      
      const msg = err.message || '';
      const msgLower = msg.toLowerCase();

      if (msgLower.includes("invalid api key") || msgLower.includes("jwt")) {
        setErrorHeader("Error de Configuración");
        setErrorDetail("La API Key de Supabase es inválida o ha expirado.");
        setShowApiKeyHelp(true);
      } else if (msgLower.includes("invalid login credentials")) {
        setErrorHeader("Credenciales Inválidas");
        setErrorDetail("La contraseña es incorrecta o no ha confirmado su correo electrónico todavía. Por favor, busque el correo de confirmación en su bandeja de entrada o Spam.");
      } else if (msgLower.includes("user already registered")) {
        setErrorHeader("Usuario Existente");
        setErrorDetail("Este correo electrónico ya está registrado. Por favor, inicie sesión.");
      } else if (msgLower.includes("rate limit")) {
        setErrorHeader("Demasiados intentos");
        setErrorDetail("Por favor espere unos momentos antes de intentar de nuevo.");
      } else {
        setErrorHeader("Error de Autenticación");
        setErrorDetail(msg || 'Ocurrió un error inesperado. Verifique su conexión.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-200 via-slate-100 to-emerald-50 p-4 md:p-0 font-sans">
      <div className="flex w-full max-w-6xl bg-white rounded-3xl shadow-2xl overflow-hidden min-h-[760px] md:min-h-[720px]">
        
        {/* ─── LEFT PANEL ──────────────────────────────────────── */}
        <div className="hidden md:flex w-[52%] relative flex-col items-center justify-center text-white text-center overflow-hidden">
          
          {/* Background photo */}
          <div 
            className="absolute inset-0 bg-cover bg-center z-0 transform scale-105 transition-transform duration-[20s] hover:scale-110"
            style={{ backgroundImage: `url('${AIFA_ASSETS.background}')` }}
          />

          {/* Deep forest-green overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#020D07]/95 via-[#062B1A]/88 to-[#081E30]/90 z-10" />
          {/* Subtle green shimmer on top-left */}
          <div className="absolute top-0 left-0 w-3/4 h-2/3 bg-gradient-to-br from-[#0F4C3A]/35 to-transparent z-10 pointer-events-none" />
          {/* Gold bottom-right glow */}
          <div className="absolute bottom-0 right-0 w-2/3 h-1/2 bg-gradient-to-tl from-[#B38E5D]/15 to-transparent z-10 pointer-events-none" />

          {/* Animated clouds + plane */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-[15]">
            <style>{`
              @keyframes loginPlaneFlight {
                0%   { transform: translate(-58%, 30%) scale(0.7) rotate(6deg); opacity: 0; }
                15%  { transform: translate(-24%, 18%) scale(0.74) rotate(7deg); opacity: 0.85; }
                42%  { transform: translate(8%, 6%) scale(0.78) rotate(8deg); opacity: 1; }
                68%  { transform: translate(46%, -10%) scale(0.82) rotate(6deg); opacity: 0.92; }
                88%  { transform: translate(86%, -24%) scale(0.85) rotate(4deg); opacity: 0.78; }
                100% { transform: translate(118%, -32%) scale(0.86) rotate(3deg); opacity: 0; }
              }
              @keyframes loginCloudFloat {
                0%   { transform: translateX(-10%) translateY(0); opacity: 0.6; }
                50%  { transform: translateX(10%) translateY(-4%); opacity: 0.8; }
                100% { transform: translateX(35%) translateY(2%); opacity: 0.6; }
              }
              @keyframes loginContrailPulse {
                0%   { opacity: 0.45; }
                50%  { opacity: 0.9; }
                100% { opacity: 0.4; }
              }
              @keyframes loginGoldPulse {
                0%, 100% { opacity: 0.5; transform: scaleX(1); }
                50% { opacity: 1; transform: scaleX(1.08); }
              }
            `}</style>

            {/* Plane */}
            <div className="absolute bottom-[-6%] left-[-14%] w-[260px] h-[120px]" style={{ animation: 'loginPlaneFlight 9s linear infinite' }}>
              <svg viewBox="0 0 200 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-[0_18px_28px_rgba(8,20,38,0.22)]" style={{ transform: 'scaleX(-1)', transformOrigin: '50% 50%' }}>
                <defs>
                  <linearGradient id={planeGradientId} x1="0" y1="45" x2="200" y2="45" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#FFFFFF" /><stop offset="0.45" stopColor="#F4F8FF" /><stop offset="1" stopColor="#E0ECFF" />
                  </linearGradient>
                  <linearGradient id={planeGlowId} x1="20" y1="70" x2="180" y2="10" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#66C2FF" stopOpacity="0.6" /><stop offset="1" stopColor="#E3F3FF" stopOpacity="0" />
                  </linearGradient>
                  <radialGradient id={planeSparkId} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(184 20) scale(28 18)">
                    <stop stopColor="#FFFFFF" stopOpacity="0.9" /><stop offset="1" stopColor="#9ECFFF" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <path d="M12 52 L118 52 L150 34 C158 30 168 28 176 30 L156 46 C154 48 154 50 156 52 L176 68 C168 70 158 68 150 62 L118 44 L12 44 C8 44 4 48 4 52 C4 56 8 60 12 60 L50 60 L72 72 C76 74 80 74 84 72 L78 60 L118 60 L150 78 C162 86 180 84 180 84 L150 52 L180 20 C180 20 162 18 150 26 L118 44 L78 44 L82 32 C78 30 74 30 70 32 L50 44 L12 44" fill={`url(#${planeGradientId})`} stroke="rgba(45,64,89,0.22)" strokeWidth="0.9" />
                <path d="M56 52 L76 52" stroke="#A7BFE8" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M34 50 L44 50" stroke="#A7BFE8" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M16 52 L-44 58" stroke="#F4F8FF" strokeWidth="9" strokeLinecap="round" opacity="0.26" style={{ animation: 'loginContrailPulse 5s ease-in-out infinite' }} />
                <path d="M24 48 L-20 52" stroke="#FFFFFF" strokeOpacity="0.18" strokeWidth="5" strokeLinecap="round" style={{ animation: 'loginContrailPulse 6s ease-in-out infinite' }} />
              </svg>
            </div>

            {/* Atmospheric blur orbs */}
            <div className="absolute top-[10%] left-[-20%] w-[380px] h-[220px] rounded-full" style={{ background: 'radial-gradient(circle at 30% 40%, rgba(15,76,58,0.5), transparent)', filter: 'blur(72px)', animation: 'loginCloudFloat 42s ease-in-out infinite' }} />
            <div className="absolute top-[55%] right-[-30%] w-[400px] h-[240px] rounded-full" style={{ background: 'radial-gradient(circle at 60% 50%, rgba(179,142,93,0.2), transparent)', filter: 'blur(80px)', animation: 'loginCloudFloat 55s ease-in-out infinite reverse' }} />
            <div className="absolute bottom-[8%] right-[-15%] w-[300px] h-[180px] rounded-full" style={{ background: 'radial-gradient(circle at 40% 40%, rgba(15,76,58,0.35), transparent)', filter: 'blur(60px)', animation: 'loginCloudFloat 48s ease-in-out infinite' }} />
          </div>

          {/* Content */}
          <div className="relative z-20 flex flex-col items-center justify-between h-full py-12 px-10">
            
            {/* Logo */}
            <div className="flex flex-col items-center gap-5 w-full">
              <div className="p-5 bg-white/96 rounded-2xl shadow-2xl backdrop-blur-md w-full max-w-[260px] flex justify-center border border-white/60">
                <AifaLogo className="h-28 w-full object-contain" />
              </div>
              
              {/* Gold separator */}
              <div className="flex items-center gap-3 w-full max-w-[220px]">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent to-[#B38E5D]/60" />
                <div className="w-1.5 h-1.5 rounded-full bg-[#B38E5D]" style={{ animation: 'loginGoldPulse 3s ease-in-out infinite' }} />
                <div className="flex-1 h-px bg-gradient-to-l from-transparent to-[#B38E5D]/60" />
              </div>
              
              <h1 className="text-[2.2rem] font-black tracking-[0.2em] text-white drop-shadow-lg leading-tight">
                AIFA<br />
                <span className="text-[#B38E5D]">CONTRATOS</span>
              </h1>
            </div>

            {/* Features */}
            <div className="flex flex-col items-center gap-5 my-6 w-full max-w-sm">
              {LOGIN_HIGHLIGHTS.map((item) => (
                <div key={item.title} className="w-full flex items-center gap-4 bg-white/8 hover:bg-white/12 border border-white/12 rounded-2xl px-5 py-3.5 backdrop-blur-sm transition-colors">
                  <div className="h-10 w-10 rounded-xl bg-[#0F4C3A]/60 border border-[#B38E5D]/40 flex items-center justify-center flex-shrink-0">
                    <item.icon className="h-5 w-5 text-[#B38E5D]" />
                  </div>
                  <span className="text-sm font-semibold tracking-[0.18em] text-white/90 uppercase">{item.title}</span>
                </div>
              ))}

              <div className="w-full mt-2 bg-gradient-to-r from-[#B38E5D]/20 to-transparent border border-[#B38E5D]/25 rounded-2xl px-5 py-3.5 text-center">
                <p className="text-xs font-bold tracking-[0.3em] text-[#C9A87A] uppercase">
                  Conectando Contratos Estratégicos
                </p>
                <p className="text-[10px] text-white/50 uppercase tracking-[0.25em] mt-1">
                  Transparencia · Control · Impacto
                </p>
              </div>
            </div>

            {/* Footer */}
            <p className="text-[11px] text-white/40 tracking-wider">
              Aeropuerto Internacional Felipe Ángeles
            </p>
          </div>
        </div>

        {/* ─── RIGHT PANEL (form) ──────────────────────────────── */}
        <div className="w-full md:w-[48%] bg-white flex flex-col justify-center relative">
          
          {/* Top accent bar */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#0F4C3A] via-[#1a7a5e] to-[#B38E5D]" />

          <div className="px-8 xl:px-14 py-12 flex flex-col justify-center flex-1">
            <div className="max-w-sm mx-auto w-full">

              {/* Mobile logo */}
              <div className="md:hidden flex justify-center mb-8">
                <div className="bg-white shadow-lg rounded-2xl px-6 py-4 border border-slate-200/70">
                  <AifaLogo className="h-20 w-52" />
                </div>
              </div>

              {/* Header */}
              <div className="mb-8 space-y-2">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0F4C3A]/10 text-[#0F4C3A] text-[10px] font-black uppercase tracking-[0.4em] border border-[#0F4C3A]/20">
                  {isRegistering ? 'Registro' : 'Acceso AIFA'}
                </div>
                <h2 className="text-[1.9rem] font-extrabold text-slate-900 tracking-tight leading-snug mt-3">
                  {isRegistering ? 'Solicitar acceso' : 'Bienvenido de nuevo'}
                </h2>
                <p className="text-slate-500 text-sm leading-relaxed">
                  {isRegistering 
                    ? 'Solicite acceso institucional para colaborar en la gestión centralizada de contratos.'
                    : 'Ingresa con tus credenciales para consultar contratos, pagos y observaciones.'}
                </p>
              </div>

              {showApiKeyHelp && (
                <div className="mb-5 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
                  <p className="font-semibold flex items-center gap-2 uppercase tracking-[0.2em]"><Key className="h-4 w-4"/> Verifique API Key</p>
                  <p className="text-xs mt-1 leading-snug text-amber-800/90">Asegúrese de que la clave en <code className="bg-white px-1.5 py-0.5 rounded-md border border-amber-200/70">supabaseClient.ts</code> sea correcta.</p>
                </div>
              )}

              <form onSubmit={handleAuth} className="space-y-5">
                
                {isRegistering && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.35em] mb-2">Nombre</label>
                    <div className="relative group">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-[#0F4C3A] transition-colors" />
                      <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-[#0F4C3A] focus:ring-2 focus:ring-[#0F4C3A]/12 outline-none transition-all placeholder:text-slate-400"
                        placeholder="Nombre completo" required={isRegistering} />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.35em] mb-2">Correo</label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-[#0F4C3A] transition-colors" />
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-[#0F4C3A] focus:ring-2 focus:ring-[#0F4C3A]/12 outline-none transition-all placeholder:text-slate-400"
                      placeholder="correo@ejemplo.com" required />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.35em] mb-2">Contraseña</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-[#0F4C3A] transition-colors" />
                    <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-11 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-[#0F4C3A] focus:ring-2 focus:ring-[#0F4C3A]/12 outline-none transition-all [&::-ms-reveal]:hidden [&::-webkit-credentials-auto-fill-button]:hidden placeholder:text-slate-400"
                      placeholder="••••••••" required minLength={6} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0F4C3A] transition-colors">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {errorHeader && (
                  <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                    <div className="flex items-center gap-2 text-red-700 font-bold text-sm mb-1">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" /><span>{errorHeader}</span>
                    </div>
                    <p className="text-red-600 text-xs ml-6 leading-relaxed">{errorDetail}</p>
                  </div>
                )}
                
                {successMessage && (
                  <div className="relative overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-white to-emerald-50 p-4 shadow-sm">
                    <div className="absolute -top-10 -right-10 h-24 w-24 bg-emerald-200/40 blur-3xl" aria-hidden="true" />
                    <div className="relative flex items-start gap-3">
                      <div className="h-9 w-9 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-600 flex-shrink-0">
                        <CheckCircle className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-emerald-800 tracking-wide uppercase">{successTitle}</h4>
                        <p className="text-emerald-700 text-xs leading-relaxed mt-1">{successMessage}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Submit button */}
                <button type="submit" disabled={isLoading}
                  className="group w-full mt-1 py-4 bg-[#0F4C3A] hover:bg-[#0d3f30] disabled:opacity-70 text-white font-bold rounded-2xl transition-all duration-200 shadow-lg shadow-[#0F4C3A]/25 hover:shadow-[#0F4C3A]/40 flex justify-center items-center gap-3 uppercase tracking-[0.35em] text-sm">
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/40 border-t-white" />
                      Procesando
                    </>
                  ) : (
                    <>
                      {isRegistering ? 'Solicitar acceso' : 'Ingresar'}
                      {isRegistering
                        ? <UserPlus className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                        : <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />}
                    </>
                  )}
                </button>
              </form>

              <div className="mt-8 pt-5 border-t border-slate-100 text-center">
                <button 
                  onClick={() => { setIsRegistering(!isRegistering); setErrorHeader(''); setErrorDetail(''); setSuccessMessage(''); setSuccessTitle('Registro Exitoso'); }}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#0F4C3A] transition-colors font-medium"
                >
                  {isRegistering ? <ArrowRight className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                  {isRegistering ? '¿Ya tienes cuenta? Inicia Sesión' : '¿No tienes cuenta? Solicitar Registro'}
                </button>
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  );

          <div className="absolute inset-0 pointer-events-none overflow-hidden z-[15]">
            <style>{`
              @keyframes loginPlaneFlight {
                0% { transform: translate(-58%, 30%) scale(0.7) rotate(6deg); opacity: 0; }
                15% { transform: translate(-24%, 18%) scale(0.74) rotate(7deg); opacity: 0.85; }
                42% { transform: translate(8%, 6%) scale(0.78) rotate(8deg); opacity: 1; }
                68% { transform: translate(46%, -10%) scale(0.82) rotate(6deg); opacity: 0.92; }
                88% { transform: translate(86%, -24%) scale(0.85) rotate(4deg); opacity: 0.78; }
                100% { transform: translate(118%, -32%) scale(0.86) rotate(3deg); opacity: 0; }
              }

              @keyframes loginCloudFloat {
                0% { transform: translateX(-10%) translateY(0); opacity: 0.6; }
                50% { transform: translateX(10%) translateY(-4%); opacity: 0.8; }
                100% { transform: translateX(35%) translateY(2%); opacity: 0.6; }
              }

              @keyframes loginContrailPulse {
                0% { opacity: 0.45; }
                50% { opacity: 0.9; }
                100% { opacity: 0.4; }
              }
            `}</style>

            <div
              className="absolute bottom-[-6%] left-[-14%] w-[260px] h-[120px]"
              style={{ animation: 'loginPlaneFlight 9s linear infinite' }}
            >
              <svg
                viewBox="0 0 200 90"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full drop-shadow-[0_18px_28px_rgba(8,20,38,0.22)]"
                style={{ transform: 'scaleX(-1)', transformOrigin: '50% 50%' }}
              >
                <defs>
                  <linearGradient id={planeGradientId} x1="0" y1="45" x2="200" y2="45" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#FFFFFF" />
                    <stop offset="0.45" stopColor="#F4F8FF" />
                    <stop offset="1" stopColor="#E0ECFF" />
                  </linearGradient>
                  <linearGradient id={planeGlowId} x1="20" y1="70" x2="180" y2="10" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#66C2FF" stopOpacity="0.6" />
                    <stop offset="1" stopColor="#E3F3FF" stopOpacity="0" />
                  </linearGradient>
                  <radialGradient id={planeSparkId} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(184 20) scale(28 18)">
                    <stop stopColor="#FFFFFF" stopOpacity="0.9" />
                    <stop offset="1" stopColor="#9ECFFF" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <path d="M12 52 L118 52 L150 34 C158 30 168 28 176 30 L156 46 C154 48 154 50 156 52 L176 68 C168 70 158 68 150 62 L118 44 L12 44 C8 44 4 48 4 52 C4 56 8 60 12 60 L50 60 L72 72 C76 74 80 74 84 72 L78 60 L118 60 L150 78 C162 86 180 84 180 84 L150 52 L180 20 C180 20 162 18 150 26 L118 44 L78 44 L82 32 C78 30 74 30 70 32 L50 44 L12 44" fill={`url(#${planeGradientId})`} stroke="rgba(45,64,89,0.22)" strokeWidth="0.9" />
                <path d="M56 52 L76 52" stroke="#A7BFE8" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M34 50 L44 50" stroke="#A7BFE8" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M54 42 L76 42" stroke="#BDD0F0" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M80 52 L104 52" stroke="#6F90CC" strokeWidth="1.6" strokeLinecap="round" opacity="0.68" />
                <rect x="122" y="38" width="12" height="4.5" rx="1.6" fill="#9BC1EE" />
                <rect x="136" y="38" width="12" height="4.5" rx="1.6" fill="#9BC1EE" />
                <rect x="150" y="38" width="12" height="4.5" rx="1.6" fill="#9BC1EE" />
                <path d="M130 44 C134 40 138 38 142 38" stroke="#5877B2" strokeWidth="0.9" strokeLinecap="round" opacity="0.45" />
                <ellipse cx="108" cy="60" rx="9" ry="3.6" fill="#AEC6EB" opacity="0.46" />
                <ellipse cx="48" cy="60" rx="12" ry="4.6" fill="#AEC6EB" opacity="0.32" />
                <path d="M120 54 C134 60 152 68 168 78" stroke={`url(#${planeGlowId})`} strokeWidth="6" strokeLinecap="round" opacity="0.24" />
                <path d="M114 50 C132 58 148 68 162 78" stroke={`url(#${planeGlowId})`} strokeWidth="3.4" strokeLinecap="round" opacity="0.36" />
                <path d="M100 52 C114 60 134 70 154 80" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M82 52 C96 60 122 72 140 82" stroke="#FFFFFF" strokeOpacity="0.28" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M16 52 L-44 58" stroke="#F4F8FF" strokeWidth="9" strokeLinecap="round" opacity="0.26" style={{ animation: 'loginContrailPulse 5s ease-in-out infinite' }} />
                <path d="M24 48 L-20 52" stroke="#FFFFFF" strokeOpacity="0.18" strokeWidth="5" strokeLinecap="round" style={{ animation: 'loginContrailPulse 6s ease-in-out infinite' }} />
                <ellipse cx="164" cy="26" rx="10" ry="6" fill={`url(#${planeSparkId})`} />
              </svg>
            </div>

            <div
              className="absolute top-[18%] left-[-20%] w-[320px] h-[180px] rounded-full"
              style={{ background: 'radial-gradient(circle at 30% 40%, rgba(255,255,255,0.45), rgba(240,248,255,0.06))', filter: 'blur(60px)', animation: 'loginCloudFloat 42s ease-in-out infinite' }}
            ></div>
            <div
              className="absolute top-[58%] right-[-28%] w-[360px] h-[200px] rounded-full"
              style={{ background: 'radial-gradient(circle at 60% 50%, rgba(210,232,255,0.5), rgba(180,212,255,0.08))', filter: 'blur(68px)', animation: 'loginCloudFloat 55s ease-in-out infinite reverse' }}
            ></div>
            <div
              className="absolute bottom-[12%] right-[-18%] w-[280px] h-[180px] rounded-full"
              style={{ background: 'radial-gradient(circle at 40% 40%, rgba(255,255,255,0.4), rgba(210,220,240,0.08))', filter: 'blur(58px)', animation: 'loginCloudFloat 48s ease-in-out infinite' }}
            ></div>
          </div>
          
          {/* Overlay Gradients for readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/80 via-slate-900/60 to-slate-900/90 z-10"></div>
};

export default Login;
