'use client';

import React, { useState, useEffect } from 'react';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { 
  ShieldAlert, CheckCircle2, Clock, 
  PlusCircle, LayoutDashboard, LogOut,
  Send
} from 'lucide-react';

const GOOGLE_CLIENT_ID = "274739568755-s1kq1q8orh7e3edneubiahgimtrgvrgi.apps.googleusercontent.com";

// URL base de la API - configurable via variable de entorno
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

interface Ticket {
  id: number;
  solicitante_email: string;
  tipo_requerimiento: string;
  prioridad: string;
  descripcion: string;
  estado: string;
  tecnico_asignado: string;
  sede?: string;
  tipo_colaborador?: string;
  notas_tecnicas?: string;
  fecha_creacion: string;
}

interface GoogleUserData {
  email: string;
  name: string;
  picture?: string;
}

// Etiquetas legibles para los roles definidos en el backend
const ROL_LABELS: Record<string, string> = {
  ADMIN_TI: 'Responsable de Sistemas',
  HELPDESK_TI: 'Help Desk TI',
  ARQUITECTO_TI: 'Arquitecto de Soluciones TI',
  INFRAESTRUCTURA_TI: 'Gestor de Infraestructura TI',
  Usuario: 'Usuario Corporativo',
};

const TI_ROLES = ['ADMIN_TI', 'HELPDESK_TI', 'ARQUITECTO_TI', 'INFRAESTRUCTURA_TI'];

// Clases de badge según el estado del ticket (convención visual corporativa)
function estadoBadgeClasses(estado: string): string {
  const base = 'inline-flex items-center font-bold px-2.5 py-0.5 rounded-full border';
  switch (estado) {
    case 'Pendiente':
      return `${base} bg-amber-100 text-amber-800 border-amber-300`;
    case 'En Proceso':
      return `${base} bg-blue-100 text-blue-800 border-blue-300`;
    case 'Solucionado':
      return `${base} bg-emerald-100 text-emerald-800 border-emerald-300`;
    case 'Cerrado':
      return `${base} bg-slate-100 text-slate-800 border-slate-300`;
    default:
      return `${base} bg-slate-100 text-slate-700 border-slate-300`;
  }
}

// Subcomponente exclusivo para manejar el botón de inicio de sesión con Google
function GoogleLoginButton({ onSuccess, onError }: { onSuccess: (credentialResponse: any) => void; onError: () => void }) {
  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        // Obtenemos los datos del usuario directamente con el token
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        const userData = await res.json();
        
        // Formateamos como lo espera tu función handleGoogleSuccess
        onSuccess({
          credential: null,
          customUser: {
            email: userData.email,
            name: userData.name,
            picture: userData.picture
          }
        });
      } catch (err) {
        onError();
      }
    },
    onError: () => onError(),
  });

  return (
    <button
      type="button"
      onClick={() => login()}
      className="flex items-center justify-center gap-3 w-full max-w-xs px-4 py-2.5 bg-white border border-slate-300 rounded-full shadow-sm hover:bg-slate-50 transition-all font-medium text-slate-700 text-sm mx-auto"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        />
      </svg>
      Iniciar sesión con Google
    </button>
  );
}

