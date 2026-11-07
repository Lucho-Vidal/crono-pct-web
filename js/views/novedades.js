// views/novedades.js - Explorador CRUD de Novedades con Color y Cobertura SAP
import { parseFechaISO, asignacionEn } from '../engine_turnos.js';
import { getSupabaseClient } from '../supabase.js';
import { ComboboxSelect } from '../combobox.js';

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
            <button class="btn btn-secondary" id="btn-nov-cambio-turno">🔄 Cambio de Turno</button>
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
              <select id="nov-form-motivo">
                <option value="">-- Seleccionar Motivo / Turno SAP --</option>
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

      <!-- Modal Cambio de Turno SAP -->
      <div class="modal-overlay" id="modal-cambio-turno">
        <div class="modal-content" style="max-width: 580px;">
          <div class="modal-header">
            <h3>🔄 Registrar Cambio de Turno SAP</h3>
            <button class="btn-icon" id="btn-cerrar-modal-cambio">✖</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Personal 1 *:</label>
              <select id="cambio-form-legajo1" required>
                <option value="">-- Seleccionar Personal 1 --</option>
              </select>
              <div id="cambio-turno-badge1" style="font-size: 12px; color: #1e3a8a; font-weight: 600; margin-top: 4px;">Turno SAP actual: —</div>
            </div>

            <div class="form-group">
              <label>Personal 2 *:</label>
              <select id="cambio-form-legajo2" required>
                <option value="">-- Seleccionar Personal 2 --</option>
              </select>
              <div id="cambio-turno-badge2" style="font-size: 12px; color: #1e3a8a; font-weight: 600; margin-top: 4px;">Turno SAP actual: —</div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Fecha Desde *:</label>
                <input type="date" id="cambio-form-inicio" required>
              </div>
              <div class="form-group">
                <label>Fecha Hasta *:</label>
                <input type="date" id="cambio-form-fin" required>
              </div>
            </div>

            <div class="form-group">
              <label>Observaciones (opcional):</label>
              <input type="text" id="cambio-form-obs" placeholder="Motivo o acuerdo del cambio...">
            </div>

            <div id="cambio-resumen-box" style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; font-size: 13px; line-height: 1.5;">
              <div style="font-weight: 700; margin-bottom: 6px; color: #0f172a;">Resumen del Intercambio:</div>
              <div id="cambio-resumen-linea1">Personal 1 ➡️ —</div>
              <div id="cambio-resumen-linea2">Personal 2 ➡️ —</div>
              <div id="cambio-resumen-aviso" style="margin-top: 6px; font-weight: 600;"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btn-cancelar-modal-cambio">Cancelar</button>
            <button class="btn btn-primary" id="btn-guardar-modal-cambio">Guardar Cambio de Turno</button>
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
          if (!val) {
            selFormTipo.value = "licencia";
            inpFormColor.value = "#ffff00";
            prevColor.textContent = "#FFFF00";
            return;
          }
          const opt = selFormMot.selectedOptions && selFormMot.selectedOptions[0];
          if (opt) {
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
        }
      });
    }

    if (inpFormColor) {
      inpFormColor.addEventListener("input", (e) => {
        prevColor.textContent = e.target.value.toUpperCase();
      });
    }

    // Selectores con Búsqueda Integrada (Combobox)
    const selFormLeg = this.container.querySelector("#nov-form-legajo");
    if (selFormLeg) {
      this.comboboxLegajo = new ComboboxSelect(selFormLeg, {
        placeholder: "🔍 Buscar por legajo o apellido..."
      });
    }

    if (selFormMot) {
      this.comboboxMotivo = new ComboboxSelect(selFormMot, {
        placeholder: "🔍 Buscar motivo o código SAP..."
      });
    }

    const selFormLegReemp = this.container.querySelector("#nov-form-legajo-reemplazado");
    if (selFormLegReemp) {
      this.comboboxLegajoReemplazado = new ComboboxSelect(selFormLegReemp, {
        placeholder: "🔍 Buscar personal reemplazado..."
      });
    }

    // Modal Cambio de Turno eventos
    const btnCambioTurno = this.container.querySelector("#btn-nov-cambio-turno");
    if (btnCambioTurno) {
      btnCambioTurno.addEventListener("click", () => {
        this.abrirModalCambioTurno(null);
      });
    }

    const modalCambio = this.container.querySelector("#modal-cambio-turno");
    const btnCerrarCambio = this.container.querySelector("#btn-cerrar-modal-cambio");
    const btnCancelarCambio = this.container.querySelector("#btn-cancelar-modal-cambio");
    const btnGuardarCambio = this.container.querySelector("#btn-guardar-modal-cambio");

    const cerrarCambio = () => modalCambio && modalCambio.classList.remove("active");
    if (btnCerrarCambio) btnCerrarCambio.addEventListener("click", cerrarCambio);
    if (btnCancelarCambio) btnCancelarCambio.addEventListener("click", cerrarCambio);

    if (btnGuardarCambio) {
      btnGuardarCambio.addEventListener("click", () => this.guardarCambioTurno());
    }

    const inpCambioIni = this.container.querySelector("#cambio-form-inicio");
    const inpCambioFin = this.container.querySelector("#cambio-form-fin");
    const selCambioLeg1 = this.container.querySelector("#cambio-form-legajo1");
    const selCambioLeg2 = this.container.querySelector("#cambio-form-legajo2");

    if (inpCambioIni && inpCambioFin) {
      inpCambioIni.addEventListener("change", () => {
        const nuevaIni = inpCambioIni.value;
        const finActual = inpCambioFin.value;
        if (!finActual || finActual === this._cambioFechaAnteriorInicio || finActual < nuevaIni) {
          inpCambioFin.value = nuevaIni;
        }
        this._cambioFechaAnteriorInicio = nuevaIni;
        this.actualizarResumenCambioTurno();
      });
      inpCambioFin.addEventListener("change", () => this.actualizarResumenCambioTurno());
    }

    if (selCambioLeg1) {
      selCambioLeg1.addEventListener("change", () => this.actualizarResumenCambioTurno());
      this.comboboxCambioLeg1 = new ComboboxSelect(selCambioLeg1, {
        placeholder: "🔍 Buscar Personal 1..."
      });
    }
    if (selCambioLeg2) {
      selCambioLeg2.addEventListener("change", () => this.actualizarResumenCambioTurno());
      this.comboboxCambioLeg2 = new ComboboxSelect(selCambioLeg2, {
        placeholder: "🔍 Buscar Personal 2..."
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

    // Repoblar agentes, motivos de catálogo y turnos SAP
    const agentesActivos = this.store.personal.filter(p => p.activo !== false);
    selLeg.innerHTML = '<option value="">-- Seleccionar Agente --</option>' + agentesActivos.map(p => `
      <option value="${p.legajo}">[${p.legajo}] ${p.apellido}, ${p.nombre} (${p.sector_actual || ''})</option>
    `).join('');

    // Motivos combinados: primero motivos regulares de catálogo, luego Turnos SAP activos
    const opcionesMotivos = [];
    opcionesMotivos.push('<option value="">-- Seleccionar Motivo / Turno SAP --</option>');
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

      selMot.value = "";
      inpMotOtro.style.display = "none";
      inpMotOtro.value = "";
      selTipo.value = "licencia";
      inpColor.value = "#ffff00";
      prevColor.textContent = "#FFFF00";
      selLegReemp.value = "";
      txtObs.value = "";
    }

    if (this.comboboxLegajo) {
      this.comboboxLegajo.actualizar();
      if (this.comboboxLegajo.inputEl) {
        this.comboboxLegajo.inputEl.disabled = Boolean(esEdicion);
      }
    }
    if (this.comboboxMotivo) {
      this.comboboxMotivo.actualizar();
    }
    if (this.comboboxLegajoReemplazado) {
      this.comboboxLegajoReemplazado.actualizar();
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

    if (!motivo) {
      alert("Por favor seleccioná un motivo.");
      return;
    }

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
        let nextId = await this.store.obtenerSiguienteIdNovedades(1);
        payload.id = nextId;

        let insertData = null;
        let insertErr = null;
        for (let intento = 0; intento < 3; intento++) {
          const res = await client
            .from('novedades')
            .insert(payload)
            .select();
          insertData = res.data;
          insertErr = res.error;
          if (!insertErr) break;
          if (insertErr.message && insertErr.message.includes('duplicate key') && insertErr.message.includes('novedades_pkey')) {
            nextId = await this.store.obtenerSiguienteIdNovedades(1);
            payload.id = nextId + intento + 1;
          } else {
            throw insertErr;
          }
        }
        if (insertErr) throw insertErr;

        if (insertData && insertData.length > 0) {
          this.store.novedades.unshift(insertData[0]);
          await this.store.auditar('novedades', 'CREACIÓN', insertData[0].id, null, insertData[0]);
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

  abrirModalCambioTurno(prefill = null) {
    if (!this.store.tienePermiso('cambio_turno', 'crear')) {
      alert("No tenés permisos para registrar cambios de turno.");
      return;
    }

    const modal = this.container.querySelector("#modal-cambio-turno");
    const selLeg1 = this.container.querySelector("#cambio-form-legajo1");
    const selLeg2 = this.container.querySelector("#cambio-form-legajo2");
    const inpIni = this.container.querySelector("#cambio-form-inicio");
    const inpFin = this.container.querySelector("#cambio-form-fin");
    const txtObs = this.container.querySelector("#cambio-form-obs");

    const agentesActivos = this.store.personal.filter(p => p.activo !== false);
    if (agentesActivos.length < 2) {
      alert("Se requieren al menos 2 agentes activos para registrar un cambio de turno.");
      return;
    }

    const optionsHtml = '<option value="">-- Seleccionar Personal --</option>' + agentesActivos.map(p => `
      <option value="${p.legajo}">[${p.legajo}] ${p.apellido}, ${p.nombre} (${p.sector_actual || ''})</option>
    `).join('');

    selLeg1.innerHTML = optionsHtml;
    selLeg2.innerHTML = optionsHtml;

    const hoyIso = new Date().toISOString().split('T')[0];
    const iniVal = prefill && prefill.fecha_inicio ? parseFechaISO(prefill.fecha_inicio) : hoyIso;
    const finVal = prefill && prefill.fecha_fin ? parseFechaISO(prefill.fecha_fin) : iniVal;

    inpIni.value = iniVal;
    inpFin.value = finVal;
    this._cambioFechaAnteriorInicio = iniVal;
    txtObs.value = prefill && prefill.observaciones ? prefill.observaciones : "";

    if (prefill && prefill.legajo) {
      selLeg1.value = String(prefill.legajo).trim();
      const otro = agentesActivos.find(a => String(a.legajo).trim() !== String(prefill.legajo).trim());
      selLeg2.value = otro ? String(otro.legajo).trim() : "";
    } else {
      selLeg1.value = String(agentesActivos[0].legajo).trim();
      selLeg2.value = String(agentesActivos[1].legajo).trim();
    }

    if (this.comboboxCambioLeg1) this.comboboxCambioLeg1.actualizar();
    if (this.comboboxCambioLeg2) this.comboboxCambioLeg2.actualizar();

    this.actualizarResumenCambioTurno();
    modal.classList.add("active");
  }

  actualizarResumenCambioTurno() {
    const selLeg1 = this.container.querySelector("#cambio-form-legajo1");
    const selLeg2 = this.container.querySelector("#cambio-form-legajo2");
    const inpIni = this.container.querySelector("#cambio-form-inicio");
    const badge1 = this.container.querySelector("#cambio-turno-badge1");
    const badge2 = this.container.querySelector("#cambio-turno-badge2");
    const linea1 = this.container.querySelector("#cambio-resumen-linea1");
    const linea2 = this.container.querySelector("#cambio-resumen-linea2");
    const aviso = this.container.querySelector("#cambio-resumen-aviso");

    const leg1 = selLeg1 ? selLeg1.value.trim() : "";
    const leg2 = selLeg2 ? selLeg2.value.trim() : "";
    const fecha = inpIni && inpIni.value ? inpIni.value : new Date().toISOString().split('T')[0];

    const asig1 = leg1 ? asignacionEn(leg1, fecha, this.store) : { codigo_sap: "" };
    const asig2 = leg2 ? asignacionEn(leg2, fecha, this.store) : { codigo_sap: "" };

    const t1 = asig1.codigo_sap ? this.store.turnos.get(asig1.codigo_sap) : null;
    const t2 = asig2.codigo_sap ? this.store.turnos.get(asig2.codigo_sap) : null;

    const desc1 = t1 ? (t1.descripcion || t1.etiqueta_corta || t1.codigo_sap) : (asig1.codigo_sap || "Sin Turno SAP");
    const desc2 = t2 ? (t2.descripcion || t2.etiqueta_corta || t2.codigo_sap) : (asig2.codigo_sap || "Sin Turno SAP");

    const lbl1 = asig1.codigo_sap && desc1 !== asig1.codigo_sap ? `${asig1.codigo_sap} - ${desc1}` : (desc1 || "—");
    const lbl2 = asig2.codigo_sap && desc2 !== asig2.codigo_sap ? `${asig2.codigo_sap} - ${desc2}` : (desc2 || "—");

    if (badge1) badge1.textContent = `Turno SAP actual: ${lbl1}`;
    if (badge2) badge2.textContent = `Turno SAP actual: ${lbl2}`;

    const ag1 = this.store.personal.find(p => String(p.legajo).trim() === leg1);
    const ag2 = this.store.personal.find(p => String(p.legajo).trim() === leg2);
    const nom1 = ag1 ? `[${ag1.legajo}] ${ag1.apellido}, ${ag1.nombre}` : (leg1 || "Personal 1");
    const nom2 = ag2 ? `[${ag2.legajo}] ${ag2.apellido}, ${ag2.nombre}` : (leg2 || "Personal 2");

    if (linea1) linea1.innerHTML = `<b>${nom1}</b> ➡️ Pasará al turno <b>${lbl2}</b> (Reemplaza a ${nom2})`;
    if (linea2) linea2.innerHTML = `<b>${nom2}</b> ➡️ Pasará al turno <b>${lbl1}</b> (Reemplaza a ${nom1})`;

    if (aviso) {
      if (leg1 && leg2 && leg1 === leg2) {
        aviso.innerHTML = "<span style='color: #dc2626;'>⚠️ Debe seleccionar dos agentes distintos.</span>";
      } else if (leg1 && !asig1.codigo_sap) {
        aviso.innerHTML = `<span style='color: #dc2626;'>⚠️ Personal 1 [${leg1}] no tiene turno SAP asignado.</span>`;
      } else if (leg2 && !asig2.codigo_sap) {
        aviso.innerHTML = `<span style='color: #dc2626;'>⚠️ Personal 2 [${leg2}] no tiene turno SAP asignado.</span>`;
      } else if (asig1.codigo_sap && asig2.codigo_sap && asig1.codigo_sap === asig2.codigo_sap) {
        aviso.innerHTML = "<span style='color: #d97706;'>ℹ️ Ambos agentes tienen el mismo Turno SAP asignado.</span>";
      } else {
        aviso.innerHTML = "<span style='color: #16a34a;'>✓ Intercambio listo para registrarse.</span>";
      }
    }
  }

  async guardarCambioTurno() {
    if (!this.store.tienePermiso('cambio_turno', 'crear')) {
      alert("No tenés permisos para registrar cambios de turno.");
      return;
    }

    const selLeg1 = this.container.querySelector("#cambio-form-legajo1");
    const selLeg2 = this.container.querySelector("#cambio-form-legajo2");
    const inpIni = this.container.querySelector("#cambio-form-inicio");
    const inpFin = this.container.querySelector("#cambio-form-fin");
    const txtObs = this.container.querySelector("#cambio-form-obs");

    const leg1 = selLeg1.value.trim();
    const leg2 = selLeg2.value.trim();
    const fIni = inpIni.value;
    const fFin = inpFin.value;
    const obsUser = txtObs.value.trim();

    if (!leg1 || !leg2) {
      alert("Debés seleccionar a ambos personales.");
      return;
    }
    if (leg1 === leg2) {
      alert("No podés seleccionar al mismo personal en ambos campos.");
      return;
    }
    if (!fIni || !fFin) {
      alert("Las fechas de inicio y fin son obligatorias.");
      return;
    }
    if (fFin < fIni) {
      alert("La fecha 'Hasta' no puede ser anterior a 'Desde'.");
      return;
    }

    const asig1 = asignacionEn(leg1, fIni, this.store);
    const asig2 = asignacionEn(leg2, fIni, this.store);

    if (!asig1.codigo_sap) {
      alert(`El Personal 1 [${leg1}] no tiene un Turno SAP asignado.`);
      return;
    }
    if (!asig2.codigo_sap) {
      alert(`El Personal 2 [${leg2}] no tiene un Turno SAP asignado.`);
      return;
    }

    if (asig1.codigo_sap === asig2.codigo_sap) {
      const continuar = confirm(
        `Ambos agentes tienen asignado el mismo Turno SAP base (${asig1.codigo_sap}).\n\n¿Deseás registrar el cambio de turno de todos modos?`
      );
      if (!continuar) return;
    }

    const t1 = this.store.turnos.get(asig1.codigo_sap);
    const t2 = this.store.turnos.get(asig2.codigo_sap);
    const desc1 = t1 ? (t1.descripcion || t1.etiqueta_corta || t1.codigo_sap) : asig1.codigo_sap;
    const desc2 = t2 ? (t2.descripcion || t2.etiqueta_corta || t2.codigo_sap) : asig2.codigo_sap;
    const lbl1 = desc1 && desc1 !== asig1.codigo_sap ? `${asig1.codigo_sap} - ${desc1}` : asig1.codigo_sap;
    const lbl2 = desc2 && desc2 !== asig2.codigo_sap ? `${asig2.codigo_sap} - ${desc2}` : asig2.codigo_sap;

    const ag1 = this.store.personal.find(p => String(p.legajo).trim() === leg1);
    const ag2 = this.store.personal.find(p => String(p.legajo).trim() === leg2);
    const nom1 = ag1 ? `${ag1.apellido} ${ag1.nombre}`.trim() : leg1;
    const nom2 = ag2 ? `${ag2.apellido} ${ag2.nombre}`.trim() : leg2;

    const obsExtra = obsUser ? ` - ${obsUser}` : "";
    const obs1 = `Cambio de turno con [${leg2}] ${nom2}${obsExtra}`;
    const obs2 = `Cambio de turno con [${leg1}] ${nom1}${obsExtra}`;

    const client = getSupabaseClient();
    const ahoraIso = new Date().toISOString();

    const payload1 = {
      legajo: leg1,
      fecha_inicio: fIni,
      fecha_fin: fFin,
      motivo: lbl2,
      tipo_color: "cambio",
      color_hex: "#daeef3",
      codigo_sap_temporal: asig2.codigo_sap,
      legajo_reemplazado: leg2,
      observaciones: obs1,
      activo: true,
      sync_status: "synced",
      updated_at: ahoraIso
    };

    const payload2 = {
      legajo: leg2,
      fecha_inicio: fIni,
      fecha_fin: fFin,
      motivo: lbl1,
      tipo_color: "cambio",
      color_hex: "#daeef3",
      codigo_sap_temporal: asig1.codigo_sap,
      legajo_reemplazado: leg1,
      observaciones: obs2,
      activo: true,
      sync_status: "synced",
      updated_at: ahoraIso
    };

    try {
      // Asignar IDs calculados de forma segura para evitar colisión de secuencia en Supabase
      let nextId = await this.store.obtenerSiguienteIdNovedades(2);
      payload1.id = nextId;
      payload2.id = nextId + 1;

      let insertData = null;
      let insertErr = null;

      for (let intento = 0; intento < 3; intento++) {
        const res = await client
          .from('novedades')
          .insert([payload1, payload2])
          .select();
        insertData = res.data;
        insertErr = res.error;
        if (!insertErr) break;
        if (insertErr.message && insertErr.message.includes('duplicate key') && insertErr.message.includes('novedades_pkey')) {
          nextId = await this.store.obtenerSiguienteIdNovedades(2);
          payload1.id = nextId + intento + 2;
          payload2.id = nextId + intento + 3;
        } else {
          throw insertErr;
        }
      }
      if (insertErr) throw insertErr;

      if (insertData && insertData.length > 0) {
        for (const novCreada of insertData) {
          this.store.novedades.unshift(novCreada);
          await this.store.auditar('novedades', 'CREACIÓN', novCreada.id, null, novCreada);
        }
      }

      this.store.guardarCacheLocal();
      const modal = this.container.querySelector("#modal-cambio-turno");
      if (modal) modal.classList.remove("active");
      this.renderTablaOCards();
      alert("Cambio de turno registrado correctamente.");
    } catch (err) {
      alert(`Error al registrar el cambio de turno: ${err.message}`);
    }
  }

  refrescar() {
    this.renderTablaOCards();
  }
}
