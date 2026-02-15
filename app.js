/* ========= Config ========= */
// En producción, el Service Worker puede dejar assets viejos cacheados.
// Este mecanismo compara una versión "global" (version.json) y si cambia,
// obliga al usuario a aceptar una limpieza de cache + SW para cargar limpio.
const VERSION_URL = "./version.json";
const STORAGE_APP_VERSION = "qr_app_version_v1";

const SALES_UPLOAD_BASE_URL =
  "https://script.google.com/macros/s/AKfycbwRT3euqtNmjqVQVEJ0B3jOrbQwQou-_TCFI3iaDABHBE72_EFYaBxW1aaOMS_Zox02/exec";

// AJUSTA ESTO: URL para devoluciones (puede ser otro script o el mismo con otra acción).
const RETURNS_UPLOAD_BASE_URL =
  "https://script.google.com/macros/s/AKfycbwRT3euqtNmjqVQVEJ0B3jOrbQwQou-_TCFI3iaDABHBE72_EFYaBxW1aaOMS_Zox02/exec";

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

  qtyModal: document.getElementById("qtyModal"),
  qtyBackdrop: document.getElementById("qtyBackdrop"),
  btnCloseQty: document.getElementById("btnCloseQty"),
  btnQtyCancel: document.getElementById("btnQtyCancel"),
  btnQtySave: document.getElementById("btnQtySave"),
  qtyInput: document.getElementById("qtyInput"),
  qtyCode: document.getElementById("qtyCode"),

  toast: document.getElementById("toast"),
};

/* ========= State ========= */
let mode = loadMode();
let pending = loadPending();
let activeView = "pendientes"; // "pendientes" | "ventas" | "stock"
let stockOrden = 3; // 1=comprado, 2=vendido, 3=disponible
let stream = null;
let detector = null;
let scanning = false;
let scanLoopHandle = 0;
let lastDetectAt = 0;
let torchOn = false;
let scanCanvas = null;
let scanCtx = null;

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
    const shownCode = item.codigo ?? item.code ?? "—";
    const shownQty = item.cantidad ?? "—";
    code.textContent = `${shownCode}  × ${shownQty}`;

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
function buildUploadUrl(payload) {
  const cfg = MODE_CONFIG[mode];
  const u = new URL(cfg.uploadBaseUrl);
  u.searchParams.set("accion", cfg.uploadAction);
  u.searchParams.set("codigo", String(payload.codigo ?? ""));
  u.searchParams.set("cantidad", String(payload.cantidad ?? ""));
  u.searchParams.set("fecha", String(payload.fecha ?? ""));
  return u.toString();
}

