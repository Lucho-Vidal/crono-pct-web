// views/novedades.js - Explorador CRUD de Novedades con Color y Cobertura SAP
import { parseFechaISO } from '../engine_turnos.js';
import { getSupabaseClient } from '../supabase.js';

export class NovedadesView {
  constructor(container, store, onIrALicencias) {
    this.container = container;
    this.store = store;
    this.onIrALicencias = onIrALicencias;

    this.filtroTexto = "";
    this.filtroSector = "TODOS";
    this.filtroMotivo = "TODOS";
    this.filtroDesde = "";
    this.filtroHasta = "";
    this.mostrarInactivos = false;
    this.vistaTarjetas = window.innerWidth <= 768;

    this.novedadEnEdicion = null;

    this.init();
  }

  init() {
    this.renderLayout();
    this.renderTablaOCards();
    this.attachEvents();
  }

  renderLayout() {
    this.container.innerHTML = `
      <div class="toolbar-card">
        <div class="toolbar-row">
          <div class="toolbar-group">
            <label style="font-weight: 600;">Desde:</label>
            <input type="date" id="inp-nov-desde" value="${this.filtroDesde}">
            <label style="font-weight: 600;">Hasta:</label>
            <input type="date" id="inp-nov-hasta" value="${this.filtroHasta}">
          </div>

          <div class="toolbar-group">
            <select id="sel-nov-sector">
              <option value="TODOS">Todos los Sectores</option>
              ${this.store.sectores.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>

            <select id="sel-nov-motivo">
              <option value="TODOS">Todos los Motivos</option>
              ${this.store.catalogo_motivos.map(m => `<option value="${m.valor}">${m.valor}</option>`).join('')}
            </select>
          </div>

          <div class="toolbar-group" style="flex: 1; min-width: 180px;">
            <input type="text" id="inp-nov-buscar" placeholder="🔍 Buscar legajo, agente u obs..." style="width: 100%;">
          </div>

          <div class="toolbar-group">
            <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; cursor: pointer; user-select: none;">
              <input type="checkbox" id="chk-nov-inactivos" ${this.mostrarInactivos ? 'checked' : ''}>
              Mostrar dadas de baja
            </label>
            <button class="btn btn-secondary" id="btn-nov-toggle-vista">${this.vistaTarjetas ? '📊 Tabla' : '📱 Tarjetas'}</button>
            <button class="btn btn-primary" id="btn-nov-nueva">➕ Nueva Novedad</button>
          </div>
        </div>
      </div>

      <div class="table-container" id="nov-table-container" style="${this.vistaTarjetas ? 'display: none;' : ''}">
        <!-- Tabla en Desktop -->
      </div>

      <div class="cards-container" id="nov-cards-container" style="${this.vistaTarjetas ? 'display: flex;' : 'display: none;'}">
        <!-- Tarjetas en Mobile -->
      </div>

      <!-- Modal Crear / Editar Novedad -->
      <div class="modal-overlay" id="modal-crud-novedad">
        <div class="modal-content">
          <div class="modal-header">
            <h3 id="modal-novedad-titulo">Cargar Novedad</h3>
            <button class="btn-icon" id="btn-cerrar-modal-novedad">✖</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Agente / Personal:</label>
              <input type="text" id="nov-buscar-agente" placeholder="🔍 Filtrar agente (legajo o apellido)..." style="margin-bottom: 6px; font-size: 13px;">
              <select id="nov-form-legajo" required>
                <option value="">-- Seleccionar Agente --</option>
                ${this.store.personal.filter(p => p.activo !== false).map(p => `
                  <option value="${p.legajo}">[${p.legajo}] ${p.apellido}, ${p.nombre} (${p.sector_actual || ''})</option>
                `).join('')}
              </select>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Fecha Inicio:</label>
                <input type="date" id="nov-form-inicio" required>
              </div>
              <div class="form-group">
                <label>Fecha Fin:</label>
                <input type="date" id="nov-form-fin" required>
              </div>
            </div>

            <div class="form-group">
              <label>Motivo / Turno SAP:</label>
              <input type="text" id="nov-buscar-motivo" placeholder="🔍 Filtrar motivo o código SAP..." style="margin-bottom: 6px; font-size: 13px;">
              <select id="nov-form-motivo">
                <!-- Motivos del catálogo -->
                ${this.store.catalogo_motivos.map(m => `
                  <option value="${m.valor}" data-color="${m.color_hex || ''}" data-tipo="${m.tipo_color || 'licencia'}" data-sap="">${m.valor}</option>
                `).join('')}
                <!-- Turnos SAP activos -->
                ${Array.from(this.store.turnos.values()).filter(t => t.activo !== false).map(t => `
                  <option value="${t.codigo_sap} - ${t.descripcion || t.etiqueta_corta || t.codigo_sap}" data-sap="${t.codigo_sap}" data-tipo="cambio" data-color="#daeef3">${t.codigo_sap} - ${t.descripcion || t.etiqueta_corta || t.codigo_sap}</option>
                `).join('')}
                <option value="OTRO" data-sap="">Otro Motivo Personalizado...</option>
              </select>
              <input type="text" id="nov-form-motivo-otro" placeholder="Escribir motivo personalizado..." style="display: none; margin-top: 6px;">
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Tipo / Estilo de Color:</label>
                <select id="nov-form-tipo-color">
                  <option value="licencia">Licencia (Amarillo)</option>
                  <option value="franco">Franco (Crema)</option>
                  <option value="cambio">Cambio de Turno (Celeste)</option>
                  <option value="noche">Noche (Grisáceo)</option>
                  <option value="otro">Personalizado</option>
                </select>
              </div>
              <div class="form-group">
                <label>Color de Celda en Sábana:</label>
                <div style="display: flex; gap: 8px; align-items: center;">
                  <input type="color" id="nov-form-color-hex" value="#ffff00" style="height: 38px; width: 60px; padding: 2px; cursor: pointer;">
                  <span id="nov-preview-color" style="font-weight: 700; font-size: 11px;">#FFFF00</span>
                </div>
              </div>
            </div>

            <!-- Reemplaza a (opcional) -->
            <div class="form-group" style="margin-top: 6px;">
              <label>Reemplaza a (opcional):</label>
              <select id="nov-form-legajo-reemplazado" style="width: 100%;">
                <option value="">-- Ninguno --</option>
                ${this.store.personal.filter(p => p.activo !== false).map(p => `
                  <option value="${p.legajo}">[${p.legajo}] ${p.apellido}, ${p.nombre}</option>
                `).join('')}
              </select>
            </div>

            <div class="form-group">
              <label>Observaciones:</label>
              <textarea id="nov-form-obs" rows="2" placeholder="Observaciones o justificativo opcional..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btn-cancelar-modal-novedad">Cancelar</button>
            <button class="btn btn-primary" id="btn-guardar-modal-novedad">Guardar Novedad</button>
          </div>
        </div>
      </div>
    `;
  }

