/**
 * combobox.js - Componente de Selector Buscable Integrado (Vanilla JS)
 * y Utilidad de Ocultamiento Dinámico de Columnas en Móvil.
 */

export class ComboboxSelect {
  /**
   * @param {HTMLSelectElement} selectEl - El elemento select nativo a transformar.
   * @param {Object} options
   * @param {string} [options.placeholder] - Texto por defecto del buscador.
   * @param {Function} [options.onSelect] - Callback al elegir una opción.
   */
  constructor(selectEl, options = {}) {
    if (!selectEl) return;
    this.selectEl = selectEl;
    this.placeholder = options.placeholder || 'Buscar o seleccionar...';
    this.onSelect = options.onSelect || null;
    this.wrapper = null;
    this.inputEl = null;
    this.dropdownEl = null;
    this.isOpen = false;

    this.init();
  }

  init() {
    // Si ya fue inicializado, evitar duplicar
    if (this.selectEl.dataset.comboboxInitialized === 'true') {
      this.actualizar();
      return;
    }

    // Ocultar select original pero mantenerlo en el DOM para formularios y eventos
    this.selectEl.style.display = 'none';
    this.selectEl.dataset.comboboxInitialized = 'true';

    // Contenedor principal del combobox
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'combobox-wrapper';

    // Campo de entrada / display
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = 'combobox-input form-control';
    this.inputEl.autocomplete = 'off';
    this.inputEl.spellcheck = false;
    this.inputEl.placeholder = this.placeholder;

    // Menú desplegable flotante
    this.dropdownEl = document.createElement('div');
    this.dropdownEl.className = 'combobox-dropdown';

    this.wrapper.appendChild(this.inputEl);
    this.wrapper.appendChild(this.dropdownEl);

    // Insertar el wrapper justo después del select original
    this.selectEl.parentNode.insertBefore(this.wrapper, this.selectEl.nextSibling);

    this.bindEvents();
    this.actualizar();
  }

  bindEvents() {
    // Abrir al hacer focus o click
    this.inputEl.addEventListener('focus', () => {
      this.abrir();
      this.inputEl.select();
    });

    this.inputEl.addEventListener('click', () => {
      if (!this.isOpen) this.abrir();
    });

    // Filtrar opciones en tiempo real mientras tipea
    this.inputEl.addEventListener('input', () => {
      if (!this.isOpen) this.abrir();
      this.filtrar(this.inputEl.value);
    });

    // Cerrar al hacer click fuera
    document.addEventListener('click', (e) => {
      if (!this.wrapper.contains(e.target)) {
        this.cerrar();
        if (this.inputEl.value.trim() === '') {
          const optVacia = Array.from(this.selectEl.options).find(o => !o.value);
          if (optVacia) {
            this.seleccionarOpcion(optVacia.value);
            return;
          }
        }
        // Restaurar el texto de la opción seleccionada actualmente si el usuario no eligió ninguna
        this.sincronizarDesdeSelect();
      }
    });

    // Soporte de navegación por teclado básica
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.cerrar();
        this.sincronizarDesdeSelect();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.inputEl.value.trim() === '') {
          const optVacia = Array.from(this.selectEl.options).find(o => !o.value);
          if (optVacia) {
            this.seleccionarOpcion(optVacia.value);
            return;
          }
        }
        const primeraVisible = this.dropdownEl.querySelector('.combobox-option:not([style*="display: none"])');
        if (primeraVisible) {
          this.seleccionarOpcion(primeraVisible.dataset.value);
        }
      }
    });

    // Si cambia el select externamente
    this.selectEl.addEventListener('change', () => {
      this.sincronizarDesdeSelect();
    });
  }

  abrir() {
    this.isOpen = true;
    this.dropdownEl.classList.add('open');
    this.filtrar(this.inputEl.value);
  }

  cerrar() {
    this.isOpen = false;
    this.dropdownEl.classList.remove('open');
  }

  actualizar() {
    this.dropdownEl.innerHTML = '';
    const options = Array.from(this.selectEl.options);

    options.forEach((opt) => {
      if (!opt.value && opt.text.trim().startsWith('--') && !opt.text.toLowerCase().includes('ninguno')) {
        // Opción placeholder inicial si existe
        return;
      }
      const item = document.createElement('div');
      item.className = 'combobox-option';
      item.dataset.value = opt.value;
      item.textContent = opt.text;

      // Preservar atributos de datos relevantes si los tiene (ej: sap, color)
      if (opt.dataset.sap) item.dataset.sap = opt.dataset.sap;
      if (opt.dataset.color) item.dataset.color = opt.dataset.color;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.seleccionarOpcion(opt.value);
      });

      this.dropdownEl.appendChild(item);
    });

    this.sincronizarDesdeSelect();
  }

  filtrar(texto) {
    const term = (texto || '').toLowerCase().trim();
    const items = this.dropdownEl.querySelectorAll('.combobox-option');
    let encontrados = 0;

    items.forEach((item) => {
      const match = !term || item.textContent.toLowerCase().includes(term);
      item.style.display = match ? 'block' : 'none';
      if (match) encontrados++;
    });

    let noResults = this.dropdownEl.querySelector('.combobox-no-results');
    if (encontrados === 0) {
      if (!noResults) {
        noResults = document.createElement('div');
        noResults.className = 'combobox-no-results';
        noResults.textContent = 'Sin resultados';
        this.dropdownEl.appendChild(noResults);
      }
      noResults.style.display = 'block';
    } else if (noResults) {
      noResults.style.display = 'none';
    }
  }

  seleccionarOpcion(valor) {
    this.selectEl.value = valor;
    this.sincronizarDesdeSelect();
    this.cerrar();

    // Disparar evento change en el select original para ejecutar handlers existentes
    const ev = new Event('change', { bubbles: true });
    this.selectEl.dispatchEvent(ev);

    if (typeof this.onSelect === 'function') {
      this.onSelect(valor, this.selectEl.selectedOptions[0]);
    }
  }

  sincronizarDesdeSelect() {
    const selOpt = this.selectEl.selectedOptions[0];
    if (selOpt && selOpt.value) {
      this.inputEl.value = selOpt.text.trim();
    } else if (selOpt && selOpt.text && selOpt.text.toLowerCase().includes('ninguno')) {
      this.inputEl.value = selOpt.text.trim();
    } else {
      this.inputEl.value = '';
      this.inputEl.placeholder = this.placeholder;
    }
  }
}

/**
 * Habilita el ocultamiento inteligente de la primera columna (.sticky-col-1)
 * cuando el usuario se desplaza horizontalmente hacia la derecha en dispositivos móviles (<= 768px),
 * anclando la segunda columna (.sticky-col-2) al borde izquierdo.
 *
 * @param {HTMLElement} tableContainer - Contenedor con overflow-x de la tabla.
 */
export function habilitarOcultarLegajoEnScroll(tableContainer) {
  if (!tableContainer) return;
  
  // Evitar vincular más de una vez al mismo contenedor
  if (tableContainer.dataset.scrollColapsoInit === 'true') return;
  tableContainer.dataset.scrollColapsoInit = 'true';

  tableContainer.addEventListener('scroll', () => {
    if (window.innerWidth <= 768) {
      if (tableContainer.scrollLeft > 25) {
        tableContainer.classList.add('hide-legajo');
      } else if (tableContainer.scrollLeft <= 15) {
        tableContainer.classList.remove('hide-legajo');
      }
    } else {
      tableContainer.classList.remove('hide-legajo');
    }
  }, { passive: true });
}
