// app.js - Inicializador Maestro, Router de Vistas, PWA y Autenticación
import { 
  WebDataStore, 
  autenticarUsuario, 
  getSession, 
  clearSession, 
  getConfig, 
  saveConfig 
} from './supabase.js';

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

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errBox.style.display = 'none';
        btnLogin.disabled = true;
        btnLogin.textContent = 'Verificando...';

        try {
          const user = await autenticarUsuario(inpUser.value, inpPass.value);
          this.ocultarPantallaLogin();
          await this.iniciarSistema(user);
        } catch (err) {
          errBox.textContent = err.message || "Error al iniciar sesión.";
          errBox.style.display = 'block';
        } finally {
          btnLogin.disabled = false;
          btnLogin.textContent = 'Ingresar a CRONO';
        }
      });
    }

    const btnLogout = document.getElementById('btn-header-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        if (confirm("¿Deseás cerrar la sesión actual?")) {
          clearSession();
          window.location.reload();
        }
      });
    }
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
        saveConfig(inpUrl.value, inpKey.value);
        cerrar();
        alert("Configuración de Supabase guardada. La página se reiniciará para aplicar las nuevas credenciales.");
        window.location.reload();
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

    this.sabanaView = new SabanaView(cSabana, this.store, (datos) => {
      this.cambiarVista('novedades');
      if (this.novedadesView) {
        this.novedadesView.abrirModalCRUD(datos);
      }
    });

    this.novedadesView = new NovedadesView(cNovedades, this.store, () => {
      this.cambiarVista('licencias');
    });

    this.personalView = new PersonalView(cPersonal, this.store);
    this.licenciasView = new LicenciasView(cLicencias, this.store);

    this.attachNavigationEvents();

    // Sincronización en segundo plano al arrancar
    this.store.sincronizar().then(() => {
      this.refrescarVistaActual();
    });
  }

  actualizarHeaderUsuario(user) {
    const lblNom = document.getElementById('header-user-name');
    const lblRol = document.getElementById('header-user-role');
    if (lblNom) lblNom.textContent = user.nombre_completo || user.username;
    if (lblRol) lblRol.textContent = user.rol;
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