  obtenerNovedadesFiltradas() {
    let novs = this.store.novedades;
    if (!this.mostrarInactivos) {
      novs = novs.filter(n => n.activo !== false && n.activo !== 0 && n.activo !== '0');
    }

    if (this.filtroDesde) {
      novs = novs.filter(n => parseFechaISO(n.fecha_fin) >= this.filtroDesde);
    }
    if (this.filtroHasta) {
      novs = novs.filter(n => parseFechaISO(n.fecha_inicio) <= this.filtroHasta);
    }
    if (this.filtroMotivo !== "TODOS") {
      novs = novs.filter(n => n.motivo === this.filtroMotivo);
    }
    if (this.filtroSector !== "TODOS") {
      novs = novs.filter(n => {
        const ag = this.store.personal.find(p => String(p.legajo).trim() === String(n.legajo).trim());
        return ag && ag.sector_actual === this.filtroSector;
      });
    }
    if (this.filtroTexto) {
      const q = this.filtroTexto.toLowerCase();
      novs = novs.filter(n => {
        const leg = String(n.legajo || "").toLowerCase();
        const obs = String(n.observaciones || "").toLowerCase();
        const mot = String(n.motivo || "").toLowerCase();
        const ag = this.store.personal.find(p => String(p.legajo).trim() === String(n.legajo).trim());
        const ape = ag ? ag.apellido.toLowerCase() : "";
        const nom = ag ? ag.nombre.toLowerCase() : "";
        return leg.includes(q) || obs.includes(q) || mot.includes(q) || ape.includes(q) || nom.includes(q);
      });
    }

    return novs;
  }

