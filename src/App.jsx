import React, { useState, useMemo, useRef, useEffect } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import logoVitalicio from "./assets/logo-vitalicio.png";

/* ─────────────────────────────────────────────────────────────
   Paleta y tipografía
   La pantalla de conteo imita una báscula de bodega: dígitos
   oscuros sobre LCD verde pálido. Es el ancla visual de la app.
   ───────────────────────────────────────────────────────────── */
/* html5-qrcode inyecta su propio <video> con estilos inline
   (ancho/alto según la resolución de la cámara, no según el
   contenedor). Esta regla fuerza a que ese video —y el recuadro
   de escaneo que dibuja encima— llenen exactamente el div
   #lector-camara sin desbordarse hacia el resto de la pantalla. */
const ESTILO_LECTOR = `
  #lector-camara video {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
  }
  #lector-camara__scan_region {
    width: 100% !important;
    height: 100% !important;
  }
`;

/* Paleta de marca — Restaurant Vitalicio.
   Azul marino y beige son los colores dominantes del logo; el
   dorado se reserva para acentos de jerarquía alta (títulos,
   links, insignias), nunca para texto de cuerpo — a ese nivel de
   saturación cansa la vista en párrafos largos.

   Las alertas de negocio (alerta/ok) se mantienen en rojo/verde
   puro a propósito: si se acercan demasiado al dorado, pierden la
   función de corte visual que necesitan en una pantalla de conteo
   donde alguien tiene que decidir en un vistazo si algo requiere
   atención. */
const C = {
  papel: "#EFEDE4",       // fondo general de la app — beige claro, igual que antes
  papel2: "#E4E1D4",       // fondo secundario / tarjetas
  tinta: "#171C1A",        // texto principal sobre fondo claro
  suave: "#71776E",        // texto secundario / metadatos
  carbon: "#0D1B2E",       // azul marino de marca — botones sólidos, headers, login
  carbon2: "#16283F",      // variante un poco más clara del marino, para hover/bordes sobre azul
  lcd: "#C3D2BC",
  lcdInk: "#131A15",
  alerta: "#A83A22",       // se mantiene rojo puro — es alerta de negocio, no decoración
  ok: "#3B6B4A",           // se mantiene verde puro, mismo motivo
  ambar: "#9C7A2E",
  dorado: "#C9A65C",       // acento de marca — títulos, links, detalles sobre azul marino
  beige: "#A99A72",        // beige verdoso del fondo del logo, para paneles con carácter de marca
  linea: "#D2CEBF",
};

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SANS =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
/* Serif de acento para títulos grandes en login/headers — evoca el
   carácter del logo sin depender de una fuente cursiva difícil de
   leer en tamaños chicos. Se usa con moderación, nunca en cuerpo
   de texto ni en la pantalla de conteo. */
const SERIF =
  "'Playfair Display', Georgia, 'Times New Roman', serif";

/* ─────────────────────────────────────────────────────────────
   Datos de ejemplo

   MODELO: un insumo vive en `stock: {area: cantidad}` — múltiples
   bodegas/zonas a la vez, cada una con su propio saldo teórico.
   El código de barra/QR se genera a partir del `id` único del
   insumo, así que sirve igual sin importar en qué bodega se
   escanea.
   ───────────────────────────────────────────────────────────── */
/* Semilla inicial de áreas/bodegas. Pasa a vivir en estado dentro
   de App porque ahora se pueden crear zonas nuevas en runtime. */
const AREAS_INICIALES = [
  "Bodega central",
  "Cocina caliente",
  "Cocina fría",
  "Barra",
  "Pastelería",
];

const INSUMOS_INICIALES = [
  { id: "CAR-001", nombre: "Lomo vetado", cat: "Carnes", u: "kg", costo: 9800, clase: "A", tol: 1, stock: { "Bodega central": 12.4, "Cocina caliente": 2.1 }, codigoGenerado: true },
  { id: "ABA-014", nombre: "Harina sin polvos 25 kg", cat: "Abarrotes", u: "saco", costo: 21500, clase: "B", tol: 3, stock: { "Bodega central": 4, "Pastelería": 1.5 }, codigoGenerado: true },
  { id: "ABA-031", nombre: "Aceite de oliva 5 L", cat: "Abarrotes", u: "bidón", costo: 34900, clase: "A", tol: 1, stock: { "Bodega central": 6 }, codigoGenerado: false },
  { id: "LAC-008", nombre: "Mantequilla sin sal", cat: "Lácteos", u: "kg", costo: 8200, clase: "A", tol: 2, stock: { "Cocina caliente": 5.5 }, codigoGenerado: true },
  { id: "PRE-002", nombre: "Fondo de ave", cat: "Preparados", u: "L", costo: 3100, clase: "B", tol: 5, stock: { "Cocina caliente": 9 }, codigoGenerado: false },
  { id: "LAC-021", nombre: "Queso parmesano", cat: "Lácteos", u: "kg", costo: 18400, clase: "A", tol: 2, stock: { "Cocina caliente": 2.8 }, codigoGenerado: true },
  { id: "PES-005", nombre: "Filete de salmón", cat: "Pescados", u: "kg", costo: 14200, clase: "A", tol: 1, stock: { "Cocina fría": 7.2 }, codigoGenerado: false },
  { id: "VER-011", nombre: "Tomate", cat: "Verduras", u: "kg", costo: 1450, clase: "C", tol: 8, stock: { "Cocina fría": 14, "Bodega central": 22, "Barra": 1.2 }, codigoGenerado: true },
  { id: "VER-003", nombre: "Palta Hass", cat: "Verduras", u: "kg", costo: 4600, clase: "B", tol: 5, stock: { "Cocina fría": 6.5 }, codigoGenerado: false },
  { id: "LIC-007", nombre: "Pisco 40°", cat: "Licores", u: "botella", costo: 11900, clase: "A", tol: 1, stock: { "Barra": 8.4 }, codigoGenerado: true },
  { id: "LIC-019", nombre: "Vino tinto reserva", cat: "Licores", u: "botella", costo: 7800, clase: "A", tol: 1, stock: { "Barra": 22 }, codigoGenerado: true },
  { id: "BEB-004", nombre: "Cerveza artesanal", cat: "Bebidas", u: "botella", costo: 1900, clase: "B", tol: 3, stock: { "Barra": 48 }, codigoGenerado: false },
  { id: "PAS-012", nombre: "Chocolate cobertura 70%", cat: "Pastelería", u: "kg", costo: 13600, clase: "A", tol: 2, stock: { "Pastelería": 3.2 }, codigoGenerado: false },
  { id: "LAC-030", nombre: "Crema 35%", cat: "Lácteos", u: "L", costo: 4300, clase: "B", tol: 4, stock: { "Pastelería": 8 }, codigoGenerado: false },
];

/* Listado FIJO de lo que cada área puede pedir. Es un subconjunto
   de las áreas donde el insumo tiene stock — bodega decide cuáles
   de esas áreas realmente lo piden (vs. solo se cuenta ahí). */
const ASIGNADO_POR_AREA = {
  "Cocina caliente": ["LAC-008", "PRE-002", "LAC-021", "CAR-001"],
  "Cocina fría": ["PES-005", "VER-011", "VER-003"],
  "Barra": ["LIC-007", "LIC-019", "BEB-004"],
  "Pastelería": ["PAS-012", "LAC-030", "ABA-014"],
};

/* Filas de ejemplo para el importador masivo. */
const CSV_DEMO = `sku,nombre,categoria,unidad,costo,area
CAR-002,Osobuco,Carnes,kg,7200,Cocina caliente
VER-020,Cebolla morada,Verduras,kg,900,Cocina fría
LIC-025,Ron añejo,Licores,botella,,Barra
ABA-040,Sal de mar,Abarrotes,kg,650,Bodega central
PES-011,Camarón ecuatoriano,Pescados,kg,15800,Cocina fría zzz
LAC-045,Yogurt natural,Lácteos,L,2100,Pastelería`;

/* Histórico de ejemplo: conteos cerrados y solicitudes previas,
   para que la pantalla no se vea vacía en la demo. */
const HISTORICO_INICIAL = [
  {
    tipo: "conteo",
    id: "CNT-0091",
    area: "Cocina fría",
    fecha: "22 jul · 18:04",
    precision: 88,
    desviacionNeta: -29900,
    desviacionAbs: 34500,
    items: [
      { nombre: "Filete de salmón", contado: 6.8, teorico: 7.2, u: "kg" },
      { nombre: "Tomate", contado: 15.5, teorico: 14, u: "kg" },
      { nombre: "Palta Hass", contado: 3.9, teorico: 6.5, u: "kg" },
    ],
  },
  {
    tipo: "solicitud",
    id: "SOL-0138",
    area: "Pastelería",
    fecha: "21 jul · 09:12",
    estado: "despachada",
    items: [
      { nombre: "Crema 35%", pedido: 6, enviado: 6, u: "L" },
      { nombre: "Chocolate cobertura 70%", pedido: 2, enviado: 1, u: "kg" },
    ],
  },
  {
    tipo: "conteo",
    id: "CNT-0088",
    area: "Barra",
    fecha: "19 jul · 23:41",
    precision: 100,
    desviacionNeta: 0,
    desviacionAbs: 0,
    items: [
      { nombre: "Pisco 40°", contado: 9, teorico: 9, u: "botella" },
      { nombre: "Vino tinto reserva", contado: 20, teorico: 20, u: "botella" },
    ],
  },
];

/* ── Utilidades ── */
const plata = (n) => "$" + Math.round(n).toLocaleString("es-CL").replace(/,/g, ".");
const num = (n) => Number(n).toLocaleString("es-CL", { maximumFractionDigits: 2 });
const uid = () => Math.random().toString(36).slice(2, 8);

/* Patrón visual de código de barras: no es un EAN real, es una
   representación determinística a partir del SKU — suficiente
   para simular el escaneo dentro del prototipo. */
/* ─────────────────────────────────────────────────────────────
   Piezas de interfaz reutilizables
   ───────────────────────────────────────────────────────────── */

function Rotulo({ children, color }) {
  return (
    <div className="uppercase" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", color: color || C.suave }}>
      {children}
    </div>
  );
}

function Coach({ children }) {
  return (
    <div className="flex gap-2 px-3 py-2 mb-4" style={{ background: C.papel2, borderLeft: `3px solid ${C.carbon}`, fontSize: 13, lineHeight: 1.45, color: C.tinta }}>
      <span style={{ fontFamily: MONO, opacity: 0.5 }}>?</span>
      <span>{children}</span>
    </div>
  );
}

function Boton({ children, onClick, tono = "solido", disabled }) {
  const estilos = {
    solido: { background: C.carbon, color: C.papel, border: "none" },
    borde: { background: "transparent", color: C.tinta, border: `1px solid ${C.linea}` },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-4 text-center transition-opacity"
      style={{ ...estilos[tono], fontFamily: SANS, fontSize: 15, fontWeight: 600, letterSpacing: "0.01em", opacity: disabled ? 0.35 : 1, cursor: disabled ? "default" : "pointer" }}
    >
      {children}
    </button>
  );
}

