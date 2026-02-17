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

    try {
      if (isRegistering) {
        const currentUrl = window.location.origin;
        const { data, error } = await supabase.auth.signUp({
          email,
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
          email,
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
    <div className="min-h-screen flex items-center justify-center bg-slate-200 p-4 md:p-0 font-sans">
      <div className="flex w-full max-w-6xl bg-white rounded-3xl shadow-2xl overflow-hidden min-h-[760px] md:min-h-[720px]">
        
        {/* Left Side - AIFA BRANDING */}
        <div className="hidden md:flex w-1/2 relative flex-col items-center justify-center text-white text-center overflow-hidden bg-slate-900">
          
          {/* Background Image */}
          <div 
            className="absolute inset-0 bg-cover bg-center z-0 transform scale-105 transition-transform duration-[20s] hover:scale-110"
            style={{ backgroundImage: `url('${AIFA_ASSETS.background}')` }}
          ></div>

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
          <div className="absolute inset-0 bg-[#002f5c]/30 z-10 mix-blend-multiply"></div>

          {/* Content */}
          <div className="relative z-20 flex flex-col items-center justify-between h-full py-16 px-10">
            
            {/* Top Logos */}
            <div className="flex flex-col items-center gap-6 w-full">
              <div className="p-6 bg-white/95 rounded-2xl shadow-xl backdrop-blur-md w-full max-w-xs flex justify-center">
                <AifaLogo className="h-32 w-full" />
              </div>
              
              <div className="h-px w-24 bg-gradient-to-r from-transparent via-white/50 to-transparent"></div>
              
              <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-md">
                AIFA CONTRATOS
              </h1>
            </div>

            {/* Center Badge/Message */}
            <div className="flex flex-col items-center gap-8 my-10 w-full">
              <div className="flex flex-wrap items-center justify-center gap-6 w-full max-w-sm">
                {LOGIN_HIGHLIGHTS.map((item, idx) => (
                  <div key={item.title} className="flex flex-col items-center gap-3 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-[0_10px_25px_rgba(0,0,0,0.25)] backdrop-blur-md">
                      <item.icon className="h-8 w-8 text-[#B38E5D]" />
                    </div>
                    <span className="text-[11px] uppercase tracking-[0.35em] text-white/85 font-semibold max-w-[8rem] leading-snug">
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>

              <div className="backdrop-blur-sm bg-black/30 px-8 py-4 rounded-2xl border border-white/10 text-center space-y-2">
                <p className="text-sm font-semibold tracking-[0.35em] text-[#B38E5D] uppercase">
                  Conectando Contratos Estratégicos
                </p>
                <p className="text-xs text-slate-200 uppercase tracking-[0.3em]">
                  Transparencia · Control · Impacto
                </p>
              </div>
            </div>

            {/* Footer Info */}
            <div className="mt-6 text-[11px] text-slate-300/90 max-w-xs leading-relaxed space-y-1">
              <p>Aeropuerto Internacional Felipe Ángeles</p>
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-full md:w-1/2 bg-white p-8 xl:p-16 flex flex-col justify-center relative">
          
          <div className="max-w-md mx-auto w-full">
            {/* Mobile Logo */}
            <div className="md:hidden flex justify-center mb-6">
               <div className="bg-white shadow-lg rounded-2xl px-6 py-4 border border-slate-200/70">
                 <AifaLogo className="h-20 w-52" />
               </div>
            </div>

            <div className="text-center mb-10 space-y-3">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-100 text-[#B38E5D] text-xs font-semibold uppercase tracking-[0.35em]">
                {isRegistering ? 'Registro' : 'Acceso AIFA'}
              </div>
              <div className="space-y-1">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  {isRegistering ? 'Forma parte del sistema' : 'Bienvenido de nuevo'}
                </h2>
                <p className="text-slate-500 text-sm leading-relaxed max-w-sm mx-auto">
                  {isRegistering 
                    ? 'Solicite acceso institucional para colaborar en la gestión centralizada de contratos.'
                    : 'Ingresa con tus credenciales para consultar contratos, pagos y observaciones a detalle.'}
                </p>
              </div>
            </div>

            {showApiKeyHelp && (
              <div className="mb-6 bg-gradient-to-r from-amber-50 to-amber-100 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900 shadow-sm">
                <p className="font-semibold flex items-center gap-2 uppercase tracking-[0.2em]"><Key className="h-4 w-4"/> Verifique API Key</p>
                <p className="text-xs mt-1 leading-snug text-amber-800/90">Asegúrese de que la clave 'Anon Public' en <code className="bg-white px-1.5 py-0.5 rounded-md border border-amber-200/70">services/supabaseClient.ts</code> sea correcta.</p>
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-6">
              
              {isRegistering && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-[0.35em] mb-2">Nombre</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-[#B38E5D] focus:ring-2 focus:ring-[#B38E5D]/20 outline-none transition-all"
                      placeholder="Nombre Completo"
                      required={isRegistering}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-[0.35em] mb-2">Correo</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-[#B38E5D] focus:ring-2 focus:ring-[#B38E5D]/20 outline-none transition-all"
                    placeholder="isaacazhael161f@gmail.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-[0.35em] mb-2">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-[#B38E5D] focus:ring-2 focus:ring-[#B38E5D]/20 outline-none transition-all"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {errorHeader && (
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 animate-fade-in">
                  <div className="flex items-center gap-2 text-red-700 font-bold text-sm mb-1">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    <span>{errorHeader}</span>
                  </div>
                  <p className="text-red-600 text-xs ml-6 leading-relaxed">{errorDetail}</p>
                </div>
              )}
              
              {successMessage && (
                <div className="relative overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-white to-emerald-50 p-4 shadow-sm animate-fade-in">
                  <div className="absolute -top-10 -right-10 h-24 w-24 bg-emerald-200/40 blur-3xl" aria-hidden="true"></div>
                  <div className="absolute -bottom-8 -left-8 h-20 w-20 bg-emerald-100/30 blur-2xl" aria-hidden="true"></div>
                  <div className="relative flex items-start gap-3">
                    <div className="h-10 w-10 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-inner shadow-emerald-200/60">
                      <CheckCircle className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-emerald-800 tracking-wide uppercase">{successTitle}</h4>
                      <p className="text-emerald-700 text-xs leading-relaxed mt-1 max-w-sm">{successMessage}</p>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-[#0F4C3A] via-[#115E47] to-[#B38E5D] text-white font-semibold rounded-2xl hover:shadow-xl focus:ring-4 focus:ring-[#B38E5D]/30 transition-all shadow-lg flex justify-center items-center gap-3 uppercase tracking-[0.45em]"
              >
                {isLoading ? (
                  <div className="flex items-center gap-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/40 border-t-white"></div>
                    Procesando
                  </div>
                ) : (
                  isRegistering ? <>Registrar <UserPlus className="h-5 w-5"/></> : <>Ingresar <ArrowRight className="h-5 w-5"/></>
                )}
              </button>
            </form>

            <div className="mt-10 pt-6 border-t border-slate-100 text-center">
              <button 
                onClick={() => {
                    setIsRegistering(!isRegistering);
                    setErrorHeader('');
                    setErrorDetail('');
                    setSuccessMessage('');
                    setSuccessTitle('Registro Exitoso');
                }}
                className="text-sm text-slate-500 hover:text-[#B38E5D] transition-colors font-medium flex items-center justify-center gap-2 mx-auto"
              >
                {isRegistering ? <ArrowRight className="h-4 w-4"/> : <UserPlus className="h-4 w-4"/>}
                {isRegistering 
                  ? '¿Ya tienes cuenta? Inicia Sesión' 
                  : '¿No tienes cuenta? Solicitar Registro'}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;