'use client';

import React, { useState, useEffect } from 'react';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { 
  ShieldAlert, CheckCircle2, Clock, 
  PlusCircle, LayoutDashboard, LogOut,
  Send, Menu, X, Bot, BookOpen, SearchX, Search, Pencil, Loader2,
  AlertTriangle, Flag, CircleDot, MapPin, Calendar, MessageSquare, User, UserCircle2, Tag
} from 'lucide-react';
import BackToHome from '@/components/BackToHome';

const GOOGLE_CLIENT_ID = "274739568755-s1kq1q8orh7e3edneubiahgimtrgvrgi.apps.googleusercontent.com";

// URL base de la API - configurable via variable de entorno
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

interface Ticket {
  id: number;
  solicitante_email: string;
  user_name?: string;
  tipo_requerimiento: string;
  prioridad: string;
  descripcion: string;
  estado: string;
  tecnico_asignado: string;
  tecnico_asignado_id?: number;
  sede?: string;
  tipo_colaborador?: string;
  notas_tecnicas?: string;
  fecha_creacion: string;
  codigo?: string;
  fecha_resolucion?: string;
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

// Formatea el correlativo único del ticket: "AF-2026-0001 · Ticket #6"
function formatoCorrelativo(t: Ticket): string {
  return t.codigo ? `${t.codigo} · Ticket #${t.id}` : `Ticket #${t.id}`;
}

// Formatea el solicitante: "Nombre Completo (correo@alianzafrancesa.org.pe)"
function formatoSolicitante(t: Ticket): string {
  const nombre = t.user_name?.trim();
  const correo = t.solicitante_email?.trim();
  if (nombre && correo) return `${nombre} (${correo})`;
  return correo || nombre || '—';
}

// Formatea fecha/hora en formato legible: "26/09/2026 09:26 AM"
function formatoFecha(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// =============================================================================
// Helpers visuales para el detalle de ticket (patrón Linear / Zendesk)
// =============================================================================

// Badge de prioridad con ícono y texto fino
function prioridadBadgeClasses(prioridad: string): string {
  const base = 'inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full border text-[11px]';
  switch (prioridad) {
    case 'Crítica':
      return `${base} bg-red-50 text-red-700 border-red-200`;
    case 'Alta':
      return `${base} bg-orange-50 text-orange-700 border-orange-200`;
    case 'Media':
      return `${base} bg-amber-50 text-amber-700 border-amber-200`;
    case 'Baja':
      return `${base} bg-slate-100 text-slate-600 border-slate-200`;
    default:
      return `${base} bg-slate-100 text-slate-600 border-slate-200`;
  }
}

function prioridadIcono(prioridad: string) {
  switch (prioridad) {
    case 'Crítica':
      return <AlertTriangle className="w-3 h-3" />;
    case 'Alta':
    case 'Media':
      return <Flag className="w-3 h-3" />;
    case 'Baja':
      return <CircleDot className="w-3 h-3" />;
    default:
      return null;
  }
}

// Fecha relativa estilo Linear/Zendesk: "hace 5 min", "hace 2 h", "hace 1 día"
function formatoRelativo(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.floor(h / 24);
  if (dias === 1) return 'hace 1 día';
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  if (meses === 1) return 'hace 1 mes';
  return `hace ${meses} meses`;
}

// Tiempo restante hacia una fecha futura: "en 2 h", "en 3 días", "vencido"
function formatoRestante(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const min = Math.floor((d.getTime() - Date.now()) / 60000);
  if (min <= 0) return 'vencido';
  if (min < 60) return `en ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `en ${h} h`;
  const dias = Math.floor(h / 24);
  return `en ${dias} días`;
}

// SLA derivado de la prioridad (solo visual; sin cambios en backend)
function calcularSLA(t: Ticket): Date {
  const base = new Date(t.fecha_creacion);
  const inicio = isNaN(base.getTime()) ? new Date() : base;
  const horas = t.prioridad === 'Crítica' ? 4 : t.prioridad === 'Alta' ? 8 : t.prioridad === 'Baja' ? 48 : 24;
  return new Date(inicio.getTime() + horas * 3600000);
}

// Extrae el id de ticket desde la URL (/admin/tickets/[id] o ?ticket=[id])
function leerTicketDeURL(): number | null {
  if (typeof window === 'undefined') return null;
  const m = window.location.pathname.match(/\/admin\/tickets\/(\d+)/);
  if (m) return Number(m[1]);
  const q = new URLSearchParams(window.location.search).get('ticket');
  if (q && /^\d+$/.test(q)) return Number(q);
  return null;
}

// Nodos de actividad para la línea de tiempo del ticket
interface NodoTimeline {
  fecha: string;
  actor: string;
  rol: string;
  accion: string;
  detalle?: string;
  tipo: 'solicitante' | 'tecnico' | 'sistema';
}

function construirTimeline(t: Ticket): NodoTimeline[] {
  const nodos: NodoTimeline[] = [];
  nodos.push({
    fecha: t.fecha_creacion,
    actor: t.user_name?.trim() || t.solicitante_email || 'Solicitante',
    rol: 'Solicitante',
    accion: 'Registró la solicitud',
    detalle: t.descripcion || undefined,
    tipo: 'solicitante',
  });
  if (t.tecnico_asignado) {
    nodos.push({
      fecha: t.fecha_resolucion || t.fecha_creacion,
      actor: t.tecnico_asignado,
      rol: 'Técnico TI',
      accion: 'Tomó el caso y está atendiendo la solicitud',
      tipo: 'tecnico',
    });
  }
  if (t.notas_tecnicas) {
    nodos.push({
      fecha: t.fecha_resolucion || t.fecha_creacion,
      actor: t.tecnico_asignado || 'Equipo TI',
      rol: 'Técnico TI',
      accion: 'Aplicó la solución técnica',
      detalle: t.notas_tecnicas,
      tipo: 'tecnico',
    });
  }
  if (t.estado === 'Solucionado' || t.estado === 'Cerrado') {
    nodos.push({
      fecha: t.fecha_resolucion || t.fecha_creacion,
      actor: t.tecnico_asignado || 'Equipo TI',
      rol: 'Sistema',
      accion: t.estado === 'Cerrado' ? 'Caso cerrado' : 'Caso resuelto',
      tipo: 'sistema',
    });
  }
  return nodos;
}

// Línea de tiempo con avatares, fechas relativas y conectores sutiles
function TicketTimeline({ ticket }: { ticket: Ticket }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, []);
  const nodos = construirTimeline(ticket);
  return (
    <div>
      {nodos.map((n, i) => (
        <div key={i} className="relative flex gap-3 pb-5 last:pb-0">
          {i < nodos.length - 1 && (
            <span className="absolute left-[15px] top-9 bottom-0 w-px bg-slate-200" />
          )}
          <div
            className={`relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
              n.tipo === 'solicitante'
                ? 'bg-[#002395] text-white border-[#002395]'
                : n.tipo === 'tecnico'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
          >
            {n.tipo === 'sistema' ? <CheckCircle2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-800">{n.actor}</span>
              <span className="text-[11px] font-medium text-slate-400">{n.rol}</span>
              <span className="text-[11px] text-slate-400">· {formatoRelativo(n.fecha)}</span>
            </div>
            <p className="text-sm text-slate-600 mt-0.5">{n.accion}</p>
            {n.detalle && (
              <p className="text-sm text-slate-700 whitespace-pre-line mt-1.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
                {n.detalle}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Fila de propiedad para el panel lateral
function Propiedad({
  icono,
  label,
  children,
}: {
  icono?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
        {icono}
        {label}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// Pipeline de avance del ticket (stepper visual)
const PASOS_TICKET = ['Recibido', 'En Revisión', 'En Proceso', 'Solucionado'];

function indiceProgreso(estado: string): number {
  switch (estado) {
    case 'Pendiente':
      return 0;
    case 'En Proceso':
      return 2;
    case 'Solucionado':
    case 'Cerrado':
      return 3;
    default:
      return 0;
  }
}

function TicketStepper({ estado }: { estado: string }) {
  const activo = indiceProgreso(estado);
  return (
    <div className="flex items-start w-full mt-4 mb-2">
      {PASOS_TICKET.map((paso, i) => {
        const alcanzado = i <= activo;
        return (
          <div key={paso} className={`flex items-start ${i < PASOS_TICKET.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex flex-col items-center min-w-0">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-colors ${
                  alcanzado ? 'bg-[#002395] border-[#002395] text-white' : 'bg-white border-slate-300 text-slate-400'
                }`}
              >
                {alcanzado ? '✓' : i + 1}
              </div>
              <span className={`mt-1 text-[9px] font-semibold whitespace-nowrap ${alcanzado ? 'text-[#002395]' : 'text-slate-400'}`}>
                {paso}
              </span>
            </div>
            {i < PASOS_TICKET.length - 1 && (
              <div className={`flex-1 h-0.5 mt-3 mx-1 rounded-full ${alcanzado ? 'bg-[#002395]' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
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
      className="flex items-center justify-center gap-3 w-full max-w-xs px-4 py-2.5 bg-white border border-slate-300 rounded-full shadow-sm hover:bg-slate-50 active:scale-[0.98] transition-all font-medium text-slate-700 text-sm mx-auto"
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
  const [activeTab, setActiveTab] = useState<'crear' | 'mis-tickets' | 'dashboard' | 'usuarios' | 'sedes' | 'entrenamiento'>('crear');
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
  const [editandoUsuario, setEditandoUsuario] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ nombre: '', email: '', rol: 'Usuario', estado: 'Activo', tipo_colaborador: '', sede_id: '' });
  const [editGuardando, setEditGuardando] = useState(false);
  const [editError, setEditError] = useState('');
  const [notasDraft, setNotasDraft] = useState<Record<number, string>>({});
  const [codigoSeguimiento, setCodigoSeguimiento] = useState<string | null>(null);
  const [ticketDetalle, setTicketDetalle] = useState<Ticket | null>(null);

  // Filtros combinados del dashboard/bandeja (aplican para el equipo TI)
  const [filtroSede, setFiltroSede] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState('');
  const [filtroTipoColab, setFiltroTipoColab] = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [filtroBusqueda, setFiltroBusqueda] = useState('');

  // Asignación de técnicos + WhatsApp + menú móvil + asistente virtual
  const [tecnicos, setTecnicos] = useState<any[]>([]);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [asistenteAbierto, setAsistenteAbierto] = useState(false);
  const [asistenteConsulta, setAsistenteConsulta] = useState('');
  const [asistenteResultado, setAsistenteResultado] = useState<any[]>([]);
  const [asistenteLoading, setAsistenteLoading] = useState(false);

  // Base de conocimiento IA (entrenamiento, solo TI)
  const [soluciones, setSoluciones] = useState<any[]>([]);
  const [nuevaSolucion, setNuevaSolucion] = useState({ titulo: '', palabras_clave: '', pasos: '', categoria: 'Impresoras' });

  // Chat flotante global (Asistente de IA)
  const [chatAbierto, setChatAbierto] = useState(false);
  const [chatMensajes, setChatMensajes] = useState<{ rol: 'user' | 'bot'; texto: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const fetchTickets = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/tickets`, {
        headers: { 'X-User-Email': user?.email || '' }
      });
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

  const fetchTecnicos = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/tecnicos`, {
        headers: { 'X-User-Email': user?.email || '' }
      });
      if (res.ok) setTecnicos(await res.json());
    } catch (err) {
      console.error("Error cargando técnicos:", err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchTickets();
      fetchSedes();
      if (TI_ROLES.includes(user.rol || '')) {
        fetchTecnicos();
        fetchSoluciones();
      }
      if (user.rol === 'ADMIN_TI') {
        fetchUsuarios();
      }
    }
  }, [user]);

  // Revalida las sedes al entrar al formulario de registro para reflejar
  // en tiempo real las sedes nuevas o eliminadas (sin recargar la página).
  useEffect(() => {
    if (user && activeTab === 'crear') {
      fetchSedes();
    }
  }, [activeTab, user]);

  // Deep-link: si la URL trae /admin/tickets/[id] o ?ticket=[id], abre el detalle
  useEffect(() => {
    const id = leerTicketDeURL();
    if (!id) return;
    const t = tickets.find((x) => x.id === id);
    if (t) setTicketDetalle(t);
  }, [tickets]);

  // Cierra cualquier modal abierto con la tecla Escape (UX tipo Linear/Zendesk)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTicketDetalle(null);
        setCodigoSeguimiento(null);
        setEditandoUsuario(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const abrirDetalle = (t: Ticket) => {
    setTicketDetalle(t);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', `/admin/tickets/${t.id}`);
    }
  };

  const cerrarDetalle = () => {
    setTicketDetalle(null);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
  };

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
      const res = await fetch(`${API_BASE_URL}/api/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solicitante_email: user?.email,
          user_name: user?.name,
          tipo_requerimiento: categoria,
          prioridad: prioridad,
          descripcion: descripcion,
          sede: sede,
          tipo_colaborador: tipoColaborador
        })
      });
      const data = await res.json();
      setDescripcion('');
      setSuccessMsg(true);
      if (data.codigo) setCodigoSeguimiento(data.codigo);
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

  const handleAsignarTecnico = async (ticketId: number, tecnicoId: string) => {
    if (!tecnicoId) return;
    await fetch(`${API_BASE_URL}/api/tickets/${ticketId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': user?.email || '' },
      body: JSON.stringify({ tecnico_asignado_id: Number(tecnicoId) })
    });
    fetchTickets();
  };

  const handleWhatsApp = (t: Ticket) => {
    const tecnico = tecnicos.find((tc) => tc.id === t.tecnico_asignado_id);
    const numero = (tecnico?.telefono_whatsapp || '+51986068159').replace(/\D/g, '');
    const resumen = (t.descripcion || '').slice(0, 120);
    const msg = `Soporte TI Alianza\nCódigo: ${formatoCorrelativo(t)}\nSede: ${t.sede || '—'}\nSolicitud: ${resumen}`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const consultarAsistente = async () => {
    if (!asistenteConsulta.trim()) return;
    setAsistenteLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/asistente`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consulta: asistenteConsulta })
      });
      const data = await res.json();
      setAsistenteResultado(data.soluciones || []);
    } catch (err) {
      setAsistenteResultado([]);
    } finally {
      setAsistenteLoading(false);
    }
  };

  const fetchSoluciones = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/soluciones`, {
        headers: { 'X-User-Email': user?.email || '' }
      });
      if (res.ok) setSoluciones(await res.json());
    } catch (err) {
      console.error("Error cargando soluciones:", err);
    }
  };

  const handleCreateSolucion = async () => {
    if (!nuevaSolucion.titulo.trim() || !nuevaSolucion.pasos.trim()) return;
    await fetch(`${API_BASE_URL}/api/soluciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': user?.email || '' },
      body: JSON.stringify(nuevaSolucion)
    });
    setNuevaSolucion({ titulo: '', palabras_clave: '', pasos: '', categoria: 'Impresoras' });
    fetchSoluciones();
  };

  const handleToggleSolucion = async (id: number, activo: boolean) => {
    await fetch(`${API_BASE_URL}/api/soluciones/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': user?.email || '' },
      body: JSON.stringify({ activo })
    });
    fetchSoluciones();
  };

  const handleDeleteSolucion = async (id: number) => {
    if (!confirm('¿Eliminar esta solución?')) return;
    await fetch(`${API_BASE_URL}/api/soluciones/${id}`, {
      method: 'DELETE',
      headers: { 'X-User-Email': user?.email || '' }
    });
    fetchSoluciones();
  };

  const enviarChat = async () => {
    const texto = chatInput.trim();
    if (!texto || chatLoading) return;
    setChatMensajes((prev) => [...prev, { rol: 'user', texto }]);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/asistente`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consulta: texto })
      });
      const data = await res.json();
      const sols = data.soluciones || [];
      if (sols.length > 0) {
        const pasos = sols.flatMap((s: any) => (s.pasos || []) as string[]);
        setChatMensajes((prev) => [...prev, { rol: 'bot', texto: pasos.join('\n') }]);
      } else {
        setChatMensajes((prev) => [...prev, { rol: 'bot', texto: 'No encontré una solución automática. Te recomiendo generar un ticket para que el equipo de TI te apoye.' }]);
      }
    } catch (err) {
      setChatMensajes((prev) => [...prev, { rol: 'bot', texto: 'Ocurrió un error al consultar. Intenta de nuevo.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const irAFormulario = () => {
    const ultimo = [...chatMensajes].reverse().find((m) => m.rol === 'user');
    if (ultimo) setDescripcion(ultimo.texto);
    setChatAbierto(false);
    setActiveTab('crear');
  };

  const handleUserUpdate = async (id: number, campos: Record<string, any>) => {
    const res = await fetch(`${API_BASE_URL}/api/usuarios/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': user?.email || '' },
      body: JSON.stringify(campos)
    });
    if (!res.ok) return;
    // Actualización optimista + reconciliación con el backend.
    setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, ...campos } : u)));
    await fetchUsuarios();
  };

  const abrirEdicion = (u: any) => {
    setEditandoUsuario(u);
    setEditForm({
      nombre: u.nombre || '',
      email: u.email || '',
      rol: u.rol || 'Usuario',
      estado: u.estado || 'Activo',
      tipo_colaborador: u.tipo_colaborador || '',
      sede_id: u.sede_id != null ? String(u.sede_id) : '',
    });
    setEditError('');
  };

  const handleUserSave = async () => {
    if (!editandoUsuario) return;
    const email = editForm.email.trim();
    if (!email) {
      setEditError('El correo institucional es obligatorio.');
      return;
    }
    setEditGuardando(true);
    setEditError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/usuarios/${editandoUsuario.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-User-Email': user?.email || '' },
        body: JSON.stringify({
          nombre: editForm.nombre,
          email,
          rol: editForm.rol,
          estado: editForm.estado,
          tipo_colaborador: editForm.tipo_colaborador || null,
          sede_id: editForm.sede_id ? Number(editForm.sede_id) : null,
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setEditError(data?.detail || 'No se pudo actualizar el usuario.');
        return;
      }
      // Actualización optimista + reconciliación con el backend en tiempo real.
      setUsuarios((prev) => prev.map((u) => (u.id === editandoUsuario.id ? { ...u, ...data } : u)));
      setEditandoUsuario(null);
      await fetchUsuarios();
    } catch (err) {
      setEditError('Error de conexión al actualizar el usuario.');
    } finally {
      setEditGuardando(false);
    }
  };

  const handleUserDelete = async (id: number) => {
    if (!confirm('¿Eliminar este usuario?')) return;
    const res = await fetch(`${API_BASE_URL}/api/usuarios/${id}`, {
      method: 'DELETE',
      headers: { 'X-User-Email': user?.email || '' }
    });
    if (!res.ok) return;
    setUsuarios((prev) => prev.filter((u) => u.id !== id));
    await fetchUsuarios();
  };

  const handleSedeDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta sede?')) return;
    const res = await fetch(`${API_BASE_URL}/api/sedes/${id}`, {
      method: 'DELETE',
      headers: { 'X-User-Email': user?.email || '' }
    });
    if (!res.ok) return;
    setSedes((prev) => prev.filter((s) => s.id !== id));
    await fetchSedes();
  };

  const [nuevoUsuario, setNuevoUsuario] = useState({ email: '', nombre: '', rol: 'Usuario' });
  const [nuevaSede, setNuevaSede] = useState({ nombre: '', tipo: 'Sede Descentralizada' });

  const handleCreateUsuario = async () => {
    if (!nuevoUsuario.email.trim()) return;
    const res = await fetch(`${API_BASE_URL}/api/usuarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': user?.email || '' },
      body: JSON.stringify(nuevoUsuario)
    });
    if (res.ok) {
      const creado = await res.json();
      setUsuarios((prev) => [...prev, creado]);
    }
    setNuevoUsuario({ email: '', nombre: '', rol: 'Usuario' });
    await fetchUsuarios();
  };

  const handleCreateSede = async () => {
    if (!nuevaSede.nombre.trim()) return;
    const res = await fetch(`${API_BASE_URL}/api/sedes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': user?.email || '' },
      body: JSON.stringify(nuevaSede)
    });
    if (res.ok) {
      const creada = await res.json();
      setSedes((prev) => [...prev, creada]);
    }
    setNuevaSede({ nombre: '', tipo: 'Sede Descentralizada' });
    await fetchSedes();
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

  // Pestaña de inicio según el rol: el equipo TI opera desde el Dashboard,
  // mientras que el usuario corporativo lo hace desde el formulario de solicitud.
  const homeTab = isTI ? 'dashboard' : 'crear';

  // Navegación global "Volver al Inicio": cierra cualquier detalle abierto y
  // regresa a la pestaña de inicio del rol actual, restableciendo la URL a "/".
  const volverAlInicio = () => {
    setTicketDetalle(null);
    setActiveTab(homeTab);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
  };

  // Navegación desde el menú lateral: cambia de pestaña y, en la vista móvil,
  // cierra el sidebar automáticamente una vez ejecutada la navegación.
  const navegarATab = (tab: 'crear' | 'mis-tickets' | 'dashboard' | 'usuarios' | 'sedes' | 'entrenamiento') => {
    setActiveTab(tab);
    setMenuAbierto(false);
  };

  const coincideBusqueda = (t: Ticket) => {
    const q = filtroBusqueda.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
      t.codigo || '',
      String(t.id),
      t.solicitante_email || '',
      t.user_name || '',
      t.sede || '',
      t.tipo_requerimiento || '',
      t.descripcion || '',
      t.tecnico_asignado || '',
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  };

  const ticketsFiltrados = tickets.filter((t) => {
    if (filtroSede && t.sede !== filtroSede) return false;
    if (filtroEstado && t.estado !== filtroEstado) return false;
    if (filtroPrioridad && t.prioridad !== filtroPrioridad) return false;
    if (filtroTipoColab && t.tipo_colaborador !== filtroTipoColab) return false;
    if (filtroDesde && new Date(t.fecha_creacion) < new Date(filtroDesde)) return false;
    if (filtroHasta && new Date(t.fecha_creacion) > new Date(filtroHasta + 'T23:59:59')) return false;
    if (!coincideBusqueda(t)) return false;
    return true;
  });

  const pendientes = ticketsFiltrados.filter(t => t.estado === 'Pendiente').length;
  const enProceso = ticketsFiltrados.filter(t => t.estado === 'En Proceso').length;
  const solucionados = ticketsFiltrados.filter(t => t.estado === 'Solucionado').length;
  const cerrados = ticketsFiltrados.filter(t => t.estado === 'Cerrado').length;

  // Resumen del usuario (Mis Solicitudes)
  const misTicketsBase = tickets.filter(t => t.solicitante_email === user?.email);
  const misTicketsTotal = misTicketsBase.length;
  const misTicketsEnProceso = misTicketsBase.filter(t => t.estado === 'En Proceso').length;
  const misTicketsResueltos = misTicketsBase.filter(t => t.estado === 'Solucionado' || t.estado === 'Cerrado').length;
  const misTicketsFiltrados = misTicketsBase.filter(t => coincideBusqueda(t));

  const promedioAtencion = (() => {
    const resueltos = ticketsFiltrados.filter(t => t.estado === 'Solucionado' && t.fecha_resolucion);
    if (resueltos.length === 0) return '—';
    const totalMs = resueltos.reduce((acc, t) => acc + (new Date(t.fecha_resolucion!).getTime() - new Date(t.fecha_creacion).getTime()), 0);
    const horas = totalMs / resueltos.length / 3600000;
    return horas >= 24 ? `${(horas / 24).toFixed(1)} días` : `${horas.toFixed(1)} h`;
  })();

  const exportarCSV = () => {
    const cabeceras = ['Código', 'Ticket #', 'Solicitante', 'Sede', 'Tipo Colaborador', 'Prioridad', 'Estado', 'Fecha Creación', 'Descripción'];
    const filas = ticketsFiltrados.map(t => [t.codigo || '', String(t.id), formatoSolicitante(t), t.sede || '', t.tipo_colaborador || '', t.prioridad || '', t.estado, t.fecha_creacion, t.descripcion || '']);
    const csv = [cabeceras, ...filas].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reporte_tickets.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const REPORTE_CSS = `
  :root { --rojo:#e30613; --azul:#002395; --gris:#f4f5f7; --borde:#e5e7eb; --texto:#1f2937; --muted:#6b7280; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: var(--texto); background: #f4f5f7; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding-top: 76px; }
  .toolbar-pdf { position: fixed; top: 0; left: 0; right: 0; height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 16px; background: #1f2937; color: #fff; z-index: 9999; box-shadow: 0 2px 10px rgba(0,0,0,.3); }
  .toolbar-pdf .titulo { font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .toolbar-btn { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; background: #e30613; color: #fff; border: none; border-radius: 999px; padding: 10px 18px; font-size: 14px; font-weight: 700; cursor: pointer; line-height: 1; }
  .toolbar-btn:active { background: #b00510; }
  @media (max-width: 480px) {
    body { padding-top: 68px; }
    .toolbar-pdf { height: 50px; padding: 0 12px; }
    .toolbar-pdf .titulo { font-size: 13px; }
    .toolbar-btn { padding: 9px 14px; font-size: 13px; }
  }
  .reporte-card { background:#fff; border-radius:16px; border:1px solid var(--borde); box-shadow:0 4px 18px rgba(0,0,0,.06); margin:20px auto; max-width:820px; overflow:hidden; page-break-after:always; }
  .reporte-card:last-child { page-break-after:auto; }
  .encabezado { display:flex; align-items:center; gap:16px; padding:20px 24px; border-bottom:3px solid var(--rojo); background:linear-gradient(90deg,#fff,#fdf2f2); }
  .logo { height:56px; width:auto; }
  .encabezado-info { flex:1; }
  .ticket-num { font-size:22px; font-weight:800; color:var(--azul); letter-spacing:.5px; }
  .codigo { font-size:12px; color:var(--muted); margin-top:2px; }
  .fecha-emision { font-size:12px; color:var(--muted); text-align:right; }
  .seccion { padding:18px 24px; border-bottom:1px solid var(--borde); }
  .seccion h2 { font-size:12px; text-transform:uppercase; letter-spacing:1.2px; color:var(--rojo); font-weight:800; margin-bottom:14px; }
  .grid-datos { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .campo { background:var(--gris); border:1px solid var(--borde); border-radius:10px; padding:12px 14px; }
  .campo.ancho { grid-column:1 / -1; }
  .campo span { display:block; font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; }
  .campo strong { font-size:14px; color:var(--texto); }
  .detalle p { font-size:14px; line-height:1.6; color:var(--texto); }
  .timeline { position:relative; padding-left:8px; }
  .nodo { display:flex; gap:14px; padding-bottom:18px; position:relative; }
  .nodo:not(:last-child)::before { content:''; position:absolute; left:17px; top:32px; bottom:0; width:2px; background:var(--borde); }
  .marcador { flex-shrink:0; width:36px; height:36px; border-radius:50%; background:var(--azul); color:#fff; font-weight:800; font-size:14px; display:flex; align-items:center; justify-content:center; z-index:1; }
  .nodo-cuerpo { background:var(--gris); border:1px solid var(--borde); border-radius:10px; padding:10px 14px; flex:1; }
  .nodo-top { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px; }
  .nodo-fecha { font-size:11px; color:var(--muted); font-weight:600; }
  .nodo-rol { font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:var(--rojo); font-weight:800; background:#fdecec; border-radius:999px; padding:2px 8px; }
  .nodo-actor { font-size:13px; font-weight:700; color:var(--azul); }
  .nodo-accion { font-size:12px; font-weight:600; color:var(--texto); margin-top:2px; }
  .nodo-detalle { font-size:12px; color:var(--muted); margin-top:4px; line-height:1.5; }
  .conclusion-box { border:2px solid var(--rojo); border-left:6px solid var(--rojo); border-radius:12px; padding:16px; background:#fffafa; }
  .conclusion-estado { margin-bottom:10px; }
  .estado { display:inline-block; font-weight:800; font-size:12px; letter-spacing:1px; text-transform:uppercase; padding:5px 14px; border-radius:999px; }
  .estado.resuelto { background:#16a34a; color:#fff; }
  .estado.proceso { background:#2563eb; color:#fff; }
  .conclusion-texto { font-size:13px; line-height:1.6; color:var(--texto); }
  .firmas { display:flex; gap:40px; padding:30px 24px 36px; }
  .firma { flex:1; text-align:center; }
  .firma .linea { border-bottom:1.5px solid var(--texto); height:40px; margin-bottom:8px; }
  .firma span { font-size:12px; color:var(--muted); }
  .seccion, .campo, .nodo, .nodo-cuerpo, .timeline, .historico, .conclusion, .conclusion-box, .firmas, .firma, .detalle p, .conclusion-texto { break-inside: avoid; page-break-inside: avoid; }
  @media print {
    body { background:#fff; padding-top: 0 !important; }
    .toolbar-pdf { display: none !important; }
    .reporte-card { box-shadow:none; border:1px solid var(--borde); margin:0 auto 12px; border-radius:0; }
    .reporte-card, .seccion, .nodo, .conclusion-box, .firmas { box-shadow:none; }
    .accion-botones, button { display:none !important; }
  }
  `;


  const exportarReportePDF = (lista: Ticket[]) => {
    const w = window.open('', '_blank');
    if (!w) return;

    const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
    const fmtFecha = formatoFecha;
    const logoFallback = 'data:image/svg+xml,' + encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='150' height='60'><rect width='150' height='60' rx='12' fill='#e30613'/><text x='75' y='41' font-family='Arial,sans-serif' font-size='30' font-weight='bold' fill='#ffffff' text-anchor='middle'>AF</text></svg>`
    ).replace(/'/g, '%27');
    const emision = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });
    const estadoResuelto = (estado: string) => estado === 'Solucionado' || estado === 'Cerrado';

    const portada = lista.length > 1
      ? `<section class="reporte-card portada"><header class="encabezado"><img class="logo" src="/logo.png" onerror="this.onerror=null;this.src='${logoFallback}'" alt="Alianza Francesa" /><div class="encabezado-info"><div class="ticket-num">Reporte de Soporte TI</div><div class="codigo">Sistema IT Alianza</div></div><div class="fecha-emision">Emitido: ${emision}</div></header><div class="seccion"><h2>Resumen Ejecutivo</h2><div class="grid-datos"><div class="campo"><span>Total de tickets</span><strong>${lista.length}</strong></div><div class="campo"><span>Pendientes</span><strong>${lista.filter((x) => x.estado === 'Pendiente').length}</strong></div><div class="campo"><span>En Proceso</span><strong>${lista.filter((x) => x.estado === 'En Proceso').length}</strong></div><div class="campo"><span>Resueltos</span><strong>${lista.filter((x) => x.estado === 'Solucionado' || x.estado === 'Cerrado').length}</strong></div></div></div></section>`
      : '';

    const tarjetas = lista.map((t) => {
      const nodos: { fecha: string; actor: string; rol: string; accion: string; detalle?: string }[] = [];
      nodos.push({ fecha: t.fecha_creacion, actor: formatoSolicitante(t), rol: 'Solicitante', accion: 'Registro de solicitud', detalle: t.descripcion || 'Sin detalle adicional' });
      if (t.tecnico_asignado) {
        nodos.push({ fecha: t.fecha_resolucion || t.fecha_creacion, actor: t.tecnico_asignado, rol: 'Técnico TI', accion: 'Asignación y atención del caso' });
      }
      if (t.notas_tecnicas) {
        nodos.push({ fecha: t.fecha_resolucion || t.fecha_creacion, actor: t.tecnico_asignado || 'Equipo TI', rol: 'Técnico TI', accion: 'Solución técnica aplicada', detalle: t.notas_tecnicas });
      }
      if (estadoResuelto(t.estado)) {
        nodos.push({ fecha: t.fecha_resolucion || t.fecha_creacion, actor: t.tecnico_asignado || 'Equipo TI', rol: 'Técnico TI', accion: 'Caso RESUELTO y cerrado' });
      }
      const timeline = nodos.map((n, i) => `
          <div class="nodo">
            <div class="marcador">${i + 1}</div>
            <div class="nodo-cuerpo">
              <div class="nodo-top"><span class="nodo-fecha">${esc(fmtFecha(n.fecha))}</span><span class="nodo-rol">${esc(n.rol)}</span></div>
              <div class="nodo-actor">${esc(n.actor)}</div>
              <div class="nodo-accion">${esc(n.accion)}</div>
              ${n.detalle ? `<div class="nodo-detalle">${esc(n.detalle)}</div>` : ''}
            </div>
          </div>`).join('');
      const estadoBadge = estadoResuelto(t.estado) ? '<span class="estado resuelto">RESUELTO</span>' : '<span class="estado proceso">EN PROCESO</span>';
      return `
      <section class="reporte-card">
        <header class="encabezado">
          <img class="logo" src="/logo.png" onerror="this.onerror=null;this.src='${logoFallback}'" alt="Alianza Francesa" />
          <div class="encabezado-info">
            <div class="ticket-num">${esc(formatoCorrelativo(t))}</div>
          </div>
          <div class="fecha-emision">Emitido: ${emision}</div>
        </header>
        <div class="seccion datos">
          <h2>Datos del Requerimiento</h2>
          <div class="grid-datos">
            <div class="campo"><span>Sede de origen</span><strong>${esc(t.sede || '—')}</strong></div>
            <div class="campo"><span>Tipo de colaborador</span><strong>${esc(t.tipo_colaborador || '—')}</strong></div>
            <div class="campo"><span>Prioridad</span><strong>${esc(t.prioridad || '—')}</strong></div>
            <div class="campo"><span>Usuario afectado</span><strong>${esc(formatoSolicitante(t))}</strong></div>
            <div class="campo ancho"><span>Categoría del servicio</span><strong>${esc(t.tipo_requerimiento || '—')}</strong></div>
          </div>
        </div>
        <div class="seccion detalle">
          <h2>Detalle del Requerimiento</h2>
          <p>${esc(t.descripcion || 'Sin descripción registrada.')}</p>
        </div>
        <div class="seccion historico">
          <h2>Histórico y Línea de Tiempo</h2>
          <div class="timeline">${timeline}</div>
        </div>
        <div class="seccion conclusion">
          <h2>Conclusión y Solución Aplicada</h2>
          <div class="conclusion-box">
            <div class="conclusion-estado">${estadoBadge}</div>
            <p class="conclusion-texto">${esc(t.notas_tecnicas || (estadoResuelto(t.estado) ? 'Caso atendido y resuelto por el equipo de TI.' : 'Caso en atención por el equipo de soporte TI.'))}</p>
          </div>
        </div>
        <div class="firmas">
          <div class="firma"><div class="linea"></div><span>Firma del Técnico TI</span></div>
          <div class="firma"><div class="linea"></div><span>Conformidad del Usuario</span></div>
        </div>
      </section>`;
    }).join('');

    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reporte de Tickets TI — Alianza Francesa</title><style>${REPORTE_CSS}</style></head><body><div class="toolbar-pdf"><div class="titulo">Reporte de Tickets TI</div><button type="button" class="toolbar-btn" onclick="cerrarVista()">← Volver</button></div>${portada}${tarjetas}<script>function cerrarVista(){try{window.close();}catch(e){}setTimeout(function(){window.location.replace('/');},250);}</script></body></html>`;
    w.document.write(html);
    w.document.close();
    w.print();
  };

  const exportarPDF = () => exportarReportePDF(ticketsFiltrados);
  const exportarTicketPDF = (t: Ticket) => exportarReportePDF([t]);
  // SLA visual del detalle (derivado de prioridad; solo presentación)
  const slaDetalle = ticketDetalle ? calcularSLA(ticketDetalle) : null;
  const slaDetalleVencido =
    !!slaDetalle &&
    !['Solucionado', 'Cerrado'].includes(ticketDetalle?.estado || '') &&
    new Date().getTime() > slaDetalle.getTime();

  return (
    <div className="min-h-screen bg-[#FDFBFB] text-slate-800 flex font-sans">
      {/* Overlay móvil del menú */}
      {menuAbierto && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setMenuAbierto(false)} />
      )}

      {/* Sidebar Rojo Institucional */}
      <aside className={`w-72 bg-[#ED1C24] text-white p-6 flex flex-col justify-between shadow-2xl fixed inset-y-0 left-0 z-40 transition-transform duration-200 md:static md:translate-x-0 ${menuAbierto ? 'translate-x-0' : '-translate-x-full'}`}>
        <div>
          <button
            onClick={() => setMenuAbierto(false)}
            className="md:hidden w-full flex justify-end mb-2 text-white/80 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
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
              onClick={() => navegarATab('crear')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'crear' 
                  ? 'bg-white text-[#ED1C24] shadow-lg' 
                  : 'text-white hover:bg-white/10'
              }`}
            >
              <PlusCircle className="w-4 h-4" /> Nuevo Requerimiento
            </button>

            <button
              onClick={() => navegarATab('mis-tickets')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'mis-tickets' 
                  ? 'bg-white text-[#ED1C24] shadow-lg' 
                  : 'text-white hover:bg-white/10'
              }`}
            >
              <Clock className="w-4 h-4" /> {isTI ? 'Bandeja de Tickets IT' : 'Mis Solicitudes'}
            </button>

            {isTI && (
              <button
                onClick={() => navegarATab('dashboard')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === 'dashboard' 
                    ? 'bg-white text-[#ED1C24] shadow-lg' 
                    : 'text-white hover:bg-white/10'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" /> Dashboard IT
              </button>
            )}

            {isTI && (
              <button
                onClick={() => navegarATab('entrenamiento')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === 'entrenamiento' 
                    ? 'bg-white text-[#ED1C24] shadow-lg' 
                    : 'text-white hover:bg-white/10'
                }`}
              >
                <BookOpen className="w-4 h-4" /> Entrenamiento IA
              </button>
            )}

            {isAdmin && (
              <>
                <button
                  onClick={() => navegarATab('usuarios')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === 'usuarios' 
                      ? 'bg-white text-[#ED1C24] shadow-lg' 
                      : 'text-white hover:bg-white/10'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4" /> Gestión de Usuarios
                </button>
                <button
                  onClick={() => navegarATab('sedes')}
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

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="md:hidden flex items-center justify-between mb-4">
          <button onClick={() => setMenuAbierto(true)} className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm">
            <Menu className="w-5 h-5 text-slate-700" />
          </button>
          <span className="text-sm font-bold text-slate-800">Sistema IT Alianza</span>
        </div>
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
                  {sedes.map((s) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
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
                className="w-full bg-[#ED1C24] hover:bg-[#C41219] text-white font-bold py-4 rounded-xl shadow-lg shadow-red-200 transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {loading ? "Enviando..." : "Enviar Requerimiento"}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <BackToHome onClick={volverAlInicio} />
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Panel de Gestión Informática</h1>
                  <p className="text-slate-500 text-sm">Monitoreo de atención y estado de requerimientos.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={exportarCSV} className="px-4 py-2 rounded-xl bg-[#002395] text-white text-xs font-semibold hover:bg-[#001d78] active:scale-[0.98]">Exportar Reporte Excel</button>
                <button onClick={exportarPDF} className="px-4 py-2 rounded-xl bg-[#ED1C24] text-white text-xs font-semibold hover:bg-[#C41219] active:scale-[0.98]">Exportar PDF</button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
              <select value={filtroSede} onChange={(e) => setFiltroSede(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs">
                <option value="">Todas las sedes</option>
                {sedes.map((s) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
              </select>
              <select value={filtroTipoColab} onChange={(e) => setFiltroTipoColab(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs">
                <option value="">Todos los colaboradores</option>
                <option>Administrativo</option><option>Docente</option>
              </select>
              <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs">
                <option value="">Todos los estados</option>
                <option>Pendiente</option><option>En Proceso</option><option>Solucionado</option><option>Cerrado</option>
              </select>
              <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs" />
              <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm border-l-4 border-l-[#ED1C24]">
                <p className="text-xs font-bold text-slate-500 uppercase">Total Tickets</p>
                <p className="text-3xl font-extrabold text-slate-900 mt-1">{ticketsFiltrados.length}</p>
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
                <p className="text-3xl font-extrabold text-emerald-600 mt-1">{solucionados}</p>
              </div>
              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm border-l-4 border-l-[#002395]">
                <p className="text-xs font-bold text-[#002395] uppercase">Promedio Atención</p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">{promedioAtencion}</p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h3 className="font-bold text-slate-800">Solicitudes Ingresadas</h3>
                <span className="text-xs font-medium text-slate-400">{ticketsFiltrados.length} ticket{ticketsFiltrados.length === 1 ? '' : 's'}</span>
              </div>
              {ticketsFiltrados.length === 0 ? (
                <div className="p-12 flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                    <SearchX className="w-7 h-7 text-slate-400" />
                  </div>
                  <h3 className="font-bold text-slate-700">Sin resultados</h3>
                  <p className="text-sm text-slate-500 mt-1">No se encontraron tickets con los filtros aplicados.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[760px]">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                        <th className="px-6 py-3 font-bold">Ticket</th>
                        <th className="px-4 py-3 font-bold">Solicitante</th>
                        <th className="px-4 py-3 font-bold">Estado</th>
                        <th className="px-4 py-3 font-bold">Prioridad</th>
                        <th className="px-4 py-3 font-bold">Asignado a</th>
                        <th className="px-4 py-3 font-bold">Fecha</th>
                        <th className="px-6 py-3 font-bold text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ticketsFiltrados.map((t) => (
                        <tr key={t.id} onClick={() => abrirDetalle(t)} className="hover:bg-slate-50/80 cursor-pointer transition-colors">
                          <td className="px-6 py-3.5 align-top">
                            <span className="block text-[11px] font-mono font-bold text-[#ED1C24]">{formatoCorrelativo(t)}</span>
                            <span className="block text-sm font-semibold text-slate-800">{t.tipo_requerimiento}</span>
                          </td>
                          <td className="px-4 py-3.5 align-top">
                            <span className="block text-sm text-slate-700">{t.user_name?.trim() || '—'}</span>
                            {t.sede && <span className="block text-[11px] text-slate-400">{t.sede}</span>}
                          </td>
                          <td className="px-4 py-3.5 align-top whitespace-nowrap">
                            <span className={`${estadoBadgeClasses(t.estado)} text-[11px]`}>{t.estado}</span>
                          </td>
                          <td className="px-4 py-3.5 align-top whitespace-nowrap">
                            {t.prioridad ? (
                              <span className={prioridadBadgeClasses(t.prioridad)}>{prioridadIcono(t.prioridad)}{t.prioridad}</span>
                            ) : (
                              <span className="text-sm text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 align-top whitespace-nowrap">
                            <span className="text-sm text-slate-600">{t.tecnico_asignado || 'Sin asignar'}</span>
                          </td>
                          <td className="px-4 py-3.5 align-top whitespace-nowrap">
                            <span className="text-xs text-slate-500">{formatoFecha(t.fecha_creacion)}</span>
                          </td>
                          <td className="px-6 py-3.5 align-top text-right whitespace-nowrap">
                            <button
                              onClick={(e) => { e.stopPropagation(); abrirDetalle(t); }}
                              className="px-3 py-1.5 rounded-lg bg-[#002395] text-white text-xs font-semibold hover:bg-[#001d78] active:scale-[0.98]"
                            >
                              Ver detalle
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'mis-tickets' && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
              <h1 className="text-2xl font-bold text-slate-900">{isTI ? 'Bandeja de Tickets IT' : 'Mis Solicitudes'}</h1>
              <BackToHome onClick={volverAlInicio} />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={filtroBusqueda}
                onChange={(e) => setFiltroBusqueda(e.target.value)}
                placeholder={isTI ? 'Buscar por correlativo (AF-2026-XXXX), ID, usuario, sede o categoría…' : 'Buscar por código de ticket o palabra clave…'}
                className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#ED1C24]"
              />
              {filtroBusqueda && (
                <button onClick={() => setFiltroBusqueda('')} className="px-3 py-2 rounded-lg bg-slate-100 text-slate-500 text-xs font-semibold hover:bg-slate-200">Limpiar</button>
              )}
            </div>
            {!isTI && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm border-l-4 border-l-[#002395]">
                  <p className="text-[11px] font-bold text-slate-500 uppercase">Total Solicitudes</p>
                  <p className="text-2xl font-extrabold text-[#002395] mt-1">{misTicketsTotal}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm border-l-4 border-l-sky-500">
                  <p className="text-[11px] font-bold text-slate-500 uppercase">En Proceso</p>
                  <p className="text-2xl font-extrabold text-sky-600 mt-1">{misTicketsEnProceso}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm border-l-4 border-l-emerald-500">
                  <p className="text-[11px] font-bold text-slate-500 uppercase">Resueltos</p>
                  <p className="text-2xl font-extrabold text-emerald-600 mt-1">{misTicketsResueltos}</p>
                </div>
              </div>
            )}
            {isTI && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
                <select value={filtroSede} onChange={(e) => setFiltroSede(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs">
                  <option value="">Todas las sedes</option>
                  {sedes.map((s) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
                </select>
                <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs">
                  <option value="">Todos los estados</option>
                  <option>Pendiente</option><option>En Proceso</option><option>Solucionado</option><option>Cerrado</option>
                </select>
                <select value={filtroPrioridad} onChange={(e) => setFiltroPrioridad(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs">
                  <option value="">Todas las prioridades</option>
                  <option>Alta</option><option>Media</option><option>Baja</option>
                </select>
                <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs" />
                <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs" />
              </div>
            )}
            {(isTI ? ticketsFiltrados : misTicketsFiltrados).length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 shadow-sm flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <SearchX className="w-7 h-7 text-slate-400" />
                </div>
                <h3 className="font-bold text-slate-700">Sin resultados</h3>
                <p className="text-sm text-slate-500 mt-1">
                  {filtroBusqueda ? 'No se encontraron tickets para tu búsqueda.' : 'Aún no tienes solicitudes registradas.'}
                </p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                        <th className="px-6 py-3 font-bold">Ticket</th>
                        <th className="px-4 py-3 font-bold">Estado</th>
                        <th className="px-4 py-3 font-bold">Prioridad</th>
                        <th className="px-4 py-3 font-bold">Asignado a</th>
                        <th className="px-4 py-3 font-bold">Fecha</th>
                        <th className="px-6 py-3 font-bold text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(isTI ? ticketsFiltrados : misTicketsFiltrados).map((t) => (
                        <tr key={t.id} onClick={() => abrirDetalle(t)} className="hover:bg-slate-50/80 cursor-pointer transition-colors">
                          <td className="px-6 py-3.5 align-top">
                            <span className="block text-[11px] font-mono font-bold text-[#ED1C24]">{formatoCorrelativo(t)}</span>
                            <span className="block text-sm font-semibold text-slate-800">{t.tipo_requerimiento}</span>
                          </td>
                          <td className="px-4 py-3.5 align-top whitespace-nowrap">
                            <span className={`${estadoBadgeClasses(t.estado)} text-[11px]`}>{t.estado}</span>
                          </td>
                          <td className="px-4 py-3.5 align-top whitespace-nowrap">
                            {t.prioridad ? (
                              <span className={prioridadBadgeClasses(t.prioridad)}>{prioridadIcono(t.prioridad)}{t.prioridad}</span>
                            ) : (
                              <span className="text-sm text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 align-top whitespace-nowrap">
                            <span className="text-sm text-slate-600">{t.tecnico_asignado || 'Sin asignar'}</span>
                          </td>
                          <td className="px-4 py-3.5 align-top whitespace-nowrap">
                            <span className="text-xs text-slate-500">{formatoFecha(t.fecha_creacion)}</span>
                          </td>
                          <td className="px-6 py-3.5 align-top text-right whitespace-nowrap">
                            <button
                              onClick={(e) => { e.stopPropagation(); abrirDetalle(t); }}
                              className="px-3 py-1.5 rounded-lg bg-[#002395] text-white text-xs font-semibold hover:bg-[#001d78] active:scale-[0.98]"
                            >
                              Ver detalle
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === 'usuarios' && isAdmin && (
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">Gestión de Usuarios</h1>
              <BackToHome onClick={volverAlInicio} />
            </div>

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
                className="px-4 py-2.5 rounded-xl bg-[#ED1C24] text-white text-sm font-semibold hover:bg-[#C41219] active:scale-[0.98]"
              >
                Agregar
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="divide-y divide-slate-100">
                {usuarios.map((u) => (
                  <div key={u.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between hover:bg-slate-50/80 transition-colors">
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
                        onClick={() => abrirEdicion(u)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 hover:bg-slate-200 flex items-center gap-1"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </button>
                      <button
                        onClick={() => handleUserDelete(u.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold border border-red-200 hover:bg-red-100"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
                {usuarios.length === 0 && (
                  <div className="p-10 flex flex-col items-center justify-center text-center">
                    <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                      <SearchX className="w-7 h-7 text-slate-400" />
                    </div>
                    <h3 className="font-bold text-slate-700">Sin usuarios registrados</h3>
                    <p className="text-sm text-slate-500 mt-1">Agrega el primer usuario corporativo para comenzar.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sedes' && isAdmin && (
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">Gestión de Sedes</h1>
              <BackToHome onClick={volverAlInicio} />
            </div>

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
                className="px-4 py-2.5 rounded-xl bg-[#ED1C24] text-white text-sm font-semibold hover:bg-[#C41219] active:scale-[0.98]"
              >
                Agregar
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="divide-y divide-slate-100">
                {sedes.map((s) => (
                  <div key={s.id} className="p-4 flex items-center justify-between hover:bg-slate-50/80 transition-colors">
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
                {sedes.length === 0 && (
                  <div className="p-10 flex flex-col items-center justify-center text-center">
                    <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                      <LayoutDashboard className="w-7 h-7 text-slate-400" />
                    </div>
                    <h3 className="font-bold text-slate-700">Sin sedes registradas</h3>
                    <p className="text-sm text-slate-500 mt-1">Agrega la primera sede para organizar la atención.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'entrenamiento' && isTI && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">Entrenamiento / Base de Conocimiento IA</h1>
              <BackToHome onClick={volverAlInicio} />
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3">
              <h3 className="font-bold text-slate-800 text-sm">Registrar nueva solución rápida</h3>
              <input
                value={nuevaSolucion.titulo}
                onChange={(e) => setNuevaSolucion({ ...nuevaSolucion, titulo: e.target.value })}
                placeholder="Título (ej: No hay conexión VPN)"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm"
              />
              <input
                value={nuevaSolucion.palabras_clave}
                onChange={(e) => setNuevaSolucion({ ...nuevaSolucion, palabras_clave: e.target.value })}
                placeholder="Problema frecuente / palabras clave (separadas por coma)"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm"
              />
              <select
                value={nuevaSolucion.categoria}
                onChange={(e) => setNuevaSolucion({ ...nuevaSolucion, categoria: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm"
              >
                <option>Impresoras</option><option>Redes</option><option>Equipos</option><option>Software</option><option>Contraseñas</option><option>Otros</option>
              </select>
              <textarea
                rows={4}
                value={nuevaSolucion.pasos}
                onChange={(e) => setNuevaSolucion({ ...nuevaSolucion, pasos: e.target.value })}
                placeholder="Solución paso a paso (una línea por paso, ej: 1. ... 2. ...)"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-sm"
              />
              <button
                onClick={handleCreateSolucion}
                className="px-5 py-2.5 rounded-xl bg-[#ED1C24] text-white text-sm font-semibold hover:bg-[#C41219] active:scale-[0.98]"
              >
                Guardar Solución
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="divide-y divide-slate-100">
                {soluciones.map((s) => (
                  <div key={s.id} className="p-4 flex items-start justify-between gap-4 hover:bg-slate-50/80 transition-colors">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-800 text-sm">{s.titulo}</p>
                        <span className="text-[10px] bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-full">{s.categoria}</span>
                        {!s.activo && <span className="text-[10px] bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">Inactiva</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 truncate">{s.palabras_clave}</p>
                      <p className="text-xs text-slate-600 mt-1 whitespace-pre-line">{s.pasos}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleToggleSolucion(s.id, !s.activo)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${s.activo ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
                      >
                        {s.activo ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        onClick={() => handleDeleteSolucion(s.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold border border-red-200 hover:bg-red-100"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
                {soluciones.length === 0 && (
                  <div className="p-10 flex flex-col items-center justify-center text-center">
                    <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                      <BookOpen className="w-7 h-7 text-slate-400" />
                    </div>
                    <h3 className="font-bold text-slate-700">Sin soluciones registradas</h3>
                    <p className="text-sm text-slate-500 mt-1">Registra soluciones rápidas para entrenar al asistente de IA.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </main>

      {editandoUsuario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !editGuardando && setEditandoUsuario(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-4 sticky top-0 bg-white z-10">
              <div>
                <span className="text-xs font-mono font-bold text-[#ED1C24]">Editar usuario</span>
                <h2 className="text-xl font-extrabold text-slate-900">{editandoUsuario.nombre || editandoUsuario.email}</h2>
              </div>
              <button onClick={() => setEditandoUsuario(null)} disabled={editGuardando} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-50">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs text-slate-500 uppercase font-bold">Nombre completo</label>
                <input
                  value={editForm.nombre}
                  onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                  placeholder="Nombre completo"
                  className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#ED1C24]"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 uppercase font-bold">Correo institucional</label>
                <input
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="@alianzafrancesa.org.pe"
                  className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#ED1C24]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 uppercase font-bold">Rol</label>
                  <select
                    value={editForm.rol}
                    onChange={(e) => setEditForm({ ...editForm, rol: e.target.value })}
                    className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm"
                  >
                    <option value="Usuario">Usuario</option>
                    <option value="HELPDESK_TI">HELPDESK_TI</option>
                    <option value="ARQUITECTO_TI">ARQUITECTO_TI</option>
                    <option value="INFRAESTRUCTURA_TI">INFRAESTRUCTURA_TI</option>
                    <option value="ADMIN_TI">ADMIN_TI</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 uppercase font-bold">Estado</label>
                  <select
                    value={editForm.estado}
                    onChange={(e) => setEditForm({ ...editForm, estado: e.target.value })}
                    className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Suspendido">Suspendido</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 uppercase font-bold">Sede asignada</label>
                  <select
                    value={editForm.sede_id}
                    onChange={(e) => setEditForm({ ...editForm, sede_id: e.target.value })}
                    className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm"
                  >
                    <option value="">— Sin sede —</option>
                    {sedes.map((s) => <option key={s.id} value={String(s.id)}>{s.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 uppercase font-bold">Tipo de colaborador</label>
                  <select
                    value={editForm.tipo_colaborador}
                    onChange={(e) => setEditForm({ ...editForm, tipo_colaborador: e.target.value })}
                    className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm"
                  >
                    <option value="">— Seleccionar —</option>
                    <option value="Administrativo">Administrativo</option>
                    <option value="Docente">Docente</option>
                  </select>
                </div>
              </div>

              {editError && (
                <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setEditandoUsuario(null)}
                  disabled={editGuardando}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUserSave}
                  disabled={editGuardando}
                  className="px-4 py-2 rounded-xl bg-[#ED1C24] text-white text-xs font-semibold hover:bg-[#C41219] active:scale-[0.98] disabled:opacity-60 flex items-center gap-2"
                >
                  {editGuardando && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editGuardando ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {ticketDetalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={cerrarDetalle}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono font-bold text-[#ED1C24]">{formatoCorrelativo(ticketDetalle)}</span>
                  <span className={`${estadoBadgeClasses(ticketDetalle.estado)} text-[11px]`}>{ticketDetalle.estado}</span>
                </div>
                <h2 className="text-xl font-extrabold text-slate-900 mt-1">{ticketDetalle.tipo_requerimiento}</h2>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {ticketDetalle.prioridad && (
                    <span className={prioridadBadgeClasses(ticketDetalle.prioridad)}>
                      {prioridadIcono(ticketDetalle.prioridad)}
                      {ticketDetalle.prioridad}
                    </span>
                  )}
                  {ticketDetalle.sede && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                      <MapPin className="w-3 h-3" /> {ticketDetalle.sede}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                {isTI && (
                  <>
                    <button onClick={() => handleUpdateStatus(ticketDetalle.id, 'Solucionado')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 active:scale-[0.98]">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Resolver
                    </button>
                    <button onClick={() => handleUpdateStatus(ticketDetalle.id, 'En Proceso')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-50 text-sky-700 text-xs font-semibold border border-sky-200 hover:bg-sky-100">
                      En Proceso
                    </button>
                    <button onClick={() => handleUpdateStatus(ticketDetalle.id, 'Cerrado')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 hover:bg-slate-200">
                      Cerrar Ticket
                    </button>
                    <button onClick={() => handleWhatsApp(ticketDetalle)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700">
                      WhatsApp
                    </button>
                  </>
                )}
                <button onClick={() => exportarTicketPDF(ticketDetalle)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50">
                  <BookOpen className="w-3.5 h-3.5" /> PDF
                </button>
                <button onClick={cerrarDetalle} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="p-6 min-w-0">
                  <TicketStepper estado={ticketDetalle.estado} />

                  <div className="mt-5">
                    <p className="text-xs text-slate-500 uppercase font-bold tracking-wide mb-2">Descripción</p>
                    <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{ticketDetalle.descripcion || 'Sin descripción.'}</p>
                  </div>

                  <div className="mt-6 border-t border-slate-100 pt-5">
                    <p className="text-xs text-slate-500 uppercase font-bold tracking-wide mb-4 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" /> Actividad
                    </p>
                    <TicketTimeline ticket={ticketDetalle} />
                  </div>

                  {isTI && (
                    <div className="mt-6 border-t border-slate-100 pt-4">
                      <p className="text-xs text-slate-500 uppercase font-bold tracking-wide mb-2">Responder / Nota técnica</p>
                      <div className="flex items-start gap-2">
                        <textarea
                          value={notasDraft[ticketDetalle.id] || ''}
                          onChange={(e) => setNotasDraft((prev) => ({ ...prev, [ticketDetalle.id]: e.target.value }))}
                          placeholder="Escribe una nota técnica para el solicitante…"
                          rows={3}
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#ED1C24] resize-none"
                        />
                        <button onClick={() => handleSaveNota(ticketDetalle.id)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#ED1C24] text-white text-xs font-semibold hover:bg-[#C41219] active:scale-[0.98] shrink-0">
                          <Send className="w-3.5 h-3.5" /> Enviar
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap pt-4 mt-4 border-t border-slate-100">
                    <BackToHome onClick={volverAlInicio} />
                  </div>
                </div>

                <aside className="border-l border-slate-100 bg-slate-50/50 p-6">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Propiedades</p>

                  <div className="divide-y divide-slate-100">
                    <Propiedad icono={<CircleDot className="w-3.5 h-3.5 text-slate-400" />} label="Estado">
                      {isTI ? (
                        <select
                          value={ticketDetalle.estado}
                          onChange={(e) => handleUpdateStatus(ticketDetalle.id, e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                        >
                          <option>Pendiente</option><option>En Proceso</option><option>Solucionado</option><option>Cerrado</option>
                        </select>
                      ) : (
                        <span className={`${estadoBadgeClasses(ticketDetalle.estado)} text-[11px]`}>{ticketDetalle.estado}</span>
                      )}
                    </Propiedad>

                    <Propiedad icono={<Flag className="w-3.5 h-3.5 text-slate-400" />} label="Prioridad">
                      {ticketDetalle.prioridad ? (
                        <span className={prioridadBadgeClasses(ticketDetalle.prioridad)}>
                          {prioridadIcono(ticketDetalle.prioridad)}
                          {ticketDetalle.prioridad}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-500">—</span>
                      )}
                    </Propiedad>

                    <Propiedad icono={<User className="w-3.5 h-3.5 text-slate-400" />} label="Asignado a">
                      {isTI ? (
                        <select
                          value={ticketDetalle.tecnico_asignado_id || ''}
                          onChange={(e) => handleAsignarTecnico(ticketDetalle.id, e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                        >
                          <option value="">Sin asignar</option>
                          {tecnicos.map((tc) => (
                            <option key={tc.id} value={tc.id}>{tc.nombre}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-sm font-semibold text-slate-800">{ticketDetalle.tecnico_asignado || 'Sin asignar'}</p>
                      )}
                    </Propiedad>

                    <Propiedad icono={<Tag className="w-3.5 h-3.5 text-slate-400" />} label="Categoría">
                      <p className="text-sm font-semibold text-slate-800">{ticketDetalle.tipo_requerimiento || '—'}</p>
                    </Propiedad>

                    <Propiedad icono={<Clock className="w-3.5 h-3.5 text-slate-400" />} label="SLA / Fecha límite">
                      <p className="text-sm font-semibold text-slate-800">{slaDetalle ? formatoFecha(slaDetalle.toISOString()) : '—'}</p>
                      <p className={`text-[11px] mt-0.5 ${slaDetalleVencido ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                        {slaDetalleVencido ? 'SLA vencido' : slaDetalle ? `Vence ${formatoRestante(slaDetalle.toISOString())}` : ''}
                      </p>
                    </Propiedad>

                    <Propiedad icono={<UserCircle2 className="w-3.5 h-3.5 text-slate-400" />} label="Cliente / Solicitante">
                      <p className="text-sm font-semibold text-slate-800">{ticketDetalle.user_name?.trim() || '—'}</p>
                      <p className="text-[11px] text-slate-400 truncate">{ticketDetalle.solicitante_email}</p>
                    </Propiedad>

                    <Propiedad icono={<MapPin className="w-3.5 h-3.5 text-slate-400" />} label="Sede de origen">
                      <p className="text-sm font-semibold text-slate-800">{ticketDetalle.sede || '—'}</p>
                    </Propiedad>

                    <Propiedad icono={<Calendar className="w-3.5 h-3.5 text-slate-400" />} label="Fecha de creación">
                      <p className="text-sm font-semibold text-slate-800">{formatoFecha(ticketDetalle.fecha_creacion)}</p>
                      <p className="text-[11px] text-slate-400">{formatoRelativo(ticketDetalle.fecha_creacion)}</p>
                    </Propiedad>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      )}

      {codigoSeguimiento && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setCodigoSeguimiento(null)}>
          <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-md w-full text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 mb-2">Solicitud Registrada Exitosamente</h2>
            <p className="text-sm text-slate-500 mb-4">Tu código de seguimiento es:</p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl py-3 px-6 inline-block mb-6">
              <span className="text-2xl font-mono font-extrabold text-[#ED1C24] tracking-wider">{codigoSeguimiento}</span>
            </div>
            <button onClick={() => setCodigoSeguimiento(null)} className="w-full py-3 rounded-xl bg-[#ED1C24] text-white font-bold hover:bg-[#C41219] active:scale-[0.98]">
              Entendido
            </button>
          </div>
        </div>
      )}

      {asistenteAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAsistenteAbierto(false)}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2"><Bot className="w-5 h-5 text-[#ED1C24]" /> Asistente Virtual TI</h2>
              <button onClick={() => setAsistenteAbierto(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-500 mb-3">Describe la falla y te sugerimos una solución paso a paso.</p>
            <textarea
              rows={3}
              value={asistenteConsulta}
              onChange={(e) => setAsistenteConsulta(e.target.value)}
              placeholder="Ej: la impresora no imprime, no tengo wifi, olvidé mi contraseña..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-sm focus:outline-none focus:border-[#ED1C24] mb-3"
            />
            <button
              onClick={consultarAsistente}
              disabled={asistenteLoading}
              className="w-full bg-[#002395] hover:bg-[#001d78] text-white font-semibold py-3 rounded-xl mb-4 disabled:opacity-60 active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {asistenteLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {asistenteLoading ? 'Consultando...' : 'Consultar Solución'}
            </button>

            {asistenteResultado.length > 0 ? (
              <div className="space-y-4">
                {asistenteResultado.map((s, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <p className="font-bold text-slate-800 text-sm mb-1">{s.titulo}</p>
                    <ol className="list-decimal pl-5 space-y-1">
                      {(s.pasos || []).map((p: string, j: number) => (
                        <li key={j} className="text-xs text-slate-600">{p}</li>
                      ))}
                    </ol>
                  </div>
                ))}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button onClick={() => setAsistenteAbierto(false)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl">¡Solucionado!</button>
                  <button onClick={() => setAsistenteAbierto(false)} className="flex-1 bg-[#ED1C24] hover:bg-[#C41219] text-white font-bold py-3 rounded-xl">Continuar y Crear Ticket</button>
                </div>
              </div>
            ) : (
              asistenteLoading ? (
                <p className="text-sm text-slate-400 text-center py-4">Buscando solución...</p>
              ) : null
            )}
          </div>
        </div>
      )}

      {/* Chat flotante global (Asistente de IA) */}
      <button
        onClick={() => setChatAbierto((v) => !v)}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-[#ED1C24] text-white shadow-2xl flex items-center justify-center hover:bg-[#C41219] transition-all"
        aria-label="Asistente de IA"
      >
        {chatAbierto ? <X className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
      </button>

      {chatAbierto && (
        <div className="fixed bottom-24 right-5 z-50 w-[92vw] max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col" style={{ height: '480px' }}>
          <div className="bg-[#ED1C24] text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              <span className="font-bold text-sm">Asistente Virtual TI</span>
            </div>
            <button onClick={() => setChatAbierto(false)} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FDFBFB]">
            <div className="bg-slate-100 text-slate-700 text-xs rounded-xl p-3 whitespace-pre-line">
              Hola 👋 Soy el asistente virtual. Describe tu problema y te sugeriré una solución.
            </div>
            {chatMensajes.map((m, i) => (
              <div key={i} className={`text-xs rounded-xl p-3 whitespace-pre-line ${m.rol === 'user' ? 'bg-[#ED1C24] text-white ml-auto max-w-[80%]' : 'bg-slate-100 text-slate-700 max-w-[85%]'}`}>
                {m.texto}
              </div>
            ))}
            {chatLoading && <div className="text-xs text-slate-400">Escribiendo...</div>}
          </div>

          <div className="p-3 border-t border-slate-200 bg-white">
            <p className="text-[11px] text-slate-500 mb-2">💡 Nota: Si estos pasos no resuelven tu inconveniente, puedes generar un ticket. El equipo de TI se comunicará contigo o acudirá a tu oficina/sede para brindarte el soporte necesario.</p>
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') enviarChat(); }}
                placeholder="Escribe tu problema..."
                className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#ED1C24]"
              />
              <button onClick={enviarChat} disabled={chatLoading} className="px-3 py-2 rounded-xl bg-[#002395] text-white text-sm font-semibold hover:bg-[#001d78] active:scale-[0.98] disabled:opacity-60">
                Enviar
              </button>
            </div>
            <button
              onClick={irAFormulario}
              className="mt-2 w-full py-2.5 rounded-xl bg-[#ED1C24] text-white text-sm font-bold hover:bg-[#C41219] active:scale-[0.98]"
            >
              Ir a Formulario de Ticket
            </button>
          </div>
        </div>
      )}
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