// views/personal.js - Base de Personal con Selector Oficial de Categorías y Sticky Columns
import { parseFechaISO } from '../engine_turnos.js';
import { getSupabaseClient } from '../supabase.js';

export class PersonalView {
  constructor(container, store) {
    this.container = container;
    this.store = store;

    this.filtroTexto = "";
    this.filtroSector = "TODOS";
    this.filtroGrupo = "TODOS";
    this.mostrarInactivos = false;

    this.columnaOrden = "orden_sabana";
    this.ordenAscendente = true;

    this.agenteEnEdicion = null;

    this.init();
  }

  init() {
    this.renderLayout();
    this.renderTabla();
    this.attachEvents();
  }

  renderLayout() {
    this.container.innerHTML = `
      <div class="toolbar-card">
        <div class="toolbar-row">
          <div class="toolbar-group" style="flex: 1; min-width: 200px;">
            <input type="text" id="inp-pers-buscar" placeholder="🔍 Buscar legajo, apellido, nombre o CUIL..." style="width: 100%;">
          </div>

          <div class="toolbar-group">
            <select id="sel-pers-sector">
              <option value="TODOS">Todos los Sectores</option>
              ${this.store.sectores.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>

            <select id="sel-pers-grupo">
              <option value="TODOS">Todos los Grupos SAP</option>
              ${Array.from(this.store.turnos.values()).map(t => `<option value="${t.codigo_sap}">[${t.codigo_sap}] ${t.etiqueta_corta}</option>`).join('')}
            </select>
          </div>

          <div class="toolbar-group">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
              <input type="checkbox" id="chk-pers-inactivos" ${this.mostrarInactivos ? 'checked' : ''}>
              Ver Inactivos
            </label>
            <button class="btn btn-primary" id="btn-pers-nuevo">➕ Alta Agente</button>
          </div>
        </div>
      </div>

      <div class="table-container" id="pers-table-container">
        <!-- Tabla con Sticky Columns -->
      </div>

      <!-- Modal Alta / Edición de Personal -->
      <div class="modal-overlay" id="modal-crud-personal">
        <div class="modal-content">
          <div class="modal-header">
            <h3 id="modal-pers-titulo">Alta de Personal</h3>
            <button class="btn-icon" id="btn-cerrar-modal-personal">✖</button>
          </div>
          <div class="modal-body">
            <div class="form-row">
              <div class="form-group">
                <label>Legajo (Único):</label>
                <input type="text" id="pers-form-legajo" required placeholder="Ej: 18142">
              </div>
              <div class="form-group">
                <label>CUIL:</label>
                <input type="text" id="pers-form-cuil" placeholder="Ej: 20-30405060-7">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Apellido:</label>
                <input type="text" id="pers-form-apellido" required>
              </div>
              <div class="form-group">
                <label>Nombre:</label>
                <input type="text" id="pers-form-nombre" required>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Categoría Oficial:</label>
                <select id="pers-form-categoria" required>
                  <!-- Poblado dinámicamente desde categorias_personal -->
                </select>
              </div>
              <div class="form-group">
                <label>Sector Actual:</label>
                <select id="pers-form-sector" required>
                  ${this.store.sectores.map(s => `<option value="${s}">${s}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Grupo / Turno SAP Actual:</label>
                <select id="pers-form-grupo">
                  <option value="">-- Sin asignar --</option>
                  ${Array.from(this.store.turnos.values()).map(t => `<option value="${t.codigo_sap}">[${t.codigo_sap}] ${t.descripcion || t.etiqueta_corta}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Fecha de Nacimiento:</label>
                <input type="date" id="pers-form-nacimiento">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Ingreso a Empresa:</label>
                <input type="date" id="pers-form-ingreso-empresa">
              </div>
              <div class="form-group">
                <label>Ingreso al PCT:</label>
                <input type="date" id="pers-form-ingreso-pct">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Celular:</label>
                <input type="text" id="pers-form-celular" placeholder="Ej: 341-1555555">
              </div>
              <div class="form-group">
                <label>Teléfono Emergencia:</label>
                <input type="text" id="pers-form-emergencia" placeholder="Contacto de auxilio">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Email:</label>
                <input type="text" id="pers-form-mail" placeholder="usuario@empresa.com.ar">
              </div>
              <div class="form-group">
                <label>Localidad:</label>
                <input type="text" id="pers-form-localidad" placeholder="Rosario, etc.">
              </div>
            </div>

            <div class="form-group">
              <label>Domicilio:</label>
              <input type="text" id="pers-form-domicilio" placeholder="Calle y número">
            </div>

            <div class="form-group" style="margin-top: 6px;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="pers-form-activo" checked>
                <b>Agente Activo en la Nómina</b>
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btn-cancelar-modal-personal">Cancelar</button>
            <button class="btn btn-primary" id="btn-guardar-modal-personal">Guardar Agente</button>
          </div>
        </div>
      </div>
    `;
  }

  obtenerAgentesFiltradosYOrdenados() {
    let lista = this.store.personal.filter(p => {
      if (!this.mostrarInactivos && p.activo === false) return false;
      return true;
    });

    if (this.filtroSector !== "TODOS") {
      lista = lista.filter(p => p.sector_actual === this.filtroSector);
    }

    if (this.filtroGrupo !== "TODOS") {
      lista = lista.filter(p => p.grupo_sap_actual === this.filtroGrupo);
    }

    if (this.filtroTexto) {
      const q = this.filtroTexto.toLowerCase();
      lista = lista.filter(p => {
        const leg = String(p.legajo || "").toLowerCase();
        const ape = String(p.apellido || "").toLowerCase();
        const nom = String(p.nombre || "").toLowerCase();
        const cuil = String(p.cuil || "").toLowerCase();
        const dom = String(p.domicilio || "").toLowerCase();
        const loc = String(p.localidad || "").toLowerCase();
        const cel = String(p.celular || "").toLowerCase();
        const mail = String(p.mail || "").toLowerCase();
        return leg.includes(q) || ape.includes(q) || nom.includes(q) || cuil.includes(q) || dom.includes(q) || loc.includes(q) || cel.includes(q) || mail.includes(q);
      });
    }

    // Ordenamiento
    lista.sort((a, b) => {
      let va = a[this.columnaOrden];
      let vb = b[this.columnaOrden];

      if (this.columnaOrden === "legajo" || this.columnaOrden === "orden_sabana") {
        va = parseInt(String(va).replace(/\D/g, '') || "0", 10);
        vb = parseInt(String(vb).replace(/\D/g, '') || "0", 10);
      } else if (this.columnaOrden.includes("ingreso") || this.columnaOrden.includes("nacimiento")) {
        const da = parseFechaISO(va) || "";
        const db = parseFechaISO(vb) || "";
        // Política NULLS LAST: agentes sin fecha van siempre al final
        if (!da && !db) {
          const apeA = String(a.apellido || "").toLowerCase();
          const apeB = String(b.apellido || "").toLowerCase();
          return apeA.localeCompare(apeB);
        }
        if (!da) return 1;
        if (!db) return -1;
        va = da;
        vb = db;
      } else {
        va = String(va || "").toLowerCase();
        vb = String(vb || "").toLowerCase();
      }

      if (va < vb) return this.ordenAscendente ? -1 : 1;
      if (va > vb) return this.ordenAscendente ? 1 : -1;

      // Desempate secundario por apellido y nombre
      const apeA = String(a.apellido || "").toLowerCase();
      const apeB = String(b.apellido || "").toLowerCase();
      return apeA.localeCompare(apeB);
    });

    return lista;
  }

  renderTabla() {
    const tableCont = this.container.querySelector("#pers-table-container");
    if (!tableCont) return;

    const lista = this.obtenerAgentesFiltradosYOrdenados();

    let html = `
      <table class="data-table">
        <thead>
          <tr>
            <th class="sticky-col-1 sortable" data-col="legajo">Legajo ${this.renderFlecha("legajo")}</th>
            <th class="sticky-col-2 sortable" data-col="apellido">Apellido y Nombre ${this.renderFlecha("apellido")}</th>
            <th class="sortable" data-col="categoria">Categoría ${this.renderFlecha("categoria")}</th>
            <th class="sortable" data-col="sector_actual">Sector ${this.renderFlecha("sector_actual")}</th>
            <th class="sortable" data-col="grupo_sap_actual">Grupo SAP ${this.renderFlecha("grupo_sap_actual")}</th>
            <th class="sortable" data-col="domicilio">Dirección ${this.renderFlecha("domicilio")}</th>
            <th class="sortable" data-col="localidad">Localidad ${this.renderFlecha("localidad")}</th>
            <th class="sortable" data-col="ingreso_pct">Ingreso PCT ${this.renderFlecha("ingreso_pct")}</th>
            <th class="sortable" data-col="ingreso_empresa">Ingreso Empresa ${this.renderFlecha("ingreso_empresa")}</th>
            <th class="sortable" data-col="fecha_nacimiento">Fecha Nac. ${this.renderFlecha("fecha_nacimiento")}</th>
            <th>Celular</th>
            <th>Tel. Emergencia</th>
            <th>CUIL</th>
            <th>Email</th>
            <th style="text-align: center;">Estado</th>
            <th style="text-align: center;">Acciones</th>
          </tr>
        </thead>
        <tbody>
    `;

    if (lista.length === 0) {
      html += `<tr><td colspan="16" style="text-align: center; padding: 30px; color: var(--text-muted);">No se encontraron agentes con los filtros indicados.</td></tr>`;
    } else {
      lista.forEach(p => {
        const leg = String(p.legajo).trim();
        const activo = p.activo !== false;
        html += `
          <tr style="${!activo ? 'opacity: 0.6; background-color: #f1f5f9;' : ''}">
            <td class="sticky-col-1" style="font-weight: 700;">${leg}</td>
            <td class="sticky-col-2"><b>${p.apellido}</b>, ${p.nombre}</td>
            <td>${p.categoria || '—'}</td>
            <td>${p.sector_actual || '—'}</td>
            <td><b>${p.grupo_sap_actual || '—'}</b></td>
            <td>${p.domicilio || '—'}</td>
            <td>${p.localidad || '—'}</td>
            <td>${p.ingreso_pct ? parseFechaISO(p.ingreso_pct) : '—'}</td>
            <td>${p.ingreso_empresa ? parseFechaISO(p.ingreso_empresa) : '—'}</td>
            <td>${p.fecha_nacimiento ? parseFechaISO(p.fecha_nacimiento) : '—'}</td>
            <td>${p.celular || '—'}</td>
            <td>${p.telefono_emergencia || '—'}</td>
            <td>${p.cuil || '—'}</td>
            <td>${p.mail || '—'}</td>
            <td style="text-align: center;">
              <span class="brand-badge" style="background-color: ${activo ? '#16a34a' : '#94a3b8'};">
                ${activo ? 'ACTIVO' : 'INACTIVO'}
              </span>
            </td>
            <td style="text-align: center; white-space: nowrap;">
              <button class="btn btn-secondary btn-pill btn-editar-agente" data-legajo="${leg}">✏️ Editar</button>
            </td>
          </tr>
        `;
      });
    }

    html += `</tbody></table>`;
    tableCont.innerHTML = html;

    this.attachTableEvents();
  }

  renderFlecha(col) {
    if (this.columnaOrden !== col) return "↕";
    return this.ordenAscendente ? "▲" : "▼";
  }

  attachEvents() {
    const inpBuscar = this.container.querySelector("#inp-pers-buscar");
    const selSec = this.container.querySelector("#sel-pers-sector");
    const selGrp = this.container.querySelector("#sel-pers-grupo");
    const chkInactivos = this.container.querySelector("#chk-pers-inactivos");
    const btnNuevo = this.container.querySelector("#btn-pers-nuevo");

    if (inpBuscar) inpBuscar.addEventListener("input", (e) => { this.filtroTexto = e.target.value; this.renderTabla(); });
    if (selSec) selSec.addEventListener("change", (e) => { this.filtroSector = e.target.value; this.renderTabla(); });
    if (selGrp) selGrp.addEventListener("change", (e) => { this.filtroGrupo = e.target.value; this.renderTabla(); });
    if (chkInactivos) chkInactivos.addEventListener("change", (e) => { this.mostrarInactivos = e.target.checked; this.renderTabla(); });

    if (btnNuevo) btnNuevo.addEventListener("click", () => this.abrirModalCRUD(null));

    // Modal eventos
    const modal = this.container.querySelector("#modal-crud-personal");
    const btnCerrar = this.container.querySelector("#btn-cerrar-modal-personal");
    const btnCancelar = this.container.querySelector("#btn-cancelar-modal-personal");
    const btnGuardar = this.container.querySelector("#btn-guardar-modal-personal");

    const cerrar = () => modal.classList.remove("active");
    if (btnCerrar) btnCerrar.addEventListener("click", cerrar);
    if (btnCancelar) btnCancelar.addEventListener("click", cerrar);
    if (btnGuardar) btnGuardar.addEventListener("click", () => this.guardarAgente());
  }

  attachTableEvents() {
    // Ordenar por columnas
    this.container.querySelectorAll("th.sortable").forEach(th => {
      th.addEventListener("click", () => {
        const col = th.dataset.col;
        if (this.columnaOrden === col) {
          this.ordenAscendente = !this.ordenAscendente;
        } else {
          this.columnaOrden = col;
          this.ordenAscendente = true;
        }
        this.renderTabla();
      });
    });

    // Botones de edición
    this.container.querySelectorAll(".btn-editar-agente").forEach(btn => {
      btn.addEventListener("click", () => {
        const leg = btn.dataset.legajo;
        const ag = this.store.personal.find(p => String(p.legajo).trim() === leg);
        if (ag) this.abrirModalCRUD(ag);
      });
    });
  }

  abrirModalCRUD(agente) {
    if (!this.store.tienePermiso('personal', agente ? 'editar' : 'crear')) {
      alert("No tenés permisos para realizar esta operación.");
      return;
    }

    this.agenteEnEdicion = agente;
    const modal = this.container.querySelector("#modal-crud-personal");
    const titulo = this.container.querySelector("#modal-pers-titulo");

    const inpLeg = this.container.querySelector("#pers-form-legajo");
    const inpCuil = this.container.querySelector("#pers-form-cuil");
    const inpApe = this.container.querySelector("#pers-form-apellido");
    const inpNom = this.container.querySelector("#pers-form-nombre");
    const selCat = this.container.querySelector("#pers-form-categoria");
    const selSec = this.container.querySelector("#pers-form-sector");
    const selGrp = this.container.querySelector("#pers-form-grupo");
    const inpNac = this.container.querySelector("#pers-form-nacimiento");
    const inpEmp = this.container.querySelector("#pers-form-ingreso-empresa");
    const inpPct = this.container.querySelector("#pers-form-ingreso-pct");
    const inpCel = this.container.querySelector("#pers-form-celular");
    const inpEmerg = this.container.querySelector("#pers-form-emergencia");
    const inpMail = this.container.querySelector("#pers-form-mail");
    const inpLoc = this.container.querySelector("#pers-form-localidad");
    const inpDom = this.container.querySelector("#pers-form-domicilio");
    const chkActivo = this.container.querySelector("#pers-form-activo");

    // 1. Poblar categorías oficiales jerárquicas desde categorias_personal
    let cats = [...this.store.categorias];
    if (cats.length === 0) {
      cats = [
        "Jefe Depto 1ra", "Jefe Depto 2da", "Jefe División 1ra", "Jefe División 2da",
        "Jefe Sección 1ra", "Jefe Sección 2da", "Supervisor Especializado",
        "Sup. Especializado CCPT", "Supervisor", "Oficial Especializado", "Oficial",
        "Operario Especializado", "Operario"
      ];
    }

    // Si el agente tiene un valor histórico que no está en la lista oficial, preservarlo
    if (agente && agente.categoria && !cats.includes(agente.categoria)) {
      cats.unshift(agente.categoria);
    }

    selCat.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');

    // 2. Poblar Sectores dinámicamente (asegurando el sector del agente)
    let sectores = [...this.store.sectores];
    if (sectores.length === 0) {
      sectores = [
        "Puesto Control", "Control Elect", "Control A", "Control B",
        "Elementos Traccion", "Elementos Elect"
      ];
    }
    if (agente && agente.sector_actual && !sectores.includes(agente.sector_actual)) {
      sectores.unshift(agente.sector_actual);
    }
    selSec.innerHTML = sectores.map(s => `<option value="${s}">${s}</option>`).join('');

    // 3. Poblar Grupos SAP dinámicamente
    const turnosArr = Array.from(this.store.turnos.values());
    selGrp.innerHTML = `<option value="">-- Sin asignar --</option>` + turnosArr.map(t => `
      <option value="${t.codigo_sap}">[${t.codigo_sap}] ${t.descripcion || t.etiqueta_corta}</option>
    `).join('');

    if (agente) {
      titulo.textContent = `Editar Agente [${agente.legajo}]`;
      inpLeg.value = agente.legajo;
      inpLeg.disabled = true;
      inpCuil.value = agente.cuil || "";
      inpApe.value = agente.apellido || "";
      inpNom.value = agente.nombre || "";
      selCat.value = agente.categoria || cats[0];
      selSec.value = agente.sector_actual || (sectores[0] || "");
      selGrp.value = agente.grupo_sap_actual || "";
      inpNac.value = parseFechaISO(agente.fecha_nacimiento);
      inpEmp.value = parseFechaISO(agente.ingreso_empresa);
      inpPct.value = parseFechaISO(agente.ingreso_pct);
      inpCel.value = agente.celular || "";
      inpEmerg.value = agente.telefono_emergencia || "";
      inpMail.value = agente.mail || "";
      inpLoc.value = agente.localidad || "";
      inpDom.value = agente.domicilio || "";
      chkActivo.checked = agente.activo !== false;
    } else {
      titulo.textContent = "Alta de Personal";
      inpLeg.disabled = false;
      inpLeg.value = "";
      inpCuil.value = "";
      inpApe.value = "";
      inpNom.value = "";
      selCat.selectedIndex = 0;
      selSec.selectedIndex = 0;
      selGrp.value = "";
      inpNac.value = "";
      inpEmp.value = "";
      inpPct.value = "";
      inpCel.value = "";
      inpEmerg.value = "";
      inpMail.value = "";
      inpLoc.value = "";
      inpDom.value = "";
      chkActivo.checked = true;
    }

    modal.classList.add("active");
  }

  async guardarAgente() {
    const inpLeg = this.container.querySelector("#pers-form-legajo");
    const inpCuil = this.container.querySelector("#pers-form-cuil");
    const inpApe = this.container.querySelector("#pers-form-apellido");
    const inpNom = this.container.querySelector("#pers-form-nombre");
    const selCat = this.container.querySelector("#pers-form-categoria");
    const selSec = this.container.querySelector("#pers-form-sector");
    const selGrp = this.container.querySelector("#pers-form-grupo");
    const inpNac = this.container.querySelector("#pers-form-nacimiento");
    const inpEmp = this.container.querySelector("#pers-form-ingreso-empresa");
    const inpPct = this.container.querySelector("#pers-form-ingreso-pct");
    const inpCel = this.container.querySelector("#pers-form-celular");
    const inpEmerg = this.container.querySelector("#pers-form-emergencia");
    const inpMail = this.container.querySelector("#pers-form-mail");
    const inpLoc = this.container.querySelector("#pers-form-localidad");
    const inpDom = this.container.querySelector("#pers-form-domicilio");
    const chkActivo = this.container.querySelector("#pers-form-activo");

    const legajo = inpLeg.value.trim();
    const apellido = inpApe.value.trim();
    const nombre = inpNom.value.trim();

    if (!legajo) {
      alert("Por favor indicá el legajo.");
      return;
    }
    if (!apellido || !nombre) {
      alert("Por favor indicá Apellido y Nombre.");
      return;
    }

    const payload = {
      legajo: legajo,
      cuil: inpCuil.value.trim() || null,
      apellido: apellido,
      nombre: nombre,
      categoria: selCat.value,
      sector_actual: selSec.value,
      grupo_sap_actual: selGrp.value || null,
      fecha_nacimiento: inpNac.value || null,
      ingreso_empresa: inpEmp.value || null,
      ingreso_pct: inpPct.value || null,
      celular: inpCel.value.trim() || null,
      telefono_emergencia: inpEmerg.value.trim() || null,
      mail: inpMail.value.trim() || null,
      localidad: inpLoc.value.trim() || null,
      domicilio: inpDom.value.trim() || null,
      activo: chkActivo.checked,
      sync_status: 'synced',
      updated_at: new Date().toISOString()
    };

    const client = getSupabaseClient();

    try {
      if (this.agenteEnEdicion) {
        // UPDATE
        const { data, error } = await client
          .from('personal')
          .update(payload)
          .eq('legajo', this.agenteEnEdicion.legajo)
          .select();

        if (error) throw error;
        if (data && data.length > 0) {
          const idx = this.store.personal.findIndex(p => p.legajo === this.agenteEnEdicion.legajo);
          if (idx !== -1) this.store.personal[idx] = data[0];
          await this.store.auditar('personal', 'EDICIÓN', legajo, this.agenteEnEdicion, data[0]);
        }
      } else {
        // INSERT
        // Chequear duplicado
        if (this.store.personal.some(p => p.legajo === legajo)) {
          alert(`Ya existe un agente con el legajo ${legajo}.`);
          return;
        }

        payload.created_at = new Date().toISOString();
        const { data, error } = await client
          .from('personal')
          .insert(payload)
          .select();

        if (error) throw error;
        if (data && data.length > 0) {
          this.store.personal.push(data[0]);
          await this.store.auditar('personal', 'CREACIÓN', legajo, null, data[0]);
        }
      }

      this.store.guardarCacheLocal();
      this.container.querySelector("#modal-crud-personal").classList.remove("active");
      this.renderTabla();
      alert("Agente guardado exitosamente.");
    } catch (err) {
      alert(`Error al guardar agente: ${err.message}`);
    }
  }

  refrescar() {
    this.renderTabla();
  }
}
