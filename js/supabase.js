// supabase.js - Cliente Oficial Supabase v2, Autenticación RBAC y Caché Offline
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Configuración por defecto del proyecto CRONO
const DEFAULT_SUPABASE_URL = "https://uhgwivolgwwmzcaliepk.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_5VFaiCRnSPjLbAypLYuOHQ_xXtr7Hqr";

const STORAGE_KEY_CONFIG = "crono_web_config";
const STORAGE_KEY_SESSION = "crono_web_session";
const STORAGE_KEY_CACHE = "crono_web_cache_v1";
const STORAGE_KEY_LOCKOUT = "crono_web_login_lockout";
const STORAGE_KEY_DEVICE = "crono_device_fingerprint";

// Generador e identificador único de huella de dispositivo persistente
export function getDeviceFingerprint() {
  try {
    let fp = localStorage.getItem(STORAGE_KEY_DEVICE);
    if (!fp) {
      // Generar UUID v4 criptográfico
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        fp = crypto.randomUUID();
      } else {
        fp = 'dev_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
      }
      localStorage.setItem(STORAGE_KEY_DEVICE, fp);
    }
    return fp;
  } catch (e) {
    return 'crono_browser_generic';
  }
}

// Gestor de Intentos Fallidos y Bloqueo Anti-Fuerza Bruta
export function getLoginLockoutState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOCKOUT);
    if (!raw) return { intentos: 0, bloqueadoHasta: null, penalizacionSegundos: 60 };
    const data = JSON.parse(raw);
    const ahora = Date.now();
    if (data.bloqueadoHasta && data.bloqueadoHasta > ahora) {
      return data;
    }
    // Si ya expiró el bloqueo, conservar nivel de penalización si fue reciente
    if (data.bloqueadoHasta && data.bloqueadoHasta <= ahora) {
      return { intentos: 0, bloqueadoHasta: null, penalizacionSegundos: data.penalizacionSegundos || 60 };
    }
    return { intentos: data.intentos || 0, bloqueadoHasta: null, penalizacionSegundos: data.penalizacionSegundos || 60 };
  } catch (e) {
    return { intentos: 0, bloqueadoHasta: null, penalizacionSegundos: 60 };
  }
}

export function registrarIntentoFallido() {
  const state = getLoginLockoutState();
  const intentos = (state.intentos || 0) + 1;
  let penalizacion = state.penalizacionSegundos || 60;
  let bloqueadoHasta = null;

  if (intentos >= 3) {
    bloqueadoHasta = Date.now() + penalizacion * 1000;
    // La siguiente penalización será más severa (60 -> 180 -> 300)
    penalizacion = Math.min(penalizacion * 2, 300);
  }

  const newState = {
    intentos: bloqueadoHasta ? 0 : intentos,
    bloqueadoHasta: bloqueadoHasta,
    penalizacionSegundos: penalizacion
  };
  localStorage.setItem(STORAGE_KEY_LOCKOUT, JSON.stringify(newState));
  return newState;
}

export function limpiarIntentosFallidos() {
  localStorage.removeItem(STORAGE_KEY_LOCKOUT);
}

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

// 2. Cliente Supabase con Inyección de x-crono-user y x-crono-auth
let supabaseInstance = null;

