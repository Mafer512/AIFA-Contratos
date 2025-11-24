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

// === COMPONENTE DE LOGO SVG PERSONALIZADO (CONTRATO + AVIÓN) ===
const AifaLogo = ({ className = "h-32 w-auto" }: { className?: string }) => (
  <svg viewBox="0 0 240 120" className={className} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#C5A065" />
        <stop offset="100%" stopColor="#997842" />
      </linearGradient>
      <linearGradient id="greenGradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#0F4C3A" />
        <stop offset="100%" stopColor="#082E23" />
      </linearGradient>
    </defs>

    {/* Documento/Contrato Base */}
    <path 
      d="M60 20 H 100 L 120 40 V 100 A 5 5 0 0 1 115 105 H 60 A 5 5 0 0 1 55 100 V 25 A 5 5 0 0 1 60 20" 
      fill="white" 
      stroke="url(#greenGradient)" 
      strokeWidth="3"
      className="drop-shadow-md"
    />
    {/* Líneas de texto del contrato */}
    <rect x="65" y="35" width="30" height="2" rx="1" fill="#CBD5E1" />
    <rect x="65" y="45" width="40" height="2" rx="1" fill="#CBD5E1" />
    <rect x="65" y="55" width="40" height="2" rx="1" fill="#CBD5E1" />
    <rect x="65" y="65" width="25" height="2" rx="1" fill="#CBD5E1" />

    {/* Esquina doblada */}
    <path d="M100 20 V 40 H 120" fill="#E2E8F0" stroke="none" />

    {/* Avión Estilizado Despegando (Cruzando el contrato) */}
    <path 
      d="M 90 90 
         C 110 90, 140 60, 160 50 
         L 190 45 
         L 180 55 
         L 165 60 
         L 195 75 
         L 185 85 
         L 150 75 
         C 130 85, 110 100, 90 90 Z" 
      fill="url(#goldGradient)" 
      stroke="white" 
      strokeWidth="1.5"
      filter="drop-shadow(0px 4px 4px rgba(0,0,0,0.2))"
    />
    
    {/* Estela de vuelo dinámica */}
    <path 
      d="M 40 100 Q 80 100 110 80" 
      fill="none" 
      stroke="#9E1B32" 
      strokeWidth="3" 
      strokeLinecap="round"
      strokeDasharray="4 4"
    />

    {/* Texto AIFA */}
    <text x="130" y="110" fontSize="14" fontWeight="800" fontFamily="Arial, sans-serif" fill="#334155" letterSpacing="1">
      AIFA
    </text>
    <text x="170" y="110" fontSize="14" fontWeight="300" fontFamily="Arial, sans-serif" fill="#B38E5D" letterSpacing="0.5">
      CONTRATOS
    </text>
  </svg>
);

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
      <div className="flex w-full max-w-6xl bg-white rounded-3xl shadow-2xl overflow-hidden h-[800px] md:h-[750px]">
        
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
            <div className="flex flex-col items-center gap-4 my-8">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-[#B38E5D] to-[#9E1B32] rounded-full blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
                <div className="relative h-32 w-32 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 shadow-2xl">
                   {AIFA_ASSETS.badge.includes('placeholder') ? (
                      <ShieldCheck className="h-16 w-16 text-[#B38E5D]" />
                   ) : (
                      <img src={AIFA_ASSETS.badge} alt="Badge Slots" className="h-28 w-28 object-contain rounded-full" referrerPolicy="no-referrer" />
                   )}
                </div>
              </div>
              <div className="backdrop-blur-sm bg-black/30 px-6 py-2 rounded-full border border-white/10">
                <p className="text-sm font-medium tracking-widest text-[#B38E5D] uppercase">
                  Coordinación de Slots
                </p>
              </div>
            </div>

            {/* Footer Info */}
            <div className="text-xs text-slate-400 max-w-xs leading-relaxed">
              <p>Aeropuerto Internacional Felipe Ángeles</p>
              <p>Acceso exclusivo para personal acreditado.</p>
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-full md:w-1/2 bg-white p-8 xl:p-16 flex flex-col justify-center relative">
          
          <div className="max-w-md mx-auto w-full">
            {/* Mobile Logo */}
            <div className="md:hidden flex justify-center mb-8">
               <AifaLogo className="h-24 w-64" />
            </div>

            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-slate-800">
                {isRegistering ? 'Solicitud de Acceso' : 'Iniciar Sesión'}
              </h2>
              <p className="text-slate-500 mt-2 text-sm">
                {isRegistering ? 'Complete el formulario para registrar usuario' : 'Ingrese sus credenciales institucionales'}
              </p>
            </div>

            {showApiKeyHelp && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 animate-pulse">
                <p className="font-bold flex items-center gap-2"><Key className="h-4 w-4"/> Verifique API Key</p>
                <p className="text-xs mt-1">Asegúrese de que la clave 'Anon Public' en <code>services/supabaseClient.ts</code> sea correcta.</p>
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-5">
              
              {isRegistering && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Nombre</label>
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
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Correo Institucional</label>
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
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Contraseña</label>
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
                className="w-full py-3.5 px-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 focus:ring-4 focus:ring-slate-200 transition-all shadow-lg flex justify-center items-center gap-2"
              >
                {isLoading ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white"></div> : (
                  isRegistering ? <>REGISTRAR <UserPlus className="h-5 w-5"/></> : <>INGRESAR <ArrowRight className="h-5 w-5"/></>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-slate-100 text-center">
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