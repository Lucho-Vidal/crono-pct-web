// engine_turnos.js - Motor de Cálculo de Rotación SAP, Novedades y Diagramador
// Réplica idéntica a la lógica del sistema de escritorio CRONO-PCT

export function expandirCiclo(bloquesCiclo) {
  if (!bloquesCiclo) return [];
  let bloques = bloquesCiclo;
  if (typeof bloques === 'string') {
    try {
      bloques = JSON.parse(bloques);
    } catch (e) {
      return [];
    }
  }
  if (!Array.isArray(bloques)) return [];

  const salida = [];
  for (const b of bloques) {
    const val = b.valor || "";
    const cant = parseInt(b.dias, 10) || 0;
    for (let i = 0; i < cant; i++) {
      salida.push(val);
    }
  }
  return salida;
}

export function parseFechaISO(fecha) {
  if (!fecha) return "";
  if (typeof fecha === 'string') {
    const clean = fecha.trim().split('T')[0];
    if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3 && parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    return clean;
  }
  if (fecha instanceof Date) {
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return "";
}

export function diasDiferenciaUTC(fechaIniStr, fechaFinStr) {
  const f1 = parseFechaISO(fechaIniStr);
  const f2 = parseFechaISO(fechaFinStr);
  if (!f1 || !f2) return 0;
  const d1 = Date.UTC(parseInt(f1.slice(0, 4), 10), parseInt(f1.slice(5, 7), 10) - 1, parseInt(f1.slice(8, 10), 10));
  const d2 = Date.UTC(parseInt(f2.slice(0, 4), 10), parseInt(f2.slice(5, 7), 10) - 1, parseInt(f2.slice(8, 10), 10));
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

export function valorEnCiclo(turno, fechaStr) {
  if (!turno) return "";
  const bloques = turno.bloques_ciclo;
  const seq = expandirCiclo(bloques);
  if (!seq || seq.length === 0) return "";

  const ancla = parseFechaISO(turno.fecha_ancla);
  if (!ancla) return "";

  const diff = diasDiferenciaUTC(ancla, fechaStr);
  const len = seq.length;
  const idx = ((diff % len) + len) % len;
  return seq[idx];
}

export function asignacionEn(legajo, fechaStr, store) {
  const l = String(legajo).trim();
  const f = parseFechaISO(fechaStr);

  // 1. Buscar en historial_asignaciones
  if (store.historial && store.historial.length > 0) {
    for (const h of store.historial) {
      if (String(h.legajo).trim() === l) {
        const desde = parseFechaISO(h.fecha_desde);
        const hasta = h.fecha_hasta ? parseFechaISO(h.fecha_hasta) : null;
        if (desde <= f && (!hasta || hasta >= f)) {
          return {
            codigo_sap: h.codigo_sap,
            sector: h.sector
          };
        }
      }
    }
  }

  // 2. Asignación actual en personal
  const a = store.personal.find(p => String(p.legajo).trim() === l);
  if (a) {
    return {
      codigo_sap: a.grupo_sap_actual || "",
      sector: a.sector_actual || ""
    };
  }

  return { codigo_sap: "", sector: "" };
}

export function obtenerColorMotivo(motivo, tipoColor, colorHex, store) {
  if (colorHex && colorHex.trim()) {
    return colorHex.trim();
  }
  const m = String(motivo || "").trim().toLowerCase();
  const cat = store.catalogo_motivos.find(x => x.valor && x.valor.trim().toLowerCase() === m);
  if (cat && cat.color_hex) {
    return cat.color_hex;
  }
  // Colores estándar por tipo
  const tipo = String(tipoColor || "").toLowerCase();
  if (tipo === "franco" || m === "franco") return "#fde9d9";
  if (tipo === "noche" || m.includes("22 a 06")) return "#ddd9c4";
  if (tipo === "cambio") return "#daeef3";
  if (tipo === "licencia" || m.includes("licencia") || m.includes("vacaciones")) return "#ffff00";
  return "#e2e8f0";
}

// Cálculo maestro de celda de Sábana
export function calcularCelda(legajo, fechaStr, store) {
  const l = String(legajo).trim();
  const f = parseFechaISO(fechaStr);

  // Buscar novedades activas del legajo en esta fecha
  const novs = store.novedades.filter(n => {
    if (!n.activo) return false;
    if (String(n.legajo).trim() !== l) return false;
    const ini = parseFechaISO(n.fecha_inicio);
    const fin = parseFechaISO(n.fecha_fin);
    return ini <= f && fin >= f;
  });

  if (novs && novs.length > 0) {
    // 1. Prioridad 1: Novedad puntual (sin codigo_sap_temporal)
    const puntual = novs.slice().reverse().find(n => !n.codigo_sap_temporal);
    if (puntual) {
      let texto = puntual.motivo || "";
      if (texto.toLowerCase() === "licencia anual") texto = "LA";
      else if (texto.toLowerCase() === "franco") texto = "F";

      const bg = obtenerColorMotivo(puntual.motivo, puntual.tipo_color, puntual.color_hex, store);
      return {
        texto: texto,
        bg: bg,
        color_hex: bg,
        tipo: puntual.tipo_color || "licencia",
        novedad: puntual
      };
    }

    // 2. Prioridad 2: Cobertura temporal por Turno SAP (con francos rotativos 'F')
    const temporal = novs.slice().reverse().find(n => Boolean(n.codigo_sap_temporal));
    if (temporal) {
      const codTurno = temporal.codigo_sap_temporal;
      const turnoTemp = store.turnos.get(codTurno);
      const val = valorEnCiclo(turnoTemp, f);
      const esFranco = val.toLowerCase() === "franco";
      const texto = esFranco ? "F" : val;
      const bg = esFranco ? "#fde9d9" : (val.includes("22 a 06") ? "#ddd9c4" : "#daeef3");
      return {
        texto: texto,
        bg: bg,
        color_hex: bg,
        tipo: esFranco ? "franco" : "temporal",
        novedad: temporal
      };
    }
  }

  // 3. Prioridad 3: Asignación habitual de turno SAP
  const asig = asignacionEn(l, f, store);
  const turno = store.turnos.get(asig.codigo_sap);
  const val = valorEnCiclo(turno, f);

  if (!val) {
    return { texto: "", bg: "#ffffff", color_hex: "#ffffff", tipo: "vacio", novedad: null };
  }

  const esFranco = val.toLowerCase() === "franco";
  if (esFranco) {
    return { texto: "F", bg: "#fde9d9", color_hex: "#fde9d9", tipo: "franco", novedad: null };
  }

  if (val.includes("22 a 06")) {
    return { texto: val, bg: "#ddd9c4", color_hex: "#ddd9c4", tipo: "noche", novedad: null };
  }

  return { texto: val, bg: "#ffffff", color_hex: "#ffffff", tipo: "normal", novedad: null };
}

// Cálculo para Diagramador de Vacaciones
export function calcularCeldaDiagramador(legajo, fechaStr, store) {
  const celda = calcularCelda(legajo, fechaStr, store);
  const t = (celda.texto || "").trim();

  // Si tiene vacación / Licencia Anual
  if (t === "LA" || (celda.novedad && celda.novedad.motivo && celda.novedad.motivo.toLowerCase().includes("licencia anual"))) {
    return { texto: "LA", bg: "#ffff00", esVacacion: true };
  }

  // Si está de Franco
  if (t === "F" || celda.tipo === "franco") {
    return { texto: "F", bg: "#fde9d9", esVacacion: false };
  }

  // Si es un horario laboral, extraer los 2 primeros dígitos de la hora de entrada
  const match = t.match(/^(\d{1,2})/);
  if (match) {
    const dosDigitos = match[1].padStart(2, '0');
    return { texto: dosDigitos, bg: "#f8fafc", esVacacion: false };
  }

  return { texto: t || "-", bg: "#ffffff", esVacacion: false };
}
