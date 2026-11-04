// views/licencias.js - Gestión de Saldos, Diagramador de Vacaciones y Control RRHH
import { calcularCeldaDiagramador, parseFechaISO } from '../engine_turnos.js';
import { getSupabaseClient } from '../supabase.js';
import { habilitarOcultarLegajoEnScroll, ComboboxSelect } from '../combobox.js';

export class LicenciasView {
  constructor(container, store) {
    this.container = container;
    this.store = store;

    this.subVistaActiva = "saldos"; // "saldos" | "diagramador" | "rrhh"

    const hoy = new Date();
    this.mesDiagramador = hoy.getMonth() + 1;
    this.anioDiagramador = hoy.getFullYear();

    this.filtroTexto = "";
    this.filtroEstadoRRHH = "TODOS"; // "TODOS" | "PENDIENTE" | "ENVIADO"

    this.celdasDiagSeleccionadas = new Set();

    this.init();
  }

  init() {
    this.renderLayout();
    this.renderSubVista();
    this.attachEvents();
  }

  renderLayout() {
    this.container.innerHTML = `
      <div class="toolbar-card">
        <div class="toolbar-row" style="justify-content: space-between;">
          <!-- Sub-pestañas -->
          <div class="toolbar-group">
            <button class="btn ${this.subVistaActiva === 'saldos' ? 'btn-primary' : 'btn-secondary'} btn-pill" id="btn-sub-saldos">
              📊 Saldos y Solicitud
            </button>
            <button class="btn ${this.subVistaActiva === 'diagramador' ? 'btn-primary' : 'btn-secondary'} btn-pill" id="btn-sub-diagramador">
              🗓️ Diagramador de Vacaciones
            </button>
            <button class="btn ${this.subVistaActiva === 'rrhh' ? 'btn-primary' : 'btn-secondary'} btn-pill" id="btn-sub-rrhh">
              ✅ Control RRHH
            </button>
          </div>

          <div class="toolbar-group" id="lic-extra-actions">
            <!-- Botones dinámicos según sub-vista -->
          </div>
        </div>
      </div>

      <div id="lic-contenido-subvista">
        <!-- Contenido dinámico -->
      </div>

      <!-- Modal Carga de Licencia Anual FIFO -->
      <div class="modal-overlay" id="modal-solicitud-la">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Solicitud de Licencia Anual (Descuento FIFO)</h3>
            <button class="btn-icon" id="btn-cerrar-modal-la">✖</button>
          </div>
          <div class="modal-body">
            <!-- Selector de Agente con Buscador Integrado -->
            <div class="form-group">
              <label>Agente / Personal:</label>
              <select id="la-form-legajo" required>
                <option value="">-- Seleccionar Agente --</option>
                ${this.store.personal.filter(p => p.activo !== false).map(p => `
                  <option value="${p.legajo}">[${p.legajo}] ${p.apellido}, ${p.nombre}</option>
                `).join('')}
              </select>
            </div>

            <!-- Resumen de saldos del agente -->
            <div id="la-resumen-saldos-agente" style="background-color: #f1f5f9; padding: 10px; border-radius: 6px; border: 1px solid var(--border-light); font-size: 12px; margin-bottom: 12px;">
              Seleccioná un agente para ver sus períodos y días disponibles.
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Fecha Inicio:</label>
                <input type="date" id="la-form-inicio" required>
              </div>
              <div class="form-group">
                <label>Cantidad de Días (Semanas completas):</label>
                <input type="number" id="la-form-dias" min="7" step="7" value="14" required>
                <small id="la-error-dias" style="color: #dc2626; font-size: 11px; font-weight: 600; display: none; margin-top: 4px;">
                  ⚠️ La cantidad de días debe ser múltiplo de 7 (ej: 7, 14, 21, 28, etc.).
                </small>
              </div>
            </div>

            <!-- Fechas Calculadas Automáticamente (No Editables) -->
            <div class="form-row" style="background-color: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid var(--border-light); margin-bottom: 12px;">
              <div class="form-group">
                <label style="font-size: 11px; color: #64748b; font-weight: 700;">📅 Fecha Fin (Automática: Inicio + Días - 1):</label>
                <input type="date" id="la-form-fin" readonly style="background-color: #f1f5f9; cursor: not-allowed; font-weight: 700; color: #1e293b;">
              </div>
              <div class="form-group">
                <label style="font-size: 11px; color: #64748b; font-weight: 700;">🔄 Fecha Reincorporación (Fin + 1 día):</label>
                <input type="date" id="la-form-vuelve" readonly style="background-color: #f1f5f9; cursor: not-allowed; font-weight: 700; color: #1e293b;">
              </div>
            </div>

            <div class="form-group">
              <label>Observaciones:</label>
              <input type="text" id="la-form-obs" placeholder="Ej: LAO 2025/2026 1ra fracción...">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btn-cancelar-modal-la">Cancelar</button>
            <button class="btn btn-primary" id="btn-guardar-modal-la">Aprobar y Descontar FIFO</button>
          </div>
        </div>
      </div>
    `;
  }

