// views/sabana.js - Vista Principal Sábana de Turnos con Columnas Fijas y Acceso Rápido
import { calcularCelda, parseFechaISO } from '../engine_turnos.js';
import { getSupabaseClient } from '../supabase.js';
import { habilitarOcultarLegajoEnScroll } from '../combobox.js';

export class SabanaView {
  constructor(container, store, onOpenNovedadModal, onOpenCambioTurnoModal) {
    this.container = container;
    this.store = store;
    this.onOpenNovedadModal = onOpenNovedadModal;
    this.onOpenCambioTurnoModal = onOpenCambioTurnoModal;

    const hoy = new Date();
    this.mesActual = hoy.getMonth() + 1;
    this.anioActual = hoy.getFullYear();

    this.filtroTexto = "";
    this.filtroSectores = [];
    this.filtroGrupos = [];
    this.filtroPersonal = [];

    this.celdasSeleccionadas = new Set(); // Set de "legajo|fechaISO"
    this.isDragging = false;
    this.dragStartLegajo = null;
    this.dragStartFecha = null;
    this.lastSelectedKey = null;
    this.touchStartCell = null;

    this.init();
  }

  init() {
    this.renderLayout();
    this.renderLeyenda();
    this.renderTabla();
    this.attachEvents();
  }

  renderLayout() {
    this.container.innerHTML = `
      <div class="toolbar-card">
        <div class="toolbar-row">
          <div class="toolbar-group">
            <button class="btn btn-secondary btn-pill" id="btn-sabana-prev">◀</button>
            <select id="sel-sabana-mes">
              ${[
                "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
              ].map((m, idx) => `<option value="${idx + 1}" ${idx + 1 === this.mesActual ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
            <input type="number" id="inp-sabana-anio" value="${this.anioActual}" style="width: 75px;">
            <button class="btn btn-secondary btn-pill" id="btn-sabana-next">▶</button>
            <button class="btn btn-primary btn-pill" id="btn-sabana-hoy" style="background-color: var(--color-hoy);">Hoy</button>
          </div>

          <div class="toolbar-group" style="flex: 1; min-width: 200px;">
            <input type="text" id="inp-sabana-buscar" placeholder="🔍 Buscar por legajo o apellido (ej: 2704, Varela)..." style="width: 100%;">
          </div>

          <div class="toolbar-group">
            <button class="btn btn-secondary" id="btn-sabana-filtro-avanzado">⚙️ Filtros (${this.contarFiltrosActivos()})</button>
            <button class="btn btn-secondary" id="btn-sabana-cambio-turno" title="Registrar cambio de turno para la selección">🔄 Cambio de Turno</button>
            <button class="btn btn-primary" id="btn-sabana-cargar-novedad">➕ Cargar Novedad</button>
          </div>
        </div>

        <div class="leyenda-row accesos-rapidos quick-access" id="sabana-leyenda-container">
          <!-- Botones de leyenda y píldora de selección -->
        </div>
      </div>

      <div class="table-container" id="sabana-table-container">
        <!-- Grilla de Sábana -->
      </div>

      <!-- Modal Filtro Avanzado -->
      <div class="modal-overlay" id="modal-filtro-avanzado">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Filtro Avanzado de Sábana</h3>
            <button class="btn-icon" id="btn-cerrar-filtro-avanzado">✖</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Sectores:</label>
              <div id="filtro-sectores-checks" style="max-height: 110px; overflow-y: auto; border: 1px solid var(--border-light); padding: 8px; border-radius: 6px;"></div>
            </div>
            <div class="form-group">
              <label>Grupos / Turnos SAP (Asignados):</label>
              <div id="filtro-grupos-checks" style="max-height: 110px; overflow-y: auto; border: 1px solid var(--border-light); padding: 8px; border-radius: 6px;"></div>
            </div>
            <div class="form-group">
              <label>Personal / Agentes:</label>
              <input type="text" id="filtro-personal-buscar" placeholder="🔍 Filtrar agente..." style="width: 100%; margin-bottom: 6px; font-size: 12px; min-height: 32px;">
              <div id="filtro-personal-checks" style="max-height: 130px; overflow-y: auto; border: 1px solid var(--border-light); padding: 8px; border-radius: 6px;"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btn-limpiar-filtros">Limpiar Filtros</button>
            <button class="btn btn-primary" id="btn-aplicar-filtros">Aplicar Filtros</button>
          </div>
        </div>
      </div>
    `;
  }

  contarFiltrosActivos() {
    return this.filtroSectores.length + this.filtroGrupos.length + this.filtroPersonal.length;
  }

  renderLeyenda() {
    const cont = this.container.querySelector("#sabana-leyenda-container");
    if (!cont) return;

    // Filtrar motivos que tienen mostrar_acceso_rapido !== false y NO sean Licencia Anual/Vacaciones
    const motivosRapidos = this.store.catalogo_motivos.filter(m => {
      const val = (m.valor || "").trim().toLowerCase();
      if (val === "licencia anual" || val === "vacaciones") return false;
      return m.mostrar_acceso_rapido !== false && m.activo !== false;
    });

    let htmlBotones = `
      <span style="font-size: 12px; font-weight: 700; color: #475569;">Acceso rápido:</span>
      <button class="btn-acceso-rapido" style="background-color: var(--color-hoy); color: white;" id="btn-leyenda-hoy">Hoy</button>
    `;

    motivosRapidos.forEach(m => {
      const bg = m.color_hex || "#e2e8f0";
      htmlBotones += `
        <button class="btn-acceso-rapido btn-aplicar-formato-rapido" 
                data-motivo="${m.valor}" 
                data-tipo="${m.tipo_color || 'licencia'}" 
                data-color="${bg}"
                style="background-color: ${bg}; color: #0f172a;"
                title="Aplicar '${m.valor}' sobre celdas seleccionadas">
          ${m.valor}
        </button>
      `;
    });

    htmlBotones += `
      <div style="flex: 1;"></div>
      <div class="badge-contador-seleccion" id="sabana-lbl-contador">📌 Selección: 0 días</div>
    `;

    cont.innerHTML = htmlBotones;

    // Vincular clicks de formato rápido
    cont.querySelectorAll(".btn-aplicar-formato-rapido").forEach(btn => {
      btn.addEventListener("click", () => {
        const mot = btn.getAttribute("data-motivo");
        const tipo = btn.getAttribute("data-tipo");
        const col = btn.getAttribute("data-color");
        this.aplicarFormatoRapido(mot, tipo, col);
      });
    });

    const bHoy = cont.querySelector("#btn-leyenda-hoy");
    if (bHoy) bHoy.addEventListener("click", () => this.irAHoy());

    this.actualizarContadorSeleccion();
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
        esHoy: this.esHoy(iso)
      });
    }
    return dias;
  }

  esHoy(iso) {
    const h = new Date();
    const hoyIso = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
    return iso === hoyIso;
  }

  obtenerAgentesFiltrados() {
    let agentes = this.store.personal.filter(p => p.activo !== false);

    // Filtro por texto multi-legajo / apellido
    if (this.filtroTexto) {
      const terminos = this.filtroTexto.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      if (terminos.length > 0) {
        agentes = agentes.filter(p => {
          const leg = String(p.legajo || "").toLowerCase();
          const ape = String(p.apellido || "").toLowerCase();
          const nom = String(p.nombre || "").toLowerCase();
          return terminos.some(t => leg.includes(t) || ape.includes(t) || nom.includes(t));
        });
      }
    }

    // Filtro de Sectores
    if (this.filtroSectores.length > 0) {
      agentes = agentes.filter(p => this.filtroSectores.includes(p.sector_actual));
    }

    // Filtro de Grupos SAP
    if (this.filtroGrupos.length > 0) {
      agentes = agentes.filter(p => this.filtroGrupos.includes(p.grupo_sap_actual));
    }

    // Filtro de Personal específico
    if (this.filtroPersonal.length > 0) {
      agentes = agentes.filter(p => this.filtroPersonal.includes(String(p.legajo).trim()));
    }

    return agentes;
  }

  renderTabla() {
    const tableCont = this.container.querySelector("#sabana-table-container");
    if (!tableCont) return;

    const dias = this.obtenerDiasDelMes(this.anioActual, this.mesActual);
    const agentes = this.obtenerAgentesFiltrados();

    let html = `
      <table class="data-table sabana-table">
        <thead>
          <!-- Fila 1: Días de la semana -->
          <tr>
            <th class="sticky-col-1">Día</th>
            <th class="sticky-col-2">Sector / Grupo</th>
            ${dias.map(d => `<th class="col-dia-nombre ${d.esHoy ? 'col-hoy' : ''}">${d.nombre}</th>`).join('')}
          </tr>
          <!-- Fila 2: Números de fecha -->
          <tr>
            <th class="sticky-col-1">Legajo</th>
            <th class="sticky-col-2">Apellido y Nombre</th>
            ${dias.map(d => `<th class="col-dia-numero ${d.esHoy ? 'col-hoy' : ''}">${d.numero}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
    `;

    if (agentes.length === 0) {
      html += `<tr><td colspan="${dias.length + 2}" style="text-align: center; padding: 30px; color: var(--text-muted);">No se encontraron agentes activos con los filtros seleccionados.</td></tr>`;
    } else {
      agentes.forEach(ag => {
        const leg = String(ag.legajo).trim();
        html += `
          <tr>
            <td class="sticky-col-1" style="font-weight: 700;">${leg}</td>
            <td class="sticky-col-2" title="${ag.apellido}, ${ag.nombre} (${ag.sector_actual || ''} - ${ag.grupo_sap_actual || ''})">
              <b>${ag.apellido}</b>, <span class="agente-nom-completo">${ag.nombre}</span><span class="agente-nom-sub">${ag.nombre ? ag.nombre[0] + '.' : ''}</span>
            </td>
            ${dias.map(d => {
              const celda = calcularCelda(leg, d.iso, this.store);
              const isSelected = this.celdasSeleccionadas.has(`${leg}|${d.iso}`);
              const novId = celda.novedad ? celda.novedad.id : '';
              return `
                <td class="celda-sabana ${isSelected ? 'selected' : ''}" 
                    data-legajo="${leg}" 
                    data-fecha="${d.iso}"
                    data-novedad-id="${novId}"
                    style="background-color: ${celda.bg}; color: #0f172a;"
                    title="${ag.apellido}: ${d.iso} - ${celda.texto || 'Sin asignar'}${celda.novedad ? ' (Doble clic para editar novedad)' : ''}">
                  ${celda.texto || ''}
                </td>
              `;
            }).join('')}
          </tr>
        `;
      });
    }

    html += `
        </tbody>
      </table>
    `;

    tableCont.innerHTML = html;
    habilitarOcultarLegajoEnScroll(tableCont);
    this.attachCellEvents();
  }

  attachEvents() {
    // Cambio de mes/año
    const selMes = this.container.querySelector("#sel-sabana-mes");
    const inpAnio = this.container.querySelector("#inp-sabana-anio");
    const btnPrev = this.container.querySelector("#btn-sabana-prev");
    const btnNext = this.container.querySelector("#btn-sabana-next");
    const btnHoy = this.container.querySelector("#btn-sabana-hoy");
    const inpBuscar = this.container.querySelector("#inp-sabana-buscar");

    if (selMes) selMes.addEventListener("change", (e) => {
      this.mesActual = parseInt(e.target.value, 10);
      this.renderTabla();
    });

    if (inpAnio) inpAnio.addEventListener("change", (e) => {
      this.anioActual = parseInt(e.target.value, 10) || this.anioActual;
      this.renderTabla();
    });

    if (btnPrev) btnPrev.addEventListener("click", () => {
      if (this.mesActual === 1) {
        this.mesActual = 12;
        this.anioActual--;
      } else {
        this.mesActual--;
      }
      selMes.value = this.mesActual;
      inpAnio.value = this.anioActual;
      this.renderTabla();
    });

    if (btnNext) btnNext.addEventListener("click", () => {
      if (this.mesActual === 12) {
        this.mesActual = 1;
        this.anioActual++;
      } else {
        this.mesActual++;
      }
      selMes.value = this.mesActual;
      inpAnio.value = this.anioActual;
      this.renderTabla();
    });

    if (btnHoy) btnHoy.addEventListener("click", () => this.irAHoy());

    if (inpBuscar) inpBuscar.addEventListener("input", (e) => {
      this.filtroTexto = e.target.value;
      this.renderTabla();
    });

    // Cargar Novedad manual sobre selección
    const btnCargar = this.container.querySelector("#btn-sabana-cargar-novedad");
    if (btnCargar) btnCargar.addEventListener("click", () => {
      this.abrirModalNovedadDesdeSeleccion();
    });

    const btnCambioTurno = this.container.querySelector("#btn-sabana-cambio-turno");
    if (btnCambioTurno) btnCambioTurno.addEventListener("click", () => {
      this.abrirModalCambioTurnoDesdeSeleccion();
    });

    // Filtros avanzados
    const btnFiltroAdv = this.container.querySelector("#btn-sabana-filtro-avanzado");
    const modalFiltro = this.container.querySelector("#modal-filtro-avanzado");
    const btnCerrarFiltro = this.container.querySelector("#btn-cerrar-filtro-avanzado");
    const btnAplicarFiltros = this.container.querySelector("#btn-aplicar-filtros");
    const btnLimpiarFiltros = this.container.querySelector("#btn-limpiar-filtros");

    if (btnFiltroAdv && modalFiltro) {
      btnFiltroAdv.addEventListener("click", () => {
        this.poblarChecksFiltroAvanzado();
        modalFiltro.classList.add("active");
      });
      btnCerrarFiltro.addEventListener("click", () => modalFiltro.classList.remove("active"));
      btnLimpiarFiltros.addEventListener("click", () => {
        this.filtroSectores = [];
        this.filtroGrupos = [];
        this.filtroPersonal = [];
        btnFiltroAdv.textContent = `⚙️ Filtros (0)`;
        modalFiltro.classList.remove("active");
        this.renderTabla();
      });
      btnAplicarFiltros.addEventListener("click", () => {
        const secChecks = modalFiltro.querySelectorAll("input[name='filtro-sec']:checked");
        const grpChecks = modalFiltro.querySelectorAll("input[name='filtro-grp']:checked");
        const persChecks = modalFiltro.querySelectorAll("input[name='filtro-pers']:checked");
        this.filtroSectores = Array.from(secChecks).map(c => c.value);
        this.filtroGrupos = Array.from(grpChecks).map(c => c.value);
        this.filtroPersonal = Array.from(persChecks).map(c => c.value);
        btnFiltroAdv.textContent = `⚙️ Filtros (${this.contarFiltrosActivos()})`;
        modalFiltro.classList.remove("active");
        this.renderTabla();
      });
    }

    // Finalizar arrastre de selección en cualquier parte de la ventana
    window.addEventListener("mouseup", () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.dragStartLegajo = null;
        this.dragStartFecha = null;
        this.actualizarContadorSeleccion();
      }
    });
  }

  poblarChecksFiltroAvanzado() {
    const secCont = this.container.querySelector("#filtro-sectores-checks");
    const grpCont = this.container.querySelector("#filtro-grupos-checks");
    const persCont = this.container.querySelector("#filtro-personal-checks");
    const inpBusPers = this.container.querySelector("#filtro-personal-buscar");
    if (!secCont || !grpCont) return;

    secCont.innerHTML = this.store.sectores.map(s => `
      <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; margin-bottom: 4px;">
        <input type="checkbox" name="filtro-sec" value="${s}" ${this.filtroSectores.includes(s) ? 'checked' : ''}>
        ${s}
      </label>
    `).join('');

    // Mostrar sólo los turnos SAP que tengan al menos un personal asignado
    const turnosAsignados = new Set(
      this.store.personal
        .filter(p => p.activo !== false && p.grupo_sap_actual)
        .map(p => p.grupo_sap_actual.trim().toUpperCase())
    );

    const turnosFiltrados = Array.from(this.store.turnos.values())
      .filter(t => turnosAsignados.has(t.codigo_sap.trim().toUpperCase()))
      .sort((a, b) => a.codigo_sap.localeCompare(b.codigo_sap));

    grpCont.innerHTML = turnosFiltrados.length > 0 ? turnosFiltrados.map(t => `
      <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; margin-bottom: 4px;">
        <input type="checkbox" name="filtro-grp" value="${t.codigo_sap}" ${this.filtroGrupos.includes(t.codigo_sap) ? 'checked' : ''}>
        <b>${t.codigo_sap}</b> (${t.etiqueta_corta})
      </label>
    `).join('') : '<div style="color: var(--text-muted); font-size: 12px;">No hay turnos con personal asignado</div>';

    // Poblar personal con buscador interactivo
    if (persCont) {
      const renderPersonalChecks = (filtro = "") => {
        const q = filtro.toLowerCase().trim();
        const agentes = this.store.personal
          .filter(p => p.activo !== false)
          .filter(p => !q || String(p.legajo).includes(q) || p.apellido.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q))
          .sort((a, b) => a.apellido.localeCompare(b.apellido));

        persCont.innerHTML = agentes.map(p => `
          <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; margin-bottom: 4px;">
            <input type="checkbox" name="filtro-pers" value="${p.legajo}" ${this.filtroPersonal.includes(String(p.legajo).trim()) ? 'checked' : ''}>
            [${p.legajo}] <b>${p.apellido}</b>, ${p.nombre}
          </label>
        `).join('') || '<div style="color: var(--text-muted); font-size: 12px;">Sin coincidencias</div>';
      };

      renderPersonalChecks();

      if (inpBusPers) {
        inpBusPers.value = "";
        inpBusPers.oninput = (e) => renderPersonalChecks(e.target.value);
      }
    }
  }