function Encabezado({ titulo, onVolver, paso }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${C.linea}` }}>
      {onVolver && (
        <button onClick={onVolver} style={{ fontFamily: MONO, fontSize: 18, color: C.tinta }} aria-label="Volver">←</button>
      )}
      <div className="flex-1">
        <div style={{ fontFamily: SANS, fontSize: 16, fontWeight: 650 }}>{titulo}</div>
        {paso && <Rotulo>{paso}</Rotulo>}
      </div>
    </div>
  );
}

function Insignia({ rol, nombre, onCambiarRol, onCerrarSesion }) {
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ fontFamily: MONO, fontSize: 10, color: C.suave, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {nombre}
      </span>
      <button onClick={onCambiarRol} className="flex items-center gap-1.5 px-2.5 py-1" style={{ background: C.carbon, color: C.papel, fontFamily: MONO, fontSize: 10.5 }}>
        {rol === "bodega" ? "BODEGA" : "ÁREA"}
        <span style={{ opacity: 0.5 }}>⇄</span>
      </button>
      <button onClick={onCerrarSesion} className="px-2 py-1" style={{ background: "transparent", border: `1px solid ${C.linea}`, fontFamily: MONO, fontSize: 10 }} aria-label="Cerrar sesión">
        ⏻
      </button>
    </div>
  );
}

function Teclado({ valor, onCambio }) {
  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"];
  const pulsar = (t) => {
    if (t === "⌫") return onCambio(valor.slice(0, -1));
    if (t === "," && valor.includes(",")) return;
    if (t === "," && valor === "") return onCambio("0,");
    onCambio(valor + t);
  };
  return (
    <div className="grid grid-cols-3 gap-px" style={{ background: C.linea }}>
      {teclas.map((t) => (
        <button key={t} onClick={() => pulsar(t)} className="py-5" style={{ background: C.papel, fontFamily: MONO, fontSize: 22, color: C.tinta }}>
          {t}
        </button>
      ))}
    </div>
  );
}

function Visor({ valor, unidad }) {
  return (
    <div className="px-5 py-6" style={{ background: C.lcd, borderTop: `1px solid ${C.linea}` }}>
      <div className="flex items-baseline justify-end gap-2">
        <span style={{ fontFamily: MONO, fontSize: 56, lineHeight: 1, fontWeight: 500, color: valor === "" ? "rgba(19,26,21,0.25)" : C.lcdInk, fontVariantNumeric: "tabular-nums" }}>
          {valor === "" ? "0" : valor}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 15, color: C.lcdInk, opacity: 0.65 }}>{unidad}</span>
      </div>
    </div>
  );
}

function Stepper({ valor, onCambiar, paso = 1 }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => onCambiar(Math.max(0, valor - paso))} style={{ fontFamily: MONO, fontSize: 20, width: 30, color: C.tinta }}>−</button>
      <span style={{ fontFamily: MONO, fontSize: 17, minWidth: 34, textAlign: "center", opacity: valor ? 1 : 0.3 }}>{num(valor)}</span>
      <button onClick={() => onCambiar(valor + paso)} style={{ fontFamily: MONO, fontSize: 20, width: 30, color: C.tinta }}>+</button>
    </div>
  );
}

/* Renderiza el código de barras o QR de un insumo. El texto
   codificado siempre es el SKU: es lo único que garantiza que
   escanear en cualquier bodega apunte al mismo insumo. */
/* Genera el código real (no un dibujo simulado) a partir del SKU
   del insumo. QR usa la librería `qrcode` sobre un <canvas>; barras
   usa `JsBarcode` (formato CODE128, que acepta letras y números,
   igual que nuestros SKU tipo "LAC-008") sobre un <svg>. Ambos
   producen códigos que un lector real —incluida nuestra propia
   cámara con html5-qrcode— puede decodificar de verdad. */
function Codigo({ insumo, tipo }) {
  const canvasRef = useRef(null);
  const svgRef = useRef(null);

  useEffect(() => {
    if (tipo === "qr" && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, insumo.id, { width: 176, margin: 1, color: { dark: "#171C1A", light: "#FFFFFF" } }, () => {});
    }
  }, [tipo, insumo.id]);

  useEffect(() => {
    if (tipo === "barra" && svgRef.current) {
      try {
        JsBarcode(svgRef.current, insumo.id, {
          format: "CODE128",
          width: 2,
          height: 64,
          displayValue: false,
          margin: 8,
          background: "#FFFFFF",
          lineColor: "#171C1A",
        });
      } catch (e) {
        // SKU con caracteres que CODE128 no soporta — no debería
        // pasar con nuestro formato XXX-000, pero no rompe la vista.
      }
    }
  }, [tipo, insumo.id]);

  if (tipo === "qr") {
    return (
      <div className="flex flex-col items-center gap-3">
        <canvas ref={canvasRef} />
        <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.05em" }}>{insumo.id}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <svg ref={svgRef} />
      <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.1em" }}>{insumo.id}</span>
    </div>
  );
}

/* Base de usuarios del prototipo. En producción esto vive en un
   backend con contraseñas hasheadas — acá es solo para simular el
   flujo completo de login sin necesitar servidor todavía. Cada
   usuario queda asociado a un rol por defecto, que se puede
   cambiar en sesión igual que antes (el selector de rol sigue
   existiendo, ahora post-login). */
const USUARIOS_INICIALES = [
  { usuario: "jmora", clave: "bodega123", nombre: "Javiera Mora", rolDefecto: "bodega" },
  { usuario: "cbarra", clave: "barra123", nombre: "Carlos Beltrán", rolDefecto: "area", areaDefecto: "Barra" },
  { usuario: "psoto", clave: "cocina123", nombre: "Paula Soto", rolDefecto: "area", areaDefecto: "Cocina caliente" },
];

/* ─────────────────────────────────────────────────────────────
   App
   ───────────────────────────────────────────────────────────── */
export default function App() {
  const [usuarios, setUsuarios] = useState(USUARIOS_INICIALES);
  const [sesion, setSesion] = useState(null); // usuario logueado actual, o null
  const [formLogin, setFormLogin] = useState({ usuario: "", clave: "" });
  const [errorLogin, setErrorLogin] = useState("");

  const [rol, setRol] = useState(null);
  const [miArea, setMiArea] = useState("Cocina caliente");
  const [vista, setVista] = useState("inicio");
  const [insumos, setInsumos] = useState(INSUMOS_INICIALES);
  const [historico, setHistorico] = useState(HISTORICO_INICIAL);
  const [areas, setAreas] = useState(AREAS_INICIALES);

  /* Declarada temprano a propósito: se usa dentro de <Insignia>,
     que aparece en varias pantallas mucho antes de donde JavaScript
     leería una declaración `const` puesta más abajo en el archivo.
     Una función const solo existe desde su línea de declaración
     hacia adelante — usarla antes revienta con
     "Cannot access before initialization". */
  const cerrarSesion = () => {
    setSesion(null);
    setRol(null);
    setVista("inicio");
    setFormLogin({ usuario: "", clave: "" });
  };

  /* conteo (bodega, cualquier zona) */
  const [areaConteo, setAreaConteo] = useState(null);
  const [indice, setIndice] = useState(0);
  const [entrada, setEntrada] = useState("");
  const [conteo, setConteo] = useState({});
  const camara = useRef(null);
  const archivoCSV = useRef(null);

  /* ─── Tomas de inventario ───
     Una "toma" es el objeto formal de una sesión de conteo: quién,
     cuándo empezó, sobre qué zona, y el estado de cada ítem
     (pendiente / contado). Vive en `tomasAbiertas` mientras está en
     curso — si la persona sale sin terminar, la toma queda ahí tal
     cual, lista para retomarse la próxima vez que alguien entre a
     esa zona. Nunca se pierde lo ya contado. */
  const [tomasAbiertas, setTomasAbiertas] = useState({}); // area -> toma

  /* entrega manual (bodega) */
  const [destino, setDestino] = useState(null);
  const [carro, setCarro] = useState({});
  const [entregada, setEntregada] = useState(false);

  /* solicitudes de área → bodega */
  const [pedidoNuevo, setPedidoNuevo] = useState({});
  const [solicitudes, setSolicitudes] = useState([
    { id: "SOL-0142", area: "Barra", estado: "pendiente", items: [{ id: "LIC-007", pedido: 4 }, { id: "BEB-004", pedido: 24 }], creada: "hoy 11:40" },
  ]);
  const [revisando, setRevisando] = useState(null);
  const [ajusteBodega, setAjusteBodega] = useState({});

  /* último conteo por área — alimenta la previsualización */
  const [ultimoConteoArea, setUltimoConteoArea] = useState({
    Barra: { fecha: "19 jul · 23:41", items: { "LIC-007": 9, "LIC-019": 20, "BEB-004": 44 } },
  });

  /* importador CSV */
  const [filasCSV, setFilasCSV] = useState(null);
  const mapeo = { sku: "sku", nombre: "nombre", cat: "categoria", u: "unidad", costo: "costo", area: "area" };

  /* crear zona nueva */
  const [nuevaZona, setNuevaZona] = useState("");

  /* administrador de SKU */
  const [editando, setEditando] = useState(null);
  const [formSKU, setFormSKU] = useState(null);
  const [codigoDe, setCodigoDe] = useState(null);
  const [tipoCodigo, setTipoCodigo] = useState("barra");
  const [seleccionMasiva, setSeleccionMasiva] = useState([]);
  const [tipoCodigoMasivo, setTipoCodigoMasivo] = useState("barra");
  const [loteGenerado, setLoteGenerado] = useState(null); // insumos recién marcados, para la hoja de impresión

  /* generación de códigos post-importación CSV */
  const [insumosRecienImportados, setInsumosRecienImportados] = useState([]);

  /* modo escaneo real: cámara partida */
  const [modoCamara, setModoCamara] = useState(false);
  const [detectado, setDetectado] = useState(null); // insumo detectado por el "escaneo"
  const [entradaCamara, setEntradaCamara] = useState("");

  /* histórico: detalle abierto */
  const [detalleHistorico, setDetalleHistorico] = useState(null);

  const lista = useMemo(
    () => insumos.filter((i) => areaConteo && i.stock && Object.prototype.hasOwnProperty.call(i.stock, areaConteo)),
    [areaConteo, insumos]
  );
  const actual = lista[indice];

  const resultados = useMemo(
    () =>
      Object.entries(conteo).map(([id, dato]) => {
        const i = insumos.find((x) => x.id === id);
        const teorico = i.stock[areaConteo] || 0;
        const dif = dato.cant - teorico;
        const pct = teorico ? (dif / teorico) * 100 : 100;
        return { ...i, teorico, contado: dato.cant, foto: dato.foto, dif, pct, valor: dif * i.costo, fuera: Math.abs(pct) > i.tol };
      }),
    [conteo, insumos, areaConteo]
  );

  const totalDesv = resultados.reduce((a, r) => a + r.valor, 0);
  const totalAbs = resultados.reduce((a, r) => a + Math.abs(r.valor), 0);
  const precision = resultados.length ? Math.round((resultados.filter((r) => !r.fuera).length / resultados.length) * 100) : 0;

  /* Pendientes: ítems de la zona actual que todavía no tienen
     entrada en `conteo`. Es el dato detrás de la alerta y del
     panel de "qué falta". */
  const pendientes = useMemo(() => lista.filter((i) => conteo[i.id] === undefined), [lista, conteo]);

  const reiniciarConteo = () => {
    setAreaConteo(null);
    setIndice(0);
    setEntrada("");
    setConteo({});
  };

  /* Crea la toma formal y arranca el conteo. La persona sale de la
     sesión logueada — ya no se tipea. Bodega abre la cámara nativa
     de entrada; área siempre arranca en manual. `lista` ya queda
     calculada sobre `areaConteo`, que ambos flujos (ElegirArea y
     AreaInicio) setean antes de llegar acá. */
  const iniciarToma = () => {
    if (!sesion) return;
    const total = lista.length;
    setTomasAbiertas((t) => ({
      ...t,
      [areaConteo]: { persona: sesion.nombre, inicio: new Date().toLocaleString("es-CL"), total, contados: 0 },
    }));
    setConteo({});
    setIndice(0);
    if (rol === "bodega") {
      setVista("contar");
      abrirCamara(lista);
    } else {
      setVista("contarArea");
    }
  };

  /* Retoma una toma abierta: repone `conteo` a partir de lo que ya
     había quedado guardado, sin pedir el formulario de nuevo. */
  const conteosGuardadosPorArea = useRef({});

  const guardarYSeguir = (cantidad) => {
    const nuevo = { ...conteo, [actual.id]: { cant: cantidad, foto: conteo[actual.id]?.foto } };
    setConteo(nuevo);
    conteosGuardadosPorArea.current[areaConteo] = nuevo;
    setTomasAbiertas((t) => (t[areaConteo] ? { ...t, [areaConteo]: { ...t[areaConteo], contados: Object.keys(nuevo).length } } : t));
    setEntrada("");
    if (indice + 1 < lista.length) setIndice(indice + 1);
    else setVista("resumen");
  };

  /* Cierra la toma aunque queden pendientes: lo contado se guarda
     en el histórico marcado como parcial, y si faltó algo la toma
     sigue "abierta" para poder retomarla — nunca se pierde lo que
     ya se registró. */
  const cerrarConteoBodega = (forzarParcial = false) => {
    const completo = pendientes.length === 0;
    setHistorico((h) => [
      {
        tipo: "conteo",
        id: "CNT-" + uid().toUpperCase(),
        area: areaConteo,
        fecha: "recién",
        precision,
        desviacionNeta: totalDesv,
        desviacionAbs: totalAbs,
        parcial: !completo,
        pendientes: pendientes.length,
        items: resultados.map((r) => ({ nombre: r.nombre, contado: r.contado, teorico: r.teorico, u: r.u })),
      },
      ...h,
    ]);
    if (completo || forzarParcial) {
      setTomasAbiertas((t) => { const cp = { ...t }; delete cp[areaConteo]; return cp; });
      conteosGuardadosPorArea.current[areaConteo] = null;
    }
    reiniciarConteo();
    setVista("inicio");
  };

  const tomarFoto = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setConteo((c) => ({ ...c, [actual.id]: { cant: c[actual.id]?.cant ?? null, foto: url } }));
  };

  const totalCarro = Object.entries(carro).reduce((a, [id, q]) => {
    const i = insumos.find((x) => x.id === id);
    return a + q * i.costo;
  }, 0);

  const folio =
    "VB-" + String(new Date().getDate()).padStart(2, "0") + String(new Date().getMonth() + 1).padStart(2, "0") + "-" + String(140 + Object.keys(carro).length).padStart(4, "0");

  const enviarSolicitud = () => {
    const items = Object.entries(pedidoNuevo).filter(([, q]) => q > 0).map(([id, q]) => ({ id, pedido: q }));
    if (!items.length) return;
    setSolicitudes((s) => [{ id: "SOL-" + uid().toUpperCase(), area: miArea, estado: "pendiente", items, creada: "recién" }, ...s]);
    setPedidoNuevo({});
    setVista("areaInicio");
  };

  const abrirRevision = (sol) => {
    const base = {};
    sol.items.forEach((it) => (base[it.id] = it.pedido));
    setAjusteBodega(base);
    setRevisando(sol.id);
  };

  const confirmarRevision = () => {
    const sol = solicitudes.find((s) => s.id === revisando);
    const itemsFinales = sol.items.map((it) => ({ ...it, enviado: ajusteBodega[it.id] ?? it.pedido }));
    setSolicitudes((s) => s.map((x) => (x.id === revisando ? { ...x, estado: "despachada", items: itemsFinales } : x)));
    setHistorico((h) => [
      {
        tipo: "solicitud",
        id: sol.id,
        area: sol.area,
        fecha: "recién",
        estado: "despachada",
        items: itemsFinales.map((it) => ({ ...it, nombre: insumos.find((i) => i.id === it.id)?.nombre, u: insumos.find((i) => i.id === it.id)?.u })),
      },
      ...h,
    ]);
    setRevisando(null);
    setVista("bandeja");
  };

  /* ─── Importador CSV ─── */
  const parsearCSV = (texto) => {
    const lineas = texto.trim().split("\n");
    const cabecera = lineas[0].split(",").map((h) => h.trim());
    return lineas.slice(1).map((linea, idx) => {
      const valores = linea.split(",").map((v) => v.trim());
      const fila = {};
      cabecera.forEach((h, i) => (fila[h] = valores[i] ?? ""));
      const errores = [];
      if (!fila.sku) errores.push("Sin SKU");
      if (!fila.costo || isNaN(parseFloat(fila.costo))) errores.push("Costo inválido");
      if (!areas.includes(fila.area?.trim())) errores.push("Área no reconocida: “" + fila.area + "”");
      const existe = insumos.some((i) => i.id === fila.sku);
      return { _fila: idx + 2, ...fila, _errores: errores, _duplicado: existe };
    });
  };

  const cargarCSVDemo = () => setFilasCSV(parsearCSV(CSV_DEMO));
  const cargarArchivo = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => setFilasCSV(parsearCSV(ev.target.result));
    reader.readAsText(f);
  };

  const filasValidas = filasCSV?.filter((f) => f._errores.length === 0) || [];
  const filasConError = filasCSV?.filter((f) => f._errores.length > 0) || [];

  const confirmarImportacion = () => {
    const nuevos = filasValidas.filter((f) => !f._duplicado).map((f) => ({
      id: f.sku, nombre: f.nombre, cat: f.categoria, u: f.unidad, costo: parseFloat(f.costo), clase: "C", tol: 5, stock: { [f.area]: 0 }, codigoGenerado: false,
    }));
    setInsumos((prev) => [...prev, ...nuevos]);
    setInsumosRecienImportados(nuevos.map((n) => n.id));
    setFilasCSV(null);
    setVista("importarCodigos");
  };

  /* ─── Administrador de SKU ─── */
  const abrirNuevoSKU = () => {
    setFormSKU({ id: "", nombre: "", cat: "", u: "kg", costo: "", clase: "C", tol: 5, areas: [] });
    setEditando("nuevo");
    setVista("editarSKU");
  };

  const abrirEditarSKU = (insumo) => {
    setFormSKU({ ...insumo, areas: Object.keys(insumo.stock) });
    setEditando(insumo.id);
    setVista("editarSKU");
  };

  const guardarSKU = () => {
    const stock = {};
    formSKU.areas.forEach((a) => { stock[a] = insumos.find((i) => i.id === formSKU.id)?.stock?.[a] ?? 0; });
    const registro = { id: formSKU.id, nombre: formSKU.nombre, cat: formSKU.cat, u: formSKU.u, costo: parseFloat(formSKU.costo) || 0, clase: formSKU.clase, tol: parseFloat(formSKU.tol) || 5, stock };
    if (editando === "nuevo") setInsumos((prev) => [...prev, registro]);
    else setInsumos((prev) => prev.map((i) => (i.id === editando ? registro : i)));
    setVista("administrarSKU");
  };

  const toggleAreaForm = (a) => {
    setFormSKU((f) => ({ ...f, areas: f.areas.includes(a) ? f.areas.filter((x) => x !== a) : [...f.areas, a] }));
  };

  /* Generar código individual: una sola vez por insumo. Una vez
     marcado codigoGenerado=true no hay botón ni ruta de vuelta —
     el bloqueo vive en el dato, no solo en la interfaz. */
  const generarCodigoIndividual = (insumo) => {
    setInsumos((prev) => prev.map((i) => (i.id === insumo.id ? { ...i, codigoGenerado: true } : i)));
    setCodigoDe({ ...insumo, codigoGenerado: true });
    setVista("verCodigo");
  };

  const toggleSeleccionMasiva = (id) => {
    setSeleccionMasiva((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const generarCodigosMasivo = (ids, tipo) => {
    setInsumos((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, codigoGenerado: true } : i)));
    setLoteGenerado({ ids, tipo });
    setSeleccionMasiva([]);
    setVista("loteGenerado");
  };

  /* ─── Modo cámara real: pantalla partida ───
     Recibe la lista de insumos escaneables en ese contexto (la
     zona que se está contando), no una lista global — así el
     escáner nunca "detecta" algo que no pertenece a esa sesión.

     La lectura real del código corre con html5-qrcode: la librería
     pide la cámara, analiza cada frame buscando un código de barras
     o QR, y devuelve el texto decodificado. Ese texto es el SKU
     (así fue como generamos los códigos), así que basta con buscarlo
     en `listaCamara` para saber a qué insumo corresponde. */
  const [listaCamara, setListaCamara] = useState([]);
  const [estadoCamara, setEstadoCamara] = useState("inactiva"); // inactiva | pidiendo | activa | denegada
  const [errorCamara, setErrorCamara] = useState("");
  const lectorRef = useRef(null);
  const listaCamaraRef = useRef([]);
  const detectadoRef = useRef(null);

  const abrirCamara = (lista) => {
    setListaCamara(lista);
    listaCamaraRef.current = lista;
    setDetectado(null);
    setEntradaCamara("");
    setModoCamara(true);
  };

  /* Se ejecuta por cada frame donde la librería logra decodificar
     algo. Ignora lecturas repetidas del mismo producto mientras ya
     está detectado (evita que el frame siguiente lo vuelva a
     disparar y resetee lo que la persona ya empezó a teclear). */
  const alDecodificar = (textoLeido) => {
    if (detectadoRef.current) return;
    const insumo = listaCamaraRef.current.find((i) => i.id === textoLeido.trim().toUpperCase());
    if (!insumo) return; // código válido pero no pertenece a esta zona — se ignora, no se avisa por cada frame
    detectadoRef.current = insumo;
    setDetectado(insumo);
    setEntradaCamara("");
  };

  /* Arranca html5-qrcode apuntando a la cámara trasera apenas se
     abre el modo cámara, y lo detiene al cerrar. La librería maneja
     el permiso del navegador internamente — es la misma solicitud
     de getUserMedia por debajo, pero con el análisis de frames ya
     resuelto en vez de tener que escribirlo a mano.

     El pequeño setTimeout antes de instanciar Html5Qrcode existe
     porque la librería busca el div por id en el DOM apenas se la
     llama — si React todavía no terminó de pintar ese div en el
     mismo tick (puede pasar justo al cambiar de pantalla), la
     librería no lo encuentra y falla en silencio. Un tick de
     margen resuelve esa carrera sin que se note. */
  useEffect(() => {
    if (!modoCamara) return;
    let cancelado = false;
    let lector = null;

    setEstadoCamara("pidiendo");
    setErrorCamara("");
    detectadoRef.current = null;

    /* Si quedó un lector de una sesión anterior sin liberar del
       todo (puede pasar si se cierra y reabre rápido, o por el
       doble-montaje de React.StrictMode en desarrollo), lo
       detenemos primero y recién después arrancamos uno nuevo.
       Arrancar mientras el anterior todavía tiene la cámara
       tomada es lo que produce el fallo silencioso. */
    const liberarAnterior = lectorRef.current
      ? lectorRef.current.stop().then(() => lectorRef.current?.clear()).catch(() => {})
      : Promise.resolve();

    liberarAnterior.then(() => {
      lectorRef.current = null;
      if (cancelado) return;

      // Un tick extra para que React termine de pintar el div antes
      // de que la librería lo busque por id.
      setTimeout(() => {
        if (cancelado) return;
        try {
          lector = new Html5Qrcode("lector-camara", {
            formatsToSupport: [
              Html5QrcodeSupportedFormats.QR_CODE,
              Html5QrcodeSupportedFormats.EAN_13,
              Html5QrcodeSupportedFormats.EAN_8,
              Html5QrcodeSupportedFormats.CODE_128,
              Html5QrcodeSupportedFormats.CODE_39,
              Html5QrcodeSupportedFormats.UPC_A,
              Html5QrcodeSupportedFormats.UPC_E,
            ],
            verbose: false,
          });
          lectorRef.current = lector;
          lector
            .start(
              { facingMode: "environment" },
              {
                fps: 10,
                qrbox: (anchoDisponible, altoDisponible) => {
                  const lado = Math.floor(Math.min(anchoDisponible, altoDisponible) * 0.75);
                  return { width: lado, height: lado };
                },
              },
              (texto) => alDecodificar(texto),
              () => {} // callback de "no se detectó nada en este frame" — se ignora, es constante
            )
            .then(() => { if (!cancelado) setEstadoCamara("activa"); })
            .catch((err) => {
              if (cancelado) return;
              setEstadoCamara("denegada");
              setErrorCamara(err?.message || String(err));
            });
        } catch (err) {
          if (!cancelado) { setEstadoCamara("denegada"); setErrorCamara(err?.message || String(err)); }
        }
      }, 150);
    });

    return () => {
      cancelado = true;
      if (lectorRef.current) {
        lectorRef.current.stop().then(() => lectorRef.current?.clear()).catch(() => {});
        lectorRef.current = null;
      }
    };
  }, [modoCamara]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmarCantidadCamara = () => {
    if (!detectado || entradaCamara === "") return;
    const cantidad = parseFloat(entradaCamara.replace(",", "."));
    setConteo((c) => ({ ...c, [detectado.id]: { cant: cantidad, foto: c[detectado.id]?.foto } }));
    setDetectado(null);
    detectadoRef.current = null;
    setEntradaCamara("");
  };

  /* Crea una zona/bodega nueva. Queda disponible de inmediato para
     asignar insumos y para contar — no requiere reiniciar nada. */
  const crearZona = () => {
    const nombre = nuevaZona.trim();
    if (!nombre || areas.includes(nombre)) return;
    setAreas((a) => [...a, nombre]);
    setNuevaZona("");
    setVista(rol === "bodega" ? "inicio" : "areaInicio");
  };

  /* Lista y cierre de conteo de área — declarados acá (antes de
     CamaraPartida) porque ese componente los referencia. */
  const listaArea = insumos.filter((i) => i.stock && Object.prototype.hasOwnProperty.call(i.stock, miArea));
  const actualArea = listaArea[indice];
  const conteoAreaCompleto = listaArea.length > 0 && listaArea.every((i) => conteo[i.id] !== undefined);

  const cerrarConteoAreaDesde = (conteoFinal, esParcial = false) => {
    const items = {};
    Object.entries(conteoFinal).forEach(([id, d]) => (items[id] = d.cant));
    const completo = Object.keys(items).length === listaArea.length;
    setUltimoConteoArea((u) => ({ ...u, [miArea]: { fecha: "recién", items } }));
    setHistorico((h) => [
      {
        tipo: "conteo",
        id: "CNT-" + uid().toUpperCase(),
        area: miArea,
        fecha: "recién",
        precision: 100,
        desviacionNeta: 0,
        desviacionAbs: 0,
        parcial: !completo,
        pendientes: listaArea.length - Object.keys(items).length,
        items: Object.entries(items).map(([id, cant]) => {
          const i = insumos.find((x) => x.id === id);
          return { nombre: i.nombre, contado: cant, teorico: i.stock[miArea] || 0, u: i.u };
        }),
      },
      ...h,
    ]);
    if (completo || esParcial) {
      setTomasAbiertas((t) => { const cp = { ...t }; delete cp[miArea]; return cp; });
    }
    setIndice(0);
    setConteo({});
    setVista("areaInicio");
  };

  /* ═══════════════════ MODO CÁMARA · pantalla partida ═══════════════════
     Mitad superior: video real del dispositivo (getUserMedia) con
     mira tipo lector láser. Mitad inferior: panel con scroll propio
     — nunca se "traba" la interacción con el teclado numérico
     porque el contenedor de abajo tiene su propio overflow-y-auto
     independiente del alto fijo de la cámara. */
  const CamaraPartida = (
    <div className="fixed inset-0 flex flex-col" style={{ zIndex: 60, background: C.tinta }}>
      <style>{ESTILO_LECTOR}</style>
      <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ background: C.carbon }}>
        <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 650, color: C.papel }}>Escanear ingrediente</span>
        <button onClick={() => { setModoCamara(false); setDetectado(null); }} style={{ fontFamily: MONO, fontSize: 13, color: C.papel, opacity: 0.6 }}>cerrar ✕</button>
      </div>

      {/* Mitad cámara — alto fijo, no colapsa al aparecer el panel de abajo.
          html5-qrcode inyecta su propio <video> + recuadro de escaneo
          dentro de este div, identificado por id. */}
      <div className="relative flex-shrink-0" style={{ height: "34vh", minHeight: 220, background: "#0B0E0C", overflow: "hidden" }}>
        <div id="lector-camara" className="absolute inset-0 w-full h-full" style={{ overflow: "hidden" }} />
        {estadoCamara !== "activa" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            {estadoCamara === "denegada" ? (
              <>
                <span style={{ fontFamily: MONO, fontSize: 11, color: "rgba(239,237,228,0.6)" }}>Sin acceso a la cámara</span>
                <span style={{ fontFamily: SANS, fontSize: 12, color: "rgba(239,237,228,0.45)" }}>
                  Revisá que le hayas dado permiso de cámara a este sitio, y que estés en HTTPS. En Android, a veces hace falta abrirlo desde Chrome directamente, no desde un navegador dentro de otra app.
                </span>
                {errorCamara && (
                  <span style={{ fontFamily: MONO, fontSize: 10, color: "rgba(168,58,34,0.8)", marginTop: 4, wordBreak: "break-word" }}>
                    detalle: {errorCamara}
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontFamily: MONO, fontSize: 11, color: "rgba(239,237,228,0.5)" }}>
                {estadoCamara === "pidiendo" ? "Solicitando cámara…" : "Iniciando cámara…"}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Mitad detección — scrollable siempre, con o sin ítem detectado */}
      <div className="flex-1 overflow-y-auto" style={{ background: C.papel, WebkitOverflowScrolling: "touch" }}>
        {detectado ? (
          <>
            <div className="px-5 pt-5 pb-3" style={{ borderBottom: `1px solid ${C.linea}` }}>
              <Rotulo color={C.ok}>✓ detectado</Rotulo>
              <div style={{ fontFamily: SANS, fontSize: 20, fontWeight: 660, letterSpacing: "-0.01em", marginTop: 2 }}>{detectado.nombre}</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.suave, marginTop: 2 }}>
                {detectado.id} · se registra en <b style={{ color: C.tinta }}>{detectado.u}</b>
              </div>
            </div>
            <Visor valor={entradaCamara} unidad={detectado.u} />
            <Teclado valor={entradaCamara} onCambio={setEntradaCamara} />
            <div className="px-5 py-4 flex gap-3">
              <button onClick={() => { setDetectado(null); detectadoRef.current = null; setEntradaCamara(""); }} className="flex-1 py-3" style={{ background: C.papel2, fontFamily: SANS, fontSize: 13.5, fontWeight: 600 }}>
                Escanear otro
              </button>
              <button
                onClick={confirmarCantidadCamara}
                disabled={entradaCamara === ""}
                className="flex-1 py-3"
                style={{ background: C.carbon, color: C.papel, fontFamily: SANS, fontSize: 13.5, fontWeight: 600, opacity: entradaCamara === "" ? 0.35 : 1 }}
              >
                Confirmar {detectado.u}
              </button>
            </div>
            {rol === "area" && conteoAreaCompleto && (
              <div className="px-5 pb-5">
                <button onClick={() => { setModoCamara(false); cerrarConteoAreaDesde(conteo); }} className="w-full py-3" style={{ background: C.ok, color: "#fff", fontFamily: SANS, fontSize: 13.5, fontWeight: 600 }}>
                  Ya escaneaste todo · cerrar conteo de zona
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="px-5 pt-5 pb-3 text-center" style={{ borderBottom: `1px solid ${C.linea}` }}>
            <div style={{ fontFamily: SANS, fontSize: 13, color: C.suave }}>
              {estadoCamara === "activa" ? "Apuntá la cámara al código del ingrediente — se detecta solo." : "Esperando la cámara…"}
            </div>
          </div>
        )}

        {/* Panel de pendientes — siempre visible, siempre scrolleable */}
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <Rotulo color={listaCamara.filter((i) => conteo[i.id] === undefined).length ? C.alerta : C.ok}>
              {listaCamara.filter((i) => conteo[i.id] === undefined).length} de {listaCamara.length} pendientes
            </Rotulo>
          </div>
          <div className="flex flex-col gap-px" style={{ background: C.linea }}>
            {listaCamara.map((i) => {
              const hecho = conteo[i.id] !== undefined;
              return (
                <div key={i.id} className="flex items-center justify-between px-3 py-2.5" style={{ background: C.papel }}>
                  <span style={{ fontFamily: SANS, fontSize: 13, color: hecho ? C.suave : C.tinta, fontWeight: hecho ? 400 : 600 }}>{i.nombre}</span>
                  {hecho ? (
                    <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.ok }}>✓ {num(conteo[i.id].cant)} {i.u}</span>
                  ) : (
                    <span className="px-2 py-0.5" style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.06em", background: "rgba(168,58,34,0.1)", color: C.alerta }}>SIN CONTAR</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  /* ═══════════════════════════ PANTALLAS · BODEGA ═══════════════════════════ */

  const Inicio = (
    <div>
      <div className="flex items-center justify-between px-5 pt-6">
        <Rotulo>Bodega · Restaurante Mesa Norte</Rotulo>
        <Insignia rol={rol} nombre={sesion?.nombre} onCambiarRol={() => setRol(null)} onCerrarSesion={cerrarSesion} />
      </div>
      <div className="px-5 pb-6 pt-2">
        <h1 style={{ fontFamily: SANS, fontSize: 27, fontWeight: 680, letterSpacing: "-0.02em", lineHeight: 1.1 }}>¿Qué vas a hacer<br />ahora?</h1>
      </div>

      {solicitudes.some((s) => s.estado === "pendiente") && (
        <div className="mx-5 mb-4">
          <button onClick={() => setVista("bandeja")} className="w-full flex items-center justify-between px-4 py-3" style={{ background: "rgba(156,122,46,0.12)", borderLeft: `3px solid ${C.ambar}` }}>
            <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: "#5C4720" }}>
              {solicitudes.filter((s) => s.estado === "pendiente").length} solicitud(es) de área esperando revisión
            </span>
            <span style={{ fontFamily: MONO, fontSize: 13, color: C.ambar }}>→</span>
          </button>
        </div>
      )}

      <div className="mx-5 mb-7 px-4 py-4 flex justify-between" style={{ background: C.papel2 }}>
        <div>
          <Rotulo>Último cierre · 21 jul</Rotulo>
          <div style={{ fontFamily: MONO, fontSize: 24, marginTop: 4 }}>94%</div>
          <div style={{ fontSize: 11, color: C.suave }}>precisión</div>
        </div>
        <div className="text-right">
          <Rotulo>Desviación valorizada</Rotulo>
          <div style={{ fontFamily: MONO, fontSize: 24, marginTop: 4, color: C.alerta }}>−$186.400</div>
          <div style={{ fontSize: 11, color: C.suave }}>1,9% de la venta</div>
        </div>
      </div>

      <div className="px-5 flex flex-col gap-3 pb-10">
        {[
          ["Tomar inventario", "Contar una zona y cerrar la diferencia", () => setVista("elegirArea")],
          ["Entregar a un área", "Sacar mercadería de bodega con vale", () => setVista("entrega")],
          ["Solicitudes de área", "Aprobar y despachar pedidos de cocina y barra", () => setVista("bandeja")],
          ["Administrar ingredientes", "Crear SKU, asignar áreas y generar códigos", () => setVista("administrarSKU")],
          ["Crear zona de conteo", "Nueva bodega o área para contar", () => setVista("crearZona")],
          ["Importar catálogo", "Cargar ingredientes, unidades y precios desde un archivo", () => setVista("importarInicio")],
          ["Histórico", "Conteos y solicitudes anteriores", () => setVista("historico")],
          ["Ver desviaciones", "Qué se está perdiendo y dónde", () => setVista("desviaciones")],
        ].map(([t, s, fn]) => (
          <button key={t} onClick={fn} className="w-full text-left px-4 py-5" style={{ background: C.carbon, color: C.papel }}>
            <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 650 }}>{t}</div>
            <div style={{ fontSize: 13, opacity: 0.6, marginTop: 2 }}>{s}</div>
          </button>
        ))}
      </div>
    </div>
  );

  const ElegirArea = (
    <div>
      <Encabezado titulo="Tomar inventario" paso="Paso 1 de 3 · Zona" onVolver={() => setVista("inicio")} />
      <div className="px-5 pt-5">
        <Coach>Se cuenta una zona completa a la vez. Nunca mezcles zonas en una misma sesión: si aparece una diferencia, no sabrías dónde se originó.</Coach>
        <div className="flex flex-col gap-px" style={{ background: C.linea }}>
          {areas.map((a) => {
            const n = insumos.filter((i) => i.stock && Object.prototype.hasOwnProperty.call(i.stock, a)).length;
            const abierta = tomasAbiertas[a];
            return (
              <button
                key={a}
                onClick={() => {
                  setAreaConteo(a);
                  if (abierta) {
                    const previo = conteosGuardadosPorArea.current[a] || {};
                    setConteo(previo);
                    const primerPendiente = insumos.filter((i) => i.stock && Object.prototype.hasOwnProperty.call(i.stock, a)).findIndex((i) => previo[i.id] === undefined);
                    setIndice(primerPendiente >= 0 ? primerPendiente : 0);
                    setVista("contar");
                  } else {
                    setFormNuevaToma({ persona: "" });
                    setVista("generarToma");
                  }
                }}
                className="flex items-center justify-between px-4 py-4 text-left"
                style={{ background: C.papel }}
              >
                <div>
                  <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 550 }}>{a}</span>
                  {abierta && (
                    <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.ambar, marginTop: 2 }}>
                      toma abierta por {abierta.persona} · {abierta.contados}/{abierta.total} contados
                    </div>
                  )}
                </div>
                <span style={{ fontFamily: MONO, fontSize: 13, color: abierta ? C.ambar : C.suave }}>{abierta ? "retomar →" : `${n} ítems`}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const [verPendientes, setVerPendientes] = useState(false);

  const CrearZona = (
    <div>
      <Encabezado titulo="Crear zona de conteo" paso={`${areas.length} zonas activas`} onVolver={() => setVista(rol === "bodega" ? "inicio" : "areaInicio")} />
      <div className="px-5 pt-5">
        <Coach>Una zona nueva queda disponible al instante: se puede asignar insumos desde "Administrar ingredientes" y contarla desde "Tomar inventario".</Coach>
        <Rotulo>Nombre de la zona</Rotulo>
        <input
          value={nuevaZona}
          onChange={(e) => setNuevaZona(e.target.value)}
          placeholder="ej: Cava de vinos"
          className="w-full px-3 py-3 mt-1 mb-2"
          style={{ background: "#fff", border: `1px solid ${C.linea}`, fontFamily: SANS, fontSize: 15 }}
        />
        {nuevaZona.trim() && areas.includes(nuevaZona.trim()) && (
          <div className="mb-4 px-3 py-2" style={{ background: "rgba(168,58,34,0.08)", fontSize: 12.5, color: C.alerta }}>Ya existe una zona con ese nombre.</div>
        )}
        <div className="mt-4 mb-6">
          <Rotulo>Zonas existentes</Rotulo>
          <div className="flex flex-wrap gap-2 mt-2">
            {areas.map((a) => (
              <span key={a} className="px-2.5 py-1" style={{ background: C.papel2, fontFamily: MONO, fontSize: 11.5, color: C.suave }}>{a}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="px-5 pb-10">
        <Boton disabled={!nuevaZona.trim() || areas.includes(nuevaZona.trim())} onClick={crearZona}>Crear zona</Boton>
      </div>
    </div>
  );

  const GenerarToma = (
    <div>
      <Encabezado titulo="Generar toma" paso={`Paso 2 de 2 · ${areaConteo}`} onVolver={() => setVista(rol === "bodega" ? "elegirArea" : "areaInicio")} />
      <div className="px-5 pt-5">
        <Coach>
          Esto queda registrado como el inicio formal de la toma, a tu nombre. {rol === "bodega" ? "La cámara se abre sola apenas empieces." : "Vas a contar de forma manual."}
        </Coach>
        <div className="flex justify-between px-4 py-3 mb-3" style={{ background: C.papel2 }}>
          <div>
            <Rotulo>Toma a nombre de</Rotulo>
            <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, marginTop: 2 }}>{sesion?.nombre}</div>
          </div>
        </div>
        <div className="flex justify-between px-4 py-3 mb-6" style={{ background: C.papel2 }}>
          <div>
            <Rotulo>Zona</Rotulo>
            <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, marginTop: 2 }}>{areaConteo}</div>
          </div>
          <div className="text-right">
            <Rotulo>Inicio</Rotulo>
            <div style={{ fontFamily: MONO, fontSize: 13, marginTop: 2 }}>{new Date().toLocaleString("es-CL")}</div>
          </div>
        </div>
        <Coach>
          Una vez adentro, cada ítem necesita un valor cargado antes de poder cerrar la toma — incluso si es "0". Si no llegás a terminar, podés dejarla en pausa y seguirla después.
        </Coach>
      </div>
      <div className="px-5 pb-10">
        <Boton onClick={iniciarToma}>Comenzar toma</Boton>
      </div>
    </div>
  );

  const ResumenParcial = (
    <div>
      <Encabezado titulo="Pausar toma" paso={areaConteo} onVolver={() => setVista("contar")} />
      <div className="px-5 pt-5">
        <Coach>
          Quedarían <b>{pendientes.length} ítem(s) sin contar</b>. Lo que ya registraste se guarda igual, y la toma sigue abierta para que cualquiera la retome después desde esta misma zona.
        </Coach>
        {pendientes.length > 0 && (
          <div className="flex flex-col gap-px mb-6" style={{ background: C.linea }}>
            {pendientes.map((i) => (
              <div key={i.id} className="flex items-center justify-between px-4 py-3" style={{ background: C.papel }}>
                <span style={{ fontFamily: SANS, fontSize: 14 }}>{i.nombre}</span>
                <span className="px-2 py-0.5" style={{ fontFamily: MONO, fontSize: 9.5, background: "rgba(168,58,34,0.1)", color: C.alerta }}>SIN CONTAR</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="px-5 pb-10 flex flex-col gap-3">
        <Boton onClick={() => cerrarConteoBodega(false)}>Pausar y salir</Boton>
        <Boton tono="borde" onClick={() => setVista("contar")}>Seguir contando</Boton>
      </div>
    </div>
  );

  const Contar = actual && (
    <div className="flex flex-col" style={{ minHeight: "100%" }}>
      <Encabezado titulo={areaConteo} paso={`Ítem ${indice + 1} de ${lista.length} · ${tomasAbiertas[areaConteo]?.persona || ""}`} onVolver={() => (indice === 0 ? setVista("elegirArea") : setIndice(indice - 1))} />
      <div style={{ height: 3, background: C.papel2 }}>
        <div style={{ height: 3, width: `${((indice + 1) / lista.length) * 100}%`, background: C.carbon, transition: "width 200ms" }} />
      </div>

      <button onClick={() => setVerPendientes((v) => !v)} className="w-full flex items-center justify-between px-5 py-2.5" style={{ background: pendientes.length ? "rgba(168,58,34,0.08)" : "rgba(59,107,74,0.08)" }}>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.05em", color: pendientes.length ? C.alerta : C.ok }}>
          {pendientes.length} de {lista.length} sin contar
        </span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.suave }}>{verPendientes ? "ocultar ▲" : "ver ▼"}</span>
      </button>

      {verPendientes && (
        <div className="px-5 py-3" style={{ background: C.papel2, maxHeight: 180, overflowY: "auto" }}>
          <div className="flex flex-col gap-px" style={{ background: C.linea }}>
            {lista.map((i, pos) => {
              const hecho = conteo[i.id] !== undefined;
              return (
                <button key={i.id} onClick={() => { setIndice(pos); setVerPendientes(false); }} className="flex items-center justify-between px-3 py-2 text-left" style={{ background: C.papel }}>
                  <span style={{ fontFamily: SANS, fontSize: 13, color: hecho ? C.suave : C.tinta, fontWeight: hecho ? 400 : 600 }}>{i.nombre}</span>
                  {hecho ? <span style={{ fontFamily: MONO, fontSize: 11, color: C.ok }}>✓</span> : <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.alerta }}>SIN CONTAR</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-5 pt-6 pb-4 flex-1">
        {indice === 0 && !verPendientes && <Coach>Conteo ciego: no verás el saldo que espera el sistema hasta cerrar. Con la cámara podés ir escaneando ingredientes sin pasar por esta lista uno por uno.</Coach>}
        <div className="flex items-center justify-between">
          <Rotulo>{actual.id} · Clase {actual.clase}</Rotulo>
          <button onClick={() => abrirCamara(lista)} className="flex items-center gap-1.5 px-2.5 py-1" style={{ background: C.carbon, color: C.papel, fontFamily: MONO, fontSize: 10.5 }}>▤ usar cámara</button>
        </div>
        <div className="mt-1" style={{ fontFamily: SANS, fontSize: 25, fontWeight: 660, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{actual.nombre}</div>
        <div style={{ fontSize: 13, color: C.suave, marginTop: 4 }}>{actual.cat} · se cuenta en {actual.u}</div>
        {conteo[actual.id]?.foto && <img src={conteo[actual.id].foto} alt="Evidencia" className="mt-4" style={{ width: 92, height: 92, objectFit: "cover" }} />}
      </div>
      <Visor valor={entrada} unidad={actual.u} />
      <Teclado valor={entrada} onCambio={setEntrada} />
      <div className="grid grid-cols-2 gap-px" style={{ background: C.linea }}>
        <button onClick={() => guardarYSeguir(0)} className="py-4" style={{ background: C.papel, fontFamily: SANS, fontSize: 14 }}>No hay stock</button>
        <button onClick={() => camara.current?.click()} className="py-4" style={{ background: C.papel, fontFamily: SANS, fontSize: 14 }}>Adjuntar foto</button>
      </div>
      <input ref={camara} type="file" accept="image/*" capture="environment" onChange={tomarFoto} style={{ display: "none" }} />
      <Boton disabled={entrada === ""} onClick={() => guardarYSeguir(parseFloat(entrada.replace(",", ".")))}>
        {indice + 1 === lista.length ? "Cerrar el conteo" : "Guardar y seguir"}
      </Boton>
      {Object.keys(conteo).length > 0 && (
        <button onClick={() => setVista("resumenParcial")} className="w-full py-3" style={{ background: "transparent", fontFamily: SANS, fontSize: 12.5, color: C.suave }}>
          Dejar en pausa y seguir después ({pendientes.length} sin contar todavía)
        </button>
      )}
      {modoCamara && CamaraPartida}
    </div>
  );

  const Resumen = (
    <div>
      <Encabezado titulo="Resultado del conteo" paso={`Paso 3 de 3 · ${areaConteo}`} onVolver={() => setVista("contar")} />
      <div className="px-5 pt-5">
        <div className="flex gap-px mb-5" style={{ background: C.linea }}>
          <div className="flex-1 px-4 py-4" style={{ background: C.papel2 }}>
            <Rotulo>Precisión</Rotulo>
            <div style={{ fontFamily: MONO, fontSize: 27, marginTop: 3 }}>{precision}%</div>
          </div>
          <div className="flex-1 px-4 py-4" style={{ background: C.papel2 }}>
            <Rotulo>Desviación neta</Rotulo>
            <div style={{ fontFamily: MONO, fontSize: 27, marginTop: 3, color: totalDesv < 0 ? C.alerta : C.ok }}>{totalDesv < 0 ? "−" : "+"}{plata(Math.abs(totalDesv))}</div>
          </div>
        </div>
        <Coach>La desviación neta puede esconder errores que se compensan. Mira siempre la desviación absoluta: {plata(totalAbs)} en esta zona.</Coach>
        <div className="flex flex-col gap-px mb-6" style={{ background: C.linea }}>
          {resultados.slice().sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)).map((r) => (
            <div key={r.id} className="px-4 py-3" style={{ background: C.papel }}>
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1">
                  <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600 }}>{r.nombre}</div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.suave, marginTop: 3 }}>contado {num(r.contado)} · sistema {num(r.teorico)} {r.u}</div>
                </div>
                <div className="text-right">
                  <div style={{ fontFamily: MONO, fontSize: 15, color: r.fuera ? C.alerta : C.ok }}>{r.dif > 0 ? "+" : ""}{num(r.dif)}</div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.suave }}>{r.valor < 0 ? "−" : "+"}{plata(Math.abs(r.valor))}</div>
                </div>
              </div>
              {r.fuera && <div className="mt-2 px-2 py-1" style={{ background: "rgba(168,58,34,0.08)", fontSize: 11.5, color: C.alerta }}>Fuera de tolerancia (±{r.tol}%). Requiere recuento y causa antes de ajustar.</div>}
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 pb-10 flex flex-col gap-3">
        <Boton onClick={() => cerrarConteoBodega(false)}>Enviar a aprobación</Boton>
        <Boton tono="borde" onClick={() => { setIndice(0); setVista("contar"); }}>Recontar la zona</Boton>
      </div>
    </div>
  );

  const Entrega = (
    <div>
      <Encabezado titulo="Entregar a un área" paso={destino ? `Paso 2 de 2 · ${destino}` : "Paso 1 de 2 · Destino"} onVolver={() => { if (destino) { setDestino(null); setCarro({}); setEntregada(false); } else setVista("inicio"); }} />
      {!destino ? (
        <div className="px-5 pt-5">
          <Coach>Todo lo que sale de bodega tiene que quedar con destino y responsable. Sin esto, la merma de cocina se confunde con la de bodega y nadie responde por ninguna.</Coach>
          <div className="flex flex-col gap-px" style={{ background: C.linea }}>
            {areas.filter((a) => a !== "Bodega central").map((a) => (
              <button key={a} onClick={() => setDestino(a)} className="px-4 py-4 text-left" style={{ background: C.papel, fontFamily: SANS, fontSize: 15, fontWeight: 550 }}>{a}</button>
            ))}
          </div>
        </div>
      ) : entregada ? (
        <div className="px-5 pt-6 pb-10">
          <div className="px-4 py-5" style={{ background: C.papel2 }}>
            <Rotulo>Vale de bodega</Rotulo>
            <div style={{ fontFamily: MONO, fontSize: 26, marginTop: 4 }}>{folio}</div>
            <div style={{ fontSize: 12.5, color: C.suave, marginTop: 8, lineHeight: 1.6 }}>Bodega central → {destino}<br />Entrega: J. Mora · Recibe: pendiente de firma<br />{new Date().toLocaleString("es-CL")}</div>
            <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.linea}` }}>
              {Object.entries(carro).map(([id, q]) => {
                const i = insumos.find((x) => x.id === id);
                return (
                  <div key={id} className="flex justify-between py-1" style={{ fontFamily: MONO, fontSize: 12.5 }}>
                    <span>{num(q)} {i.u} · {i.nombre}</span>
                    <span>{plata(q * i.costo)}</span>
                  </div>
                );
              })}
              <div className="flex justify-between pt-3 mt-2" style={{ borderTop: `1px solid ${C.linea}`, fontFamily: MONO, fontSize: 15 }}>
                <span>Total valorizado</span>
                <span>{plata(totalCarro)}</span>
              </div>
            </div>
          </div>
          <div className="mt-5">
            <Boton onClick={() => { setDestino(null); setCarro({}); setEntregada(false); setVista("inicio"); }}>Listo</Boton>
          </div>
        </div>
      ) : (
        <div>
          <div className="px-5 pt-5"><Coach>La cantidad se valoriza al costo promedio ponderado del insumo, no a la última factura. Así una compra cara puntual no distorsiona el costo del área.</Coach></div>
          <div className="flex flex-col gap-px" style={{ background: C.linea }}>
            {insumos.filter((i) => i.stock && Object.prototype.hasOwnProperty.call(i.stock, "Bodega central")).map((i) => {
              const q = carro[i.id] || 0;
              return (
                <div key={i.id} className="flex items-center justify-between px-4 py-3" style={{ background: C.papel }}>
                  <div className="flex-1 pr-3">
                    <div style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 600 }}>{i.nombre}</div>
                    <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.suave }}>{plata(i.costo)} / {i.u} · quedan {num(i.stock["Bodega central"])}</div>
                  </div>
                  <Stepper valor={q} onCambiar={(v) => setCarro((c) => ({ ...c, [i.id]: v }))} />
                </div>
              );
            })}
          </div>
          <div className="px-5 py-5">
            <div className="flex justify-between mb-4" style={{ fontFamily: MONO, fontSize: 15 }}><span style={{ color: C.suave }}>Total del vale</span><span>{plata(totalCarro)}</span></div>
            <Boton disabled={totalCarro === 0} onClick={() => setEntregada(true)}>Confirmar entrega</Boton>
          </div>
        </div>
      )}
    </div>
  );

  const Desviaciones = (() => {
    const demo = [
      { nombre: "Pisco 40°", area: "Barra", valor: -71400, causa: "Sobreporcionado en trago" },
      { nombre: "Lomo vetado", area: "Cocina caliente", valor: -48000, causa: "Rendimiento bajo lo fichado" },
      { nombre: "Palta Hass", area: "Cocina fría", valor: -29900, causa: "Merma no registrada" },
      { nombre: "Queso parmesano", area: "Cocina caliente", valor: -18400, causa: "Sin causa asignada" },
      { nombre: "Cerveza artesanal", area: "Barra", valor: 9500, causa: "Recepción mal digitada" },
    ];
    const max = Math.max(...demo.map((d) => Math.abs(d.valor)));
    return (
      <div>
        <Encabezado titulo="Desviaciones del mes" paso="Julio · valorizadas a costo" onVolver={() => setVista("inicio")} />
        <div className="px-5 pt-5">
          <Coach>Ordenadas por plata, no por unidades. Cuatro paltas perdidas importan menos que media botella de pisco, aunque el conteo muestre lo contrario.</Coach>
          <div className="flex flex-col gap-4 pb-10">
            {demo.map((d) => (
              <div key={d.nombre}>
                <div className="flex justify-between items-baseline">
                  <span style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 600 }}>{d.nombre}</span>
                  <span style={{ fontFamily: MONO, fontSize: 14, color: d.valor < 0 ? C.alerta : C.ok }}>{d.valor < 0 ? "−" : "+"}{plata(Math.abs(d.valor))}</span>
                </div>
                <div className="mt-1.5" style={{ height: 6, background: C.papel2 }}><div style={{ height: 6, width: `${(Math.abs(d.valor) / max) * 100}%`, background: d.valor < 0 ? C.alerta : C.ok }} /></div>
                <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.suave, marginTop: 5 }}>{d.area} · {d.causa}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  })();

  /* ═══════════════════════ ADMINISTRADOR DE SKU ═══════════════════════ */

  const sinCodigo = insumos.filter((i) => !i.codigoGenerado);
  const [modoSeleccion, setModoSeleccion] = useState(false);

  const AdministrarSKU = (
    <div>
      <Encabezado
        titulo="Administrar ingredientes"
        paso={`${insumos.length} SKU · ${sinCodigo.length} sin código`}
        onVolver={() => (modoSeleccion ? (setModoSeleccion(false), setSeleccionMasiva([])) : setVista("inicio"))}
      />
      <div className="px-5 pt-5">
        <Coach>
          Cada ingrediente puede vivir en varias bodegas o áreas a la vez. El código se genera <b>una sola vez por ingrediente</b> — una vez creado queda fijo, así que conviene revisar bien antes de imprimir.
        </Coach>

        {!modoSeleccion && sinCodigo.length > 0 && (
          <button onClick={() => setModoSeleccion(true)} className="w-full flex items-center justify-between px-4 py-3 mb-4" style={{ background: "rgba(59,107,74,0.1)", borderLeft: `3px solid ${C.ok}` }}>
            <span style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: "#2A4E36" }}>Generar códigos para varios a la vez</span>
            <span style={{ fontFamily: MONO, fontSize: 13, color: C.ok }}>→</span>
          </button>
        )}

        <div className="flex flex-col gap-px mb-6" style={{ background: C.linea }}>
          {insumos.map((i) => {
            const seleccionado = seleccionMasiva.includes(i.id);
            return (
              <div key={i.id} className="px-4 py-3 flex items-start gap-3" style={{ background: C.papel }}>
                {modoSeleccion && (
                  <button
                    onClick={() => i.codigoGenerado ? null : toggleSeleccionMasiva(i.id)}
                    disabled={i.codigoGenerado}
                    className="mt-0.5"
                    style={{ fontFamily: MONO, fontSize: 16, color: i.codigoGenerado ? C.linea : seleccionado ? C.ok : C.suave, opacity: i.codigoGenerado ? 0.4 : 1 }}
                  >
                    {seleccionado ? "✓" : "○"}
                  </button>
                )}
                <button onClick={() => !modoSeleccion && abrirEditarSKU(i)} className="flex-1 text-left" disabled={modoSeleccion}>
                  <div style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 600 }}>{i.nombre}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.suave, marginTop: 2 }}>{i.id} · {plata(i.costo)}/{i.u}</div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Object.keys(i.stock).map((a) => (
                      <span key={a} className="px-2 py-0.5" style={{ background: C.papel2, fontFamily: MONO, fontSize: 10, color: C.suave }}>{a}</span>
                    ))}
                  </div>
                </button>
                {!modoSeleccion && (
                  i.codigoGenerado ? (
                    <button onClick={() => { setCodigoDe(i); setVista("verCodigo"); }} className="px-2 py-2" style={{ background: C.carbon, color: C.papel }} aria-label="Ver código">▤</button>
                  ) : (
                    <button onClick={() => generarCodigoIndividual(i)} className="px-3 py-2" style={{ background: C.ok, color: "#fff", fontFamily: MONO, fontSize: 10.5, whiteSpace: "nowrap" }}>
                      generar
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
      {modoSeleccion ? (
        <div className="px-5 pb-10 flex flex-col gap-3">
          <div className="flex gap-px" style={{ background: C.linea }}>
            {["barra", "qr"].map((t) => (
              <button key={t} onClick={() => setTipoCodigoMasivo(t)} className="flex-1 py-2" style={{ background: tipoCodigoMasivo === t ? C.carbon : C.papel2, color: tipoCodigoMasivo === t ? C.papel : C.tinta, fontFamily: SANS, fontSize: 12.5, fontWeight: 600 }}>
                {t === "barra" ? "Barras" : "QR"}
              </button>
            ))}
          </div>
          <Boton disabled={seleccionMasiva.length === 0} onClick={() => generarCodigosMasivo(seleccionMasiva, tipoCodigoMasivo)}>
            Generar {seleccionMasiva.length || ""} código{seleccionMasiva.length === 1 ? "" : "s"}
          </Boton>
        </div>
      ) : (
        <div className="px-5 pb-10"><Boton onClick={abrirNuevoSKU}>Nuevo ingrediente</Boton></div>
      )}
    </div>
  );

  const EditarSKU = formSKU && (
    <div>
      <Encabezado titulo={editando === "nuevo" ? "Nuevo ingrediente" : "Editar ingrediente"} paso={editando === "nuevo" ? "Alta de SKU" : formSKU.id} onVolver={() => setVista("administrarSKU")} />
      <div className="px-5 pt-5 pb-10">
        <Rotulo>SKU</Rotulo>
        <input
          value={formSKU.id}
          disabled={editando !== "nuevo"}
          onChange={(e) => setFormSKU((f) => ({ ...f, id: e.target.value.toUpperCase() }))}
          placeholder="ej: VER-025"
          className="w-full px-3 py-2 mb-4 mt-1"
          style={{ background: editando !== "nuevo" ? C.papel2 : "#fff", border: `1px solid ${C.linea}`, fontFamily: MONO, fontSize: 14 }}
        />
        <Rotulo>Nombre</Rotulo>
        <input value={formSKU.nombre} onChange={(e) => setFormSKU((f) => ({ ...f, nombre: e.target.value }))} className="w-full px-3 py-2 mb-4 mt-1" style={{ background: "#fff", border: `1px solid ${C.linea}`, fontFamily: SANS, fontSize: 14 }} />
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <Rotulo>Categoría</Rotulo>
            <input value={formSKU.cat} onChange={(e) => setFormSKU((f) => ({ ...f, cat: e.target.value }))} className="w-full px-3 py-2 mt-1" style={{ background: "#fff", border: `1px solid ${C.linea}`, fontFamily: SANS, fontSize: 14 }} />
          </div>
          <div>
            <Rotulo>Unidad</Rotulo>
            <input value={formSKU.u} onChange={(e) => setFormSKU((f) => ({ ...f, u: e.target.value }))} className="w-full px-3 py-2 mt-1" style={{ background: "#fff", border: `1px solid ${C.linea}`, fontFamily: SANS, fontSize: 14 }} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div>
            <Rotulo>Costo</Rotulo>
            <input type="number" value={formSKU.costo} onChange={(e) => setFormSKU((f) => ({ ...f, costo: e.target.value }))} className="w-full px-3 py-2 mt-1" style={{ background: "#fff", border: `1px solid ${C.linea}`, fontFamily: MONO, fontSize: 14 }} />
          </div>
          <div>
            <Rotulo>Tolerancia %</Rotulo>
            <input type="number" value={formSKU.tol} onChange={(e) => setFormSKU((f) => ({ ...f, tol: e.target.value }))} className="w-full px-3 py-2 mt-1" style={{ background: "#fff", border: `1px solid ${C.linea}`, fontFamily: MONO, fontSize: 14 }} />
          </div>
        </div>

        <Rotulo>Se cuenta en estas bodegas / áreas</Rotulo>
        <div className="flex flex-col gap-px mt-2 mb-6" style={{ background: C.linea }}>
          {areas.map((a) => (
            <button key={a} onClick={() => toggleAreaForm(a)} className="flex items-center justify-between px-4 py-3" style={{ background: C.papel }}>
              <span style={{ fontFamily: SANS, fontSize: 14 }}>{a}</span>
              <span style={{ fontFamily: MONO, fontSize: 16, color: formSKU.areas.includes(a) ? C.ok : C.linea }}>{formSKU.areas.includes(a) ? "✓" : "○"}</span>
            </button>
          ))}
        </div>

        <Boton disabled={!formSKU.id || !formSKU.nombre || formSKU.areas.length === 0} onClick={guardarSKU}>
          {editando === "nuevo" ? "Crear ingrediente" : "Guardar cambios"}
        </Boton>
      </div>
    </div>
  );

  const VerCodigo = codigoDe && (
    <div>
      <Encabezado titulo={codigoDe.nombre} paso="Código de identificación" onVolver={() => setVista("administrarSKU")} />
      <div className="px-5 pt-8 pb-10 flex flex-col items-center">
        <div className="flex gap-px mb-8" style={{ background: C.linea }}>
          {["barra", "qr"].map((t) => (
            <button key={t} onClick={() => setTipoCodigo(t)} className="px-5 py-2" style={{ background: tipoCodigo === t ? C.carbon : C.papel, color: tipoCodigo === t ? C.papel : C.tinta, fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>
              {t === "barra" ? "Código de barras" : "Código QR"}
            </button>
          ))}
        </div>
        <div className="px-8 py-8" style={{ background: "#fff", border: `1px solid ${C.linea}` }}>
          <Codigo insumo={codigoDe} tipo={tipoCodigo} />
        </div>
        <div className="mt-6 text-center px-4">
          <div style={{ fontFamily: SANS, fontSize: 13, color: C.suave }}>Imprimí y pegá en el envase o estante.</div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: C.suave }}>Barras y QR son dos formatos del mismo código — cambiar la vista no genera uno nuevo.</div>
        </div>
        <div className="mt-4 px-3 py-1.5" style={{ background: "rgba(35,43,39,0.06)", fontFamily: MONO, fontSize: 10.5, color: C.suave, letterSpacing: "0.05em" }}>
          CÓDIGO FIJO · NO SE PUEDE REGENERAR
        </div>
        <div className="w-full mt-8"><Boton tono="borde" onClick={() => window.print?.()}>Enviar a impresión</Boton></div>
      </div>
    </div>
  );

  const LoteGenerado = loteGenerado && (
    <div>
      <Encabezado titulo="Códigos generados" paso={`${loteGenerado.ids.length} ingredientes`} onVolver={() => setVista("administrarSKU")} />
      <div className="px-5 pt-5 pb-10">
        <Coach>Quedaron marcados como bloqueados — no se puede volver a generar un código para ninguno de estos. Imprimí desde acá antes de salir.</Coach>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {loteGenerado.ids.map((id) => {
            const i = insumos.find((x) => x.id === id);
            return (
              <div key={id} className="px-3 py-4 flex flex-col items-center" style={{ background: "#fff", border: `1px solid ${C.linea}` }}>
                <Codigo insumo={i} tipo={loteGenerado.tipo} />
                <div style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 600, marginTop: 6, textAlign: "center" }}>{i.nombre}</div>
              </div>
            );
          })}
        </div>
        <Boton onClick={() => window.print?.()}>Enviar todo a impresión</Boton>
      </div>
    </div>
  );

  /* ═══════════════════════════ IMPORTADOR MASIVO ═══════════════════════════ */

  const ImportarInicio = (
    <div>
      <Encabezado titulo="Importar catálogo" paso="Paso 1 de 3 · Origen del archivo" onVolver={() => setVista("inicio")} />
      <div className="px-5 pt-5">
        <Coach>Formato esperado: CSV con columnas <b>sku, nombre, categoria, unidad, costo, area</b>. Si tu sistema exporta con otros nombres de columna, los mapeas en el paso siguiente.</Coach>
        <button onClick={() => archivoCSV.current?.click()} className="w-full px-4 py-8 flex flex-col items-center justify-center gap-2 mb-3" style={{ background: C.papel2, border: `1px dashed ${C.suave}` }}>
          <span style={{ fontFamily: MONO, fontSize: 22 }}>↑</span>
          <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600 }}>Subir archivo .csv</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.suave }}>o arrastralo aquí</span>
        </button>
        <input ref={archivoCSV} type="file" accept=".csv,text/csv" onChange={cargarArchivo} style={{ display: "none" }} />
        <button onClick={cargarCSVDemo} className="w-full py-3 mb-6" style={{ background: "transparent", border: `1px solid ${C.linea}`, fontFamily: SANS, fontSize: 13.5 }}>Usar archivo de ejemplo para ver cómo funciona</button>
        <Rotulo>También podés</Rotulo>
        <div className="flex flex-col gap-px mt-2" style={{ background: C.linea }}>
          {["Descargar planilla modelo (.csv)", "Conectar por API con tu ERP", "Sincronizar desde Google Sheets"].map((t) => (
            <div key={t} className="px-4 py-3 flex justify-between items-center" style={{ background: C.papel, opacity: 0.5 }}>
              <span style={{ fontFamily: SANS, fontSize: 13.5 }}>{t}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.suave }}>PRÓXIMAMENTE</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const ImportarMapeo = filasCSV && (
    <div>
      <Encabezado titulo="Confirmar columnas" paso="Paso 2 de 3 · Mapeo" onVolver={() => setFilasCSV(null)} />
      <div className="px-5 pt-5 pb-10">
        <Coach>Así leímos tu archivo. Revisá que cada campo del sistema esté apuntando a la columna correcta antes de validar.</Coach>
        <div className="flex flex-col gap-px mb-6" style={{ background: C.linea }}>
          {Object.entries(mapeo).map(([campo, columna]) => (
            <div key={campo} className="flex items-center justify-between px-4 py-3" style={{ background: C.papel }}>
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.suave, textTransform: "uppercase", letterSpacing: "0.05em" }}>{campo}</span>
              <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600 }}>{columna}</span>
            </div>
          ))}
        </div>
        <Boton onClick={() => setVista("importarValidacion")}>Validar {filasCSV.length} filas</Boton>
      </div>
    </div>
  );

  const ImportarValidacion = filasCSV && (
    <div>
      <Encabezado titulo="Revisión antes de importar" paso="Paso 3 de 3 · Validación" onVolver={() => setVista("importarInicio")} />
      <div className="px-5 pt-5">
        <div className="flex gap-px mb-5" style={{ background: C.linea }}>
          <div className="flex-1 px-4 py-4" style={{ background: C.papel2 }}>
            <Rotulo>Listas para importar</Rotulo>
            <div style={{ fontFamily: MONO, fontSize: 27, marginTop: 3, color: C.ok }}>{filasValidas.filter((f) => !f._duplicado).length}</div>
          </div>
          <div className="flex-1 px-4 py-4" style={{ background: C.papel2 }}>
            <Rotulo>Con error</Rotulo>
            <div style={{ fontFamily: MONO, fontSize: 27, marginTop: 3, color: filasConError.length ? C.alerta : C.suave }}>{filasConError.length}</div>
          </div>
        </div>
        {filasConError.length > 0 && <Coach>Las filas con error no se importan. Corregí el archivo original y volvé a subirlo.</Coach>}
        <div className="flex flex-col gap-px mb-8" style={{ background: C.linea }}>
          {filasCSV.map((f) => (
            <div key={f._fila} className="px-4 py-3" style={{ background: C.papel }}>
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1">
                  <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600 }}>{f.nombre || <span style={{ color: C.suave }}>(sin nombre)</span>}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.suave, marginTop: 2 }}>fila {f._fila} · {f.sku || "sin sku"} · {f.area}</div>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 13 }}>{f.costo ? plata(parseFloat(f.costo)) : "—"}</div>
              </div>
              {f._duplicado && <div className="mt-2 px-2 py-1" style={{ background: "rgba(156,122,46,0.1)", fontSize: 11.5, color: C.ambar }}>Ya existe un insumo con este SKU — se omitirá para no duplicar.</div>}
              {f._errores.map((e) => (<div key={e} className="mt-2 px-2 py-1" style={{ background: "rgba(168,58,34,0.08)", fontSize: 11.5, color: C.alerta }}>{e}</div>))}
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 pb-10">
        <Boton disabled={filasValidas.filter((f) => !f._duplicado).length === 0} onClick={confirmarImportacion}>Importar {filasValidas.filter((f) => !f._duplicado).length} ingredientes</Boton>
      </div>
    </div>
  );

  const ImportarCodigos = (
    <div>
      <Encabezado titulo="Importación completa" paso={`${insumosRecienImportados.length} ingredientes nuevos`} onVolver={() => setVista("inicio")} />
      <div className="px-5 pt-5 pb-10">
        <Coach>Se cargaron sin código. Generalos ahora mientras están frescos en la lista, o hacelo después desde "Administrar ingredientes" — quedan disponibles ahí de todos modos.</Coach>
        <div className="flex flex-col gap-px mb-6" style={{ background: C.linea }}>
          {insumosRecienImportados.map((id) => {
            const i = insumos.find((x) => x.id === id);
            if (!i) return null;
            return (
              <div key={id} className="px-4 py-3 flex justify-between items-center" style={{ background: C.papel }}>
                <div>
                  <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600 }}>{i.nombre}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: C.suave }}>{i.id} · {Object.keys(i.stock)[0]}</div>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.ambar }}>SIN CÓDIGO</span>
              </div>
            );
          })}
        </div>
        <div className="flex gap-px mb-4" style={{ background: C.linea }}>
          {["barra", "qr"].map((t) => (
            <button key={t} onClick={() => setTipoCodigoMasivo(t)} className="flex-1 py-2" style={{ background: tipoCodigoMasivo === t ? C.carbon : C.papel2, color: tipoCodigoMasivo === t ? C.papel : C.tinta, fontFamily: SANS, fontSize: 12.5, fontWeight: 600 }}>
              {t === "barra" ? "Código de barras" : "Código QR"}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <Boton onClick={() => generarCodigosMasivo(insumosRecienImportados, tipoCodigoMasivo)}>Generar los {insumosRecienImportados.length} códigos ahora</Boton>
          <Boton tono="borde" onClick={() => setVista("inicio")}>Hacerlo después</Boton>
        </div>
      </div>
    </div>
  );

  /* ═══════════════════════════ HISTÓRICO ═══════════════════════════ */

  const Historico = (
    <div>
      <Encabezado titulo="Histórico" paso={`${historico.length} registros`} onVolver={() => setVista("inicio")} />
      <div className="px-5 pt-5 pb-10">
        <Coach>Conteos cerrados y solicitudes ya despachadas. Los datos originales no se editan — si algo cambió después, queda como un evento nuevo, no como una corrección del anterior.</Coach>
        <div className="flex flex-col gap-3">
          {historico.map((h) => (
            <button key={h.id} onClick={() => { setDetalleHistorico(h); setVista("detalleHistorico"); }} className="w-full text-left px-4 py-4" style={{ background: C.papel2 }}>
              <div className="flex justify-between items-center">
                <span style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 650 }}>
                  {h.tipo === "conteo" ? "Conteo · " : "Solicitud · "}{h.area}
                </span>
                <span className="px-2 py-0.5" style={{ fontFamily: MONO, fontSize: 10, background: h.tipo === "conteo" ? "rgba(35,43,39,0.08)" : "rgba(59,107,74,0.15)", color: h.tipo === "conteo" ? C.tinta : C.ok }}>
                  {h.tipo === "conteo" ? `${h.precision}%` : (h.estado || "").toUpperCase()}
                </span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.suave, marginTop: 4 }}>{h.id} · {h.fecha}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const DetalleHistorico = detalleHistorico && (
    <div>
      <Encabezado titulo={detalleHistorico.id} paso={`${detalleHistorico.area} · ${detalleHistorico.fecha}`} onVolver={() => setVista("historico")} />
      <div className="px-5 pt-5 pb-10">
        {detalleHistorico.tipo === "conteo" ? (
          <>
            <div className="flex gap-px mb-5" style={{ background: C.linea }}>
              <div className="flex-1 px-4 py-4" style={{ background: C.papel2 }}>
                <Rotulo>Precisión</Rotulo>
                <div style={{ fontFamily: MONO, fontSize: 24, marginTop: 3 }}>{detalleHistorico.precision}%</div>
              </div>
              <div className="flex-1 px-4 py-4" style={{ background: C.papel2 }}>
                <Rotulo>Desviación neta</Rotulo>
                <div style={{ fontFamily: MONO, fontSize: 24, marginTop: 3, color: detalleHistorico.desviacionNeta < 0 ? C.alerta : C.ok }}>
                  {detalleHistorico.desviacionNeta < 0 ? "−" : "+"}{plata(Math.abs(detalleHistorico.desviacionNeta))}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-px" style={{ background: C.linea }}>
              {detalleHistorico.items.map((it) => (
                <div key={it.nombre} className="flex justify-between px-4 py-3" style={{ background: C.papel }}>
                  <span style={{ fontFamily: SANS, fontSize: 14 }}>{it.nombre}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12.5, color: C.suave }}>{num(it.contado)} / {num(it.teorico)} {it.u}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-px" style={{ background: C.linea }}>
            {detalleHistorico.items.map((it) => (
              <div key={it.nombre} className="flex justify-between px-4 py-3" style={{ background: C.papel }}>
                <span style={{ fontFamily: SANS, fontSize: 14 }}>{it.nombre}</span>
                <span style={{ fontFamily: MONO, fontSize: 12.5 }}>
                  {it.enviado !== it.pedido ? (
                    <><span style={{ textDecoration: "line-through", color: C.suave }}>{it.pedido}</span> <span style={{ color: C.ambar }}>{it.enviado}</span></>
                  ) : num(it.pedido)}{" "}{it.u}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  /* ═══════════════════════════ PANTALLAS · ÁREA ═══════════════════════════ */

  const asignados = (ASIGNADO_POR_AREA[miArea] || []).map((id) => insumos.find((i) => i.id === id)).filter(Boolean);

  const AreaInicio = (
    <div>
      <div className="flex items-center justify-between px-5 pt-6">
        <Rotulo>{miArea}</Rotulo>
        <Insignia rol={rol} nombre={sesion?.nombre} onCambiarRol={() => setRol(null)} onCerrarSesion={cerrarSesion} />
      </div>
      <div className="px-5 pb-6 pt-2">
        <h1 style={{ fontFamily: SANS, fontSize: 27, fontWeight: 680, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Hola, equipo<br />de {miArea.toLowerCase()}</h1>
      </div>
      <div className="px-5 mb-6">
        <select value={miArea} onChange={(e) => setMiArea(e.target.value)} className="w-full px-3 py-2" style={{ background: C.papel2, border: `1px solid ${C.linea}`, fontFamily: MONO, fontSize: 12 }}>
          {Object.keys(ASIGNADO_POR_AREA).map((a) => (<option key={a} value={a}>Ver como: {a}</option>))}
        </select>
      </div>
      <div className="px-5 flex flex-col gap-3 pb-10">
        <button onClick={() => setVista("pedirNuevo")} className="w-full text-left px-4 py-5" style={{ background: C.carbon, color: C.papel }}>
          <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 650 }}>Pedir a bodega</div>
          <div style={{ fontSize: 13, opacity: 0.6, marginTop: 2 }}>Solicitar reposición de tu listado</div>
        </button>
        <button
          onClick={() => {
            setAreaConteo(miArea);
            const abierta = tomasAbiertas[miArea];
            if (abierta) {
              const previo = conteosGuardadosPorArea.current[miArea] || {};
              setConteo(previo);
              const primerPendiente = listaArea.findIndex((i) => previo[i.id] === undefined);
              setIndice(primerPendiente >= 0 ? primerPendiente : 0);
              setVista("contarArea");
            } else {
              setFormNuevaToma({ persona: "" });
              setVista("generarToma");
            }
          }}
          className="w-full text-left px-4 py-5"
          style={{ background: C.carbon, color: C.papel }}
        >
          <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 650 }}>Contar mi zona</div>
          <div style={{ fontSize: 13, opacity: 0.6, marginTop: 2 }}>
            {tomasAbiertas[miArea] ? `Toma abierta por ${tomasAbiertas[miArea].persona} · ${tomasAbiertas[miArea].contados}/${tomasAbiertas[miArea].total} — retomar` : "Conteo rápido de lo que tenés hoy"}
          </div>
        </button>
        <button onClick={() => setVista("misSolicitudes")} className="w-full text-left px-4 py-5" style={{ background: C.papel2, color: C.tinta, border: `1px solid ${C.linea}` }}>
          <div style={{ fontFamily: SANS, fontSize: 16, fontWeight: 650 }}>Mis solicitudes</div>
          <div style={{ fontSize: 13, color: C.suave, marginTop: 2 }}>{solicitudes.filter((s) => s.area === miArea).length} enviada(s) · seguimiento de despacho</div>
        </button>
        <button onClick={() => setVista("crearZona")} className="w-full text-left px-4 py-3" style={{ background: "transparent", color: C.suave, fontFamily: SANS, fontSize: 13 }}>
          + crear una zona de conteo nueva
        </button>
      </div>
    </div>
  );

  /* Previsualización: muestra lo último que el área contó, antes
     de dejarla pasar al armado del pedido. Es lectura, no edición. */
  const PrevisualizarConteo = (() => {
    const ultimo = ultimoConteoArea[miArea];
    return (
      <div>
        <Encabezado titulo="Lo que contaste" paso={ultimo ? `Último conteo · ${ultimo.fecha}` : miArea} onVolver={() => setVista("areaInicio")} />
        <div className="px-5 pt-5">
          {!ultimo ? (
            <Coach>Todavía no hay un conteo cerrado de {miArea}. Contá tu zona primero para tener esta referencia al pedir.</Coach>
          ) : (
            <>
              <Coach>Esto es lo que quedó registrado la última vez que contaste. Usalo como referencia para decidir cuánto pedir — no se actualiza solo, hacé un conteo nuevo cuando quieras refrescarlo.</Coach>
              <div className="flex flex-col gap-px mb-6" style={{ background: C.linea }}>
                {Object.entries(ultimo.items).map(([id, cant]) => {
                  const i = insumos.find((x) => x.id === id);
                  if (!i) return null;
                  return (
                    <div key={id} className="flex justify-between px-4 py-3" style={{ background: C.papel }}>
                      <span style={{ fontFamily: SANS, fontSize: 14 }}>{i.nombre}</span>
                      <span style={{ fontFamily: MONO, fontSize: 14 }}>{num(cant)} {i.u}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="px-5 pb-10">
          <Boton onClick={() => setVista("pedirNuevo")}>{ultimo ? "Armar pedido con esta referencia" : "Ir a pedir de todos modos"}</Boton>
        </div>
      </div>
    );
  })();

  const PedirNuevo = (
    <div>
      <Encabezado titulo="Pedir a bodega" paso={`${miArea} · listado asignado`} onVolver={() => { setPedidoNuevo({}); setVista("areaInicio"); }} />
      <div className="px-5 pt-5">
        <button onClick={() => setVista("previsualizarConteo")} className="w-full flex items-center justify-between px-4 py-3 mb-4" style={{ background: C.papel2, borderLeft: `3px solid ${C.carbon}` }}>
          <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>Ver lo último que conté antes de pedir</span>
          <span style={{ fontFamily: MONO, fontSize: 13 }}>→</span>
        </button>
        <Coach>Solo ves los insumos que bodega asignó a tu área. Si falta algo que necesitás seguido, pedile a bodega que lo agregue a tu listado.</Coach>
        <div className="flex flex-col gap-px mb-6" style={{ background: C.linea }}>
          {asignados.map((i) => {
            const q = pedidoNuevo[i.id] || 0;
            const contado = ultimoConteoArea[miArea]?.items[i.id];
            return (
              <div key={i.id} className="flex items-center justify-between px-4 py-3" style={{ background: C.papel }}>
                <div className="flex-1 pr-3">
                  <div style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 600 }}>{i.nombre}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.suave }}>
                    se pide en {i.u}{contado !== undefined && <> · contaste {num(contado)}</>}
                  </div>
                </div>
                <Stepper valor={q} onCambiar={(v) => setPedidoNuevo((p) => ({ ...p, [i.id]: v }))} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="px-5 pb-10"><Boton disabled={Object.values(pedidoNuevo).every((q) => !q)} onClick={enviarSolicitud}>Enviar solicitud</Boton></div>
    </div>
  );

  const MisSolicitudes = (() => {
    const mias = solicitudes.filter((s) => s.area === miArea);
    return (
      <div>
        <Encabezado titulo="Mis solicitudes" paso={miArea} onVolver={() => setVista("areaInicio")} />
        <div className="px-5 pt-5 pb-10">
          {mias.length === 0 && <Coach>Todavía no enviaste pedidos desde esta área.</Coach>}
          <div className="flex flex-col gap-3">
            {mias.map((s) => (
              <div key={s.id} className="px-4 py-4" style={{ background: C.papel2 }}>
                <div className="flex justify-between items-center mb-2">
                  <span style={{ fontFamily: MONO, fontSize: 13 }}>{s.id}</span>
                  <span className="px-2 py-0.5" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.05em", background: s.estado === "pendiente" ? "rgba(156,122,46,0.15)" : "rgba(59,107,74,0.15)", color: s.estado === "pendiente" ? C.ambar : C.ok }}>
                    {s.estado === "pendiente" ? "EN BODEGA" : "DESPACHADA"}
                  </span>
                </div>
                {s.items.map((it) => {
                  const i = insumos.find((x) => x.id === it.id);
                  const ajustado = it.enviado !== undefined && it.enviado !== it.pedido;
                  return (
                    <div key={it.id} className="flex justify-between" style={{ fontFamily: MONO, fontSize: 12.5, marginTop: 3 }}>
                      <span>{i.nombre}</span>
                      <span>{ajustado ? (<><span style={{ textDecoration: "line-through", color: C.suave }}>{it.pedido}</span> <span style={{ color: C.ambar }}>{it.enviado}</span></>) : num(it.pedido)} {i.u}</span>
                    </div>
                  );
                })}
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.suave, marginTop: 6 }}>{s.creada}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  })();

  const [verPendientesArea, setVerPendientesArea] = useState(false);
  const pendientesArea = useMemo(() => listaArea.filter((i) => conteo[i.id] === undefined), [listaArea, conteo]);

  const ContarArea = actualArea && (
    <div className="flex flex-col" style={{ minHeight: "100%" }}>
      <Encabezado titulo={miArea} paso={`${indice + 1} de ${listaArea.length} · ${tomasAbiertas[miArea]?.persona || ""}`} onVolver={() => (indice === 0 ? setVista("areaInicio") : setIndice(indice - 1))} />
      <div style={{ height: 3, background: C.papel2 }}>
        <div style={{ height: 3, width: `${((indice + 1) / listaArea.length) * 100}%`, background: C.carbon, transition: "width 200ms" }} />
      </div>

      <button onClick={() => setVerPendientesArea((v) => !v)} className="w-full flex items-center justify-between px-5 py-2.5" style={{ background: pendientesArea.length ? "rgba(168,58,34,0.08)" : "rgba(59,107,74,0.08)" }}>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.05em", color: pendientesArea.length ? C.alerta : C.ok }}>
          {pendientesArea.length} de {listaArea.length} sin contar
        </span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.suave }}>{verPendientesArea ? "ocultar ▲" : "ver ▼"}</span>
      </button>

      {verPendientesArea && (
        <div className="px-5 py-3" style={{ background: C.papel2, maxHeight: 180, overflowY: "auto" }}>
          <div className="flex flex-col gap-px" style={{ background: C.linea }}>
            {listaArea.map((i, pos) => {
              const hecho = conteo[i.id] !== undefined;
              return (
                <button key={i.id} onClick={() => { setIndice(pos); setVerPendientesArea(false); }} className="flex items-center justify-between px-3 py-2 text-left" style={{ background: C.papel }}>
                  <span style={{ fontFamily: SANS, fontSize: 13, color: hecho ? C.suave : C.tinta, fontWeight: hecho ? 400 : 600 }}>{i.nombre}</span>
                  {hecho ? <span style={{ fontFamily: MONO, fontSize: 11, color: C.ok }}>✓</span> : <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.alerta }}>SIN CONTAR</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-5 pt-6 pb-4 flex-1">
        {indice === 0 && !verPendientesArea && <Coach>Esto queda registrado como tu último conteo de zona y alimenta la previsualización al pedir. El conteo de área es siempre manual.</Coach>}
        <Rotulo>{actualArea.id}</Rotulo>
        <div className="mt-1" style={{ fontFamily: SANS, fontSize: 25, fontWeight: 660, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{actualArea.nombre}</div>
        <div style={{ fontSize: 13, color: C.suave, marginTop: 4 }}>se cuenta en {actualArea.u}</div>
      </div>
      <Visor valor={entrada} unidad={actualArea.u} />
      <Teclado valor={entrada} onCambio={setEntrada} />
      <Boton
        disabled={entrada === ""}
        onClick={() => {
          const nuevoConteo = { ...conteo, [actualArea.id]: { cant: parseFloat(entrada.replace(",", ".")) } };
          setConteo(nuevoConteo);
          setTomasAbiertas((t) => (t[miArea] ? { ...t, [miArea]: { ...t[miArea], contados: Object.keys(nuevoConteo).length } } : t));
          setEntrada("");
          if (indice + 1 < listaArea.length) setIndice(indice + 1);
          else cerrarConteoAreaDesde(nuevoConteo);
        }}
      >
        {indice + 1 === listaArea.length ? "Cerrar conteo de zona" : "Guardar y seguir"}
      </Boton>
      {Object.keys(conteo).length > 0 && (
        <button onClick={() => setVista("resumenParcialArea")} className="w-full py-3" style={{ background: "transparent", fontFamily: SANS, fontSize: 12.5, color: C.suave }}>
          Dejar en pausa y seguir después ({pendientesArea.length} sin contar todavía)
        </button>
      )}
    </div>
  );

  const ResumenParcialArea = (
    <div>
      <Encabezado titulo="Pausar toma" paso={miArea} onVolver={() => setVista("contarArea")} />
      <div className="px-5 pt-5">
        <Coach>
          Quedarían <b>{pendientesArea.length} ítem(s) sin contar</b>. Lo que ya registraste se guarda igual, y la próxima vez que entres a esta zona vas a poder retomar justo donde quedaste.
        </Coach>
        {pendientesArea.length > 0 && (
          <div className="flex flex-col gap-px mb-6" style={{ background: C.linea }}>
            {pendientesArea.map((i) => (
              <div key={i.id} className="flex items-center justify-between px-4 py-3" style={{ background: C.papel }}>
                <span style={{ fontFamily: SANS, fontSize: 14 }}>{i.nombre}</span>
                <span className="px-2 py-0.5" style={{ fontFamily: MONO, fontSize: 9.5, background: "rgba(168,58,34,0.1)", color: C.alerta }}>SIN CONTAR</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="px-5 pb-10 flex flex-col gap-3">
        <Boton onClick={() => cerrarConteoAreaDesde(conteo, true)}>Pausar y salir</Boton>
        <Boton tono="borde" onClick={() => setVista("contarArea")}>Seguir contando</Boton>
      </div>
    </div>
  );

  /* ═══════════════════ BANDEJA DE APROBACIÓN · BODEGA ═══════════════════ */

  const Bandeja = (
    <div>
      <Encabezado titulo="Solicitudes de área" paso="Bodega · por aprobar y despachar" onVolver={() => setVista("inicio")} />
      <div className="px-5 pt-5 pb-10">
        <Coach>Ajustá cantidad antes de despachar si no hay stock suficiente. El área ve exactamente qué le mandaste versus qué pidió.</Coach>
        <div className="flex flex-col gap-3">
          {solicitudes.map((s) => (
            <button key={s.id} onClick={() => s.estado === "pendiente" && abrirRevision(s)} className="w-full text-left px-4 py-4" style={{ background: C.papel2, opacity: s.estado === "pendiente" ? 1 : 0.55 }}>
              <div className="flex justify-between items-center">
                <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 650 }}>{s.area}</span>
                <span className="px-2 py-0.5" style={{ fontFamily: MONO, fontSize: 10.5, background: s.estado === "pendiente" ? "rgba(156,122,46,0.15)" : "rgba(59,107,74,0.15)", color: s.estado === "pendiente" ? C.ambar : C.ok }}>
                  {s.estado === "pendiente" ? "PENDIENTE" : "DESPACHADA"}
                </span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.suave, marginTop: 4 }}>{s.id} · {s.items.length} ítem(s) · {s.creada}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const solEnRevision = solicitudes.find((s) => s.id === revisando);

  const RevisarSolicitud = solEnRevision && (
    <div>
      <Encabezado titulo={solEnRevision.area} paso={`${solEnRevision.id} · ajustar y despachar`} onVolver={() => setRevisando(null)} />
      <div className="px-5 pt-5">
        <div className="flex flex-col gap-px mb-6" style={{ background: C.linea }}>
          {solEnRevision.items.map((it) => {
            const i = insumos.find((x) => x.id === it.id);
            const valor = ajusteBodega[it.id] ?? it.pedido;
            const recortado = valor < it.pedido;
            return (
              <div key={it.id} className="px-4 py-3" style={{ background: C.papel }}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 pr-3">
                    <div style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 600 }}>{i.nombre}</div>
                    <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.suave }}>pedido {num(it.pedido)} {i.u} · stock actual {num(i.stock[solEnRevision.area] || 0)}</div>
                  </div>
                  <Stepper valor={valor} onCambiar={(v) => setAjusteBodega((a) => ({ ...a, [it.id]: v }))} />
                </div>
                {recortado && <div className="mt-2 px-2 py-1" style={{ background: "rgba(156,122,46,0.1)", fontSize: 11.5, color: C.ambar }}>Se envía menos de lo pedido — el área verá el ajuste marcado.</div>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="px-5 pb-10"><Boton onClick={confirmarRevision}>Confirmar y despachar</Boton></div>
    </div>
  );

  /* ═══════════════════════════ SELECTOR DE ROL ═══════════════════════════ */

  /* Verifica usuario/clave contra la base local. En producción esto
     sería una llamada a backend con hash de contraseña — acá alcanza
     con comparar en memoria porque lo que importa en el prototipo
     es el flujo completo: quién quedó logueado, y que las tomas se
     generen a su nombre sin volver a preguntarlo. */
  const intentarLogin = () => {
    const u = usuarios.find(
      (x) => x.usuario.toLowerCase() === formLogin.usuario.trim().toLowerCase() && x.clave === formLogin.clave
    );
    if (!u) {
      setErrorLogin("Usuario o contraseña incorrectos.");
      return;
    }
    setSesion(u);
    setErrorLogin("");
    setFormLogin({ usuario: "", clave: "" });
    // Si el usuario tiene un rol/área habitual, entra directo ahí;
    // igual puede cambiar de rol después con el botón de la insignia.
    if (u.rolDefecto === "area") {
      setRol("area");
      setMiArea(u.areaDefecto || "Cocina caliente");
      setVista("areaInicio");
    } else if (u.rolDefecto === "bodega") {
      setRol("bodega");
      setVista("inicio");
    } else {
      setRol(null);
    }
  };

  const Login = (
    <div className="min-h-screen flex flex-col" style={{ background: C.carbon }}>
      <div className="flex-1 flex flex-col items-center justify-center px-8 pt-12 pb-8">
        <img src={logoVitalicio} alt="Restaurant Vitalicio" style={{ width: 148, height: "auto" }} className="mb-6" />
        <h1
          className="text-center mb-1"
          style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: C.dorado, letterSpacing: "-0.01em", lineHeight: 1.2 }}
        >
          Control de inventario
        </h1>
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: "rgba(233,224,201,0.55)", letterSpacing: "0.18em" }} className="uppercase mb-10">
          Bodega · Cocina · Barra · Pastelería
        </div>

        <div className="w-full" style={{ maxWidth: 340 }}>
          <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: "rgba(233,224,201,0.6)" }} className="uppercase">Usuario</label>
          <input
            value={formLogin.usuario}
            onChange={(e) => { setFormLogin((f) => ({ ...f, usuario: e.target.value })); setErrorLogin(""); }}
            onKeyDown={(e) => e.key === "Enter" && intentarLogin()}
            placeholder="ej: jmora"
            autoCapitalize="none"
            className="w-full px-3 py-3 mt-1 mb-4"
            style={{ background: C.carbon2, border: `1px solid rgba(233,224,201,0.18)`, color: C.papel, fontFamily: SANS, fontSize: 15 }}
          />
          <label style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: "rgba(233,224,201,0.6)" }} className="uppercase">Contraseña</label>
          <input
            type="password"
            value={formLogin.clave}
            onChange={(e) => { setFormLogin((f) => ({ ...f, clave: e.target.value })); setErrorLogin(""); }}
            onKeyDown={(e) => e.key === "Enter" && intentarLogin()}
            placeholder="••••••••"
            className="w-full px-3 py-3 mt-1 mb-2"
            style={{ background: C.carbon2, border: `1px solid rgba(233,224,201,0.18)`, color: C.papel, fontFamily: SANS, fontSize: 15 }}
          />

          {errorLogin && (
            <div className="mt-2 px-3 py-2" style={{ background: "rgba(168,58,34,0.15)", fontSize: 12.5, color: "#E8A594" }}>{errorLogin}</div>
          )}

          <button
            onClick={intentarLogin}
            disabled={!formLogin.usuario.trim() || !formLogin.clave}
            className="w-full py-4 mt-6"
            style={{ background: C.dorado, color: C.carbon, fontFamily: SANS, fontSize: 15, fontWeight: 700, opacity: !formLogin.usuario.trim() || !formLogin.clave ? 0.4 : 1 }}
          >
            Ingresar
          </button>

          <button disabled className="w-full mt-3 py-4 flex items-center justify-center gap-2" style={{ background: "transparent", border: `1px solid rgba(233,224,201,0.18)`, opacity: 0.55 }}>
            <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: C.papel }}>Continuar con Google</span>
            <span style={{ fontFamily: MONO, fontSize: 9.5, color: "rgba(233,224,201,0.6)", letterSpacing: "0.05em" }}>PRÓXIMAMENTE</span>
          </button>

          <div className="mt-8 px-4 py-3" style={{ background: "rgba(233,224,201,0.06)" }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", color: "rgba(233,224,201,0.55)" }} className="uppercase">Usuarios de prueba</div>
            <div style={{ fontFamily: MONO, fontSize: 11.5, color: "rgba(233,224,201,0.75)", marginTop: 6, lineHeight: 1.7 }}>
              jmora / bodega123 — Bodega<br />
              cbarra / barra123 — Barra<br />
              psoto / cocina123 — Cocina caliente
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const SelectorRol = (
    <div className="px-5 pt-16">
      <Rotulo color={C.dorado}>Restaurant Vitalicio</Rotulo>
      <h1 className="mt-2 mb-8" style={{ fontFamily: SANS, fontSize: 27, fontWeight: 680, letterSpacing: "-0.02em", lineHeight: 1.15 }}>¿Con qué acceso<br />entrás hoy?</h1>
      <div className="flex flex-col gap-3">
        <button onClick={() => { setRol("bodega"); setVista("inicio"); }} className="w-full text-left px-5 py-6" style={{ background: C.carbon, color: C.papel }}>
          <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 660 }}>Bodega</div>
          <div style={{ fontSize: 13, opacity: 0.65, marginTop: 3 }}>Inventario general, entregas, aprobación de pedidos, catálogo</div>
        </button>
        <button onClick={() => { setRol("area"); setVista("areaInicio"); }} className="w-full text-left px-5 py-6" style={{ background: C.papel2, border: `1px solid ${C.linea}` }}>
          <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 660 }}>Área de trabajo</div>
          <div style={{ fontSize: 13, color: C.suave, marginTop: 3 }}>Cocina, barra o pastelería: pedir insumos y contar tu zona</div>
        </button>
      </div>
    </div>
  );

  const pantallas = {
    inicio: Inicio,
    elegirArea: ElegirArea,
    generarToma: GenerarToma,
    crearZona: CrearZona,
    contar: Contar,
    resumen: Resumen,
    resumenParcial: ResumenParcial,
    entrega: Entrega,
    desviaciones: Desviaciones,
    administrarSKU: AdministrarSKU,
    editarSKU: EditarSKU,
    verCodigo: VerCodigo,
    loteGenerado: LoteGenerado,
    importarInicio: filasCSV ? ImportarMapeo : ImportarInicio,
    importarValidacion: ImportarValidacion,
    importarCodigos: ImportarCodigos,
    historico: Historico,
    detalleHistorico: DetalleHistorico,
    bandeja: revisando ? RevisarSolicitud : Bandeja,
    areaInicio: AreaInicio,
    pedirNuevo: PedirNuevo,
    previsualizarConteo: PrevisualizarConteo,
    misSolicitudes: MisSolicitudes,
    contarArea: ContarArea,
    resumenParcialArea: ResumenParcialArea,
  };

  return (
    <div className="w-full flex justify-center" style={{ background: C.papel2, minHeight: "100vh" }}>
      <div className="w-full" style={{ maxWidth: 430, background: C.papel, color: C.tinta, fontFamily: SANS, minHeight: "100vh" }}>
        {!sesion ? Login : !rol ? SelectorRol : pantallas[vista]}
      </div>
    </div>
  );
}