  renderTablaOCards() {
    const tableCont = this.container.querySelector("#nov-table-container");
    const cardsCont = this.container.querySelector("#nov-cards-container");
    if (!tableCont || !cardsCont) return;

    const lista = this.obtenerNovedadesFiltradas();

    // 1. Render Tabla Desktop
    let htmlTable = `
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Legajo</th>
            <th>Apellido y Nombre</th>
            <th>Desde</th>
            <th>Hasta</th>
            <th>Motivo / Turno SAP</th>
            <th>Tipo / Color</th>
            <th>Reemplaza a</th>
            <th>Observaciones</th>
            <th style="text-align: center;">Acciones</th>
          </tr>
        </thead>
        <tbody>
    `;

    if (lista.length === 0) {
      htmlTable += `<tr><td colspan="10" style="text-align: center; padding: 25px; color: var(--text-muted);">No hay novedades que coincidan con los filtros.</td></tr>`;
    } else {
      lista.forEach(n => {
        const ag = this.store.personal.find(p => String(p.legajo).trim() === String(n.legajo).trim());
        const apeNom = ag ? `${ag.apellido}, ${ag.nombre}` : "Agente no encontrado";
        const colorHex = n.color_hex || "#e2e8f0";
        const esInactiva = n.activo === false || n.activo === 0 || n.activo === '0';

        let reempTexto = "—";
        if (n.legajo_reemplazado) {
          const agR = this.store.personal.find(p => String(p.legajo).trim() === String(n.legajo_reemplazado).trim());
          reempTexto = agR ? `[${n.legajo_reemplazado}] ${agR.apellido}` : `[${n.legajo_reemplazado}]`;
        }

        htmlTable += `
          <tr ${esInactiva ? 'style="opacity: 0.6; background-color: #f8fafc;"' : ''}>
            <td>
              ${n.id}
              ${esInactiva ? '<span class="brand-badge" style="background-color: #94a3b8; color: white; font-size: 9px; margin-left: 4px; padding: 2px 4px; border-radius: 4px;">BAJA</span>' : ''}
            </td>
            <td style="font-weight: 700;">${n.legajo}</td>
            <td>${apeNom}</td>
            <td>${n.fecha_inicio}</td>
            <td>${n.fecha_fin}</td>
            <td><b ${esInactiva ? 'style="text-decoration: line-through;"' : ''}>${n.motivo}</b></td>
            <td>
              <span style="display: inline-block; width: 14px; height: 14px; border-radius: 3px; background-color: ${colorHex}; border: 1px solid #94a3b8; vertical-align: middle; margin-right: 4px;"></span>
              ${n.tipo_color || 'licencia'}
            </td>
            <td>${reempTexto}</td>
            <td title="${n.observaciones || ''}">${(n.observaciones || '—').slice(0, 30)}</td>
            <td style="text-align: center; white-space: nowrap;">
              ${esInactiva ? `
                <button class="btn btn-secondary btn-pill btn-reactivar-nov" data-id="${n.id}" title="Reactivar novedad">♻️ Reactivar</button>
              ` : `
                <button class="btn btn-secondary btn-pill btn-editar-nov" data-id="${n.id}">✏️</button>
                <button class="btn btn-danger btn-pill btn-eliminar-nov" data-id="${n.id}">🗑️</button>
              `}
            </td>
          </tr>
        `;
      });
    }

    htmlTable += `</tbody></table>`;
    tableCont.innerHTML = htmlTable;

    // 2. Render Cards Mobile
    let htmlCards = "";
    if (lista.length === 0) {
      htmlCards = `<div style="text-align: center; padding: 30px; color: var(--text-muted);">No hay novedades con los filtros seleccionados.</div>`;
    } else {
      lista.forEach(n => {
        const ag = this.store.personal.find(p => String(p.legajo).trim() === String(n.legajo).trim());
        const apeNom = ag ? `${ag.apellido}, ${ag.nombre}` : `Legajo ${n.legajo}`;
        const colorHex = n.color_hex || "#e2e8f0";
        const esInactiva = n.activo === false || n.activo === 0 || n.activo === '0';

        let reempTexto = "";
        if (n.legajo_reemplazado) {
          const agR = this.store.personal.find(p => String(p.legajo).trim() === String(n.legajo_reemplazado).trim());
          reempTexto = `<div style="font-size: 12px; margin-bottom: 4px; color: #1e3a8a;">👥 Reemplaza a: <b>${agR ? `${agR.apellido}, ${agR.nombre} (${n.legajo_reemplazado})` : n.legajo_reemplazado}</b></div>`;
        }

        htmlCards += `
          <div class="novedad-card" ${esInactiva ? 'style="opacity: 0.65; background-color: #f8fafc; border-left: 4px solid #94a3b8;"' : ''}>
            <div class="card-header">
              <div>
                <div class="card-title">${apeNom} <span style="color: var(--text-muted); font-size: 12px;">(${n.legajo})</span> ${esInactiva ? '<span class="brand-badge" style="background-color: #94a3b8; color: white; font-size: 9px; padding: 2px 4px; border-radius: 4px;">BAJA</span>' : ''}</div>
                <div class="card-dates">📅 ${n.fecha_inicio} al ${n.fecha_fin}</div>
              </div>
              <span class="card-badge" style="background-color: ${colorHex}; border: 1px solid #94a3b8;">
                ${n.motivo}
              </span>
            </div>
            ${reempTexto}
            ${n.observaciones ? `<div style="font-size: 12px; color: #475569; margin-bottom: 8px;">📝 ${n.observaciones}</div>` : ''}
            <div style="display: flex; justify-content: flex-end; gap: 8px;">
              ${esInactiva ? `
                <button class="btn btn-secondary btn-pill btn-reactivar-nov" data-id="${n.id}">♻️ Reactivar</button>
              ` : `
                <button class="btn btn-secondary btn-pill btn-editar-nov" data-id="${n.id}">✏️ Editar</button>
                <button class="btn btn-danger btn-pill btn-eliminar-nov" data-id="${n.id}">🗑️ Eliminar</button>
              `}
            </div>
          </div>
        `;
      });
    }
    cardsCont.innerHTML = htmlCards;

    this.attachRowEvents();
  }