  irAHoy() {
    const h = new Date();
    this.mesActual = h.getMonth() + 1;
    this.anioActual = h.getFullYear();

    const selMes = this.container.querySelector("#sel-sabana-mes");
    const inpAnio = this.container.querySelector("#inp-sabana-anio");
    if (selMes) selMes.value = this.mesActual;
    if (inpAnio) inpAnio.value = this.anioActual;

    this.renderTabla();

    // Scroll horizontal hacia la columna de hoy
    setTimeout(() => {
      const celdaHoy = this.container.querySelector(".col-hoy");
      if (celdaHoy) {
        celdaHoy.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }, 100);
  }

  seleccionarRangoEnFila(row, fStart, fEnd, mantenerPrevios = false) {
    if (!row) return;
    const f1 = fStart < fEnd ? fStart : fEnd;
    const f2 = fStart < fEnd ? fEnd : fStart;
    const leg = this.dragStartLegajo || row.querySelector('.celda-sabana')?.dataset.legajo;
    if (!leg) return;

    if (!mantenerPrevios) {
      this.celdasSeleccionadas.clear();
      this.container.querySelectorAll(".celda-sabana.selected").forEach(el => el.classList.remove("selected"));
    }

    const celdasFila = row.querySelectorAll('.celda-sabana');
    celdasFila.forEach(rc => {
      const rf = rc.dataset.fecha;
      if (rf >= f1 && rf <= f2) {
        this.celdasSeleccionadas.add(`${leg}|${rf}`);
        rc.classList.add('selected');
      }
    });
  }

  attachCellEvents() {
    const celdas = this.container.querySelectorAll(".celda-sabana");

    celdas.forEach(c => {
      // 1. Mousedown: Inicia selección o arrastre
      c.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return; // Solo clic izquierdo principal
        const leg = c.dataset.legajo;
        const fec = c.dataset.fecha;
        const key = `${leg}|${fec}`;

        this.isDragging = true;
        this.dragStartLegajo = leg;
        this.dragStartFecha = fec;

        if (e.shiftKey && this.lastSelectedKey) {
          const [lastLeg, lastFec] = this.lastSelectedKey.split('|');
          if (lastLeg === leg) {
            this.seleccionarRangoEnFila(c.closest('tr'), lastFec, fec, e.ctrlKey);
          } else {
            this.celdasSeleccionadas.add(key);
            c.classList.add("selected");
          }
        } else if (e.ctrlKey) {
          if (this.celdasSeleccionadas.has(key)) {
            this.celdasSeleccionadas.delete(key);
            c.classList.remove("selected");
          } else {
            this.celdasSeleccionadas.add(key);
            c.classList.add("selected");
          }
        } else {
          this.celdasSeleccionadas.clear();
          this.container.querySelectorAll(".celda-sabana.selected").forEach(el => el.classList.remove("selected"));
          this.celdasSeleccionadas.add(key);
          c.classList.add("selected");
        }

        this.lastSelectedKey = key;
        this.actualizarContadorSeleccion();
      });

      // 2. Mouseenter: Arrastre interactivo en la fila del agente
      c.addEventListener("mouseenter", (e) => {
        if (!this.isDragging || !this.dragStartLegajo) return;

        const leg = c.dataset.legajo;
        const fec = c.dataset.fecha;

        if (leg === this.dragStartLegajo) {
          const row = c.closest('tr');
          if (row) {
            this.seleccionarRangoEnFila(row, this.dragStartFecha, fec, false);
          }
        }
        this.actualizarContadorSeleccion();
      });

      // 3. Touch Support para móviles y tablets
      c.addEventListener("touchstart", (e) => {
        const leg = c.dataset.legajo;
        const fec = c.dataset.fecha;
        this.touchStartCell = { leg, fec, el: c };
      }, { passive: true });

      c.addEventListener("touchmove", (e) => {
        if (!this.touchStartCell) return;
        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        if (target && target.classList.contains("celda-sabana") && target.dataset.legajo === this.touchStartCell.leg) {
          const row = target.closest('tr');
          if (row) {
            this.seleccionarRangoEnFila(row, this.touchStartCell.fec, target.dataset.fecha, false);
            this.actualizarContadorSeleccion();
          }
        }
      }, { passive: true });

      c.addEventListener("touchend", () => {
        this.touchStartCell = null;
      }, { passive: true });

      // 4. Doble click / doble toque: Abrir edición si tiene novedad o alta si está libre
      c.addEventListener("dblclick", () => {
        this.abrirModalNovedadDesdeCelda(c);
      });
    });
  }

  abrirModalNovedadDesdeCelda(celdaEl) {
    if (!celdaEl) return;
    const leg = celdaEl.dataset.legajo;
    const fec = celdaEl.dataset.fecha;
    const novId = celdaEl.dataset.novedadId;

    if (novId) {
      const nov = this.store.novedades.find(n => String(n.id) === String(novId));
      if (nov) {
        if (this.onOpenNovedadModal) {
          this.onOpenNovedadModal(nov);
        }
        return;
      }
    }

    // Búsqueda de respaldo por fecha y legajo
    const novExistente = this.store.novedades.find(n => 
      n.activo !== false && 
      String(n.legajo).trim() === String(leg).trim() && 
      n.fecha_inicio <= fec && 
      n.fecha_fin >= fec
    );

    if (novExistente) {
      if (this.onOpenNovedadModal) {
        this.onOpenNovedadModal(novExistente);
      }
      return;
    }

    this.abrirModalNovedad(leg, fec, fec);
  }

  actualizarContadorSeleccion() {
    const lbl = this.container.querySelector("#sabana-lbl-contador");
    const btnCargar = this.container.querySelector("#btn-sabana-cargar-novedad");

    const total = this.celdasSeleccionadas.size;
    if (total === 0) {
      if (lbl) lbl.textContent = "📌 Selección: 0 días";
      if (btnCargar) {
        btnCargar.textContent = "➕ Cargar Novedad";
        btnCargar.title = "Cargar novedad";
      }
      return;
    }

    const agentes = new Set();
    const fechas = new Set();

    this.celdasSeleccionadas.forEach(key => {
      const [leg, fec] = key.split('|');
      agentes.add(leg);
      fechas.add(fec);
    });

    if (lbl) {
      lbl.textContent = `📌 Selección: ${total} días (${agentes.size} ag. × ${fechas.size} fechas)`;
    }

    if (btnCargar) {
      if (total === 1) {
        const key = Array.from(this.celdasSeleccionadas)[0];
        const [leg, fec] = key.split('|');
        const celdaEl = this.container.querySelector(`.celda-sabana[data-legajo="${leg}"][data-fecha="${fec}"]`);
        if (celdaEl && (celdaEl.dataset.novedadId || this.obtenerNovedadDeCelda(leg, fec))) {
          btnCargar.textContent = "✏️ Editar Novedad";
          btnCargar.title = "Editar la novedad de la celda seleccionada";
        } else {
          btnCargar.textContent = "➕ Cargar Novedad";
          btnCargar.title = "Cargar novedad para el día seleccionado";
        }
      } else {
        btnCargar.textContent = "➕ Cargar Novedad";
        btnCargar.title = "Cargar novedad para el rango seleccionado";
      }
    }
  }

  obtenerNovedadDeCelda(legajo, fecha) {
    return this.store.novedades.find(n => 
      n.activo !== false && 
      String(n.legajo).trim() === String(legajo).trim() && 
      n.fecha_inicio <= fecha && 
      n.fecha_fin >= fecha
    );
  }

  abrirModalNovedadDesdeSeleccion() {
    if (this.celdasSeleccionadas.size === 0) {
      alert("Seleccioná al menos una celda en la Sábana para cargar una novedad.");
      return;
    }

    // Si exactamente 1 celda está seleccionada y tiene una novedad cargada, abrirla para edición
    if (this.celdasSeleccionadas.size === 1) {
      const key = Array.from(this.celdasSeleccionadas)[0];
      const [leg, fec] = key.split('|');
      const celdaEl = this.container.querySelector(`.celda-sabana[data-legajo="${leg}"][data-fecha="${fec}"]`);
      if (celdaEl) {
        const nov = (celdaEl.dataset.novedadId ? this.store.novedades.find(n => String(n.id) === String(celdaEl.dataset.novedadId)) : null)
          || this.obtenerNovedadDeCelda(leg, fec);
        if (nov) {
          if (this.onOpenNovedadModal) {
            this.onOpenNovedadModal(nov);
          }
          return;
        }
      }
    }

    const items = Array.from(this.celdasSeleccionadas).map(k => {
      const [leg, fec] = k.split('|');
      return { legajo: leg, fecha: fec };
    });

    const primerLegajo = items[0].legajo;
    const fechas = items.map(x => x.fecha).sort();
    const fIni = fechas[0];
    const fFin = fechas[fechas.length - 1];

    this.abrirModalNovedad(primerLegajo, fIni, fFin);
  }

  abrirModalNovedad(legajo, fIni, fFin) {
    if (this.onOpenNovedadModal) {
      this.onOpenNovedadModal({
        legajo: legajo,
        fecha_inicio: fIni,
        fecha_fin: fFin,
        esNuevo: true
      });
    }
  }

  abrirModalCambioTurnoDesdeSeleccion() {
    let legajo = null;
    let fIni = null;
    let fFin = null;

    if (this.celdasSeleccionadas.size > 0) {
      const items = Array.from(this.celdasSeleccionadas).map(k => {
        const [leg, fec] = k.split('|');
        return { legajo: leg, fecha: fec };
      });
      legajo = items[0].legajo;
      const fechas = items.map(x => x.fecha).sort();
      fIni = fechas[0];
      fFin = fechas[fechas.length - 1];
    }

    if (this.onOpenCambioTurnoModal) {
      this.onOpenCambioTurnoModal({
        legajo: legajo,
        fecha_inicio: fIni,
        fecha_fin: fFin,
      });
    }
  }

  async aplicarFormatoRapido(motivo, tipoColor, colorHex) {
    if (this.celdasSeleccionadas.size === 0) {
      alert("Seleccioná un rango de celdas en la Sábana antes de aplicar un formato rápido.");
      return;
    }

    if (!this.store.tienePermiso('novedades', 'crear')) {
      alert("Tu rol actual no tiene permisos para crear o modificar novedades.");
      return;
    }

    const items = Array.from(this.celdasSeleccionadas).map(k => {
      const [leg, fec] = k.split('|');
      return { legajo: leg, fecha: fec };
    });

    // Agrupar por legajo
    const porLegajo = {};
    items.forEach(it => {
      if (!porLegajo[it.legajo]) porLegajo[it.legajo] = [];
      porLegajo[it.legajo].push(it.fecha);
    });

    const client = getSupabaseClient();
    const ahoraIso = new Date().toISOString();

    for (const [leg, fechas] of Object.entries(porLegajo)) {
      fechas.sort();
      const fIni = fechas[0];
      const fFin = fechas[fechas.length - 1];

      const payload = {
        legajo: leg,
        fecha_inicio: fIni,
        fecha_fin: fFin,
        motivo: motivo,
        tipo_color: tipoColor,
        color_hex: colorHex,
        observaciones: `Acceso rápido desde CRONO-WEB`,
        activo: true,
        sync_status: 'synced',
        updated_at: ahoraIso
      };

      const { data, error } = await client.from('novedades').insert(payload).select();
      if (!error && data && data.length > 0) {
        this.store.novedades.unshift(data[0]);
        await this.store.auditar('novedades', 'CREACIÓN', data[0].id, null, data[0]);
      }
    }

    this.store.guardarCacheLocal();
    this.renderTabla();
    alert(`Formato '${motivo}' aplicado con éxito sobre ${this.celdasSeleccionadas.size} celdas.`);
  }

  refrescar() {
    this.renderLeyenda();
    this.renderTabla();
  }
}