  attachEvents() {
    const btnSaldos = this.container.querySelector("#btn-sub-saldos");
    const btnDiag = this.container.querySelector("#btn-sub-diagramador");
    const btnRrhh = this.container.querySelector("#btn-sub-rrhh");

    btnSaldos.addEventListener("click", () => {
      this.subVistaActiva = "saldos";
      this.actualizarBotonesPestanas();
      this.renderSubVista();
    });

    btnDiag.addEventListener("click", () => {
      this.subVistaActiva = "diagramador";
      this.actualizarBotonesPestanas();
      this.renderSubVista();
    });

    btnRrhh.addEventListener("click", () => {
      this.subVistaActiva = "rrhh";
      this.actualizarBotonesPestanas();
      this.renderSubVista();
    });

    // Modal Solicitud LA
    const modalLA = this.container.querySelector("#modal-solicitud-la");
    const btnCerrar = this.container.querySelector("#btn-cerrar-modal-la");
    const btnCancelar = this.container.querySelector("#btn-cancelar-modal-la");
    const btnGuardar = this.container.querySelector("#btn-guardar-modal-la");
    const selAgente = this.container.querySelector("#la-form-legajo");
    const inpIni = this.container.querySelector("#la-form-inicio");
    const inpFin = this.container.querySelector("#la-form-fin");
    const inpDias = this.container.querySelector("#la-form-dias");
    const inpVuelve = this.container.querySelector("#la-form-vuelve");

    const cerrar = () => modalLA.classList.remove("active");
    if (btnCerrar) btnCerrar.addEventListener("click", cerrar);
    if (btnCancelar) btnCancelar.addEventListener("click", cerrar);
    if (btnGuardar) btnGuardar.addEventListener("click", () => this.guardarSolicitudLA());

    if (selAgente) {
      this.comboboxAgenteLA = new ComboboxSelect(selAgente, {
        placeholder: "🔍 Buscar por legajo o apellido..."
      });
      selAgente.addEventListener("change", () => this.actualizarResumenSaldosAgente());
    }

    // Auto-cálculo y validación estricta de días múltiplo de 7
    this.recalcularFechasLA = () => {
      const f1 = inpIni.value;
      const dias = parseInt(inpDias.value, 10) || 0;
      const errDias = this.container.querySelector("#la-error-dias");

      if (dias <= 0 || dias % 7 !== 0) {
        if (errDias) errDias.style.display = "block";
        inpDias.style.borderColor = "#dc2626";
        inpFin.value = "";
        inpVuelve.value = "";
        if (btnGuardar) btnGuardar.disabled = true;
        return false;
      }

      if (errDias) errDias.style.display = "none";
      inpDias.style.borderColor = "";
      if (btnGuardar) btnGuardar.disabled = false;

      if (f1 && dias > 0) {
        const [y, m, d] = f1.split('-').map(Number);
        const dtIni = new Date(y, m - 1, d);
        const dtFin = new Date(dtIni);
        dtFin.setDate(dtFin.getDate() + (dias - 1));
        const dtVuelve = new Date(dtFin);
        dtVuelve.setDate(dtVuelve.getDate() + 1);

        const pad = (n) => String(n).padStart(2, '0');
        inpFin.value = `${dtFin.getFullYear()}-${pad(dtFin.getMonth() + 1)}-${pad(dtFin.getDate())}`;
        inpVuelve.value = `${dtVuelve.getFullYear()}-${pad(dtVuelve.getMonth() + 1)}-${pad(dtVuelve.getDate())}`;
      }
      return true;
    };

    if (inpIni) {
      inpIni.addEventListener("change", () => this.recalcularFechasLA());
      inpIni.addEventListener("input", () => this.recalcularFechasLA());
    }
    if (inpDias) {
      inpDias.addEventListener("input", () => this.recalcularFechasLA());
      inpDias.addEventListener("change", () => this.recalcularFechasLA());
    }
  }

