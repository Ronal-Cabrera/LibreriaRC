/* ========= Config ========= */
// En producción, el Service Worker puede dejar assets viejos cacheados.
// Este mecanismo compara una versión "global" (version.json) y si cambia,
// obliga al usuario a aceptar una limpieza de cache + SW para cargar limpio.
const VERSION_URL = "./version.json";
const STORAGE_APP_VERSION = "qr_app_version_v1";

const SALES_UPLOAD_BASE_URL =
  "https://script.google.com/macros/s/AKfycbwZvL3jYOXDCh2XnPPFk9y7T-y9osvrzEFDWIbpuwfZEDGTQGViTpldj3MRglyk7oJP/exec";

// AJUSTA ESTO: URL para devoluciones (puede ser otro script o el mismo con otra acción).
const RETURNS_UPLOAD_BASE_URL =
  "https://script.google.com/macros/s/AKfycbwZvL3jYOXDCh2XnPPFk9y7T-y9osvrzEFDWIbpuwfZEDGTQGViTpldj3MRglyk7oJP/exec";

const MODE_CONFIG = {
  ventas: {
    label: "Ventas",
    uploadBaseUrl: SALES_UPLOAD_BASE_URL,
    uploadAction: "vender",
    // Nota: en algunos despliegues, /exec/ventas puede redirigir a login.
    // Usamos query (?accion=ventas) para mantenerlo como una llamada pública y “limpia”.
    listUrl: `${SALES_UPLOAD_BASE_URL}?accion=ventas`,
  },
  devoluciones: {
    label: "Devoluciones",
    uploadBaseUrl: RETURNS_UPLOAD_BASE_URL,
    uploadAction: "devolver",
    listUrl: `${RETURNS_UPLOAD_BASE_URL}?accion=devoluciones`,
  },
};

const STOCK_URL = `${SALES_UPLOAD_BASE_URL}?accion=stock`;

const STORAGE_MODE = "qr_mode_v1";
const STORAGE_KEY_PREFIX = "qr_pending_uploads_v1";
const STORAGE_LAST_SCAN_PREFIX = "qr_last_scan_v1";
const STORAGE_THEME = "qr_theme_v1";

