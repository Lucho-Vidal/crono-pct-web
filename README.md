# CRONO-WEB (v1.0.0) — Progressive Web App (PWA)

Versión Web Progresiva de **CRONO-PCT**, diseñada para ser alojada como sitio estático directamente en **GitHub Pages** y conectada en tiempo real a la base de datos **Supabase**.

---

## 🚀 Características Principales

1. **Sin Build Steps Complejos**:
   - Desarrollada en HTML5 semántico, CSS3 moderno y **Vanilla JavaScript (ES6 Modules)**.
   - Cliente oficial `@supabase/supabase-js` (v2) cargado vía CDN ESM.
2. **PWA Instalable (Mobile & Desktop)**:
   - `manifest.json` e íconos (`192x192` y `512x512`).
   - `sw.js` (Service Worker) con cacheo de App Shell y consulta offline desde `localStorage`.
   - Botón `"📲 Instalar App"` interactivo.
3. **Diseño Adaptativo (Mobile-First + Desktop)**:
   - Barra de navegación inferior táctil (*Bottom Navigation Bar*) en celular.
   - Columnas fijas a la izquierda (*Sticky Columns*) para Legajo y Apellido/Nombre en Sábana y Personal.
   - Modales adaptados a *Bottom Sheets* deslizables en pantallas táctiles.
4. **Seguridad y Permisos RBAC**:
   - Inyección automática del header `x-crono-user` en las peticiones REST a Supabase para cumplir las políticas RLS (`fn_rol_actual()`).
   - Verificación de contraseñas con Web Crypto API (SHA-256).
   - Control de permisos según el rol (`ADMIN`, `SUPERVISOR`, `CONSULTA`).
5. **Los 4 Módulos Integrados**:
   - 📅 **Sábana de Turnos**: Selector de mes/año, motor de rotación SAP con cálculo en tiempo real, accesos rápidos a formatos excluyendo Licencia Anual, píldora con contador de días seleccionados y soporte de cobertura temporal SAP.
   - 📑 **Novedades**: Explorador en tabla y tarjetas (*Cards*), selector de tipo/color con muestra visual y color picker, cobertura SAP temporal y bloqueo de Licencia Anual con redirección a Licencias.
   - 👥 **Personal**: Listado con ordenamiento por fechas/números, columnas fijas, selector oficial de las 13 categorías jerárquicas desde `categorias_personal`.
   - 🏖️ **Licencias Anuales**: Saldos por período con imputación FIFO automática, Diagramador de Vacaciones sincronizado con indicador de cupo y horas de entrada (`06`, `12`, etc.), y Control RRHH con checkbox reactivo interactivo.

---

## 📦 Despliegue en GitHub Pages

Este directorio `web/` cuenta con su propio repositorio Git inicializado (`web/.git`).

Para publicarlo en tu cuenta de GitHub:

1. Creá un nuevo repositorio en GitHub (ej: `crono-web` o `crono-pct-web`).
2. Desde la terminal en esta carpeta:
   ```bash
   cd web
   git add .
   git commit -m "feat: release inicial CRONO-WEB v1.0.0"
   git remote add origin https://github.com/TU_USUARIO/crono-web.git
   git branch -M main
   git push -u origin main
   ```
3. En GitHub > **Settings** > **Pages**:
   - Source: **Deploy from a branch**
   - Branch: **main** / folder: **/ (root)**
   - Clic en **Save**.
4. ¡Listo! Tu app estará disponible en `https://TU_USUARIO.github.io/crono-web/`.

---

## 💻 Prueba Local Rápida

Podés probar la PWA localmente ejecutando un servidor HTTP ligero:

```bash
# Desde la raíz del proyecto
python -m http.server 8080 --directory web
```
Luego abrí `http://localhost:8080` en tu navegador o celular conectado a la misma red local.