async function uploadMovimiento(payload) {
  const url = buildUploadUrl(payload);
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

function addPendingMovimiento(payload) {
  pending.unshift({
    id: makeId(),
    codigo: payload.codigo,
    cantidad: payload.cantidad,
    fecha: payload.fecha,
    createdAt: nowIso(),
    lastAttemptAt: null,
    attempts: 0,
  });
  savePending();
  return true;
}

function openQtyModal(code) {
  if (!el.qtyModal) return Promise.resolve(null);

  el.qtyCode.textContent = String(code || "");
  el.qtyInput.value = "1";

  el.qtyModal.classList.add("modal--open");
  el.qtyModal.setAttribute("aria-hidden", "false");

  // Focus al input para teclear rápido
  window.setTimeout(() => el.qtyInput?.focus?.(), 0);

  return new Promise((resolve) => {
    const cleanup = () => {
      el.qtyModal.classList.remove("modal--open");
      el.qtyModal.setAttribute("aria-hidden", "true");
      el.btnQtySave?.removeEventListener("click", onSave);
      el.btnQtyCancel?.removeEventListener("click", onCancel);
      el.btnCloseQty?.removeEventListener("click", onCancel);
      el.qtyBackdrop?.removeEventListener("click", onCancel);
      el.qtyInput?.removeEventListener("keydown", onKey);
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const onSave = () => {
      const n = Number(el.qtyInput.value);
      if (!Number.isFinite(n) || n <= 0) {
        toast("Cantidad inválida.", "warn");
        el.qtyInput.focus();
        return;
      }
      cleanup();
      resolve(Math.floor(n));
    };

    const onKey = (ev) => {
      if (ev.key === "Enter") onSave();
      if (ev.key === "Escape") onCancel();
    };

    el.btnQtySave?.addEventListener("click", onSave);
    el.btnQtyCancel?.addEventListener("click", onCancel);
    el.btnCloseQty?.addEventListener("click", onCancel);
    el.qtyBackdrop?.addEventListener("click", onCancel);
    el.qtyInput?.addEventListener("keydown", onKey);
  });
}

async function processScannedCode(code) {
  const cleaned = String(code || "").trim();
  if (!cleaned) {
    toast("QR vacío o inválido.", "bad");
    return;
  }

  setLastScan(cleaned);

  const cantidad = await openQtyModal(cleaned);
  if (cantidad == null) {
    toast("Cancelado.", "info");
    renderPending();
    return;
  }

  const payload = {
    codigo: cleaned,
    cantidad,
    fecha: nowIsoGuatemala(),
  };

  // Si no hay internet, se guarda en localStorage.
  if (!navigator.onLine) {
    addPendingMovimiento(payload);
    renderPending();
    toast("Guardado sin internet (pendiente).");
    return;
  }

  // Con internet: intenta subir.
  try {
    toast("Subiendo…");
    const out = await uploadMovimiento(payload);
    if (out.ok) {
      toast("Subido OK.");
      // No guardamos nada en pendientes
      savePending();
      renderPending();
    } else {
      addPendingMovimiento(payload);
      renderPending();
      toast(`No se pudo subir (respuesta: ${String(out.text).trim().slice(0, 60) || out.status}). Guardado pendiente.`, "warn");
    }
  } catch (e) {
    addPendingMovimiento(payload);
    renderPending();
    toast("Error de red. Guardado pendiente.", "warn");
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
    const payload = {
      codigo: item.codigo ?? item.code,
      cantidad: item.cantidad ?? 1,
      fecha: item.fecha ?? nowIsoGuatemala(),
    };
    const out = await uploadMovimiento(payload);
    if (out.ok) {
      pending = pending.filter((p) => (p.id || p.code) !== idOrCode);
      savePending();
      renderPending();
      toast("Subido OK.");
    } else {
      toast(`Falló (respuesta: ${String(out.text).trim().slice(0, 60) || out.status}).`, "warn");
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
      scanning = false;
      closeScanner();
      await processScannedCode(raw);
      return;
    }
  } catch (e) {
    // Algunos navegadores pueden fallar temporalmente. Seguimos intentando.
  }

  scanLoopHandle = requestAnimationFrame(scanLoop);
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
    const u = new URL(STOCK_URL);
    if (stockOrden === 1 || stockOrden === 2 || stockOrden === 3) {
      u.searchParams.set("orden", String(stockOrden));
    }
    u.searchParams.set("t", String(Date.now()));

    const res = await fetch(u.toString(), { cache: "no-store" });
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

    const ordenLabel =
      stockOrden === 1 ? "comprado (desc)" : stockOrden === 2 ? "vendido (desc)" : stockOrden === 3 ? "disponible (desc)" : "sin orden";
    el.stockNotice.textContent = `Stock cargado. Total: ${maybeJson.total ?? data.length} · Orden: ${ordenLabel}`;

    const rows = data
      .map((r) => ({
        codigo: String(r?.codigo ?? ""),
        nombre: String(r?.nombre ?? ""),
        comprado: Number(r?.comprado ?? 0),
        vendido: Number(r?.vendido ?? 0),
        disponible: Number(r?.disponible ?? 0),
      }))
      // No reordenamos acá: el orden viene del backend (orden=1/2/3).
      ;

    const tableHtml = `
      <div style="overflow:auto; padding: 16px;">
        <table style="width:100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr>
              <th style="text-align:left; padding:10px 8px; border-bottom: 1px solid rgba(255,255,255,.12);">Código</th>
              <th style="text-align:left; padding:10px 8px; border-bottom: 1px solid rgba(255,255,255,.12);">Nombre</th>
              <th data-orden="1" style="text-align:right; padding:10px 8px; border-bottom: 1px solid rgba(255,255,255,.12); cursor:pointer; user-select:none;">
                Comprado${stockOrden === 1 ? " ▾" : ""}
              </th>
              <th data-orden="2" style="text-align:right; padding:10px 8px; border-bottom: 1px solid rgba(255,255,255,.12); cursor:pointer; user-select:none;">
                Vendido${stockOrden === 2 ? " ▾" : ""}
              </th>
              <th data-orden="3" style="text-align:right; padding:10px 8px; border-bottom: 1px solid rgba(255,255,255,.12); cursor:pointer; user-select:none;">
                Disponible${stockOrden === 3 ? " ▾" : ""}
              </th>
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

    // Orden vía click en el nombre de columna (<th>).
    el.stockBody.querySelectorAll("th[data-orden]").forEach((th) => {
      th.addEventListener("click", async () => {
        const ord = Number(th.getAttribute("data-orden") || 0);
        if (ord !== 1 && ord !== 2 && ord !== 3) return;
        stockOrden = ord;
        await loadStock();
      });
    });
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

el.btnOpenScanner.addEventListener("click", openScanner);
el.scannerBackdrop.addEventListener("click", closeScanner);
el.btnCloseScanner.addEventListener("click", closeScanner);
el.btnStopCamera.addEventListener("click", closeScanner);

el.btnToggleFlash.addEventListener("click", async () => {
  try {
    await setTorch(!torchOn);
  } catch {
    toast("No se pudo activar flash.", "warn");
  }
});

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

setNetStatus();
applyModeToUI();
pending = loadPending();
renderPending();
registerSW();


