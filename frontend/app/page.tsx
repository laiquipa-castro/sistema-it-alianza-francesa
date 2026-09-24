'use client';

import React, { useState, useEffect } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { 
  ShieldAlert, CheckCircle2, Clock, 
  PlusCircle, LayoutDashboard, LogOut,
  Send
} from 'lucide-react';

const GOOGLE_CLIENT_ID = "274739568755-s1kq1q8orh7e3edneubiahgimtrgvrgi.apps.googleusercontent.com";

interface Ticket {
  id: number;
  solicitante_email: string;
  tipo_requerimiento: string;
  prioridad: string;
  descripcion: string;
  estado: string;
  tecnico_asignado: string;
  fecha_creacion: string;
}

interface GoogleUserData {
  email: string;
  name: string;
  picture?: string;
}

function MainApp() {
  const [user, setUser] = useState<{ email: string; name: string; role: string; picture?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'crear' | 'mis-tickets' | 'dashboard'>('crear');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  // Formulario
  const [categoria, setCategoria] = useState('💻 Soporte Técnico / Hardware');
  const [prioridad, setPrioridad] = useState('Media');
  const [descripcion, setDescripcion] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);

  const fetchTickets = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/tickets');
      const data = await res.json();
      setTickets(data);
    } catch (err) {
      console.error("Error conectando con la API:", err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchTickets();
    }
  }, [user]);

  const handleGoogleSuccess = (credentialResponse: any) => {
    try {
      if (!credentialResponse.credential) return;
      
      const decoded: GoogleUserData = jwtDecode(credentialResponse.credential);
      
      if (decoded.email.endsWith('@alianzafrancesa.org.pe')) {
        const isAdmin = decoded.email.includes('aiquipa') || decoded.email.includes('admin');
        setUser({
          email: decoded.email,
          name: decoded.name,
          role: isAdmin ? "Administrador TI" : "Usuario Corporativo",
          picture: decoded.picture
        });
        setErrorMsg('');
      } else {
        setErrorMsg('Acceso restringido: Debe ingresar únicamente con su cuenta @alianzafrancesa.org.pe');
      }
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
    setLoading(true);

    try {
      await fetch('http://127.0.0.1:8000/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solicitante_email: user?.email,
          tipo_requerimiento: categoria,
          prioridad: prioridad,
          descripcion: descripcion
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
    await fetch(`http://127.0.0.1:8000/api/tickets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        estado: nuevoEstado,
        tecnico_asignado: user?.name
      })
    });
    fetchTickets();
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

          <div className="flex justify-center my-4">
            <GoogleLogin
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

  const pendientes = tickets.filter(t => t.estado === 'Pendiente').length;
  const enProceso = tickets.filter(t => t.estado === 'En Proceso').length;
  const resueltos = tickets.filter(t => t.estado === 'Resuelto').length;

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
          </nav>
        </div>

        <div className="pt-6 border-t border-white/20">
          <div className="mb-3">
            <p className="text-sm font-bold text-white">{user.name}</p>
            <p className="text-xs text-red-100 truncate">{user.email}</p>
            <span className="inline-block mt-2 bg-[#002395] text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase">
              {user.role}
            </span>
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
                <p className="text-xs font-bold text-emerald-600 uppercase">Resueltos</p>
                <p className="text-3xl font-extrabold text-emerald-600 mt-1">{resueltos}</p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <h3 className="font-bold text-slate-800">Solicitudes Ingresadas</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {tickets.map((t) => (
                  <div key={t.id} className="p-6 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono font-bold text-[#ED1C24]">#{t.id}</span>
                        <h4 className="font-bold text-slate-900">{t.tipo_requerimiento}</h4>
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                          t.estado === 'Pendiente' ? 'bg-amber-100 text-amber-800' :
                          t.estado === 'En Proceso' ? 'bg-sky-100 text-sky-800' :
                          'bg-emerald-100 text-emerald-800'
                        }`}>
                          {t.estado}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">{t.descripcion}</p>
                      <p className="text-[11px] text-slate-400">Solicitante: {t.solicitante_email} • {t.fecha_creacion}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUpdateStatus(t.id, 'En Proceso')}
                        className="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 text-xs font-semibold border border-sky-200 hover:bg-sky-100"
                      >
                        En Proceso
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(t.id, 'Resuelto')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200 hover:bg-emerald-100"
                      >
                        Resolver
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'mis-tickets' && (
          <div className="max-w-4xl mx-auto space-y-4">
            <h1 className="text-2xl font-bold text-slate-900 mb-6">Mis Solicitudes</h1>
            {tickets.map((t) => (
              <div key={t.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="text-xs font-mono font-bold text-[#ED1C24]">Ticket #{t.id}</span>
                    <h3 className="font-bold text-slate-900 text-base">{t.tipo_requerimiento}</h3>
                  </div>
                  <span className="text-xs bg-slate-100 text-slate-700 font-semibold px-3 py-1 rounded-full">
                    {t.estado}
                  </span>
                </div>
                <p className="text-slate-600 text-sm mb-4">{t.descripcion}</p>
                <div className="text-xs text-slate-400 flex justify-between pt-4 border-t border-slate-100">
                  <span>Fecha: {t.fecha_creacion}</span>
                  <span>Técnico: {t.tecnico_asignado}</span>
                </div>
              </div>
            ))}
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