  attachEvents() {
    const inpDesde = this.container.querySelector("#inp-nov-desde");
    const inpHasta = this.container.querySelector("#inp-nov-hasta");
    const selSec = this.container.querySelector("#sel-nov-sector");
    const selMot = this.container.querySelector("#sel-nov-motivo");
    const inpBuscar = this.container.querySelector("#inp-nov-buscar");
    const btnToggleVista = this.container.querySelector("#btn-nov-toggle-vista");
    const btnNueva = this.container.querySelector("#btn-nov-nueva");

    if (inpDesde) inpDesde.addEventListener("change", (e) => { this.filtroDesde = e.target.value; this.renderTablaOCards(); });
    if (inpHasta) inpHasta.addEventListener("change", (e) => { this.filtroHasta = e.target.value; this.renderTablaOCards(); });
    if (selSec) selSec.addEventListener("change", (e) => { this.filtroSector = e.target.value; this.renderTablaOCards(); });
    if (selMot) selMot.addEventListener("change", (e) => { this.filtroMotivo = e.target.value; this.renderTablaOCards(); });
    if (inpBuscar) inpBuscar.addEventListener("input", (e) => { this.filtroTexto = e.target.value; this.renderTablaOCards(); });

    const chkInactivos = this.container.querySelector("#chk-nov-inactivos");
    if (chkInactivos) {
      chkInactivos.addEventListener("change", (e) => {
        this.mostrarInactivos = e.target.checked;
        this.renderTablaOCards();
      });
    }

    if (btnToggleVista) {
      btnToggleVista.addEventListener("click", () => {
        this.vistaTarjetas = !this.vistaTarjetas;
        btnToggleVista.textContent = this.vistaTarjetas ? '📊 Tabla' : '📱 Tarjetas';
        const tc = this.container.querySelector("#nov-table-container");
        const cc = this.container.querySelector("#nov-cards-container");
        if (tc && cc) {
          tc.style.display = this.vistaTarjetas ? 'none' : 'block';
          cc.style.display = this.vistaTarjetas ? 'flex' : 'none';
        }
      });
    }

    if (btnNueva) {
      btnNueva.addEventListener("click", () => {
        this.abrirModalCRUD(null);
      });
    }

    // Modal CRUD eventos
    const modal = this.container.querySelector("#modal-crud-novedad");
    const btnCerrar = this.container.querySelector("#btn-cerrar-modal-novedad");
    const btnCancelar = this.container.querySelector("#btn-cancelar-modal-novedad");
    const btnGuardar = this.container.querySelector("#btn-guardar-modal-novedad");

    const cerrar = () => modal.classList.remove("active");
    if (btnCerrar) btnCerrar.addEventListener("click", cerrar);
    if (btnCancelar) btnCancelar.addEventListener("click", cerrar);

    if (btnGuardar) {
      btnGuardar.addEventListener("click", () => this.guardarNovedad());
    }

    // Sincronizar combobox de motivo con tipo y color
    const selFormMot = this.container.querySelector("#nov-form-motivo");
    const inpFormMotOtro = this.container.querySelector("#nov-form-motivo-otro");
    const selFormTipo = this.container.querySelector("#nov-form-tipo-color");
    const inpFormColor = this.container.querySelector("#nov-form-color-hex");
    const prevColor = this.container.querySelector("#nov-preview-color");

    if (selFormMot) {
      selFormMot.addEventListener("change", () => {
        const val = selFormMot.value;
        if (val === "OTRO") {
          inpFormMotOtro.style.display = "block";
        } else {
          inpFormMotOtro.style.display = "none";
          const opt = selFormMot.selectedOptions[0];
          const col = opt.getAttribute("data-color");
          const tipo = opt.getAttribute("data-tipo");
          if (col) {
            inpFormColor.value = col;
            prevColor.textContent = col.toUpperCase();
          }
          if (tipo) {
            selFormTipo.value = tipo;
          }
        }
      });
    }

    if (inpFormColor) {
      inpFormColor.addEventListener("input", (e) => {
        prevColor.textContent = e.target.value.toUpperCase();
      });
    }

    // Buscador interactivo de Agente en formulario de novedad
    const inpBuscarAgente = this.container.querySelector("#nov-buscar-agente");
    const selFormLeg = this.container.querySelector("#nov-form-legajo");
    if (inpBuscarAgente && selFormLeg) {
      inpBuscarAgente.addEventListener("input", (e) => {
        const q = e.target.value.trim().toLowerCase();
        Array.from(selFormLeg.options).forEach((opt, idx) => {
          if (idx === 0) return; // Mantener opción por defecto
          const txt = opt.textContent.toLowerCase();
          opt.style.display = (!q || txt.includes(q)) ? "" : "none";
        });
      });
    }

    // Buscador interactivo de Motivo / Turno SAP en formulario de novedad
    const inpBuscarMotivo = this.container.querySelector("#nov-buscar-motivo");
    if (inpBuscarMotivo && selFormMot) {
      inpBuscarMotivo.addEventListener("input", (e) => {
        const q = e.target.value.trim().toLowerCase();
        Array.from(selFormMot.options).forEach(opt => {
          if (opt.value === "OTRO") {
            opt.style.display = "";
            return;
          }
          const txt = opt.textContent.toLowerCase();
          opt.style.display = (!q || txt.includes(q)) ? "" : "none";
        });
      });
    }
  }

