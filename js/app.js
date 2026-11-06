// app.js - Inicializador Maestro, Router de Vistas, PWA y Autenticación
import { 
  WebDataStore, 
  autenticarUsuario, 
  verificarTotpUsuario,
  verificarDispositivoConfiable,
  registrarDispositivoConfiable,
  autenticarPorDispositivoBiometrico,
  configurarTotp,
  consultarEstadoSeguridadUsuario,
  getSession, 
  clearSession, 
  getConfig, 
  saveConfig,
  getLoginLockoutState
} from './supabase.js';

import {
  isBiometricsAvailable,
  registrarCredencialBiometrica,
  verificarCredencialBiometrica
} from './webauthn.js';

import { SabanaView } from './views/sabana.js';
import { NovedadesView } from './views/novedades.js';
import { PersonalView } from './views/personal.js';
import { LicenciasView } from './views/licencias.js';

class AppController {
  constructor() {
    this.store = new WebDataStore();
    this.vistaActiva = "sabana"; // "sabana" | "novedades" | "personal" | "licencias"

    this.sabanaView = null;
    this.novedadesView = null;
    this.personalView = null;
    this.licenciasView = null;

    this.deferredPrompt = null;

    this.init();
  }

  async init() {
    this.registerServiceWorker();
    this.attachPWAInstall();
    this.attachNetworkStatus();
    this.attachLoginEvents();
    this.attachConfigEvents();
    this.attachSeguridadEvents();
    this.attachModalBackdropEvents();

    const session = getSession();
    if (!session) {
      this.mostrarPantallaLogin();
    } else {
      await this.iniciarSistema(session);
    }
  }