/* ========= Update / Cache Bust ========= */
function updateModalHtml({ currentVersion, serverVersion }) {
  const cv = currentVersion || "—";
  const sv = serverVersion || "—";

  return `
    <div class="modal modal--open" id="updateModal" aria-hidden="false" role="dialog" aria-label="Actualización disponible">
      <div class="modal__backdrop"></div>
      <div class="modal__sheet" style="max-width: 560px;">
        <div class="modal__header">
          <div class="modal__title">Nueva versión detectada</div>
        </div>
        <div class="updateModal__body">
          <div class="updateModal__desc">
            Para evitar problemas de caché en producción, es necesario limpiar el Service Worker y recargar la web.
            Este aviso se mantendrá hasta que aceptes.
          </div>
          <div class="updateModal__meta">
            <div>Tu versión: <code>${cv}</code></div>
            <div>Servidor: <code>${sv}</code></div>
          </div>
          <div class="updateModal__actions">
            <button class="btn btn--primary" id="btnUpdateNow" type="button">Actualizar ahora</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function showUpdateRequiredModal({ currentVersion, serverVersion, onAccept }) {
  // Evita duplicados
  const existing = document.getElementById("updateModal");
  if (existing) return;

  const wrap = document.createElement("div");
  wrap.innerHTML = updateModalHtml({ currentVersion, serverVersion });
  const modal = wrap.firstElementChild;
  document.body.appendChild(modal);

  const btn = document.getElementById("btnUpdateNow");
  btn?.addEventListener("click", () => onAccept?.());
}

async function fetchServerVersion() {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const v = data?.version;
    return typeof v === "string" && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function getStoredAppVersion() {
  try {
    return localStorage.getItem(STORAGE_APP_VERSION) || "";
  } catch {
    return "";
  }
}

function setStoredAppVersion(v) {
  try {
    localStorage.setItem(STORAGE_APP_VERSION, String(v || ""));
  } catch {
    // ignore
  }
}

async function clearAllCaches() {
  if (!("caches" in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    // ignore
  }
}

async function unregisterAllServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    // ignore
  }
}

async function hardRefreshToLatest(serverVersion) {
  // Guardamos la nueva versión primero para evitar loops si el reload tarda.
  setStoredAppVersion(serverVersion);

  // Limpieza best-effort: SW + Cache Storage.
  await unregisterAllServiceWorkers();
  await clearAllCaches();

  // Cache-bust de navegación (por si algún proxy hace cache agresivo).
  const next = `./?v=${encodeURIComponent(serverVersion)}&t=${Date.now()}`;
  window.location.replace(next);
}

async function checkForUpdateAndMaybeForceRefresh() {
  // Si no hay internet no hacemos nada.
  if (!navigator.onLine) return;

  const serverVersion = await fetchServerVersion();
  if (!serverVersion) return;

  const currentVersion = getStoredAppVersion();
  if (!currentVersion) {
    setStoredAppVersion(serverVersion);
    return;
  }

  if (currentVersion !== serverVersion) {
    showUpdateRequiredModal({
      currentVersion,
      serverVersion,
      onAccept: () => hardRefreshToLatest(serverVersion),
    });
  }
}

/* ========= DOM ========= */
const el = {
  btnToggleTheme: document.getElementById("btnToggleTheme"),
  themeIcon: document.getElementById("themeIcon"),
  netStatus: document.getElementById("netStatus"),
  appTitle: document.getElementById("appTitle"),
  tabVentas: document.getElementById("tabVentas"),
  tabStock: document.getElementById("tabStock"),
  viewPendientes: document.getElementById("viewPendientes"),
  viewVentas: document.getElementById("viewVentas"),
  viewStock: document.getElementById("viewStock"),
  btnOpenScanner: document.getElementById("btnOpenScanner"),
  btnRetryAll: document.getElementById("btnRetryAll"),
  pendingStats: document.getElementById("pendingStats"),
  pendingList: document.getElementById("pendingList"),
  pendingEmpty: document.getElementById("pendingEmpty"),
  pendingHint: document.getElementById("pendingHint"),
  statPending: document.getElementById("statPending"),
  statLastScan: document.getElementById("statLastScan"),
  btnClearLocal: document.getElementById("btnClearLocal"),
  btnRefreshVentas: document.getElementById("btnRefreshVentas"),
  ventasNotice: document.getElementById("ventasNotice"),
  ventasBody: document.getElementById("ventasBody"),
  btnRefreshStock: document.getElementById("btnRefreshStock"),
  stockNotice: document.getElementById("stockNotice"),
  stockBody: document.getElementById("stockBody"),
  pendingTitle: document.getElementById("pendingTitle"),
  listTitle: document.getElementById("listTitle"),
  modeVentas: document.getElementById("modeVentas"),
  modeDevoluciones: document.getElementById("modeDevoluciones"),

  scannerModal: document.getElementById("scannerModal"),
  scannerBackdrop: document.getElementById("scannerBackdrop"),
  btnCloseScanner: document.getElementById("btnCloseScanner"),
  btnStopCamera: document.getElementById("btnStopCamera"),
  btnToggleFlash: document.getElementById("btnToggleFlash"),
  scannerHelp: document.getElementById("scannerHelp"),
  video: document.getElementById("video"),

  btnCrearVenta: document.getElementById("btnCrearVenta"),
  ventaModal: document.getElementById("ventaModal"),
  ventaBackdrop: document.getElementById("ventaBackdrop"),
  btnCloseVenta: document.getElementById("btnCloseVenta"),
  btnVentaCancel: document.getElementById("btnVentaCancel"),
  btnVentaSave: document.getElementById("btnVentaSave"),
  btnAgregarProducto: document.getElementById("btnAgregarProducto"),
  productsTableBody: document.getElementById("productsTableBody"),
  totalGeneral: document.getElementById("totalGeneral"),
  emptyRow: document.getElementById("emptyRow"),
  
  productoEncontradoModal: document.getElementById("productoEncontradoModal"),
  productoEncontradoBackdrop: document.getElementById("productoEncontradoBackdrop"),
  productoNombre: document.getElementById("productoNombre"),
  productoCodigo: document.getElementById("productoCodigo"),
  productoPrecio: document.getElementById("productoPrecio"),
  btnNoAgregar: document.getElementById("btnNoAgregar"),
  btnAgregarConfirm: document.getElementById("btnAgregarConfirm"),

  toast: document.getElementById("toast"),
};

/* ========= State ========= */
let mode = loadMode();
let pending = loadPending();
let activeView = "pendientes"; // "pendientes" | "ventas" | "stock"
let stream = null;
let detector = null;
let scanning = false;
let scanLoopHandle = 0;
let lastDetectAt = 0;
let torchOn = false;
let scanCanvas = null;
let scanCtx = null;
let currentProducts = []; // Array de productos en la venta actual
let productoEscaneado = null; // Producto recién escaneado

/* ========= Utils ========= */
function nowIso() {
  return new Date().toISOString();
}

function nowIsoGuatemala() {
  // Guatemala: America/Guatemala (UTC-06, sin DST)
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  const yyyy = get("year");
  const mm = get("month");
  const dd = get("day");
  const HH = get("hour");
  const MM = get("minute");
  const SS = get("second");

  // Offset fijo -06:00
  return `${yyyy}-${mm}-${dd}T${HH}:${MM}:${SS}-06:00`;
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso || "—";
  }
}

function toast(msg, variant = "info") {
  el.toast.textContent = msg;
  el.toast.dataset.variant = variant;
  el.toast.classList.add("toast--show");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => el.toast.classList.remove("toast--show"), 2600);
}

function setNetStatus() {
  const online = navigator.onLine;
  el.netStatus.textContent = online ? "Con internet" : "Sin internet (modo offline)";
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parsePossiblyWrappedJson(text) {
  const direct = safeJsonParse(text);
  if (direct) return direct;

  const s = String(text ?? "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return safeJsonParse(s.slice(start, end + 1));
  }
  return null;
}

function looksLikeHtml(text) {
  const s = String(text ?? "").trimStart();
  return s.startsWith("<!doctype") || s.startsWith("<html") || s.startsWith("<HTML") || s.startsWith("<");
}

/* ========= Storage ========= */
function loadPending() {
  const raw = localStorage.getItem(storageKeyForPending());
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function savePending() {
  localStorage.setItem(storageKeyForPending(), JSON.stringify(pending));
}

function setLastScan(code) {
  localStorage.setItem(storageKeyForLastScan(), code);
}

function getLastScan() {
  return localStorage.getItem(storageKeyForLastScan()) || "";
}

function storageKeyForPending() {
  return `${STORAGE_KEY_PREFIX}:${mode}`;
}

function storageKeyForLastScan() {
  return `${STORAGE_LAST_SCAN_PREFIX}:${mode}`;
}

function loadMode() {
  const m = localStorage.getItem(STORAGE_MODE);
  return m === "devoluciones" ? "devoluciones" : "ventas";
}

function saveMode() {
  localStorage.setItem(STORAGE_MODE, mode);
}

function modeLabel() {
  return MODE_CONFIG[mode]?.label || "Ventas";
}

/* ========= Theme ========= */
function loadTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_THEME);
    return saved === "dark" ? "dark" : "light"; // Por defecto: light
  } catch {
    return "light";
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_THEME, theme);
  } catch {
    // ignore
  }
}

function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    if (el.themeIcon) el.themeIcon.textContent = "☀️";
  } else {
    document.documentElement.removeAttribute("data-theme");
    if (el.themeIcon) el.themeIcon.textContent = "🌙";
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  saveTheme(next);
}

/* ========= Views ========= */
function setActiveView(view) {
  const v = view === "ventas" || view === "stock" ? view : "pendientes";
  activeView = v;

  el.viewPendientes.classList.toggle("view--active", activeView === "pendientes");
  el.viewVentas.classList.toggle("view--active", activeView === "ventas");
  el.viewStock?.classList.toggle("view--active", activeView === "stock");

  if (el.tabVentas) {
    const isActive = activeView === "ventas";
    el.tabVentas.classList.toggle("tab--active", isActive);
    el.tabVentas.textContent = isActive ? "Regresar" : `Ver lista de ${modeLabel()}`;
  }
  if (el.tabStock) {
    const isActive = activeView === "stock";
    el.tabStock.classList.toggle("tab--active", isActive);
    el.tabStock.textContent = isActive ? "Regresar" : "Stock";
  }

  // En vistas online (lista/stock), ocultar el botón principal de escaneo
  if (el.btnOpenScanner) el.btnOpenScanner.style.display = activeView === "pendientes" ? "" : "none";
}

function renderPending() {
  const hasPending = pending.length > 0;

  // Si no hay pendientes: no mostrar nada relacionado con "pendientes"
  if (el.pendingTitle) {
    el.pendingTitle.textContent = hasPending ? `Pendientes (${modeLabel()})` : `Listo para registrar (${modeLabel()})`;
  }
  if (el.pendingHint) {
    el.pendingHint.textContent = hasPending
      ? "Pendientes guardados. Se enviarán cuando haya internet o con “Reintentar todo”."
      : "Escanea para registrar. Si no hay internet, se guarda y se envía después.";
  }

  el.statPending.textContent = String(pending.length);
  const last = getLastScan();
  el.statLastScan.textContent = last ? last : "—";

  el.pendingList.innerHTML = "";
  if (el.pendingStats) el.pendingStats.style.display = hasPending ? "" : "none";
  if (el.pendingList) el.pendingList.style.display = hasPending ? "" : "none";
  if (el.pendingEmpty) el.pendingEmpty.style.display = "none"; // nunca mostrar el bloque "No hay pendientes"

  // Botones relacionados a pendientes: solo cuando existan
  if (el.btnRetryAll) {
    el.btnRetryAll.style.display = hasPending ? "" : "none";
    el.btnRetryAll.disabled = !hasPending || !navigator.onLine;
  }
  if (el.btnClearLocal) el.btnClearLocal.style.display = hasPending ? "" : "none";

  if (!hasPending) return;

  for (const item of pending) {
    const row = document.createElement("div");
    row.className = "item";
    row.setAttribute("role", "listitem");

    const left = document.createElement("div");
    left.className = "item__left";

    const code = document.createElement("div");
    code.className = "item__code";
    
    // Mostrar información de los registros
    if (item.registros && Array.isArray(item.registros)) {
      const count = item.registros.length;
      const codigos = item.registros.map(r => r.codigo).join(", ");
      code.textContent = `${count} producto${count > 1 ? 's' : ''}: ${codigos}`;
    } else {
      // Formato antiguo (compatibilidad)
      const shownCode = item.codigo ?? item.code ?? "—";
      const shownQty = item.cantidad ?? "—";
      code.textContent = `${shownCode}  × ${shownQty}`;
    }

    const meta = document.createElement("div");
    meta.className = "item__meta";

    const pill1 = document.createElement("span");
    pill1.className = "pill pill--warn";
    pill1.textContent = `Intentos: ${item.attempts || 0}`;

    const pill2 = document.createElement("span");
    pill2.className = "pill";
    pill2.textContent = `Creado: ${formatTime(item.createdAt)}`;

    meta.appendChild(pill1);
    meta.appendChild(pill2);

    if (item.lastAttemptAt) {
      const pill3 = document.createElement("span");
      pill3.className = "pill";
      pill3.textContent = `Último: ${formatTime(item.lastAttemptAt)}`;
      meta.appendChild(pill3);
    }

    left.appendChild(code);
    left.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "item__actions";

    const btnRetry = document.createElement("button");
    btnRetry.className = "btn btn--ghost";
    btnRetry.type = "button";
    btnRetry.textContent = "Reintentar";
    btnRetry.disabled = !navigator.onLine;
    btnRetry.addEventListener("click", async () => {
      await retryOne(item.id || item.code);
    });

    const btnRemove = document.createElement("button");
    btnRemove.className = "btn btn--danger";
    btnRemove.type = "button";
    btnRemove.textContent = "Quitar";
    btnRemove.addEventListener("click", () => {
      const key = item.id || item.code;
      pending = pending.filter((p) => (p.id || p.code) !== key);
      savePending();
      renderPending();
      toast("Quitado de pendientes.");
    });

    actions.appendChild(btnRetry);
    actions.appendChild(btnRemove);

    row.appendChild(left);
    row.appendChild(actions);
    el.pendingList.appendChild(row);
  }
}

/* ========= Upload ========= */
function buildUploadUrl(registros) {
  const cfg = MODE_CONFIG[mode];
  const u = new URL(cfg.uploadBaseUrl);
  u.searchParams.set("accion", cfg.uploadAction);
  u.searchParams.set("registros", JSON.stringify(registros));
  return u.toString();
}

async function uploadMovimientos(registros) {
  const url = buildUploadUrl(registros);
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });
  const text = await res.text();
  const maybeJson = parsePossiblyWrappedJson(text);
  const ok = res.ok && (maybeJson?.ok === true || String(text).trim().toUpperCase().includes("OK"));
  return { ok, status: res.status, text };
}

function makeId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function addPendingMovimientos(registros) {
  // Guardar como un grupo de registros
  pending.unshift({
    id: makeId(),
    registros: registros, // Array de {codigo, cantidad, fecha, precio_manual}
    createdAt: nowIso(),
    lastAttemptAt: null,
    attempts: 0,
  });
  savePending();
  return true;
}

/* ========= Parsear QR ========= */
function parseQRCode(qrText) {
  // Formato: a100003*CUADERNO CALIGRAFIA MONZA 2DO BASICO*1*17
  // Formato: b10001*COMPAS ESCOLAR MAPED TRENDY*1*7.5
  const parts = String(qrText || "").split("*");
  if (parts.length < 4) return null;

  return {
    codigo: parts[0].trim(),
    nombre: parts[1].trim(),
    cantidadPorPrecio: Number(parts[2]) || 1, // Cantidad por la que se divide el precio
    precioUnitario: Number(parts[3]) || 0,
  };
}

/* ========= Modal de Productos ========= */
function calcularTotal(producto) {
  const cantidad = Number(producto.cantidad) || 0;
  const cantidadPorPrecio = Number(producto.cantidadPorPrecio) || 1;
  const precioUnitario = Number(producto.precioUnitario) || 0;
  const precioManual = Number(producto.precioManual) || 0;

  if (precioManual > 0) {
    // Si hay precio manual, usar ese directamente
    return precioManual;
  }

  // Fórmula: (cantidad / cantidadPorPrecio) * precioUnitario
  return (cantidad / cantidadPorPrecio) * precioUnitario;
}

function actualizarTotales() {
  let totalGeneral = 0;

  currentProducts.forEach((producto, index) => {
    const total = calcularTotal(producto);
    totalGeneral += total;

    // Actualizar el total en la fila
    const totalCell = document.getElementById(`total-${index}`);
    if (totalCell) {
      totalCell.textContent = `Q ${total.toFixed(2)}`;
    }
  });

  // Actualizar total general
  if (el.totalGeneral) {
    el.totalGeneral.textContent = `Q ${totalGeneral.toFixed(2)}`;
  }
}

// Funciones antiguas eliminadas - ahora usamos renderTablaProductos

/* ========= Guardar Venta ========= */
async function guardarVenta() {
  if (currentProducts.length === 0) {
    toast("No hay productos para guardar", "warn");
    return;
  }
  
  // Preparar el array de registros para enviar
  const fecha = nowIsoGuatemala();
  const registros = currentProducts.map(p => ({
    codigo: p.codigo,
    cantidad: p.cantidad,
    fecha: fecha,
    precio_manual: p.precioManual || 0,
  }));

  // Si no hay internet, se guarda en localStorage.
  if (!navigator.onLine) {
    addPendingMovimientos(registros);
    renderPending();
    toast("Guardado sin internet (pendiente).");
    cerrarModalVenta();
    return;
  }

  // Con internet: intenta subir.
  try {
    toast("Subiendo venta…");
    const out = await uploadMovimientos(registros);
    if (out.ok) {
      toast("✓ Venta guardada exitosamente");
      cerrarModalVenta();
      savePending();
      renderPending();
    } else {
      addPendingMovimientos(registros);
      renderPending();
      cerrarModalVenta();
      toast(`No se pudo subir. Guardado como pendiente.`, "warn");
    }
  } catch (e) {
    addPendingMovimientos(registros);
    renderPending();
    cerrarModalVenta();
    toast("Error de red. Guardado como pendiente.", "warn");
  }
}

async function retryOne(idOrCode) {
  if (!navigator.onLine) {
    toast("No hay internet.", "warn");
    return;
  }

  const item = pending.find((p) => (p.id || p.code) === idOrCode);
  if (!item) return;
  item.attempts = (item.attempts || 0) + 1;
  item.lastAttemptAt = nowIso();
  savePending();
  renderPending();

  try {
    toast("Reintentando…");
    
    // Verificar si es el nuevo formato con registros array
    if (item.registros && Array.isArray(item.registros)) {
      const out = await uploadMovimientos(item.registros);
      if (out.ok) {
        pending = pending.filter((p) => (p.id || p.code) !== idOrCode);
        savePending();
        renderPending();
        toast("Subido OK.");
      } else {
        toast(`Falló (respuesta: ${String(out.text).trim().slice(0, 60) || out.status}).`, "warn");
      }
    } else {
      // Formato antiguo (compatibilidad) - convertir a array
      const registros = [{
        codigo: item.codigo ?? item.code,
        cantidad: item.cantidad ?? 1,
        fecha: item.fecha ?? nowIsoGuatemala(),
        precio_manual: 0,
      }];
      const out = await uploadMovimientos(registros);
      if (out.ok) {
        pending = pending.filter((p) => (p.id || p.code) !== idOrCode);
        savePending();
        renderPending();
        toast("Subido OK.");
      } else {
        toast(`Falló (respuesta: ${String(out.text).trim().slice(0, 60) || out.status}).`, "warn");
      }
    }
  } catch {
    toast("Error de red al reintentar.", "warn");
  }
}

async function retryAll() {
  if (!navigator.onLine) {
    toast("No hay internet.", "warn");
    return;
  }
  if (!pending.length) return;

  // Copia para evitar problemas si vamos quitando elementos.
  const keys = pending.map((p) => p.id || p.code);
  for (const k of keys) {
    // Pequeña pausa para que la UI se sienta viva y no dispare demasiadas requests.
    // eslint-disable-next-line no-await-in-loop
    await retryOne(k);
  }
}

/* ========= Scanner (BarcodeDetector) ========= */
function barcodeDetectorSupported() {
  return "BarcodeDetector" in window;
}

function getDetector() {
  if (!barcodeDetectorSupported()) return null;
  if (!detector) {
    detector = new window.BarcodeDetector({ formats: ["qr_code"] });
  }
  return detector;
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("getUserMedia no soportado");
  }
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
  el.video.srcObject = stream;
  await el.video.play();
}

function stopCamera() {
  scanning = false;
  if (scanLoopHandle) cancelAnimationFrame(scanLoopHandle);
  scanLoopHandle = 0;
  lastDetectAt = 0;
  scanCanvas = null;
  scanCtx = null;

  if (stream) {
    for (const t of stream.getTracks()) t.stop();
  }
  stream = null;
  el.video.srcObject = null;
  torchOn = false;
  el.btnToggleFlash.disabled = true;
  el.btnToggleFlash.textContent = "Flash";
}

async function setTorch(on) {
  if (!stream) return;
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  const caps = track.getCapabilities?.();
  if (!caps?.torch) return;

  await track.applyConstraints({ advanced: [{ torch: !!on }] });
  torchOn = !!on;
  el.btnToggleFlash.textContent = torchOn ? "Flash: ON" : "Flash";
}

function enableTorchButtonIfPossible() {
  if (!stream) return;
  const track = stream.getVideoTracks()[0];
  const caps = track?.getCapabilities?.();
  const canTorch = !!caps?.torch;
  el.btnToggleFlash.disabled = !canTorch;
}

async function scanLoop() {
  if (!scanning) return;

  const det = getDetector();
  if (!det) return;

  const video = el.video;
  const w = video.videoWidth || 0;
  const h = video.videoHeight || 0;
  if (!w || !h) {
    scanLoopHandle = requestAnimationFrame(scanLoop);
    return;
  }

  const now = performance.now();
  if (now - lastDetectAt < 180) {
    scanLoopHandle = requestAnimationFrame(scanLoop);
    return;
  }
  lastDetectAt = now;

  if (!scanCanvas) {
    scanCanvas = document.createElement("canvas");
    scanCtx = scanCanvas.getContext("2d", { willReadFrequently: true });
  }
  if (scanCanvas.width !== w) scanCanvas.width = w;
  if (scanCanvas.height !== h) scanCanvas.height = h;
  scanCtx.drawImage(video, 0, 0, w, h);

  try {
    const codes = await det.detect(scanCanvas);
    if (codes && codes.length) {
      const raw = codes[0]?.rawValue || "";
      
      // Parsear el QR
      const parsedProduct = parseQRCode(raw);
      if (!parsedProduct) {
        toast("Formato de QR inválido", "bad");
        scanLoopHandle = requestAnimationFrame(scanLoop);
        return;
      }

      // Detener escaneo y cerrar cámara
      scanning = false;
      stopCamera();
      closeScanner();
      
      // Guardar último escaneo
      setLastScan(raw);
      
      // Mostrar modal con producto encontrado
      mostrarProductoEncontrado(parsedProduct);
      return;
    }
  } catch (e) {
    // Algunos navegadores pueden fallar temporalmente. Seguimos intentando.
  }

  scanLoopHandle = requestAnimationFrame(scanLoop);
}

/* ========= Modal de Venta ========= */
function abrirModalVenta() {
  currentProducts = [];
  renderTablaProductos();
  
  el.ventaModal.classList.add("modal--open");
  el.ventaModal.setAttribute("aria-hidden", "false");
}

function cerrarModalVenta() {
  el.ventaModal.classList.remove("modal--open");
  el.ventaModal.setAttribute("aria-hidden", "true");
  currentProducts = [];
}

function renderTablaProductos() {
  if (!el.productsTableBody) return;
  
  // Limpiar tabla
  el.productsTableBody.innerHTML = "";
  
  if (currentProducts.length === 0) {
    // Mostrar fila vacía
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = `
      <td colspan="6" style="padding: 2rem; text-align: center; color: var(--muted);">
        No hay productos. Presiona "Agregar Producto" para escanear.
      </td>
    `;
    el.productsTableBody.appendChild(emptyRow);
    actualizarTotalGeneral();
    return;
  }
  
  // Renderizar productos
  currentProducts.forEach((producto, index) => {
    const row = document.createElement("tr");
    row.style.borderBottom = "1px solid var(--line)";
    
    // Nombre
    const tdNombre = document.createElement("td");
    tdNombre.style.padding = "0.75rem";
    tdNombre.textContent = producto.nombre;
    row.appendChild(tdNombre);
    
    // Cantidad (editable)
    const tdCantidad = document.createElement("td");
    tdCantidad.style.padding = "0.75rem";
    tdCantidad.style.textAlign = "center";
    const inputCantidad = document.createElement("input");
    inputCantidad.type = "number";
    inputCantidad.inputMode = "numeric";
    inputCantidad.min = "1";
    inputCantidad.step = "1";
    inputCantidad.value = producto.cantidad;
    inputCantidad.style.width = "70px";
    inputCantidad.style.padding = "6px";
    inputCantidad.style.borderRadius = "6px";
    inputCantidad.style.border = "1px solid var(--line)";
    inputCantidad.style.background = "var(--input-bg)";
    inputCantidad.style.color = "var(--text)";
    inputCantidad.style.fontWeight = "700";
    inputCantidad.style.textAlign = "center";
    inputCantidad.addEventListener("input", (e) => {
      producto.cantidad = Number(e.target.value) || 1;
      actualizarTotalFila(index);
      actualizarTotalGeneral();
    });
    tdCantidad.appendChild(inputCantidad);
    row.appendChild(tdCantidad);
    
    // Precio Unitario
    const tdPrecio = document.createElement("td");
    tdPrecio.style.padding = "0.75rem";
    tdPrecio.style.textAlign = "right";
    tdPrecio.style.fontSize = "14px";
    tdPrecio.textContent = `Q ${producto.precioUnitario.toFixed(2)}`;
    row.appendChild(tdPrecio);
    
    // Precio Manual (editable)
    const tdPrecioManual = document.createElement("td");
    tdPrecioManual.style.padding = "0.75rem";
    tdPrecioManual.style.textAlign = "right";
    const inputPrecioManual = document.createElement("input");
    inputPrecioManual.type = "number";
    inputPrecioManual.inputMode = "decimal";
    inputPrecioManual.min = "0";
    inputPrecioManual.step = "0.01";
    inputPrecioManual.value = producto.precioManual || "0";
    inputPrecioManual.placeholder = "0";
    inputPrecioManual.style.width = "90px";
    inputPrecioManual.style.padding = "6px";
    inputPrecioManual.style.borderRadius = "6px";
    inputPrecioManual.style.border = "1px solid var(--line)";
    inputPrecioManual.style.background = "var(--input-bg)";
    inputPrecioManual.style.color = "var(--text)";
    inputPrecioManual.style.fontWeight = "700";
    inputPrecioManual.style.textAlign = "right";
    inputPrecioManual.style.fontSize = "14px";
    inputPrecioManual.addEventListener("input", (e) => {
      producto.precioManual = Number(e.target.value) || 0;
      actualizarTotalFila(index);
      actualizarTotalGeneral();
    });
    tdPrecioManual.appendChild(inputPrecioManual);
    row.appendChild(tdPrecioManual);
    
    // Total
    const tdTotal = document.createElement("td");
    tdTotal.style.padding = "0.75rem";
    tdTotal.style.textAlign = "right";
    tdTotal.style.fontWeight = "800";
    tdTotal.style.color = "var(--primary)";
    tdTotal.style.fontSize = "15px";
    tdTotal.id = `total-${index}`;
    tdTotal.textContent = `Q ${calcularTotal(producto).toFixed(2)}`;
    row.appendChild(tdTotal);
    
    // Botón eliminar
    const tdEliminar = document.createElement("td");
    tdEliminar.style.padding = "0.75rem";
    tdEliminar.style.textAlign = "center";
    const btnEliminar = document.createElement("button");
    btnEliminar.className = "iconBtn";
    btnEliminar.textContent = "✕";
    btnEliminar.style.width = "32px";
    btnEliminar.style.height = "32px";
    btnEliminar.style.fontSize = "14px";
    btnEliminar.addEventListener("click", () => {
      currentProducts.splice(index, 1);
      renderTablaProductos();
    });
    tdEliminar.appendChild(btnEliminar);
    row.appendChild(tdEliminar);
    
    el.productsTableBody.appendChild(row);
  });
  
  actualizarTotalGeneral();
}

function actualizarTotalFila(index) {
  const totalCell = document.getElementById(`total-${index}`);
  if (totalCell && currentProducts[index]) {
    const total = calcularTotal(currentProducts[index]);
    totalCell.textContent = `Q ${total.toFixed(2)}`;
  }
}

function actualizarTotalGeneral() {
  let totalGeneral = 0;
  
  currentProducts.forEach((producto) => {
    totalGeneral += calcularTotal(producto);
  });
  
  if (el.totalGeneral) {
    el.totalGeneral.textContent = `Q ${totalGeneral.toFixed(2)}`;
  }
}

/* ========= Modal Producto Encontrado ========= */
function mostrarProductoEncontrado(producto) {
  productoEscaneado = producto;
  
  el.productoNombre.textContent = producto.nombre;
  el.productoCodigo.textContent = producto.codigo;
  el.productoPrecio.textContent = `Q ${producto.precioUnitario.toFixed(2)}`;
  
  el.productoEncontradoModal.classList.add("modal--open");
  el.productoEncontradoModal.setAttribute("aria-hidden", "false");
}

function cerrarProductoEncontrado() {
  el.productoEncontradoModal.classList.remove("modal--open");
  el.productoEncontradoModal.setAttribute("aria-hidden", "true");
  productoEscaneado = null;
}

function agregarProductoATabla() {
  if (!productoEscaneado) return;
  
  // Agregar con valores iniciales
  productoEscaneado.cantidad = 1;
  productoEscaneado.precioManual = 0;
  currentProducts.push(productoEscaneado);
  
  toast(`✓ Producto agregado: ${productoEscaneado.nombre}`, "info");
  
  cerrarProductoEncontrado();
  renderTablaProductos();
}

function noAgregarProducto() {
  toast("Producto no agregado", "info");
  cerrarProductoEncontrado();
}

async function openScanner() {
  el.scannerModal.classList.add("modal--open");
  el.scannerModal.setAttribute("aria-hidden", "false");

  if (!barcodeDetectorSupported()) {
    el.scannerHelp.textContent =
      "Tu navegador no soporta escaneo nativo (BarcodeDetector). Prueba con Chrome/Edge en Android o un navegador moderno.";
    toast("Escáner no soportado en este navegador.", "warn");
    return;
  }

  try {
    el.scannerHelp.textContent = "Iniciando cámara…";
    await startCamera();
    enableTorchButtonIfPossible();
    el.scannerHelp.textContent = "Apunta al código QR dentro del recuadro.";
    scanning = true;
    scanLoopHandle = requestAnimationFrame(scanLoop);
  } catch (e) {
    el.scannerHelp.textContent = "No se pudo abrir la cámara. Revisa permisos.";
    toast("No se pudo abrir la cámara.", "bad");
    stopCamera();
  }
}

function closeScanner() {
  stopCamera();
  el.scannerModal.classList.remove("modal--open");
  el.scannerModal.setAttribute("aria-hidden", "true");
}

/* ========= Ventas ========= */
async function loadVentas() {
  if (!navigator.onLine) {
    el.ventasNotice.textContent = `Sin internet. Conéctate para ver ${modeLabel().toLowerCase()}.`;
    el.ventasBody.innerHTML = "";
    return;
  }

  const url = MODE_CONFIG[mode].listUrl;
  if (el.listTitle) el.listTitle.textContent = `Lista de ${modeLabel()}`;
  el.ventasNotice.textContent = `Cargando...`;
  el.ventasBody.innerHTML = "";

  try {
    // Petición con redirect: "follow" para manejar redirecciones 302 de Google Apps Script
    const res = await fetch(url, {
      redirect: "follow",
    });
    const text = await res.text();
    const maybeJson = parsePossiblyWrappedJson(text);

    // Si el endpoint está privado, normalmente termina en HTML (login / moved temporarily)
    // y no vamos a poder leer JSON desde aquí.
    if (!maybeJson && (looksLikeHtml(text) || String(res.url || "").includes("accounts.google.com"))) {
      el.ventasNotice.textContent =
        `No se pudo leer JSON. El endpoint parece requerir inicio de sesión (respuesta HTML/redirección). ` +
        `Solución: publica el Apps Script como Web App accesible para “Anyone”.`;
      el.ventasBody.innerHTML =
        `<div class="notice">` +
        `<div style="margin-bottom: .5rem;">URL final: <span style="font-family: monospace;">${escapeHtml(res.url || url)}</span></div>` +
        `<div style="margin-bottom: .5rem;">HTTP: ${escapeHtml(String(res.status))}</div>` +
        `<div><a class="link" href="${escapeHtml(url)}" target="_blank" rel="noopener">Abrir endpoint en una pestaña</a></div>` +
        `</div>` +
        `<pre>${escapeHtml(String(text).slice(0, 1200))}</pre>`;
      return;
    }

    if (maybeJson && maybeJson.data && Array.isArray(maybeJson.data)) {
      const data = maybeJson.data;
      el.ventasNotice.textContent = `${modeLabel()} cargadas. Total: ${maybeJson.total || data.length}`;
      
      if (data.length === 0) {
        el.ventasBody.innerHTML = `<div class="empty"><div class="empty__card"><div class="empty__title">No hay ${modeLabel().toLowerCase()}</div><div class="empty__desc">No se encontraron registros.</div></div></div>`;
        return;
      }

      // Crear tabla con los datos
      let tableHtml = `
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; margin-top: 1rem;">
            <thead>
              <tr style="background: rgba(255,255,255,0.05); border-bottom: 2px solid rgba(255,255,255,0.1);">
                <th style="padding: 0.75rem; text-align: left; font-weight: 600;">Código</th>
                <th style="padding: 0.75rem; text-align: left; font-weight: 600;">Producto</th>
                <th style="padding: 0.75rem; text-align: right; font-weight: 600;">Cantidad</th>
                <th style="padding: 0.75rem; text-align: left; font-weight: 600;">Fecha</th>
              </tr>
            </thead>
            <tbody>
      `;

      for (const row of data) {
        const codigo = row[0] || "—";
        const producto = row[1] || "—";
        const cantidad = row[2] || 0;
        const fecha = row[3] ? formatTime(row[3]) : "—";
        
        tableHtml += `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 0.75rem; font-family: monospace;">${escapeHtml(String(codigo))}</td>
            <td style="padding: 0.75rem;">${escapeHtml(String(producto))}</td>
            <td style="padding: 0.75rem; text-align: right; font-weight: 500;">${escapeHtml(String(cantidad))}</td>
            <td style="padding: 0.75rem; color: rgba(255,255,255,0.7); font-size: 0.9em;">${escapeHtml(String(fecha))}</td>
          </tr>
        `;
      }

      tableHtml += `
            </tbody>
          </table>
        </div>
      `;

      el.ventasBody.innerHTML = tableHtml;
    } else if (maybeJson) {
      // Si no tiene la estructura esperada, mostrar el JSON completo
      el.ventasNotice.textContent = `${modeLabel()} cargadas (formato inesperado).`;
      el.ventasBody.innerHTML = `<pre>${escapeHtml(JSON.stringify(maybeJson, null, 2))}</pre>`;
    } else {
      // Si no es JSON válido, mostrar el texto plano
      el.ventasNotice.textContent = `Respuesta recibida (no es JSON válido).`;
      el.ventasBody.innerHTML = `<pre>${escapeHtml(text)}</pre>`;
    }
  } catch (err) {
    el.ventasNotice.textContent = `Error cargando ${modeLabel().toLowerCase()} (red/CORS/endpoint).`;
    el.ventasBody.innerHTML = `<pre style="color: #ff6b6b;">${escapeHtml(String(err))}</pre>`;
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadStock() {
  if (!navigator.onLine) {
    if (el.stockNotice) el.stockNotice.textContent = "Sin internet. Conéctate para ver stock.";
    if (el.stockBody) el.stockBody.innerHTML = "";
    return;
  }

  el.stockNotice.textContent = "Cargando...";
  el.stockBody.innerHTML = "";

  try {
    const res = await fetch(`${STOCK_URL}&t=${Date.now()}`, { cache: "no-store" });
    const text = await res.text();

    if (looksLikeHtml(text)) {
      el.stockNotice.textContent = "La API devolvió HTML (posible login/permisos).";
      el.stockBody.innerHTML = `<pre>${escapeHtml(text.slice(0, 6000))}</pre>`;
      return;
    }

    const maybeJson = parsePossiblyWrappedJson(text);
    const data = maybeJson?.data;

    if (!Array.isArray(data)) {
      el.stockNotice.textContent = "Respuesta recibida (formato inesperado).";
      el.stockBody.innerHTML = maybeJson ? `<pre>${escapeHtml(JSON.stringify(maybeJson, null, 2))}</pre>` : `<pre>${escapeHtml(text)}</pre>`;
      return;
    }

    el.stockNotice.textContent = `Stock cargado. Total: ${maybeJson.total ?? data.length}`;

    const rows = data
      .map((r) => ({
        codigo: String(r?.codigo ?? ""),
        nombre: String(r?.nombre ?? ""),
        comprado: Number(r?.comprado ?? 0),
        vendido: Number(r?.vendido ?? 0),
        disponible: Number(r?.disponible ?? 0),
      }))
      .sort((a, b) => b.disponible - a.disponible);

    const tableHtml = `
      <div style="overflow:auto; padding: 16px;">
        <table style="width:100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr>
              <th style="text-align:left; padding:10px 8px; border-bottom: 1px solid rgba(255,255,255,.12);">Código</th>
              <th style="text-align:left; padding:10px 8px; border-bottom: 1px solid rgba(255,255,255,.12);">Nombre</th>
              <th style="text-align:right; padding:10px 8px; border-bottom: 1px solid rgba(255,255,255,.12);">Comprado</th>
              <th style="text-align:right; padding:10px 8px; border-bottom: 1px solid rgba(255,255,255,.12);">Vendido</th>
              <th style="text-align:right; padding:10px 8px; border-bottom: 1px solid rgba(255,255,255,.12);">Disponible</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) => `
                  <tr>
                    <td style="padding:10px 8px; border-bottom: 1px solid rgba(255,255,255,.08); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">${escapeHtml(
                      r.codigo
                    )}</td>
                    <td style="padding:10px 8px; border-bottom: 1px solid rgba(255,255,255,.08);">${escapeHtml(r.nombre)}</td>
                    <td style="padding:10px 8px; border-bottom: 1px solid rgba(255,255,255,.08); text-align:right;">${escapeHtml(
                      String(r.comprado)
                    )}</td>
                    <td style="padding:10px 8px; border-bottom: 1px solid rgba(255,255,255,.08); text-align:right;">${escapeHtml(
                      String(r.vendido)
                    )}</td>
                    <td style="padding:10px 8px; border-bottom: 1px solid rgba(255,255,255,.08); text-align:right; font-weight:900;">${escapeHtml(
                      String(r.disponible)
                    )}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    el.stockBody.innerHTML = tableHtml;
  } catch (err) {
    el.stockNotice.textContent = "Error cargando stock (red/CORS/endpoint).";
    el.stockBody.innerHTML = `<pre style="color: #ff6b6b;">${escapeHtml(String(err))}</pre>`;
  }
}

/* ========= Events ========= */
el.tabVentas.addEventListener("click", async () => {
  // Toggle: Ver lista <-> Regresar
  const next = activeView === "ventas" ? "pendientes" : "ventas";
  setActiveView(next);
  if (next === "ventas") await loadVentas();
});

el.tabStock?.addEventListener("click", async () => {
  const next = activeView === "stock" ? "pendientes" : "stock";
  setActiveView(next);
  if (next === "stock") await loadStock();
});

function applyModeToUI() {
  const isSales = mode === "ventas";
  if (el.modeVentas) el.modeVentas.classList.toggle("mode--active", isSales);
  if (el.modeDevoluciones) el.modeDevoluciones.classList.toggle("mode--active", !isSales);

  // Tab label dinámico para la lista online
  if (el.tabVentas) el.tabVentas.textContent = activeView === "ventas" ? "Regresar" : `Ver lista de ${modeLabel()}`;

  // Títulos dinámicos
  if (el.pendingTitle) el.pendingTitle.textContent = `Pendientes (${modeLabel()})`;
  if (el.listTitle) el.listTitle.textContent = `Lista de ${modeLabel()}`;

  // CTA principal bien claro para usuarios jóvenes
  if (el.btnOpenScanner) {
    el.btnOpenScanner.textContent = mode === "devoluciones" ? "Registrar devolución (QR)" : "Registrar venta (QR)";
  }

  if (el.appTitle) {
    el.appTitle.textContent = mode === "devoluciones" ? "Registrar devoluciones" : "Registrar ventas";
  }

  // Si estamos en lista, siempre ocultar escaneo
  if (el.btnOpenScanner) el.btnOpenScanner.style.display = activeView === "pendientes" ? "" : "none";
}

function setMode(nextMode) {
  const nm = nextMode === "devoluciones" ? "devoluciones" : "ventas";
  if (mode === nm) return;
  mode = nm;
  saveMode();
  pending = loadPending();
  applyModeToUI();
  renderPending();
  if (el.viewVentas.classList.contains("view--active")) {
    loadVentas();
  }
}

el.modeVentas?.addEventListener("click", () => setMode("ventas"));
el.modeDevoluciones?.addEventListener("click", () => setMode("devoluciones"));

// Botón principal: Crear Venta
el.btnCrearVenta?.addEventListener("click", abrirModalVenta);

// Modal de Venta
el.btnCloseVenta?.addEventListener("click", cerrarModalVenta);
el.btnVentaCancel?.addEventListener("click", cerrarModalVenta);
el.ventaBackdrop?.addEventListener("click", cerrarModalVenta);
el.btnVentaSave?.addEventListener("click", guardarVenta);
el.btnAgregarProducto?.addEventListener("click", openScanner);

// Scanner
el.scannerBackdrop?.addEventListener("click", closeScanner);
el.btnCloseScanner?.addEventListener("click", closeScanner);
el.btnStopCamera?.addEventListener("click", closeScanner);

el.btnToggleFlash?.addEventListener("click", async () => {
  try {
    await setTorch(!torchOn);
  } catch {
    toast("No se pudo activar flash.", "warn");
  }
});

// Modal Producto Encontrado
el.btnNoAgregar?.addEventListener("click", noAgregarProducto);
el.btnAgregarConfirm?.addEventListener("click", agregarProductoATabla);
el.productoEncontradoBackdrop?.addEventListener("click", cerrarProductoEncontrado);

el.btnToggleTheme?.addEventListener("click", toggleTheme);

el.btnRetryAll.addEventListener("click", retryAll);

el.btnClearLocal.addEventListener("click", () => {
  const ok = confirm("¿Seguro? Esto borra la lista de pendientes locales.");
  if (!ok) return;
  pending = [];
  savePending();
  renderPending();
  toast("Pendientes limpiados.");
});

el.btnRefreshVentas.addEventListener("click", loadVentas);
el.btnRefreshStock?.addEventListener("click", loadStock);

window.addEventListener("online", () => {
  setNetStatus();
  renderPending();
  toast("Volviste a tener internet.");
});
window.addEventListener("offline", () => {
  setNetStatus();
  renderPending();
  toast("Sin internet (modo offline).", "warn");
});

/* ========= Init ========= */
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("./service-worker.js", { scope: "./" })
    .then((reg) => reg.update().catch(() => {}))
    .catch(() => {
      // ignora
    });
}

// Importante: correr esto lo más temprano posible para detectar versión nueva.
checkForUpdateAndMaybeForceRefresh();

// Aplicar tema guardado
const savedTheme = loadTheme();
applyTheme(savedTheme);

setNetStatus();
applyModeToUI();
pending = loadPending();
renderPending();
registerSW();