  attachRowEvents() {
    this.container.querySelectorAll(".btn-editar-nov").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.dataset.id, 10);
        const nov = this.store.novedades.find(n => n.id === id);
        if (nov) this.abrirModalCRUD(nov);
      });
    });

    this.container.querySelectorAll(".btn-eliminar-nov").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.dataset.id, 10);
        this.eliminarNovedad(id);
      });
    });

    this.container.querySelectorAll(".btn-reactivar-nov").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.dataset.id, 10);
        this.reactivarNovedad(id);
      });
    });
  }

  abrirModalCRUD(novedad = null, datosIniciales = null) {
    // Si viene un objeto de precarga sin ID (ej: desde Sábana), es una creación con datos iniciales
    const esEdicion = Boolean(novedad && novedad.id);
    const prefill = esEdicion ? null : (datosIniciales || (novedad && !novedad.id ? novedad : null));

    if (!this.store.tienePermiso('novedades', esEdicion ? 'editar' : 'crear')) {
      alert("No tenés permisos para realizar esta operación.");
      return;
    }

    // RESTRICCIÓN OBLIGATORIA: Licencia Anual
    if (novedad && novedad.motivo === "Licencia Anual") {
      const ir = confirm("Las Licencias Anuales deben gestionarse desde la pestaña 'Licencias Anuales' para controlar saldos y tercio legal.\n\n¿Deseás ir a Licencias Anuales ahora?");
      if (ir && this.onIrALicencias) {
        this.onIrALicencias();
      }
      return;
    }

    this.novedadEnEdicion = esEdicion ? novedad : null;
    const modal = this.container.querySelector("#modal-crud-novedad");
    const titulo = this.container.querySelector("#modal-novedad-titulo");

    const selLeg = this.container.querySelector("#nov-form-legajo");
    const inpIni = this.container.querySelector("#nov-form-inicio");
    const inpFin = this.container.querySelector("#nov-form-fin");
    const selMot = this.container.querySelector("#nov-form-motivo");
    const inpMotOtro = this.container.querySelector("#nov-form-motivo-otro");
    const selTipo = this.container.querySelector("#nov-form-tipo-color");
    const inpColor = this.container.querySelector("#nov-form-color-hex");
    const prevColor = this.container.querySelector("#nov-preview-color");
    const selSapTemp = this.container.querySelector("#nov-form-sap-temporal");
    const selLegReemp = this.container.querySelector("#nov-form-legajo-reemplazado");
    const txtObs = this.container.querySelector("#nov-form-obs");

    const inpBuscarAgente = this.container.querySelector("#nov-buscar-agente");
    const inpBuscarMotivo = this.container.querySelector("#nov-buscar-motivo");
    if (inpBuscarAgente) inpBuscarAgente.value = "";
    if (inpBuscarMotivo) inpBuscarMotivo.value = "";

    // Repoblar agentes, motivos de catálogo y turnos SAP
    const agentesActivos = this.store.personal.filter(p => p.activo !== false);
    selLeg.innerHTML = '<option value="">-- Seleccionar Agente --</option>' + agentesActivos.map(p => `
      <option value="${p.legajo}">[${p.legajo}] ${p.apellido}, ${p.nombre} (${p.sector_actual || ''})</option>
    `).join('');

    // Motivos combinados: primero motivos regulares de catálogo, luego Turnos SAP activos
    const opcionesMotivos = [];
    (this.store.catalogo_motivos || []).forEach(m => {
      opcionesMotivos.push(`<option value="${m.valor}" data-color="${m.color_hex || ''}" data-tipo="${m.tipo_color || 'licencia'}" data-sap="">${m.valor}</option>`);
    });
    Array.from(this.store.turnos.values()).filter(t => t.activo !== false).forEach(t => {
      const textoTurno = `${t.codigo_sap} - ${t.descripcion || t.etiqueta_corta || t.codigo_sap}`;
      opcionesMotivos.push(`<option value="${textoTurno}" data-sap="${t.codigo_sap}" data-tipo="cambio" data-color="#daeef3">${textoTurno}</option>`);
    });
    opcionesMotivos.push('<option value="OTRO" data-sap="">Otro Motivo Personalizado...</option>');
    selMot.innerHTML = opcionesMotivos.join('');

    selLegReemp.innerHTML = '<option value="">-- Ninguno --</option>' + agentesActivos.map(p => `
      <option value="${p.legajo}">[${p.legajo}] ${p.apellido}, ${p.nombre}</option>
    `).join('');

    if (esEdicion) {
      titulo.textContent = `Editar Novedad #${novedad.id}`;
      selLeg.value = novedad.legajo;
      selLeg.disabled = true;
      inpIni.value = parseFechaISO(novedad.fecha_inicio);
      inpFin.value = parseFechaISO(novedad.fecha_fin);

      // Chequear si motivo está en las opciones (o por codigo_sap_temporal)
      const motivoBuscado = novedad.motivo || "";
      let optCoincidente = Array.from(selMot.options).find(o => o.value === motivoBuscado);
      if (!optCoincidente && novedad.codigo_sap_temporal) {
        optCoincidente = Array.from(selMot.options).find(o => o.getAttribute("data-sap") === novedad.codigo_sap_temporal);
      }

      if (optCoincidente) {
        selMot.value = optCoincidente.value;
        inpMotOtro.style.display = "none";
      } else {
        selMot.value = "OTRO";
        inpMotOtro.style.display = "block";
        inpMotOtro.value = motivoBuscado;
      }

      selTipo.value = novedad.tipo_color || (optCoincidente ? optCoincidente.getAttribute("data-tipo") : "licencia") || "licencia";
      inpColor.value = novedad.color_hex || (optCoincidente ? optCoincidente.getAttribute("data-color") : "#ffff00") || "#ffff00";
      prevColor.textContent = (inpColor.value).toUpperCase();
      selLegReemp.value = novedad.legajo_reemplazado || "";
      txtObs.value = novedad.observaciones || "";
    } else {
      titulo.textContent = "Cargar Nueva Novedad";
      selLeg.disabled = false;
      const hoyIso = new Date().toISOString().split('T')[0];

      if (prefill) {
        selLeg.value = prefill.legajo || "";
        inpIni.value = prefill.fecha_inicio ? parseFechaISO(prefill.fecha_inicio) : hoyIso;
        inpFin.value = prefill.fecha_fin ? parseFechaISO(prefill.fecha_fin) : hoyIso;
      } else {
        selLeg.value = "";
        inpIni.value = hoyIso;
        inpFin.value = hoyIso;
      }

      selMot.selectedIndex = 0;
      inpMotOtro.style.display = "none";
      inpMotOtro.value = "";
      selTipo.value = "licencia";
      inpColor.value = "#ffff00";
      prevColor.textContent = "#FFFF00";
      selLegReemp.value = "";
      txtObs.value = "";
    }

    modal.classList.add("active");
  }

  async guardarNovedad() {
    const selLeg = this.container.querySelector("#nov-form-legajo");
    const inpIni = this.container.querySelector("#nov-form-inicio");
    const inpFin = this.container.querySelector("#nov-form-fin");
    const selMot = this.container.querySelector("#nov-form-motivo");
    const inpMotOtro = this.container.querySelector("#nov-form-motivo-otro");
    const selTipo = this.container.querySelector("#nov-form-tipo-color");
    const inpColor = this.container.querySelector("#nov-form-color-hex");
    const selLegReemp = this.container.querySelector("#nov-form-legajo-reemplazado");
    const txtObs = this.container.querySelector("#nov-form-obs");

    const legajo = selLeg.value.trim();
    const fIni = inpIni.value;
    const fFin = inpFin.value;

    if (!legajo) {
      alert("Por favor seleccioná un agente.");
      return;
    }
    if (!fIni || !fFin) {
      alert("Por favor completá ambas fechas (Inicio y Fin).");
      return;
    }
    if (fIni > fFin) {
      alert("La fecha de inicio no puede ser posterior a la fecha de fin.");
      return;
    }

    let motivo = selMot.value;
    let codigoSapTemporal = null;

    if (motivo === "OTRO") {
      motivo = inpMotOtro.value.trim();
      if (!motivo) {
        alert("Por favor especificá el motivo personalizado.");
        return;
      }
    } else {
      const optSel = selMot.selectedOptions && selMot.selectedOptions[0];
      if (optSel) {
        const codSap = optSel.getAttribute("data-sap");
        if (codSap) {
          codigoSapTemporal = codSap;
        }
      }
    }

    // Si aún no se detectó por atributo pero coincide con un turno de store.turnos
    if (!codigoSapTemporal) {
      const sUp = motivo.trim().toUpperCase();
      for (const [cod] of this.store.turnos.entries()) {
        const codUp = cod.toUpperCase();
        if (sUp === codUp || sUp.startsWith(`${codUp} -`) || sUp.startsWith(`${codUp} –`)) {
          codigoSapTemporal = cod;
          break;
        }
      }
    }

    // BLOQUEO ESTRICTO DE LICENCIA ANUAL EN NOVEDADES
    if (motivo.toLowerCase() === "licencia anual") {
      alert("La creación de Licencia Anual está restringida en esta vista para no alterar los saldos sin control FIFO.\n\nUtilizá la pestaña '🏖️ Licencias Anuales'.");
      return;
    }

    const client = getSupabaseClient();
    const ahoraIso = new Date().toISOString();

    const payload = {
      legajo: legajo,
      fecha_inicio: fIni,
      fecha_fin: fFin,
      motivo: motivo,
      tipo_color: selTipo.value || 'licencia',
      color_hex: inpColor.value || '#ffff00',
      codigo_sap_temporal: codigoSapTemporal || null,
      legajo_reemplazado: selLegReemp.value ? selLegReemp.value.trim() : null,
      observaciones: txtObs.value.trim() || null,
      activo: true,
      sync_status: 'synced',
      updated_at: ahoraIso
    };

    try {
      if (this.novedadEnEdicion && this.novedadEnEdicion.id) {
        // UPDATE
        const { data, error } = await client
          .from('novedades')
          .update(payload)
          .eq('id', this.novedadEnEdicion.id)
          .select();

        if (error) throw error;
        if (data && data.length > 0) {
          const idx = this.store.novedades.findIndex(x => x.id === this.novedadEnEdicion.id);
          if (idx !== -1) this.store.novedades[idx] = data[0];
          await this.store.auditar('novedades', 'EDICIÓN', this.novedadEnEdicion.id, this.novedadEnEdicion, data[0]);
        }
      } else {
        // INSERT
        const { data, error } = await client
          .from('novedades')
          .insert(payload)
          .select();

        if (error) throw error;
        if (data && data.length > 0) {
          this.store.novedades.unshift(data[0]);
          await this.store.auditar('novedades', 'CREACIÓN', data[0].id, null, data[0]);
        }
      }

      this.store.guardarCacheLocal();
      this.container.querySelector("#modal-crud-novedad").classList.remove("active");
      this.renderTablaOCards();
      alert("Novedad guardada correctamente.");
    } catch (err) {
      alert(`Error al guardar la novedad: ${err.message}`);
    }
  }

  async eliminarNovedad(id) {
    if (!this.store.tienePermiso('novedades', 'eliminar')) {
      alert("No tenés permisos para eliminar novedades.");
      return;
    }

    const nov = this.store.novedades.find(n => n.id === id);
    if (!nov) return;

    let mensaje = `¿Estás seguro de anular la novedad #${id} (${nov.motivo} - ${nov.legajo})?`;
    let restituir = false;

    if (nov.motivo === "Licencia Anual") {
      restituir = confirm(`${mensaje}\n\nDetectamos que es una Licencia Anual. ¿Deseás restituir automáticamente los ${nov.cantidad_dias || 0} días al saldo de licencias?`);
    } else {
      if (!confirm(mensaje)) return;
    }

    const client = getSupabaseClient();
    const ahoraIso = new Date().toISOString();

    try {
      // Baja lógica
      const { data, error } = await client
        .from('novedades')
        .update({ activo: false, sync_status: 'synced', updated_at: ahoraIso })
        .eq('id', id)
        .select();

      if (error) throw error;

      // Restituir saldo si fue confirmado
      if (restituir && nov.cantidad_dias) {
        const saldoKey = `${nov.legajo}_${nov.periodo_imputado || ''}`;
        const saldo = this.store.saldos.get(saldoKey);
        if (saldo) {
          const nuevoDisp = saldo.dias_disponibles + nov.cantidad_dias;
          await client.from('saldos_licencias')
            .update({ dias_disponibles: nuevoDisp, updated_at: ahoraIso })
            .eq('legajo', nov.legajo)
            .eq('periodo', saldo.periodo);
          saldo.dias_disponibles = nuevoDisp;
        }
      }

      const idx = this.store.novedades.findIndex(n => n.id === id);
      if (idx !== -1) {
        this.store.novedades[idx].activo = false;
        this.store.novedades[idx].updated_at = ahoraIso;
      }

      await this.store.auditar('novedades', 'ELIMINACIÓN / BAJA', id, nov, null);
      this.store.guardarCacheLocal();
      this.renderTablaOCards();
      alert("Novedad dada de baja con éxito.");
    } catch (err) {
      alert(`Error al eliminar la novedad: ${err.message}`);
    }
  }

  async reactivarNovedad(id) {
    if (!this.store.tienePermiso('novedades', 'editar')) {
      alert("No tenés permisos para reactivar novedades.");
      return;
    }

    const nov = this.store.novedades.find(n => n.id === id);
    if (!nov) return;

    if (!confirm(`¿Estás seguro de reactivar la novedad #${id} (${nov.motivo} - ${nov.legajo})?`)) {
      return;
    }

    const client = getSupabaseClient();
    const ahoraIso = new Date().toISOString();

    try {
      const { data, error } = await client
        .from('novedades')
        .update({ activo: true, sync_status: 'synced', updated_at: ahoraIso })
        .eq('id', id)
        .select();

      if (error) throw error;

      nov.activo = true;
      nov.updated_at = ahoraIso;

      await this.store.auditar('novedades', 'REACTIVACIÓN', id, { activo: false }, { activo: true });
      this.store.guardarCacheLocal();
      this.renderTablaOCards();
      alert("Novedad reactivada con éxito.");
    } catch (err) {
      alert(`Error al reactivar la novedad: ${err.message}`);
    }
  }

  refrescar() {
    this.renderTablaOCards();
  }
}