function MainApp() {
  const [user, setUser] = useState<{ email: string; name: string; role: string; rol?: string; cargo_ti?: string; picture?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'crear' | 'mis-tickets' | 'dashboard' | 'usuarios' | 'sedes'>('crear');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  // Formulario
  const [categoria, setCategoria] = useState('💻 Soporte Técnico / Hardware');
  const [prioridad, setPrioridad] = useState('Media');
  const [descripcion, setDescripcion] = useState('');
  const [sede, setSede] = useState('Miraflores');
  const [tipoColaborador, setTipoColaborador] = useState('Administrativo');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [sedes, setSedes] = useState<any[]>([]);
  const [notasDraft, setNotasDraft] = useState<Record<number, string>>({});

  const fetchTickets = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/tickets`);
      const data = await res.json();
      setTickets(data);
    } catch (err) {
      console.error("Error conectando con la API:", err);
    }
  };

  const fetchUsuarios = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/usuarios`, {
        headers: { 'X-User-Email': user?.email || '' }
      });
      if (res.ok) setUsuarios(await res.json());
    } catch (err) {
      console.error("Error cargando usuarios:", err);
    }
  };

  const fetchSedes = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sedes`);
      if (res.ok) setSedes(await res.json());
    } catch (err) {
      console.error("Error cargando sedes:", err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchTickets();
      if (user.rol === 'ADMIN_TI') {
        fetchUsuarios();
        fetchSedes();
      }
    }
  }, [user]);

  const handleGoogleSuccess = async (credentialResponse: any) => {
    try {
      let email = '';
      let name = '';
      let picture = '';

      if (credentialResponse.customUser) {
        email = credentialResponse.customUser.email;
        name = credentialResponse.customUser.name;
        picture = credentialResponse.customUser.picture;
      } else if (credentialResponse.credential) {
        const decoded: GoogleUserData = jwtDecode(credentialResponse.credential);
        email = decoded.email;
        name = decoded.name;
        picture = decoded.picture || '';
      }

      // Verificación estricta de dominio + auto-registro contra el backend (fuente de verdad)
      const res = await fetch(`${API_BASE_URL}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, nombre: name }),
      });

      if (!res.ok) {
        let msg = 'Acceso restringido: Debe ingresar únicamente con su cuenta @alianzafrancesa.org.pe';
        try {
          const err = await res.json();
          if (typeof err?.detail === 'string') {
            msg = err.detail;
          } else if (Array.isArray(err?.detail) && err.detail[0]?.msg) {
            msg = err.detail[0].msg;
          }
        } catch {}
        setErrorMsg(msg);
        return;
      }

      const usuario = await res.json();
      setUser({
        email: usuario.email,
        name: usuario.nombre || name,
        role: ROL_LABELS[usuario.rol] || usuario.rol,
        rol: usuario.rol,
        cargo_ti: usuario.cargo_ti,
        picture,
      });
      setErrorMsg('');
    } catch (error) {
      setErrorMsg('Error al procesar la autenticación con Google.');
    }
  };

  const handleLogout = () => {
    setUser(null);
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descripcion.trim()) return;
    if (!sede) {
      alert('Debe seleccionar una Sede de Origen');
      return;
    }
    setLoading(true);

    try {
      await fetch(`${API_BASE_URL}/api/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solicitante_email: user?.email,
          tipo_requerimiento: categoria,
          prioridad: prioridad,
          descripcion: descripcion,
          sede: sede,
          tipo_colaborador: tipoColaborador
        })
      });
      setDescripcion('');
      setSuccessMsg(true);
      fetchTickets();
      setTimeout(() => setSuccessMsg(false), 4000);
    } catch (err) {
      alert("Error al guardar la solicitud");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: number, nuevoEstado: string) => {
    await fetch(`${API_BASE_URL}/api/tickets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': user?.email || '' },
      body: JSON.stringify({
        estado: nuevoEstado,
        tecnico_asignado: user?.name
      })
    });
    fetchTickets();
  };

  const handleSaveNota = async (id: number) => {
    const nota = (notasDraft[id] || '').trim();
    if (!nota) return;
    await fetch(`${API_BASE_URL}/api/tickets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': user?.email || '' },
      body: JSON.stringify({ notas_tecnicas: nota })
    });
    setNotasDraft((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    fetchTickets();
  };

  const handleUserUpdate = async (id: number, campos: Record<string, any>) => {
    await fetch(`${API_BASE_URL}/api/usuarios/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': user?.email || '' },
      body: JSON.stringify(campos)
    });
    fetchUsuarios();
  };

  const handleUserDelete = async (id: number) => {
    if (!confirm('¿Eliminar este usuario?')) return;
    await fetch(`${API_BASE_URL}/api/usuarios/${id}`, {
      method: 'DELETE',
      headers: { 'X-User-Email': user?.email || '' }
    });
    fetchUsuarios();
  };

  const handleSedeDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta sede?')) return;
    await fetch(`${API_BASE_URL}/api/sedes/${id}`, {
      method: 'DELETE',
      headers: { 'X-User-Email': user?.email || '' }
    });
    fetchSedes();
  };

  const [nuevoUsuario, setNuevoUsuario] = useState({ email: '', nombre: '', rol: 'Usuario' });
  const [nuevaSede, setNuevaSede] = useState({ nombre: '', tipo: 'Sede Descentralizada' });

  const handleCreateUsuario = async () => {
    if (!nuevoUsuario.email.trim()) return;
    await fetch(`${API_BASE_URL}/api/usuarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': user?.email || '' },
      body: JSON.stringify(nuevoUsuario)
    });
    setNuevoUsuario({ email: '', nombre: '', rol: 'Usuario' });
    fetchUsuarios();
  };

  const handleCreateSede = async () => {
    if (!nuevaSede.nombre.trim()) return;
    await fetch(`${API_BASE_URL}/api/sedes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': user?.email || '' },
      body: JSON.stringify(nuevaSede)
    });
    setNuevaSede({ nombre: '', tipo: 'Sede Descentralizada' });
    fetchSedes();
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FDFBFB] flex flex-col justify-center items-center p-4 relative font-sans">
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[#ED1C24] via-[#002395] to-[#ED1C24]" />

        <div className="max-w-md w-full bg-white rounded-2xl p-8 shadow-2xl border border-slate-100 text-center relative z-10">
          {/* Logo en pantalla de inicio de sesión */}
          <div className="flex justify-center mb-6">
            <div className="bg-white px-8 py-5 rounded-3xl shadow-lg border border-slate-100 flex items-center justify-center w-full">
              <img src="/logo.png" alt="Alliance Française Logo" className="h-24 w-full object-contain" />
            </div>
          </div>

          <div className="inline-block px-3 py-1 bg-[#ED1C24]/10 text-[#ED1C24] rounded-full text-xs font-bold tracking-wide mb-3">
            MESA DE AYUDA / IT
          </div>

          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">
            Alianza Francesa de Lima
          </h1>
          <p className="text-slate-600 text-sm mb-6 leading-relaxed">
            Plataforma corporativa de atención de requerimientos informáticos.
          </p>

          {errorMsg && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          
          <div className="flex justify-center my-4 min-h-[40px]">
            <GoogleLoginButton 
              onSuccess={handleGoogleSuccess}
              onError={() => setErrorMsg('Fallo en el inicio de sesión con Google')}
            />
          </div>

          <p className="text-xs text-slate-400 mt-6">
            Acceso restringido a cuentas <span className="font-semibold text-slate-600">@alianzafrancesa.org.pe</span>
          </p>
        </div>
      </div>
    );
  }

  const isAdmin = user?.rol === 'ADMIN_TI';
  const isTI = !!user && TI_ROLES.includes(user.rol || '');

  const pendientes = tickets.filter(t => t.estado === 'Pendiente').length;
  const enProceso = tickets.filter(t => t.estado === 'En Proceso').length;
  const solucionados = tickets.filter(t => t.estado === 'Solucionado').length;
  const cerrados = tickets.filter(t => t.estado === 'Cerrado').length;

  return (
    <div className="min-h-screen bg-[#FDFBFB] text-slate-800 flex font-sans">
      {/* Sidebar Rojo Institucional */}
      <aside className="w-72 bg-[#ED1C24] text-white p-6 flex flex-col justify-between hidden md:flex shadow-2xl">
        <div>
          {/* Logo en la cabecera del menú lateral */}
          <div className="flex flex-col items-center text-center gap-3 mb-8 pb-6 border-b border-white/20">
            <div className="bg-white px-6 py-4 rounded-3xl shadow-lg flex items-center justify-center w-full">
              <img src="/logo.png" alt="Alliance Française" className="h-20 w-full object-contain" />
            </div>
            <div>
              <h2 className="font-bold text-white text-lg leading-tight">Alianza Francesa</h2>
              <p className="text-xs text-red-100">Sistemas & Tecnología</p>
            </div>
          </div>

          <nav className="space-y-2">
            <button
              onClick={() => setActiveTab('crear')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'crear' 
                  ? 'bg-white text-[#ED1C24] shadow-lg' 
                  : 'text-white hover:bg-white/10'
              }`}
            >
              <PlusCircle className="w-4 h-4" /> Nuevo Requerimiento
            </button>

            <button
              onClick={() => setActiveTab('mis-tickets')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'mis-tickets' 
                  ? 'bg-white text-[#ED1C24] shadow-lg' 
                  : 'text-white hover:bg-white/10'
              }`}
            >
              <Clock className="w-4 h-4" /> Mis Solicitudes
            </button>

            {isTI && (
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === 'dashboard' 
                    ? 'bg-white text-[#ED1C24] shadow-lg' 
                    : 'text-white hover:bg-white/10'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" /> Dashboard IT
              </button>
            )}

            {isAdmin && (
              <>
                <button
                  onClick={() => setActiveTab('usuarios')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === 'usuarios' 
                      ? 'bg-white text-[#ED1C24] shadow-lg' 
                      : 'text-white hover:bg-white/10'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4" /> Gestión de Usuarios
                </button>
                <button
                  onClick={() => setActiveTab('sedes')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === 'sedes' 
                      ? 'bg-white text-[#ED1C24] shadow-lg' 
                      : 'text-white hover:bg-white/10'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" /> Gestión de Sedes
                </button>
              </>
            )}
          </nav>
        </div>

        <div className="pt-6 border-t border-white/20">
          <div className="mb-3">
            <p className="text-sm font-bold text-white">{user.name}</p>
            <p className="text-xs text-red-100 truncate">{user.email}</p>
            <span className="inline-block mt-2 bg-[#002395] text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase">
              {user.role}
            </span>
            {user.cargo_ti && (
              <p className="text-[10px] text-red-100 mt-1 leading-tight">{user.cargo_ti}</p>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 bg-black/10 hover:bg-black/30 text-white text-xs py-2.5 rounded-xl transition-all"
          >
            <LogOut className="w-3.5 h-3.5" /> Cerrar Sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto">
        {activeTab === 'crear' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-gradient-to-r from-[#ED1C24] to-[#C41219] rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
              <div className="relative z-10">
                <h1 className="text-3xl font-extrabold mb-2">Registrar Solicitud TI</h1>
                <p className="text-red-100 text-sm">Ingrese los detalles para asignar su caso al equipo de soporte informático.</p>
              </div>
            </div>

            {successMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center gap-3 shadow-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="text-sm font-medium">¡Solicitud registrada correctamente en la Mesa de Ayuda!</span>
              </div>
            )}

            <form onSubmit={handleCreateTicket} className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Sede de Origen <span className="text-red-500">*</span></label>
                <select
                  value={sede}
                  onChange={(e) => setSede(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-[#ED1C24]"
                >
                  <option>Miraflores</option>
                  <option>Los Olivos</option>
                  <option>La Molina</option>
                  <option>Jesús María</option>
                  <option>Remoto</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Tipo de Colaborador</label>
                <select
                  value={tipoColaborador}
                  onChange={(e) => setTipoColaborador(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-[#ED1C24]"
                >
                  <option>Administrativo</option>
                  <option>Docente</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Categoría del Servicio</label>
                <select 
                  value={categoria} 
                  onChange={(e) => setCategoria(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-[#ED1C24]"
                >
                  <option>💻 Soporte Técnico / Hardware</option>
                  <option>⚙️ Software / Licencias / Configuración</option>
                  <option>🌐 Acceso a Red / Internet / VPN</option>
                  <option>📧 Correo Institucional / Accesos</option>
                  <option>🛠️ Mantenimiento Preventivo</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Prioridad del Caso</label>
                <div className="grid grid-cols-4 gap-3">
                  {['Baja', 'Media', 'Alta', 'Crítica'].map((p) => (
                    <button
                      type="button"
                      key={p}
                      onClick={() => setPrioridad(p)}
                      className={`py-3 rounded-xl text-xs font-bold border transition-all ${
                        prioridad === p 
                          ? 'bg-[#ED1C24] text-white border-[#ED1C24] shadow-md shadow-red-200' 
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Descripción Detallada</label>
                <textarea
                  rows={4}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Escriba el detalle del fallo, mensaje de error o requerimiento técnico..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-4 text-sm focus:outline-none focus:border-[#ED1C24]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#ED1C24] hover:bg-[#C41219] text-white font-bold py-4 rounded-xl shadow-lg shadow-red-200 transition-all flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" /> {loading ? "Enviando..." : "Enviar Requerimiento"}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Panel de Gestión Informática</h1>
              <p className="text-slate-500 text-sm">Monitoreo de atención y estado de requerimientos.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm border-l-4 border-l-[#ED1C24]">
                <p className="text-xs font-bold text-slate-500 uppercase">Total Tickets</p>
                <p className="text-3xl font-extrabold text-slate-900 mt-1">{tickets.length}</p>
              </div>
              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm border-l-4 border-l-amber-500">
                <p className="text-xs font-bold text-amber-600 uppercase">Pendientes</p>
                <p className="text-3xl font-extrabold text-amber-600 mt-1">{pendientes}</p>
              </div>
              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm border-l-4 border-l-sky-500">
                <p className="text-xs font-bold text-sky-600 uppercase">En Proceso</p>
                <p className="text-3xl font-extrabold text-sky-600 mt-1">{enProceso}</p>
              </div>
              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm border-l-4 border-l-emerald-500">
                <p className="text-xs font-bold text-emerald-600 uppercase">Solucionados</p>
                <p className="text-3xl font-extrabold text-emerald-600 mt-1">{solucionados}</p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <h3 className="font-bold text-slate-800">Solicitudes Ingresadas</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {tickets.map((t) => (
                  <div key={t.id} className="p-6 hover:bg-slate-50/80 transition-colors flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs font-mono font-bold text-[#ED1C24]">#{t.id}</span>
                          <h4 className="font-bold text-slate-900">{t.tipo_requerimiento}</h4>
                          <span className={`${estadoBadgeClasses(t.estado)} text-[10px]`}>
                            {t.estado}
                          </span>
                          {t.sede && <span className="text-[10px] bg-red-50 text-red-600 font-semibold px-2 py-0.5 rounded-full">{t.sede}</span>}
                        </div>
                        <p className="text-xs text-slate-600">{t.descripcion}</p>
                        <p className="text-[11px] text-slate-400">Solicitante: {t.solicitante_email} • {t.fecha_creacion}</p>
                        {t.notas_tecnicas && (
                          <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-2 mt-1">
                            <span className="font-bold">Nota técnica:</span> {t.notas_tecnicas}
                          </p>
                        )}
                      </div>

                      {isTI && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => handleUpdateStatus(t.id, 'En Proceso')}
                            className="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 text-xs font-semibold border border-sky-200 hover:bg-sky-100"
                          >
                            En Proceso
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(t.id, 'Solucionado')}
                            className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200 hover:bg-emerald-100"
                          >
                            Solucionado
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(t.id, 'Cerrado')}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 hover:bg-slate-200"
                          >
                            Cerrado
                          </button>
                        </div>
                      )}
                    </div>

                    {isTI && (
                      <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                        <input
                          value={notasDraft[t.id] || ''}
                          onChange={(e) => setNotasDraft((prev) => ({ ...prev, [t.id]: e.target.value }))}
                          placeholder="Añadir nota técnica..."
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#ED1C24]"
                        />
                        <button
                          onClick={() => handleSaveNota(t.id)}
                          className="px-3 py-2 rounded-lg bg-[#002395] text-white text-xs font-semibold hover:bg-[#001d78]"
                        >
                          Guardar nota
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'mis-tickets' && (
          <div className="max-w-4xl mx-auto space-y-4">
            <h1 className="text-2xl font-bold text-slate-900 mb-6">Mis Solicitudes</h1>
            {tickets.filter(t => t.solicitante_email === user?.email).map((t) => (
              <div key={t.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="text-xs font-mono font-bold text-[#ED1C24]">Ticket #{t.id}</span>
                    <h3 className="font-bold text-slate-900 text-base">{t.tipo_requerimiento}</h3>
                  </div>
                  <span className={`${estadoBadgeClasses(t.estado)} text-xs`}>
                    {t.estado}
                  </span>
                </div>
                <p className="text-slate-600 text-sm mb-4">{t.descripcion}</p>
                {t.notas_tecnicas && (
                  <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-3 mb-3">
                    <span className="font-bold">Nota técnica:</span> {t.notas_tecnicas}
                  </p>
                )}
                <div className="text-xs text-slate-400 flex justify-between pt-4 border-t border-slate-100">
                  <span>Sede: {t.sede || '—'} • {t.fecha_creacion}</span>
                  <span>Técnico: {t.tecnico_asignado || '—'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'usuarios' && isAdmin && (
          <div className="max-w-5xl mx-auto space-y-4">
            <h1 className="text-2xl font-bold text-slate-900">Gestión de Usuarios</h1>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row gap-3">
              <input
                value={nuevoUsuario.email}
                onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, email: e.target.value })}
                placeholder="Correo @alianzafrancesa.org.pe"
                className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm"
              />
              <input
                value={nuevoUsuario.nombre}
                onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, nombre: e.target.value })}
                placeholder="Nombre completo"
                className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm"
              />
              <select
                value={nuevoUsuario.rol}
                onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, rol: e.target.value })}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="Usuario">Usuario</option>
                <option value="HELPDESK_TI">HELPDESK_TI</option>
                <option value="ARQUITECTO_TI">ARQUITECTO_TI</option>
                <option value="INFRAESTRUCTURA_TI">INFRAESTRUCTURA_TI</option>
                <option value="ADMIN_TI">ADMIN_TI</option>
              </select>
              <button
                onClick={handleCreateUsuario}
                className="px-4 py-2.5 rounded-xl bg-[#ED1C24] text-white text-sm font-semibold hover:bg-[#C41219]"
              >
                Agregar
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="divide-y divide-slate-100">
                {usuarios.map((u) => (
                  <div key={u.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-slate-800 text-sm">{u.nombre}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                      <p className="text-[11px] text-slate-400">Sede: {u.sede_nombre || '—'} • {u.tipo_colaborador || '—'}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={u.rol}
                        onChange={(e) => handleUserUpdate(u.id, { rol: e.target.value })}
                        className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                      >
                        <option value="ADMIN_TI">ADMIN_TI</option>
                        <option value="HELPDESK_TI">HELPDESK_TI</option>
                        <option value="ARQUITECTO_TI">ARQUITECTO_TI</option>
                        <option value="INFRAESTRUCTURA_TI">INFRAESTRUCTURA_TI</option>
                        <option value="Usuario">Usuario</option>
                      </select>
                      <select
                        value={u.estado}
                        onChange={(e) => handleUserUpdate(u.id, { estado: e.target.value })}
                        className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                      >
                        <option value="Activo">Activo</option>
                        <option value="Suspendido">Suspendido</option>
                      </select>
                      <button
                        onClick={() => handleUserDelete(u.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold border border-red-200 hover:bg-red-100"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sedes' && isAdmin && (
          <div className="max-w-3xl mx-auto space-y-4">
            <h1 className="text-2xl font-bold text-slate-900">Gestión de Sedes</h1>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row gap-3">
              <input
                value={nuevaSede.nombre}
                onChange={(e) => setNuevaSede({ ...nuevaSede, nombre: e.target.value })}
                placeholder="Nombre de la sede"
                className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm"
              />
              <select
                value={nuevaSede.tipo}
                onChange={(e) => setNuevaSede({ ...nuevaSede, tipo: e.target.value })}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="Sede Principal">Sede Principal</option>
                <option value="Sede Descentralizada">Sede Descentralizada</option>
                <option value="Modalidad Remota">Modalidad Remota</option>
              </select>
              <button
                onClick={handleCreateSede}
                className="px-4 py-2.5 rounded-xl bg-[#ED1C24] text-white text-sm font-semibold hover:bg-[#C41219]"
              >
                Agregar
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="divide-y divide-slate-100">
                {sedes.map((s) => (
                  <div key={s.id} className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{s.nombre}</p>
                      <p className="text-xs text-slate-500">{s.tipo}</p>
                    </div>
                    <button
                      onClick={() => handleSedeDelete(s.id)}
                      className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold border border-red-200 hover:bg-red-100"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

export default function AppIT() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <MainApp />
    </GoogleOAuthProvider>
  );
}