  actualizarBotonesPestanas() {
    const btnS = this.container.querySelector("#btn-sub-saldos");
    const btnD = this.container.querySelector("#btn-sub-diagramador");
    const btnR = this.container.querySelector("#btn-sub-rrhh");

    btnS.className = `btn ${this.subVistaActiva === 'saldos' ? 'btn-primary' : 'btn-secondary'} btn-pill`;
    btnD.className = `btn ${this.subVistaActiva === 'diagramador' ? 'btn-primary' : 'btn-secondary'} btn-pill`;
    btnR.className = `btn ${this.subVistaActiva === 'rrhh' ? 'btn-primary' : 'btn-secondary'} btn-pill`;
  }

  renderSubVista() {
    const cont = this.container.querySelector("#lic-contenido-subvista");
    const actionsCont = this.container.querySelector("#lic-extra-actions");
    if (!cont || !actionsCont) return;

    if (this.subVistaActiva === "saldos") {
      actionsCont.innerHTML = `
        <button class="btn btn-primary" id="btn-nueva-solicitud-la">➕ Cargar Licencia Anual</button>
      `;
      const btn = actionsCont.querySelector("#btn-nueva-solicitud-la");
      if (btn) btn.addEventListener("click", () => this.abrirModalSolicitudLA());
      this.renderSubVistaSaldos(cont);

    } else if (this.subVistaActiva === "diagramador") {
      actionsCont.innerHTML = `
        <div class="toolbar-group">
          <button class="btn btn-secondary btn-pill" id="btn-diag-prev">◀</button>
          <select id="sel-diag-mes">
            ${[
              "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
              "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
            ].map((m, idx) => `<option value="${idx + 1}" ${idx + 1 === this.mesDiagramador ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
          <input type="number" id="inp-diag-anio" value="${this.anioDiagramador}" style="width: 75px;">
          <button class="btn btn-secondary btn-pill" id="btn-diag-next">▶</button>
          <div class="badge-contador-seleccion" id="diag-lbl-contador">📌 Selección: 0 días</div>
        </div>
      `;
      this.attachDiagramadorControls(actionsCont);
      this.renderSubVistaDiagramador(cont);

    } else if (this.subVistaActiva === "rrhh") {
      actionsCont.innerHTML = `
        <div class="toolbar-group">
          <select id="sel-rrhh-filtro-estado">
            <option value="TODOS">Todos los Estados</option>
            <option value="PENDIENTE">⏳ Pendientes de Envío</option>
            <option value="ENVIADO">✅ Enviados a RRHH</option>
          </select>
          <input type="text" id="inp-rrhh-buscar" placeholder="🔍 Buscar por legajo o nombre..." style="width: 180px;">
        </div>
      `;
      this.attachRRHHControls(actionsCont);
      this.renderSubVistaRRHH(cont);
    }

    // Habilitar ocultamiento dinámico de legajo en scroll en todas las tablas de licencias
    cont.querySelectorAll(".table-container").forEach(tc => {
      habilitarOcultarLegajoEnScroll(tc);
    });
  }

  // --- SUB-VISTA 1: SALDOS DE LICENCIAS ---
  renderSubVistaSaldos(cont) {
    const periodos = this.store.periodos.length > 0 ? this.store.periodos : [2022, 2023, 2024, 2025, 2026];
    const agentes = this.store.personal.filter(p => p.activo !== false);

    let html = `
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th class="sticky-col-1">Legajo</th>
              <th class="sticky-col-2">Apellido y Nombre</th>
              <th>Sector</th>
              ${periodos.map(p => `<th style="text-align: center;">Período ${p}</th>`).join('')}
              <th style="text-align: center; background-color: #dbeafe;">Total Disp.</th>
              <th style="text-align: center;">Tercio Legal</th>
            </tr>
          </thead>
          <tbody>
    `;

    agentes.forEach(ag => {
      const leg = String(ag.legajo).trim();
      let totalDisp = 0;
      let tercioLegal = 7;

      const celdasPeriodos = periodos.map(p => {
        const saldo = this.store.saldos.get(`${leg}_${p}`);
        const disp = saldo ? saldo.dias_disponibles : 0;
        totalDisp += disp;
        if (saldo && saldo.tercio_legal) tercioLegal = saldo.tercio_legal;
        return `<td style="text-align: center; font-weight: 600; color: ${disp > 0 ? '#1e40af' : '#94a3b8'};">${disp} d</td>`;
      }).join('');

      html += `
        <tr>
          <td class="sticky-col-1" style="font-weight: 700;">${leg}</td>
          <td class="sticky-col-2"><b>${ag.apellido}</b>, ${ag.nombre}</td>
          <td>${ag.sector_actual || '—'}</td>
          ${celdasPeriodos}
          <td style="text-align: center; font-weight: 800; background-color: #eff6ff; color: #1d4ed8; font-size: 14px;">
            ${totalDisp} días
          </td>
          <td style="text-align: center;">${tercioLegal} días</td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    cont.innerHTML = html;
  }

  abrirModalSolicitudLA() {
    if (!this.store.tienePermiso('licencias', 'crear')) {
      alert("No tenés permisos para cargar licencias anuales.");
      return;
    }
    const modal = this.container.querySelector("#modal-solicitud-la");
    const selAgente = this.container.querySelector("#la-form-legajo");
    const inpIni = this.container.querySelector("#la-form-inicio");
    const inpDias = this.container.querySelector("#la-form-dias");
    const inpObs = this.container.querySelector("#la-form-obs");

    selAgente.value = "";
    if (this.comboboxAgenteLA) {
      this.comboboxAgenteLA.actualizar();
    }
    const hoyIso = new Date().toISOString().split('T')[0];
    inpIni.value = hoyIso;
    inpDias.value = "14";
    inpObs.value = "";

    if (typeof this.recalcularFechasLA === 'function') {
      this.recalcularFechasLA();
    }

    this.actualizarResumenSaldosAgente();
    modal.classList.add("active");
  }

  actualizarResumenSaldosAgente() {
    const cont = this.container.querySelector("#la-resumen-saldos-agente");
    const selAgente = this.container.querySelector("#la-form-legajo");
    if (!cont || !selAgente) return;

    const leg = selAgente.value.trim();
    if (!leg) {
      cont.innerHTML = "Seleccioná un agente para ver sus períodos y días disponibles.";
      return;
    }

    const periodos = this.store.periodos.length > 0 ? this.store.periodos : [2022, 2023, 2024, 2025, 2026];
    let totalDisp = 0;
    let items = [];

    periodos.forEach(p => {
      const s = this.store.saldos.get(`${leg}_${p}`);
      const disp = s ? s.dias_disponibles : 0;
      totalDisp += disp;
      if (disp > 0) {
        items.push(`<b>${p}</b>: ${disp} días`);
      }
    });

    cont.innerHTML = `
      <div style="font-weight: 700; color: #1e3a8a; margin-bottom: 4px;">Saldo Total Disponible: ${totalDisp} días</div>
      <div>Períodos con saldo: ${items.length > 0 ? items.join(' | ') : '<span style="color: var(--danger);">Sin saldo disponible</span>'}</div>
    `;
  }

  async guardarSolicitudLA() {
    const selAgente = this.container.querySelector("#la-form-legajo");
    const inpIni = this.container.querySelector("#la-form-inicio");
    const inpFin = this.container.querySelector("#la-form-fin");
    const inpDias = this.container.querySelector("#la-form-dias");
    const inpVuelve = this.container.querySelector("#la-form-vuelve");
    const inpObs = this.container.querySelector("#la-form-obs");

    const leg = selAgente.value.trim();
    const fIni = inpIni.value;
    const fFin = inpFin.value;
    const dias = parseInt(inpDias.value, 10) || 0;

    if (!leg) { alert("Seleccioná un agente."); return; }
    if (!fIni) { alert("Por favor completá la fecha de inicio."); return; }
    if (dias <= 0 || dias % 7 !== 0) {
      alert("La cantidad de días debe ser obligatoriamente un múltiplo de 7 (semanas completas: 7, 14, 21, 28, etc.).");
      inpDias.focus();
      return;
    }
    if (!fFin) {
      alert("Fecha de fin no calculada. Revisá la fecha de inicio.");
      return;
    }

    // 1. Imputación FIFO de saldos
    const periodos = [...(this.store.periodos.length > 0 ? this.store.periodos : [2022, 2023, 2024, 2025, 2026])].sort();
    let restante = dias;
    const cuotas = []; // [{ periodo, cant }]

    for (const p of periodos) {
      if (restante <= 0) break;
      const s = this.store.saldos.get(`${leg}_${p}`);
      if (s && s.dias_disponibles > 0) {
        const tomar = Math.min(restante, s.dias_disponibles);
        cuotas.push({ periodo: p, cant: tomar });
        restante -= tomar;
      }
    }

    if (restante > 0) {
      alert(`El agente no posee suficiente saldo disponible (faltan ${restante} días para cubrir los ${dias} solicitados).`);
      return;
    }

    const perImputado = cuotas.map(c => `${c.periodo} (${c.cant}d)`).join(' / ');
    const client = getSupabaseClient();
    const ahoraIso = new Date().toISOString();

    try {
      // 2. Descontar en saldos_licencias
      for (const c of cuotas) {
        const s = this.store.saldos.get(`${leg}_${c.periodo}`);
        const nuevoDisp = s.dias_disponibles - c.cant;
        const { error } = await client.from('saldos_licencias')
          .update({ dias_disponibles: nuevoDisp, updated_at: ahoraIso })
          .eq('legajo', leg)
          .eq('periodo', c.periodo);
        if (error) throw error;
        s.dias_disponibles = nuevoDisp;
      }

      // 3. Crear novedad oficial
      const payloadNov = {
        legajo: leg,
        fecha_inicio: fIni,
        fecha_fin: fFin,
        motivo: "Licencia Anual",
        tipo_color: "licencia",
        color_hex: "#ffff00",
        periodo_imputado: perImputado,
        cantidad_dias: dias,
        fecha_reincorporacion: inpVuelve.value || null,
        observaciones: inpObs.value.trim() || null,
        enviado_rrhh: false,
        activo: true,
        sync_status: 'synced',
        updated_at: ahoraIso
      };

      const { data: novData, error: novErr } = await client.from('novedades').insert(payloadNov).select();
      if (novErr) throw novErr;

      if (novData && novData.length > 0) {
        this.store.novedades.unshift(novData[0]);
        await this.store.auditar('novedades', 'CREACIÓN', novData[0].id, null, novData[0]);
      }

      this.store.guardarCacheLocal();
      this.container.querySelector("#modal-solicitud-la").classList.remove("active");
      this.renderSubVista();
      alert(`Licencia Anual de ${dias} días aprobada con éxito. Imputación: ${perImputado}`);
    } catch (err) {
      alert(`Error al procesar la solicitud: ${err.message}`);
    }
  }

  // --- SUB-VISTA 2: DIAGRAMADOR DE VACACIONES ---
  attachDiagramadorControls(cont) {
    const selMes = cont.querySelector("#sel-diag-mes");
    const inpAnio = cont.querySelector("#inp-diag-anio");
    const btnPrev = cont.querySelector("#btn-diag-prev");
    const btnNext = cont.querySelector("#btn-diag-next");

    if (selMes) selMes.addEventListener("change", (e) => {
      this.mesDiagramador = parseInt(e.target.value, 10);
      this.renderSubVistaDiagramador(this.container.querySelector("#lic-contenido-subvista"));
    });

    if (inpAnio) inpAnio.addEventListener("change", (e) => {
      this.anioDiagramador = parseInt(e.target.value, 10);
      this.renderSubVistaDiagramador(this.container.querySelector("#lic-contenido-subvista"));
    });

    if (btnPrev) btnPrev.addEventListener("click", () => {
      if (this.mesDiagramador === 1) { this.mesDiagramador = 12; this.anioDiagramador--; }
      else { this.mesDiagramador--; }
      selMes.value = this.mesDiagramador;
      inpAnio.value = this.anioDiagramador;
      this.renderSubVistaDiagramador(this.container.querySelector("#lic-contenido-subvista"));
    });

    if (btnNext) btnNext.addEventListener("click", () => {
      if (this.mesDiagramador === 12) { this.mesDiagramador = 1; this.anioDiagramador++; }
      else { this.mesDiagramador++; }
      selMes.value = this.mesDiagramador;
      inpAnio.value = this.anioDiagramador;
      this.renderSubVistaDiagramador(this.container.querySelector("#lic-contenido-subvista"));
    });
  }

  renderSubVistaDiagramador(cont) {
    const dias = this.obtenerDiasDelMes(this.anioDiagramador, this.mesDiagramador);
    const agentes = this.store.personal.filter(p => p.activo !== false);

    // Contar agentes de vacaciones por cada día para la fila de Cupo
    const conteoVacaciones = {};
    dias.forEach(d => { conteoVacaciones[d.iso] = 0; });

    agentes.forEach(ag => {
      dias.forEach(d => {
        const cel = calcularCeldaDiagramador(ag.legajo, d.iso, this.store);
        if (cel.esVacacion) {
          conteoVacaciones[d.iso]++;
        }
      });
    });

    let html = `
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th class="sticky-col-1">Día</th>
              <th class="sticky-col-2">Sector</th>
              ${dias.map(d => `<th class="col-dia-nombre ${d.esHoy ? 'col-hoy' : ''}">${d.nombre}</th>`).join('')}
            </tr>
            <tr>
              <th class="sticky-col-1">Fecha</th>
              <th class="sticky-col-2">CUPO SIMULTÁNEO</th>
              ${dias.map(d => `<th class="col-dia-numero ${d.esHoy ? 'col-hoy' : ''}">${d.numero}</th>`).join('')}
            </tr>
            <!-- Fila de Alerta de Cupo -->
            <tr style="background-color: #f1f5f9; font-weight: 800;">
              <th class="sticky-col-1">CUPO</th>
              <th class="sticky-col-2" style="color: #475569;">Agentes en simultáneo:</th>
              ${dias.map(d => {
                const cant = conteoVacaciones[d.iso];
                const supera = cant > 2; // Alerta si más de 2 simultáneos
                return `
                  <th style="text-align: center; color: ${supera ? 'var(--danger)' : '#334155'}; background-color: ${supera ? 'var(--danger-light)' : '#f1f5f9'};">
                    ${cant}
                  </th>
                `;
              }).join('')}
            </tr>
          </thead>
          <tbody>
    `;

    agentes.forEach(ag => {
      const leg = String(ag.legajo).trim();
      html += `
        <tr>
          <td class="sticky-col-1" style="font-weight: 700;">${leg}</td>
          <td class="sticky-col-2"><b>${ag.apellido}</b>, ${ag.nombre}</td>
          ${dias.map(d => {
            const cel = calcularCeldaDiagramador(leg, d.iso, this.store);
            const isSelected = this.celdasDiagSeleccionadas.has(`${leg}|${d.iso}`);
            return `
              <td class="celda-sabana ${isSelected ? 'selected' : ''}" 
                  data-legajo="${leg}" 
                  data-fecha="${d.iso}"
                  style="background-color: ${cel.bg}; color: #0f172a; text-align: center; font-weight: 700;">
                ${cel.texto}
              </td>
            `;
          }).join('')}
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    cont.innerHTML = html;

    // Conectar selección de celdas en el diagramador
    cont.querySelectorAll(".celda-sabana").forEach(c => {
      c.addEventListener("click", () => {
        const key = `${c.dataset.legajo}|${c.dataset.fecha}`;
        if (this.celdasDiagSeleccionadas.has(key)) {
          this.celdasDiagSeleccionadas.delete(key);
          c.classList.remove("selected");
        } else {
          this.celdasDiagSeleccionadas.add(key);
          c.classList.add("selected");
        }
        const lbl = this.container.querySelector("#diag-lbl-contador");
        if (lbl) lbl.textContent = `📌 Selección: ${this.celdasDiagSeleccionadas.size} días`;
      });
    });
  }

  obtenerDiasDelMes(anio, mes) {
    const cantDias = new Date(anio, mes, 0).getDate();
    const dias = [];
    const diasSemana = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

    for (let d = 1; d <= cantDias; d++) {
      const fecha = new Date(anio, mes - 1, d);
      const diaNum = String(d).padStart(2, '0');
      const mesNum = String(mes).padStart(2, '0');
      const iso = `${anio}-${mesNum}-${diaNum}`;
      dias.push({
        numero: diaNum,
        nombre: diasSemana[fecha.getDay()],
        iso: iso,
        esHoy: new Date().toISOString().startsWith(iso)
      });
    }
    return dias;
  }

  // --- SUB-VISTA 3: CONTROL RRHH (CHECKBOX REACTIVO) ---
  attachRRHHControls(cont) {
    const selEst = cont.querySelector("#sel-rrhh-filtro-estado");
    const inpBus = cont.querySelector("#inp-rrhh-buscar");

    if (selEst) selEst.addEventListener("change", (e) => {
      this.filtroEstadoRRHH = e.target.value;
      this.renderSubVistaRRHH(this.container.querySelector("#lic-contenido-subvista"));
    });

    if (inpBus) inpBus.addEventListener("input", (e) => {
      this.filtroTexto = e.target.value;
      this.renderSubVistaRRHH(this.container.querySelector("#lic-contenido-subvista"));
    });
  }

  renderSubVistaRRHH(cont) {
    // Filtrar licencias anuales activas
    let lista = this.store.novedades.filter(n => n.activo !== false && n.motivo === "Licencia Anual");

    if (this.filtroEstadoRRHH === "PENDIENTE") {
      lista = lista.filter(n => !n.enviado_rrhh);
    } else if (this.filtroEstadoRRHH === "ENVIADO") {
      lista = lista.filter(n => n.enviado_rrhh);
    }

    if (this.filtroTexto) {
      const q = this.filtroTexto.toLowerCase();
      lista = lista.filter(n => {
        const leg = String(n.legajo || "").toLowerCase();
        const obs = String(n.observaciones || "").toLowerCase();
        const ag = this.store.personal.find(p => String(p.legajo).trim() === String(n.legajo).trim());
        const ape = ag ? ag.apellido.toLowerCase() : "";
        const nom = ag ? ag.nombre.toLowerCase() : "";
        return leg.includes(q) || obs.includes(q) || ape.includes(q) || nom.includes(q);
      });
    }

    let html = `
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Legajo</th>
              <th>Apellido y Nombre</th>
              <th>Desde</th>
              <th>Hasta</th>
              <th>Días</th>
              <th>Imputación</th>
              <th>Reincorporación</th>
              <th style="text-align: center; background-color: #fef9c3;">Enviado a RRHH</th>
              <th>Fecha de Envío</th>
            </tr>
          </thead>
          <tbody>
    `;

    if (lista.length === 0) {
      html += `<tr><td colspan="10" style="text-align: center; padding: 30px; color: var(--text-muted);">No se encontraron licencias anuales para el filtro indicado.</td></tr>`;
    } else {
      lista.forEach(n => {
        const ag = this.store.personal.find(p => String(p.legajo).trim() === String(n.legajo).trim());
        const apeNom = ag ? `${ag.apellido}, ${ag.nombre}` : `Legajo ${n.legajo}`;
        const enviado = Boolean(n.enviado_rrhh);
        html += `
          <tr style="${enviado ? 'background-color: #f0fdf4;' : ''}">
            <td>${n.id}</td>
            <td style="font-weight: 700;">${n.legajo}</td>
            <td>${apeNom}</td>
            <td>${n.fecha_inicio}</td>
            <td>${n.fecha_fin}</td>
            <td style="font-weight: 700;">${n.cantidad_dias || '—'} d</td>
            <td>${n.periodo_imputado || '—'}</td>
            <td>${n.fecha_reincorporacion || '—'}</td>
            <td style="text-align: center;">
              <input type="checkbox" class="chk-enviado-rrhh" data-id="${n.id}" ${enviado ? 'checked' : ''} style="transform: scale(1.3); cursor: pointer;">
            </td>
            <td style="font-size: 11px; color: var(--text-muted);">
              ${n.fecha_envio_rrhh ? n.fecha_envio_rrhh.slice(0, 16).replace('T', ' ') : '—'}
            </td>
          </tr>
        `;
      });
    }

    html += `</tbody></table></div>`;
    cont.innerHTML = html;

    // Conectar cambio en checkboxes
    cont.querySelectorAll(".chk-enviado-rrhh").forEach(chk => {
      chk.addEventListener("change", (e) => {
        const id = parseInt(chk.dataset.id, 10);
        const nuevoEstado = e.target.checked;
        this.actualizarEnvioRRHH(id, nuevoEstado);
      });
    });
  }

  async actualizarEnvioRRHH(novedadId, enviado) {
    const nov = this.store.novedades.find(n => n.id === novedadId);
    if (!nov) return;

    const client = getSupabaseClient();
    const ahoraIso = new Date().toISOString();
    const fechaEnvio = enviado ? ahoraIso : null;

    try {
      const { error } = await client.from('novedades')
        .update({
          enviado_rrhh: enviado,
          fecha_envio_rrhh: fechaEnvio,
          updated_at: ahoraIso
        })
        .eq('id', novedadId);

      if (error) throw error;

      nov.enviado_rrhh = enviado;
      nov.fecha_envio_rrhh = fechaEnvio;
      this.store.guardarCacheLocal();
      await this.store.auditar('novedades', 'CONTROL RRHH', novedadId, { enviado_rrhh: !enviado }, { enviado_rrhh: enviado, fecha_envio_rrhh: fechaEnvio });

      this.renderSubVistaRRHH(this.container.querySelector("#lic-contenido-subvista"));
    } catch (err) {
      alert(`Error al actualizar estado en RRHH: ${err.message}`);
    }
  }

  refrescar() {
    this.renderSubVista();
  }
}