export function getSupabaseClient() {
  const cfg = getConfig();
  const session = getSession();
  const username = session ? session.username : "admin";
  const authToken = session ? (session.session_token || session.auth_token || "") : "";

  // Re-instanciar cliente con cabeceras de seguridad
  const headers = {
    'x-crono-user': username
  };
  if (authToken) {
    headers['x-crono-auth'] = authToken;
  }

  supabaseInstance = createClient(cfg.supabase_url, cfg.supabase_anon_key, {
    auth: {
      persistSession: false
    },
    global: {
      headers: headers
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

// 4. Sesión de Usuario en sessionStorage (nunca almacena contraseñas ni hashes)
export function getSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function saveSession(user) {
  // Asegurarse de no persistir password_hash ni passwords
  const sessionData = {
    username: user.username,
    nombre_completo: user.nombre_completo,
    email: user.email || '',
    rol: user.rol || 'CONSULTA',
    session_token: user.session_token || user.auth_token || '',
    token_expira: user.token_expira || null
  };
  sessionStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(sessionData));
}

export async function clearSession() {
  try {
    const client = getSupabaseClient();
    await client.rpc('fn_cerrar_sesion').catch(() => {});
  } catch (e) {
    // Si falla la red, continuar limpiando el cliente
  }
  sessionStorage.removeItem(STORAGE_KEY_SESSION);
  localStorage.removeItem(STORAGE_KEY_CACHE);
}

// 5. Autenticación contra RPC fn_autenticar_usuario (con fallback seguro)
export async function autenticarUsuario(username, password) {
  // 1. Validar si está en período de penalización por intentos fallidos
  const lockout = getLoginLockoutState();
  if (lockout.bloqueadoHasta && lockout.bloqueadoHasta > Date.now()) {
    const restantes = Math.ceil((lockout.bloqueadoHasta - Date.now()) / 1000);
    throw new Error(`Acceso temporalmente bloqueado por intentos fallidos. Aguardá ${restantes} segundos.`);
  }

  const u = String(username || "").trim();
  const p = String(password || "").trim();

  if (!u || !p) {
    throw new Error("Por favor ingresá usuario y contraseña.");
  }

  const client = getSupabaseClient();
  const hashIngresado = await sha256(p);
  const deviceId = getDeviceFingerprint();

  // Intentar primero autenticación segura mediante RPC en el servidor
  try {
    const { data, error } = await client.rpc('fn_autenticar_usuario', {
      p_username: u,
      p_password_hash: hashIngresado,
      p_password_plain: p,
      p_device_id: deviceId
    });

    if (error) {
      const msg = error.message || "";
      const code = error.code || "";
      // Si la función RPC no existe en el esquema remoto (404 / PGRST202)
      if (code === 'PGRST202' || error.status === 404 || msg.toLowerCase().includes('not found')) {
        console.warn("RPC fn_autenticar_usuario no instalada en Supabase, intentando fallback:", msg);
      } else {
        // Es un error de autenticación legítimo lanzado por la función (credenciales, bloqueo, etc.)
        registrarIntentoFallido();
        throw new Error(msg || "Error de autenticación en el servidor.");
      }
    } else if (data) {
      // Compatibilidad con versiones que devuelven { ok: false, error: "..." }
      if (data.ok === false) {
        registrarIntentoFallido();
        throw new Error(data.error || "Credenciales inválidas.");
      }

      // Si el servidor detectó que el usuario tiene TOTP activo y el dispositivo no es de confianza
      if (data.requiere_totp === true) {
        return {
          requiere_totp: true,
          username: data.username || u,
          mensaje: data.mensaje || "Se requiere código de Google Authenticator."
        };
      }

      if (data.username) {
        limpiarIntentosFallidos();
        const userSession = {
          username: data.username,
          nombre_completo: data.nombre_completo,
          email: data.email || '',
          rol: data.rol || 'CONSULTA',
          session_token: data.session_token || data.auth_token || '',
          token_expira: data.token_expira || null
        };
        saveSession(userSession);
        return userSession;
      }
    }
  } catch (rpcErr) {
    if (rpcErr.message && !rpcErr.message.toLowerCase().includes('fallback')) {
      throw rpcErr;
    }
    console.warn("RPC fn_autenticar_usuario no disponible, usando fallback:", rpcErr.message);
  }

  // Fallback: consulta directa a usuarios_app
  const { data: users, error } = await client
    .from('usuarios_app')
    .select('*')
    .eq('activo', true);

  if (error) {
    registrarIntentoFallido();
    throw new Error(`Error al conectar con Supabase: ${error.message}`);
  }

  const user = users.find(x => x.username && x.username.toLowerCase() === u.toLowerCase());
  if (!user) {
    registrarIntentoFallido();
    throw new Error(`El usuario "${u}" no existe o está inactivo.`);
  }

  const ok = await verificarPassword(p, user.password_hash);
  if (!ok) {
    const nuevoState = registrarIntentoFallido();
    if (nuevoState.bloqueadoHasta) {
      const segs = Math.ceil((nuevoState.bloqueadoHasta - Date.now()) / 1000);
      throw new Error(`Contraseña incorrecta. Has superado el límite de intentos. Ingreso bloqueado por ${segs} segundos.`);
    }
    throw new Error("Contraseña / PIN incorrecto.");
  }

  // Si tiene TOTP activo, verificar si este dispositivo ya es de confianza
  if (user.totp_activo === true && user.totp_secret) {
    const devs = Array.isArray(user.dispositivos_confianza) ? user.dispositivos_confianza : [];
    const esConfiable = devs.some(d => d && d.device_id === deviceId);
    if (!esConfiable) {
      return {
        requiere_totp: true,
        username: user.username,
        mensaje: "Se requiere código de Google Authenticator."
      };
    }
  }

  limpiarIntentosFallidos();
  const userSession = {
    username: user.username,
    nombre_completo: user.nombre_completo,
    email: user.email || '',
    rol: user.rol || 'CONSULTA',
    session_token: hashIngresado,
    token_expira: null
  };

  saveSession(userSession);
  return userSession;
}

// 5.1 Validación y Registro TOTP (Google Authenticator)
export async function verificarTotpUsuario(username, codigoTotp, confiarDispositivo = true, nombreDispositivo = "Navegador Web") {
  const u = String(username || "").trim();
  const c = String(codigoTotp || "").replace(/\s+/g, '');
  const deviceId = getDeviceFingerprint();

  if (!u || !c) {
    throw new Error("Por favor ingresá el código de 6 dígitos.");
  }

  const client = getSupabaseClient();
  const { data, error } = await client.rpc('fn_verificar_y_registrar_totp', {
    p_username: u,
    p_totp_code: c,
    p_device_id: deviceId,
    p_confiar_dispositivo: Boolean(confiarDispositivo),
    p_device_nombre: String(nombreDispositivo || 'Navegador Web')
  });

  if (error) {
    throw new Error(error.message || "Error al verificar código TOTP.");
  }

  if (data && data.username) {
    limpiarIntentosFallidos();
    const userSession = {
      username: data.username,
      nombre_completo: data.nombre_completo,
      email: data.email || '',
      rol: data.rol || 'CONSULTA',
      session_token: data.session_token || data.auth_token || '',
      token_expira: data.token_expira || null
    };
    saveSession(userSession);
    return userSession;
  }

  throw new Error("Respuesta inválida del servidor al verificar TOTP.");
}

// 5.2 Dispositivos de Confianza y Autenticación Biométrica (WebAuthn)
export async function verificarDispositivoConfiable(username) {
  const u = String(username || "").trim();
  const deviceId = getDeviceFingerprint();
  if (!u || !deviceId) return false;

  try {
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('fn_verificar_dispositivo_confiable', {
      p_username: u,
      p_device_id: deviceId
    });
    if (error) return false;
    return Boolean(data);
  } catch (e) {
    return false;
  }
}

export async function registrarDispositivoConfiable(username, deviceName = "Navegador Web", credentialId = null, publicKey = null) {
  const u = String(username || "").trim();
  const deviceId = getDeviceFingerprint();
  if (!u || !deviceId) return false;

  try {
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('fn_registrar_dispositivo_confiable', {
      p_username: u,
      p_device_id: deviceId,
      p_device_name: String(deviceName || "Navegador Web"),
      p_credential_id: credentialId,
      p_public_key: publicKey
    });
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn("No se pudo registrar dispositivo de confianza en Supabase:", e);
    return false;
  }
}

export async function autenticarPorDispositivoBiometrico(username) {
  const u = String(username || "").trim();
  const deviceId = getDeviceFingerprint();

  if (!u || !deviceId) {
    throw new Error("Faltan parámetros para autenticación biométrica.");
  }

  const client = getSupabaseClient();
  const { data, error } = await client.rpc('fn_autenticar_dispositivo_biometrico', {
    p_username: u,
    p_device_id: deviceId
  });

  if (error) {
    throw new Error(error.message || "Error al autenticar dispositivo biométrico.");
  }

  if (data && data.username) {
    limpiarIntentosFallidos();
    const userSession = {
      username: data.username,
      nombre_completo: data.nombre_completo,
      email: data.email || '',
      rol: data.rol || 'CONSULTA',
      session_token: data.session_token || data.auth_token || '',
      token_expira: data.token_expira || null
    };
    saveSession(userSession);
    return userSession;
  }

  throw new Error("Respuesta inválida de autenticación biométrica.");
}

// 5.3 Configuración de 2FA TOTP (Google Authenticator)
export async function configurarTotp(username, activar = true) {
  const u = String(username || "").trim();
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('fn_configurar_totp', {
    p_username: u,
    p_activar: Boolean(activar)
  });

  if (error) {
    throw new Error(error.message || "Error al configurar Google Authenticator.");
  }
  return data;
}

export async function consultarEstadoSeguridadUsuario(username) {
  const u = String(username || "").trim();
  const client = getSupabaseClient();
  try {
    const { data, error } = await client
      .from('usuarios_app')
      .select('username, totp_activo, dispositivos_confianza')
      .eq('username', u)
      .single();
    if (error) return null;
    return data;
  } catch (e) {
    return null;
  }
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
