// supabase.js - Cliente Oficial Supabase v2, Autenticación RBAC y Caché Offline
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Configuración por defecto del proyecto CRONO
const DEFAULT_SUPABASE_URL = "https://uhgwivolgwwmzcaliepk.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_5VFaiCRnSPjLbAypLYuOHQ_xXtr7Hqr";

const STORAGE_KEY_CONFIG = "crono_web_config";
const STORAGE_KEY_SESSION = "crono_web_session";
const STORAGE_KEY_CACHE = "crono_web_cache_v1";

// 1. Manejo de Configuración
export function sanitizarSupabaseUrl(url) {
  if (!url) return "";
  let u = String(url).trim().replace(/\/+$/, "");
  if (!u) return "";

  // Si pegó URL del dashboard
  const matchDash = u.match(/supabase\.com\/dashboard\/project\/([a-zA-Z0-9_\-]+)/i);
  if (matchDash) {
    return `https://${matchDash[1]}.supabase.co`;
  }

  // Eliminar /rest/v1 o /api/v1
  u = u.replace(/\/(rest|api)\/v\d+.*$/i, "").replace(/\/+$/, "");

  if (u.startsWith("http://")) {
    u = "https://" + u.slice(7);
  } else if (!u.startsWith("https://")) {
    u = "https://" + u;
  }
  return u.replace(/\/+$/, "");
}

export function getConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (raw) {
      const cfg = JSON.parse(raw);
      if (cfg.supabase_url && cfg.supabase_anon_key) {
        return cfg;
      }
    }
  } catch (e) {
    console.error("Error leyendo config de localStorage:", e);
  }
  return {
    supabase_url: DEFAULT_SUPABASE_URL,
    supabase_anon_key: DEFAULT_SUPABASE_ANON_KEY
  };
}

export function saveConfig(url, anonKey) {
  const sanitizedUrl = sanitizarSupabaseUrl(url);
  const cfg = {
    supabase_url: sanitizedUrl,
    supabase_anon_key: String(anonKey || "").trim()
  };
  localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(cfg));
  return cfg;
}

// 2. Cliente Supabase con Inyección de x-crono-user
let supabaseInstance = null;

export function getSupabaseClient() {
  const cfg = getConfig();
  const session = getSession();
  const username = session ? session.username : "admin";

  // Re-instanciar cliente con cabecera x-crono-user
  supabaseInstance = createClient(cfg.supabase_url, cfg.supabase_anon_key, {
    auth: {
      persistSession: false
    },
    global: {
      headers: {
        'x-crono-user': username
      }
    }
  });

  return supabaseInstance;
}

// 3. Funciones de Hashing y Seguridad
export async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `sha256$${hashHex}`;
}

export async function verificarPassword(passwordIngresada, hashAlmacenado) {
  if (!hashAlmacenado || !passwordIngresada) return false;
  const ing = passwordIngresada.trim();
  if (hashAlmacenado.startsWith('sha256$')) {
    const hash = await sha256(ing);
    return hash === hashAlmacenado;
  }
  if (hashAlmacenado.length === 64 && /^[0-9a-fA-F]{64}$/.test(hashAlmacenado)) {
    const msgBuffer = new TextEncoder().encode(ing);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.toLowerCase() === hashAlmacenado.toLowerCase();
  }
  // Migración texto plano legado
  return ing === hashAlmacenado;
}

// 4. Sesión de Usuario
export function getSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function saveSession(user) {
  localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY_SESSION);
}

// 5. Autenticación contra usuarios_app
export async function autenticarUsuario(username, password) {
  const client = getSupabaseClient();
  const u = username.trim().toLowerCase();

  const { data, error } = await client
    .from('usuarios_app')
    .select('*')
    .eq('activo', true);

  if (error) {
    throw new Error(`Error al conectar con Supabase: ${error.message}`);
  }

  const user = data.find(x => x.username && x.username.toLowerCase() === u);
  if (!user) {
    throw new Error(`El usuario "${username}" no existe o está inactivo.`);
  }

  const ok = await verificarPassword(password, user.password_hash);
  if (!ok) {
    throw new Error("Contraseña / PIN incorrecto.");
  }

  const userSession = {
    username: user.username,
    nombre_completo: user.nombre_completo,
    email: user.email || '',
    rol: user.rol || 'CONSULTA'
  };

  saveSession(userSession);
  return userSession;
}

// 6. DataStore en Memoria + Caché Offline en LocalStorage
export class WebDataStore {
  constructor() {
    this.personal = [];
    this.turnos = new Map();
    this.novedades = [];
    this.saldos = new Map();
    this.periodos = [];
    this.catalogo_motivos = [];
    this.sectores = [];
    this.categorias = [];
    this.roles = new Map();
    this.usuarios = [];
    this.historial = [];
    this.ultimoSync = null;
    this.isOffline = false;

    // Cargar caché local de inmediato para arranque ultrarrápido
    this.cargarCacheLocal();
  }

  cargarCacheLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CACHE);
      if (!raw) return;
      const data = JSON.parse(raw);
      this._aplicarDatos(data);
      this.ultimoSync = data.syncTime ? new Date(data.syncTime) : null;
    } catch (e) {
      console.warn("No se pudo cargar la caché local previa:", e);
    }
  }

  guardarCacheLocal() {
    try {
      const snapshot = {
        syncTime: new Date().toISOString(),
        personal: this.personal,
        turnos: Array.from(this.turnos.values()),
        novedades: this.novedades,
        saldos: Array.from(this.saldos.values()),
        periodos: this.periodos,
        catalogo_motivos: this.catalogo_motivos,
        sectores: this.sectores,
        categorias: this.categorias,
        roles: Array.from(this.roles.values()),
        usuarios: this.usuarios,
        historial: this.historial
      };
      localStorage.setItem(STORAGE_KEY_CACHE, JSON.stringify(snapshot));
    } catch (e) {
      console.warn("Error guardando snapshot en localStorage:", e);
    }
  }

  _aplicarDatos(d) {
    if (d.personal) this.personal = d.personal;
    if (d.turnos) {
      this.turnos.clear();
      d.turnos.forEach(t => this.turnos.set(t.codigo_sap, t));
    }
    if (d.novedades) this.novedades = d.novedades;
    if (d.saldos) {
      this.saldos.clear();
      d.saldos.forEach(s => this.saldos.set(`${s.legajo}_${s.periodo}`, s));
    }
    if (d.periodos) this.periodos = d.periodos;
    if (d.catalogo_motivos) this.catalogo_motivos = d.catalogo_motivos;
    if (d.sectores) this.sectores = d.sectores;
    if (d.categorias) this.categorias = d.categorias;
    if (d.roles) {
      this.roles.clear();
      d.roles.forEach(r => this.roles.set(r.rol, r));
    }
    if (d.usuarios) this.usuarios = d.usuarios;
    if (d.historial) this.historial = d.historial;
  }

  async sincronizar() {
    const client = getSupabaseClient();
    try {
      // Descarga de las 11 tablas en paralelo
      const [
        resPersonal,
        resTurnos,
        resNovedades,
        resSaldos,
        resPeriodos,
        resCatalogo,
        resSectores,
        resCategorias,
        resRoles,
        resUsuarios,
        resHistorial
      ] = await Promise.all([
        client.from('personal').select('*').order('orden_sabana', { ascending: true }),
        client.from('turnos_sap').select('*'),
        client.from('novedades').select('*').order('id', { ascending: false }),
        client.from('saldos_licencias').select('*'),
        client.from('periodos_licencias').select('*').order('periodo', { ascending: true }),
        client.from('catalogo_opciones').select('*').order('orden', { ascending: true }),
        client.from('sectores_app').select('*').order('orden', { ascending: true }),
        client.from('categorias_personal').select('*').order('orden', { ascending: true }),
        client.from('roles_app').select('*'),
        client.from('usuarios_app').select('*'),
        client.from('historial_asignaciones').select('*').order('id', { ascending: true })
      ]);

      const dataSnapshot = {
        personal: resPersonal.data || [],
        turnos: resTurnos.data || [],
        novedades: resNovedades.data || [],
        saldos: resSaldos.data || [],
        periodos: (resPeriodos.data || []).map(p => p.periodo),
        catalogo_motivos: resCatalogo.data || [],
        sectores: (resSectores.data || []).filter(s => s.activo).map(s => s.nombre),
        categorias: (resCategorias.data || []).filter(c => c.activo).map(c => c.nombre),
        roles: resRoles.data || [],
        usuarios: resUsuarios.data || [],
        historial: resHistorial.data || []
      };

      this._aplicarDatos(dataSnapshot);
      this.ultimoSync = new Date();
      this.isOffline = false;
      this.guardarCacheLocal();
      return true;
    } catch (err) {
      console.warn("Fallo de conexión en sincronizar(), activando modo offline:", err);
      this.isOffline = true;
      this.cargarCacheLocal();
      return false;
    }
  }

  // RBAC: Verificación de Permisos
  tienePermiso(modulo, accion) {
    const session = getSession();
    if (!session) return false;
    const rolNombre = session.rol || 'CONSULTA';

    if (rolNombre === 'ADMIN') return true;

    const rInfo = this.roles.get(rolNombre);
    if (!rInfo) return rolNombre === 'ADMIN';
    if (rInfo.es_admin_total) return true;

    let permisos = rInfo.permisos;
    if (typeof permisos === 'string') {
      try { permisos = JSON.parse(permisos); } catch (e) { permisos = {}; }
    }
    const modPermisos = permisos ? permisos[modulo] : null;
    return modPermisos ? Boolean(modPermisos[accion]) : false;
  }

  // Trazabilidad y Auditoría en Supabase
  async auditar(tabla, operacion, registroId, datosAnteriores, datosNuevos) {
    const session = getSession();
    const usuario = session ? session.username : 'web_user';
    const client = getSupabaseClient();

    try {
      await client.from('auditoria_sistema').insert({
        fecha_hora: new Date().toISOString(),
        usuario_accion: usuario,
        tabla_afectada: tabla,
        operacion: operacion,
        registro_id: String(registroId || ''),
        datos_anteriores: datosAnteriores || null,
        datos_nuevos: datosNuevos || null,
        app_version: '1.0.0-web',
        sync_status: 'synced'
      });
    } catch (e) {
      console.warn("No se pudo registrar auditoría en Supabase:", e);
    }
  }
}
