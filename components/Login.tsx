import React, { useState } from 'react';
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
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState(''); 
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Estado para mensajes de error más detallados
  const [errorHeader, setErrorHeader] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  
  const [successMessage, setSuccessMessage] = useState('');
  const [showApiKeyHelp, setShowApiKeyHelp] = useState(false);

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
        
        if (data.user && !data.session) {
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
                SISTEMA INTEGRAL <br/>
                <span className="text-2xl font-light text-slate-200">DE GESTIÓN</span>
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
              <p>Plataforma operativa para equipos acreditados y autorizados.</p>
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
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-[0.35em] mb-2">Correo Institucional</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-[#B38E5D] focus:ring-2 focus:ring-[#B38E5D]/20 outline-none transition-all"
                    placeholder="usuario@aifa.gob.mx"
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
                <div className="bg-green-50 p-4 rounded-xl border border-green-200 animate-fade-in">
                  <div className="flex items-center gap-2 text-green-800 font-bold text-sm mb-1">
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    <span>Registro Exitoso</span>
                  </div>
                  <p className="text-green-700 text-xs ml-6 leading-relaxed">{successMessage}</p>
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