import React, { useEffect, useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, AlertTriangle, CheckCircle, KeyRound } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

// Pantalla final del restablecimiento de contraseña.
//
// Se llega aquí desde el enlace del correo. Supabase valida ese enlace y deja
// una sesión temporal abierta; con ella —y sólo con ella— updateUser() puede
// cambiar la contraseña sin pedir la anterior, que es justo lo que la persona
// no recuerda.
//
// Sin esta pantalla el enlace sólo servía para entrar una vez: la contraseña
// seguía siendo la vieja y al siguiente intento la persona volvía a quedarse
// fuera.

interface ResetPasswordProps {
  /** Se llama al terminar; el contenedor cierra la sesión y vuelve al login. */
  onDone: (mensaje: string) => void;
  /** Error que venía en el propio enlace (caducado, ya usado...). */
  linkError?: string | null;
}

const AifaLogo = ({ className = "h-20 w-auto" }: { className?: string }) => (
  <img src="/images/aifa-logo.png" alt="Logotipo AIFA" className={className} loading="lazy" />
);

const ResetPassword: React.FC<ResetPasswordProps> = ({ onDone, linkError }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  // Hasta no confirmar que el enlace abrió sesión, no se enseña el formulario.
  const [sesionValida, setSesionValida] = useState<boolean | null>(linkError ? false : null);

  /**
   * Comprueba que el enlace haya dejado sesión abierta antes de pedir nada.
   *
   * getSession() espera a que el cliente termine de canjear el token del hash,
   * así que si aquí no hay sesión es que el enlace no sirve. Sin esta
   * comprobación la persona escribiría su contraseña nueva dos veces para que
   * al pulsar Guardar le saliera un error incomprensible.
   */
  useEffect(() => {
    if (linkError) return;
    let vivo = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (vivo) setSesionValida(Boolean(data.session));
    })();
    return () => { vivo = false; };
  }, [linkError]);

  // Medidor simple: lo que de verdad importa es la longitud, así que el aviso
  // se queda en eso en vez de exigir símbolos que la gente acaba apuntando.
  const fuerza = password.length >= 12 ? 'fuerte' : password.length >= 8 ? 'aceptable' : 'corta';
  const fuerzaMeta = {
    corta:     { pct: 33,  cls: 'bg-red-500',     txt: 'text-red-600',     label: 'Corta' },
    aceptable: { pct: 66,  cls: 'bg-amber-500',   txt: 'text-amber-600',   label: 'Aceptable' },
    fuerte:    { pct: 100, cls: 'bg-emerald-500', txt: 'text-emerald-600', label: 'Fuerte' },
  }[fuerza];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('La contraseña necesita al menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }

    setIsSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      onDone('Tu contraseña se actualizó. Ya puedes entrar con la nueva.');
    } catch (err: any) {
      console.error('Error actualizando la contraseña:', err);
      const msg = (err?.message ?? '').toLowerCase();

      if (msg.includes('session') || msg.includes('jwt') || msg.includes('expired')) {
        // La sesión temporal del enlace caducó mientras llenaba el formulario.
        setError('El enlace caducó. Vuelve a la pantalla de acceso y pulsa "¿Olvidaste tu contraseña?" para pedir uno nuevo.');
      } else if (msg.includes('should be different') || msg.includes('same as the old')) {
        setError('Esa es la misma contraseña que ya tenías. Escribe una distinta.');
      } else if (msg.includes('weak') || msg.includes('password')) {
        setError(err.message);
      } else {
        setError(err?.message ?? 'No se pudo actualizar la contraseña.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-200 via-slate-100 to-emerald-50 p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">

        <div className="px-8 pt-8 pb-6 text-center border-b border-slate-100">
          <div className="flex justify-center mb-5">
            <AifaLogo className="h-16 w-auto" />
          </div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0F4C3A]/10 text-[#0F4C3A] text-[10px] font-black uppercase tracking-[0.3em] border border-[#0F4C3A]/20">
            <KeyRound className="h-3 w-3" />
            Nueva contraseña
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-3">
            Crea tu contraseña
          </h1>
          <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">
            Escríbela dos veces para confirmar que quedó como querías.
          </p>
        </div>

        {sesionValida === null ? (
          <div className="p-8 flex flex-col items-center justify-center gap-3 py-16">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-[#0F4C3A]" />
            <p className="text-sm text-slate-500">Comprobando el enlace...</p>
          </div>
        ) : (linkError || sesionValida === false) ? (
          <div className="p-8">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
              <p className="text-sm font-bold text-amber-900">Este enlace ya no sirve</p>
              <p className="text-xs text-amber-800 mt-1.5 leading-relaxed">
                {linkError ?? 'El enlace caducó, ya se usó, o se abrió sin pasar por el correo. Pide uno nuevo desde la pantalla de acceso con "¿Olvidaste tu contraseña?".'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onDone('')}
              className="w-full mt-5 py-3.5 bg-[#0F4C3A] hover:bg-[#0d3f30] text-white font-bold rounded-2xl transition-colors uppercase tracking-[0.25em] text-xs"
            >
              Volver al acceso
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-8 space-y-5">

            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">
                Nueva contraseña
              </label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-[#0F4C3A] transition-colors" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  className="w-full pl-11 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-[#0F4C3A] focus:ring-2 focus:ring-[#0F4C3A]/12 outline-none transition-all [&::-ms-reveal]:hidden placeholder:text-slate-400"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0F4C3A] transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {password.length > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${fuerzaMeta.cls}`}
                      style={{ width: `${fuerzaMeta.pct}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${fuerzaMeta.txt}`}>
                    {fuerzaMeta.label}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">
                Repite la contraseña
              </label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-[#0F4C3A] transition-colors" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full pl-11 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-[#0F4C3A] focus:ring-2 focus:ring-[#0F4C3A]/12 outline-none transition-all [&::-ms-reveal]:hidden placeholder:text-slate-400"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
                {confirm.length > 0 && password === confirm && (
                  <CheckCircle className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                )}
              </div>
              {confirm.length > 0 && password !== confirm && (
                <p className="text-[11px] text-red-600 mt-1.5 font-medium">Todavía no coinciden.</p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                <div className="flex items-start gap-2 text-red-700">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <p className="text-xs leading-relaxed">{error}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="group w-full py-4 bg-[#0F4C3A] hover:bg-[#0d3f30] disabled:opacity-70 text-white font-bold rounded-2xl transition-all duration-200 shadow-lg shadow-[#0F4C3A]/25 flex justify-center items-center gap-3 uppercase tracking-[0.3em] text-xs"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/40 border-t-white" />
                  Guardando
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  Guardar contraseña
                </>
              )}
            </button>

            <p className="text-[11px] text-slate-400 text-center leading-relaxed pt-1">
              Al guardarla se cerrará esta ventana y podrás entrar con tu contraseña nueva.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