  attachModalBackdropEvents() {
    // Cerrar cualquier modal al hacer clic en el fondo exterior oscuro (backdrop)
    document.addEventListener('click', (e) => {
      if (e.target.classList && e.target.classList.contains('modal-overlay') && e.target.classList.contains('active')) {
        e.target.classList.remove('active');
      }
    });
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('Service Worker registrado OK:', reg.scope))
          .catch(err => console.warn('Fallo registrando Service Worker:', err));
      });
    }
  }

  attachPWAInstall() {
    const btnInstalar = document.getElementById('btn-instalar-app');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      if (btnInstalar) {
        btnInstalar.style.display = 'inline-flex';
        btnInstalar.addEventListener('click', async () => {
          if (!this.deferredPrompt) return;
          this.deferredPrompt.prompt();
          const { outcome } = await this.deferredPrompt.userChoice;
          console.log(`PWA Prompt resultado: ${outcome}`);
          this.deferredPrompt = null;
          btnInstalar.style.display = 'none';
        });
      }
    });

    // Detectar iOS para guía de instalación
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    if (isIos && !isStandalone && btnInstalar) {
      btnInstalar.style.display = 'inline-flex';
      btnInstalar.addEventListener('click', () => {
        alert("Para instalar en iPhone o iPad:\n1. Tocá el botón de Compartir en Safari (icono con flecha arriba)\n2. Seleccioná 'Agregar a pantalla de inicio'");
      });
    }
  }

  attachNetworkStatus() {
    const dot = document.getElementById('status-dot');
    const update = () => {
      if (navigator.onLine) {
        dot.classList.remove('offline');
        dot.title = "En línea (Conectado a Supabase)";
      } else {
        dot.classList.add('offline');
        dot.title = "Modo Offline (Caché local activa)";
      }
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  }

  mostrarPantallaLogin() {
    const screen = document.getElementById('login-screen');
    if (screen) screen.style.display = 'flex';
  }

  ocultarPantallaLogin() {
    const screen = document.getElementById('login-screen');
    if (screen) screen.style.display = 'none';
  }

  attachLoginEvents() {
    const form = document.getElementById('login-form');
    const inpUser = document.getElementById('login-username');
    const inpPass = document.getElementById('login-password');
    const btnLogin = document.getElementById('btn-login-submit');
    const errBox = document.getElementById('login-error-msg');
    const lockoutBox = document.getElementById('login-lockout-box');
    const lockoutTimer = document.getElementById('login-lockout-timer');

    let intervaloLockout = null;

    const actualizarEstadoBloqueo = () => {
      const state = getLoginLockoutState();
      if (state.bloqueadoHasta && state.bloqueadoHasta > Date.now()) {
        const segs = Math.ceil((state.bloqueadoHasta - Date.now()) / 1000);
        if (lockoutBox) lockoutBox.style.display = 'block';
        if (lockoutTimer) lockoutTimer.textContent = segs;
        if (inpUser) inpUser.disabled = true;
        if (inpPass) inpPass.disabled = true;
        if (btnLogin) {
          btnLogin.disabled = true;
          btnLogin.textContent = `Bloqueado (${segs}s)`;
        }

        if (!intervaloLockout) {
          intervaloLockout = setInterval(() => {
            const actual = getLoginLockoutState();
            if (actual.bloqueadoHasta && actual.bloqueadoHasta > Date.now()) {
              const r = Math.ceil((actual.bloqueadoHasta - Date.now()) / 1000);
              if (lockoutTimer) lockoutTimer.textContent = r;
              if (btnLogin) btnLogin.textContent = `Bloqueado (${r}s)`;
            } else {
              clearInterval(intervaloLockout);
              intervaloLockout = null;
              if (lockoutBox) lockoutBox.style.display = 'none';
              if (inpUser) inpUser.disabled = false;
              if (inpPass) inpPass.disabled = false;
              if (btnLogin) {
                btnLogin.disabled = false;
                btnLogin.textContent = 'Ingresar a CRONO';
              }
            }
          }, 1000);
        }
        return true;
      } else {
        if (intervaloLockout) {
          clearInterval(intervaloLockout);
          intervaloLockout = null;
        }
        if (lockoutBox) lockoutBox.style.display = 'none';
        if (inpUser) inpUser.disabled = false;
        if (inpPass) inpPass.disabled = false;
        if (btnLogin) {
          btnLogin.disabled = false;
          btnLogin.textContent = 'Ingresar a CRONO';
        }
        return false;
      }
    };

    // Chequear al iniciar
    actualizarEstadoBloqueo();

    // Elementos de Biometría (WebAuthn)
    const bioBox = document.getElementById('biometric-login-box');
    const bioUserLabel = document.getElementById('biometric-user-label');
    const btnBioSubmit = document.getElementById('btn-biometric-submit');
    const btnBioIcon = document.getElementById('btn-biometric-icon');
    const btnBioFallback = document.getElementById('btn-biometric-fallback');

    // Comprobar si hay un usuario biométrico recordado en este dispositivo
    const verificarBiometriaGuardada = async () => {
      try {
        const tieneHardware = await isBiometricsAvailable();
        const bioDataRaw = localStorage.getItem('crono_biometric_device_user');
        if (tieneHardware && bioDataRaw && bioBox && form) {
          const bioData = JSON.parse(bioDataRaw);
          if (bioData && bioData.username) {
            bioUserLabel.textContent = `Hola ${bioData.nombre || bioData.username}, tocá el sensor para ingresar`;
            form.style.display = 'none';
            bioBox.style.display = 'block';
            return true;
          }
        }
      } catch (e) {
        console.warn("Fallo verificando biometría recordada:", e);
      }
      return false;
    };

    verificarBiometriaGuardada();

    const ejecutarLoginBiometrico = async () => {
      errBox.style.display = 'none';
      btnBioSubmit.disabled = true;
      btnBioSubmit.textContent = '👆 Verificando sensor...';

      try {
        const bioDataRaw = localStorage.getItem('crono_biometric_device_user');
        const bioData = bioDataRaw ? JSON.parse(bioDataRaw) : null;
        if (!bioData || !bioData.username) {
          throw new Error("No hay credencial biométrica registrada.");
        }

        // 1. Invocar WebAuthn nativo del navegador
        await verificarCredencialBiometrica(bioData.credentialId);

        // 2. Autenticar contra RPC de Supabase para este dispositivo de confianza
        const res = await autenticarPorDispositivoBiometrico(bioData.username);
        this.ocultarPantallaLogin();
        bioBox.style.display = 'none';
        form.style.display = 'block';
        await this.iniciarSistema(res);
      } catch (err) {
        console.warn("Autenticación biométrica no completada:", err);
        errBox.textContent = err.message || "Validación biométrica cancelada o no reconocida.";
        errBox.style.display = 'block';
        // Fallback automático inmediato a formulario de contraseña
        bioBox.style.display = 'none';
        form.style.display = 'block';
      } finally {
        btnBioSubmit.disabled = false;
        btnBioSubmit.textContent = '👆 Usar Huella / Biometría';
      }
    };

    if (btnBioSubmit) btnBioSubmit.addEventListener('click', ejecutarLoginBiometrico);
    if (btnBioIcon) btnBioIcon.addEventListener('click', ejecutarLoginBiometrico);

    // Fallback explícito: si el usuario prefiere poner contraseña
    if (btnBioFallback) {
      btnBioFallback.addEventListener('click', () => {
        errBox.style.display = 'none';
        if (bioBox) bioBox.style.display = 'none';
        if (form) form.style.display = 'block';
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (actualizarEstadoBloqueo()) {
          return;
        }

        errBox.style.display = 'none';
        btnLogin.disabled = true;
        btnLogin.textContent = 'Verificando...';

        try {
          const res = await autenticarUsuario(inpUser.value, inpPass.value);
          if (res && res.requiere_totp) {
            // Mostrar formulario de TOTP
            this.usuarioPendienteTotp = res.username || inpUser.value;
            form.style.display = 'none';
            if (totpForm) {
              totpForm.style.display = 'block';
              if (totpCode) {
                totpCode.value = '';
                totpCode.focus();
              }
            }
            return;
          }

          this.ocultarPantallaLogin();
          await this.iniciarSistema(res);
          this.consultarActivacionBiometrica(res);
        } catch (err) {
          errBox.textContent = err.message || "Error al iniciar sesión.";
          errBox.style.display = 'block';
          actualizarEstadoBloqueo();
        } finally {
          if (!actualizarEstadoBloqueo()) {
            btnLogin.disabled = false;
            btnLogin.textContent = 'Ingresar a CRONO';
          }
        }
      });
    }

    // Eventos del formulario TOTP (Google Authenticator)
    const totpForm = document.getElementById('totp-form');
    const totpCode = document.getElementById('totp-code');
    const totpConfiar = document.getElementById('totp-confiar-dispositivo');
    const btnTotpSubmit = document.getElementById('btn-totp-submit');
    const btnTotpVolver = document.getElementById('btn-totp-volver');

    if (totpForm) {
      totpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errBox.style.display = 'none';
        btnTotpSubmit.disabled = true;
        btnTotpSubmit.textContent = 'Verificando...';

        try {
          const user = await verificarTotpUsuario(
            this.usuarioPendienteTotp || inpUser.value,
            totpCode.value,
            totpConfiar ? totpConfiar.checked : true
          );
          this.ocultarPantallaLogin();
          totpForm.style.display = 'none';
          form.style.display = 'block';
          await this.iniciarSistema(user);
          this.consultarActivacionBiometrica(user);
        } catch (err) {
          errBox.textContent = err.message || "Código TOTP inválido.";
          errBox.style.display = 'block';
        } finally {
          btnTotpSubmit.disabled = false;
          btnTotpSubmit.textContent = 'Verificar Código';
        }
      });
    }

    if (btnTotpVolver) {
      btnTotpVolver.addEventListener('click', () => {
        if (totpForm) totpForm.style.display = 'none';
        if (form) form.style.display = 'block';
        errBox.style.display = 'none';
      });
    }

    const btnLogout = document.getElementById('btn-header-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', async () => {
        if (confirm("¿Deseás cerrar la sesión actual?")) {
          await this.ejecutarLogout(false);
        }
      });
    }
  }

  async consultarActivacionBiometrica(user) {
    try {
      const tieneHardware = await isBiometricsAvailable();
      if (!tieneHardware) return; // Dispositivo sin lector de huella/FaceID (ej. PC clásica)

      const yaConfigurado = localStorage.getItem('crono_biometric_device_user');
      if (yaConfigurado) return; // Ya está configurado en este navegador

      const nombre = user.nombre_completo || user.username || "Usuario";
      const confirmar = confirm(`¿Deseás habilitar el inicio de sesión con Huella Digital o Biometría en este dispositivo para futuras sesiones?`);
      if (!confirmar) return;

      const cred = await registrarCredencialBiometrica(user.username);
      if (cred && cred.id) {
        // Registrar en Supabase
        await registrarDispositivoConfiable(
          user.username,
          "Dispositivo Biométrico (" + (navigator.userAgent.includes('Mobile') ? 'Móvil' : 'PC') + ")",
          cred.id,
          cred.rawId
        );

        // Guardar credencial local para futuros inicios sin contraseña
        localStorage.setItem('crono_biometric_device_user', JSON.stringify({
          username: user.username,
          nombre: nombre,
          credentialId: cred.id
        }));

        alert("¡Biometría configurada con éxito! La próxima vez podrás ingresar tocando el sensor.");
      }
    } catch (e) {
      console.warn("Activación biométrica no completada o cancelada:", e);
    }
  }

  async ejecutarLogout(porInactividad = false) {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    try {
      await clearSession();
    } catch (e) {}

    // 1. Desmontar visualmente todas las secciones operativas de inmediato
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.remove('active');
    });

    const headerBadge = document.getElementById('header-user-badge');
    if (headerBadge) {
      const lblNom = document.getElementById('header-user-name');
      const lblRol = document.getElementById('header-user-role');
      if (lblNom) lblNom.textContent = 'Usuario';
      if (lblRol) lblRol.textContent = 'ROL';
    }

    const btnCfg = document.getElementById('btn-header-config');
    if (btnCfg) btnCfg.style.display = 'none';

    // 2. Limpiar formularios de login
    const inpPass = document.getElementById('login-password');
    if (inpPass) inpPass.value = '';

    const totpForm = document.getElementById('totp-form');
    if (totpForm) totpForm.style.display = 'none';

    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.style.display = 'block';

    const errBox = document.getElementById('login-error-msg');
    if (errBox) errBox.style.display = 'none';

    // 3. Mostrar pantalla de login en primer plano
    this.mostrarPantallaLogin();

    // Notificar al Service Worker para que purgue la caché de autenticación
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ action: 'CLEAR_AUTH_CACHE' });
    }

    if (porInactividad) {
      alert("Tu sesión ha sido cerrada automáticamente por inactividad (20 minutos) para proteger tus datos.");
      window.location.reload();
    }
  }

  iniciarMonitorInactividad() {
    const TIEMPO_INACTIVIDAD_MS = 20 * 60 * 1000; // 20 minutos
    let ultimoReinicio = Date.now();

    const reiniciarTimer = () => {
      // Throttle: evitar reiniciar en cada milisegundo de movimiento del mouse
      const ahora = Date.now();
      if (ahora - ultimoReinicio < 2000) return;
      ultimoReinicio = ahora;

      if (this.inactivityTimer) {
        clearTimeout(this.inactivityTimer);
      }
      this.inactivityTimer = setTimeout(() => {
        const session = getSession();
        if (session) {
          this.ejecutarLogout(true);
        }
      }, TIEMPO_INACTIVIDAD_MS);
    };

    ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'].forEach(evt => {
      window.addEventListener(evt, reiniciarTimer, { passive: true });
    });

    reiniciarTimer();
  }

  attachConfigEvents() {
    const modalCfg = document.getElementById('modal-config-supabase');
    const btnOpen = document.getElementById('btn-header-config');
    const btnOpenLogin = document.getElementById('btn-login-config');
    const btnCerrar = document.getElementById('btn-cerrar-config-supabase');
    const btnCancelar = document.getElementById('btn-cancelar-config-supabase');
    const btnGuardar = document.getElementById('btn-guardar-config-supabase');

    const inpUrl = document.getElementById('cfg-supabase-url');
    const inpKey = document.getElementById('cfg-supabase-anon-key');

    const abrir = () => {
      // Bloqueo estricto: solo administradores
      const session = getSession();
      const esAdmin = Boolean(session && (session.rol === 'ADMIN' || (typeof this.store?.esAdmin === 'function' && this.store.esAdmin())));
      if (!esAdmin && session) {
        alert("Acceso Restringido: La configuración de conexión a Supabase es exclusiva para Administradores.");
        return;
      }

      const cfg = getConfig();
      inpUrl.value = cfg.supabase_url;
      inpKey.value = cfg.supabase_anon_key;
      modalCfg.classList.add('active');
    };

    const cerrar = () => modalCfg.classList.remove('active');

    if (btnOpen) btnOpen.addEventListener('click', abrir);
    if (btnOpenLogin) btnOpenLogin.addEventListener('click', abrir);
    if (btnCerrar) btnCerrar.addEventListener('click', cerrar);
    if (btnCancelar) btnCancelar.addEventListener('click', cerrar);

    if (btnGuardar) {
      btnGuardar.addEventListener('click', () => {
        const session = getSession();
        const esAdmin = Boolean(session && (session.rol === 'ADMIN' || (typeof this.store?.esAdmin === 'function' && this.store.esAdmin())));
        if (!esAdmin && session) {
          alert("Operación denegada: Sólo un Administrador puede modificar los parámetros de conexión.");
          return;
        }

        saveConfig(inpUrl.value, inpKey.value);
        cerrar();
        alert("Configuración de Supabase guardada. La página se reiniciará para aplicar las nuevas credenciales.");
        window.location.reload();
      });
    }
  }

  attachSeguridadEvents() {
    const modalSeg = document.getElementById('modal-seguridad');
    const btnOpenSeg = document.getElementById('btn-header-seguridad');
    const btnCerrarSeg = document.getElementById('btn-cerrar-modal-seguridad');
    const btnCerrarSegFooter = document.getElementById('btn-cerrar-seguridad-footer');

    const totpStatusLabel = document.getElementById('totp-status-label');
    const btnIniciarSetupTotp = document.getElementById('btn-iniciar-setup-totp');
    const btnDesactivarTotp = document.getElementById('btn-desactivar-totp');
    const totpSetupContainer = document.getElementById('totp-setup-container');
    const qrContainer = document.getElementById('totp-qr-container');
    const btnTotpOpenApp = document.getElementById('btn-totp-open-app');
    const totpSecretText = document.getElementById('totp-secret-key-text');
    const btnCopiarSecret = document.getElementById('btn-copiar-secret');
    const inpConfirmCode = document.getElementById('inp-totp-confirm-code');
    const btnConfirmarActivacion = document.getElementById('btn-confirmar-activacion-totp');

    const bioStatus = document.getElementById('biometric-local-status');
    const btnToggleBio = document.getElementById('btn-toggle-biometria-local');

    let currentOtpUri = "";
    let currentSecret = "";

    const actualizarVistaSeguridad = async () => {
      const session = getSession();
      if (!session) return;

      // 1. Consultar estado en servidor
      const uData = await consultarEstadoSeguridadUsuario(session.username);
      const estaActivo = uData ? Boolean(uData.totp_activo) : false;

      if (estaActivo) {
        totpStatusLabel.textContent = "✅ Activo y Protegido";
        totpStatusLabel.style.color = "var(--success, #10b981)";
        if (btnIniciarSetupTotp) btnIniciarSetupTotp.style.display = "none";
        if (btnDesactivarTotp) btnDesactivarTotp.style.display = "inline-block";
        if (totpSetupContainer) totpSetupContainer.style.display = "none";
      } else {
        totpStatusLabel.textContent = "⚠️ Inactivo (Se recomienda activar)";
        totpStatusLabel.style.color = "var(--warning, #f59e0b)";
        if (btnIniciarSetupTotp) btnIniciarSetupTotp.style.display = "inline-block";
        if (btnDesactivarTotp) btnDesactivarTotp.style.display = "none";
      }

      // 2. Estado de biometría local
      const tieneHw = await isBiometricsAvailable();
      const bioLocal = localStorage.getItem('crono_biometric_device_user');
      if (!tieneHw) {
        bioStatus.textContent = "Hardware biométrico no detectado en este equipo.";
        btnToggleBio.style.display = "none";
      } else if (bioLocal) {
        bioStatus.textContent = "✅ Habilitado en este navegador.";
        btnToggleBio.textContent = "🗑️ Desvincular de este equipo";
        btnToggleBio.className = "btn btn-danger btn-pill";
      } else {
        bioStatus.textContent = "Disponible para habilitar.";
        btnToggleBio.textContent = "👆 Habilitar en este equipo";
        btnToggleBio.className = "btn btn-primary btn-pill";
      }
    };

    const abrirModal = async () => {
      await actualizarVistaSeguridad();
      modalSeg.classList.add('active');
    };

    const cerrarModal = () => {
      modalSeg.classList.remove('active');
      if (totpSetupContainer) totpSetupContainer.style.display = 'none';
    };

    if (btnOpenSeg) btnOpenSeg.addEventListener('click', abrirModal);
    if (btnCerrarSeg) btnCerrarSeg.addEventListener('click', cerrarModal);
    if (btnCerrarSegFooter) btnCerrarSegFooter.addEventListener('click', cerrarModal);

    // Iniciar configuración de Google Authenticator
    if (btnIniciarSetupTotp) {
      btnIniciarSetupTotp.addEventListener('click', async () => {
        const session = getSession();
        if (!session) return;
        btnIniciarSetupTotp.disabled = true;
        btnIniciarSetupTotp.textContent = "Generando claves...";

        try {
          const res = await configurarTotp(session.username, true);
          currentOtpUri = res.otpauth_uri;
          currentSecret = res.totp_secret;

          // Dibujar QR con QRCode si la librería está disponible
          if (qrContainer) {
            qrContainer.innerHTML = '';
            if (window.QRCode) {
              new window.QRCode(qrContainer, {
                text: currentOtpUri,
                width: 180,
                height: 180,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: window.QRCode.CorrectLevel.M
              });
            } else {
              qrContainer.innerHTML = '<div style="color: var(--danger); font-size: 12px;">No se pudo cargar el motor de QR local. Utilizá la clave manual abajo.</div>';
            }
          }

          if (totpSecretText) totpSecretText.value = currentSecret;

          // Enlace directo si está en el celular
          if (btnTotpOpenApp) {
            btnTotpOpenApp.href = currentOtpUri;
            btnTotpOpenApp.style.display = /Android|iPhone|iPad/i.test(navigator.userAgent) ? "inline-block" : "none";
          }

          totpSetupContainer.style.display = "block";
          if (inpConfirmCode) inpConfirmCode.focus();
        } catch (e) {
          alert("Error generando clave 2FA: " + (e.message || e));
        } finally {
          btnIniciarSetupTotp.disabled = false;
          btnIniciarSetupTotp.textContent = "🔑 Configurar Google Authenticator";
        }
      });
    }

    // Copiar clave secreta
    if (btnCopiarSecret) {
      btnCopiarSecret.addEventListener('click', async () => {
        if (!currentSecret) return;
        try {
          await navigator.clipboard.writeText(currentSecret);
          btnCopiarSecret.textContent = "¡Copiado!";
          setTimeout(() => { btnCopiarSecret.textContent = "📋 Copiar"; }, 2000);
        } catch (err) {
          prompt("Copiá esta clave manualmente:", currentSecret);
        }
      });
    }

    // Confirmar código de prueba
    if (btnConfirmarActivacion) {
      btnConfirmarActivacion.addEventListener('click', async () => {
        const session = getSession();
        const code = inpConfirmCode ? inpConfirmCode.value.trim() : "";
        if (!code || code.length !== 6) {
          alert("Por favor ingresá los 6 dígitos generados en Google Authenticator.");
          return;
        }

        btnConfirmarActivacion.disabled = true;
        btnConfirmarActivacion.textContent = "Validando...";

        try {
          await verificarTotpUsuario(session.username, code, true);
          alert("¡Felicitaciones! Google Authenticator ha quedado activado y vinculado a tu cuenta.");
          cerrarModal();
        } catch (e) {
          alert("Código incorrecto o desfasado. Verificá que la hora de tu celular sea la correcta: " + (e.message || e));
        } finally {
          btnConfirmarActivacion.disabled = false;
          btnConfirmarActivacion.textContent = "Confirmar y Activar";
        }
      });
    }

    // Desactivar 2FA
    if (btnDesactivarTotp) {
      btnDesactivarTotp.addEventListener('click', async () => {
        const session = getSession();
        if (!confirm("¿Estás seguro de que deseas desactivar la verificación en dos pasos? Tu cuenta será menos segura.")) {
          return;
        }
        try {
          await configurarTotp(session.username, false);
          alert("Google Authenticator ha sido desactivado.");
          await actualizarVistaSeguridad();
        } catch (e) {
          alert("Error desactivando 2FA: " + (e.message || e));
        }
      });
    }

    // Alternar biometría local
    if (btnToggleBio) {
      btnToggleBio.addEventListener('click', async () => {
        const session = getSession();
        const bioLocal = localStorage.getItem('crono_biometric_device_user');
        if (bioLocal) {
          localStorage.removeItem('crono_biometric_device_user');
          alert("Se ha desvinculado la biometría / Windows Hello de este equipo. La próxima vez ingresarás con tu contraseña normal de CRONO.");
          await actualizarVistaSeguridad();
        } else if (session) {
          await this.consultarActivacionBiometrica(session);
          await actualizarVistaSeguridad();
        }
      });
    }
  }

  async iniciarSistema(user) {
    this.actualizarHeaderUsuario(user);

    // Cargar o sincronizar datos
    const btnSync = document.getElementById('btn-header-sync');
    if (btnSync) {
      btnSync.addEventListener('click', async () => {
        btnSync.disabled = true;
        btnSync.textContent = '🔄...';
        await this.store.sincronizar();
        btnSync.disabled = false;
        btnSync.textContent = '🔄';
        this.refrescarVistaActual();
      });
    }

    // Inicializar Vistas
    const cSabana = document.getElementById('view-sabana');
    const cNovedades = document.getElementById('view-novedades');
    const cPersonal = document.getElementById('view-personal');
    const cLicencias = document.getElementById('view-licencias');

    this.sabanaView = new SabanaView(
      cSabana,
      this.store,
      (datos) => {
        this.cambiarVista('novedades');
        if (this.novedadesView) {
          if (datos && datos.id) {
            this.novedadesView.abrirModalCRUD(datos);
          } else {
            this.novedadesView.abrirModalCRUD(null, datos);
          }
        }
      },
      (datos) => {
        this.cambiarVista('novedades');
        if (this.novedadesView) {
          this.novedadesView.abrirModalCambioTurno(datos);
        }
      }
    );

    this.novedadesView = new NovedadesView(cNovedades, this.store, () => {
      this.cambiarVista('licencias');
    });

    this.personalView = new PersonalView(cPersonal, this.store);
    this.licenciasView = new LicenciasView(cLicencias, this.store);

    this.attachNavigationEvents();
    this.iniciarMonitorInactividad();

    // Sincronización en segundo plano al arrancar
    this.store.sincronizar().then(() => {
      this.refrescarVistaActual();
    });
  }

  actualizarHeaderUsuario(user) {
    const lblNom = document.getElementById('header-user-name');
    const lblRol = document.getElementById('header-user-role');
    const btnCfg = document.getElementById('btn-header-config');
    if (lblNom) lblNom.textContent = user.nombre_completo || user.username;
    if (lblRol) lblRol.textContent = user.rol;

    // Solo mostrar el botón de configuración si es Administrador
    if (btnCfg) {
      const esAdmin = Boolean(user && (user.rol === 'ADMIN' || (typeof this.store?.esAdmin === 'function' && this.store.esAdmin())));
      btnCfg.style.display = esAdmin ? 'inline-flex' : 'none';
    }
  }

  attachNavigationEvents() {
    // Desktop Tabs
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.view;
        this.cambiarVista(target);
      });
    });

    // Mobile Bottom Nav
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const target = item.dataset.view;
        this.cambiarVista(target);
      });
    });
  }

  cambiarVista(nombreVista) {
    this.vistaActiva = nombreVista;

    // Actualizar botones activos
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === nombreVista);
    });

    document.querySelectorAll('.bottom-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === nombreVista);
    });

    // Mostrar sección correspondiente
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.remove('active');
    });

    const targetSec = document.getElementById(`view-${nombreVista}`);
    if (targetSec) targetSec.classList.add('active');

    this.refrescarVistaActual();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  refrescarVistaActual() {
    if (this.vistaActiva === 'sabana' && this.sabanaView) this.sabanaView.refrescar();
    if (this.vistaActiva === 'novedades' && this.novedadesView) this.novedadesView.refrescar();
    if (this.vistaActiva === 'personal' && this.personalView) this.personalView.refrescar();
    if (this.vistaActiva === 'licencias' && this.licenciasView) this.licenciasView.refrescar();
  }
}

// Iniciar aplicación al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  window.cronoApp = new AppController();
});
