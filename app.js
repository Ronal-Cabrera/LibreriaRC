/* ========= Config ========= */
const SALES_UPLOAD_BASE_URL =
  "https://script.google.com/macros/s/AKfycbzJpoyLr7CeeekdMfYvQ42PFbzUUffy-YZmBb6up5XkuZLSbV1WqTkdG1KF7yGSBkLI/exec";

// AJUSTA ESTO: URL para devoluciones (puede ser otro script o el mismo con otra acción).
const RETURNS_UPLOAD_BASE_URL =
  "https://script.google.com/macros/s/AKfycbzJpoyLr7CeeekdMfYvQ42PFbzUUffy-YZmBb6up5XkuZLSbV1WqTkdG1KF7yGSBkLI/exec";

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

const STORAGE_MODE = "qr_mode_v1";
const STORAGE_KEY_PREFIX = "qr_pending_uploads_v1";
const STORAGE_LAST_SCAN_PREFIX = "qr_last_scan_v1";

/* ========= DOM ========= */
const el = {
  netStatus: document.getElementById("netStatus"),
  tabPendientes: document.getElementById("tabPendientes"),
  tabVentas: document.getElementById("tabVentas"),
  viewPendientes: document.getElementById("viewPendientes"),
  viewVentas: document.getElementById("viewVentas"),
  btnOpenScanner: document.getElementById("btnOpenScanner"),
  btnRetryAll: document.getElementById("btnRetryAll"),
  pendingList: document.getElementById("pendingList"),
  pendingEmpty: document.getElementById("pendingEmpty"),
  statPending: document.getElementById("statPending"),
  statLastScan: document.getElementById("statLastScan"),
  btnClearLocal: document.getElementById("btnClearLocal"),
  btnRefreshVentas: document.getElementById("btnRefreshVentas"),
  ventasNotice: document.getElementById("ventasNotice"),
  ventasBody: document.getElementById("ventasBody"),
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
function setActiveTab(tab) {
  const isPend = tab === "pendientes";
  el.tabPendientes.classList.toggle("tab--active", isPend);
  el.tabVentas.classList.toggle("tab--active", !isPend);
  el.viewPendientes.classList.toggle("view--active", isPend);
  el.viewVentas.classList.toggle("view--active", !isPend);
}

function renderPending() {
  if (el.pendingTitle) el.pendingTitle.textContent = `Pendientes (${modeLabel()})`;
  el.statPending.textContent = String(pending.length);
  const last = getLastScan();
  el.statLastScan.textContent = last ? last : "—";

  el.pendingList.innerHTML = "";
  el.pendingEmpty.style.display = pending.length ? "none" : "block";
  el.btnRetryAll.disabled = pending.length === 0 || !navigator.onLine;

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

/* ========= Events ========= */
el.tabPendientes.addEventListener("click", () => setActiveTab("pendientes"));
el.tabVentas.addEventListener("click", async () => {
  setActiveTab("ventas");
  await loadVentas();
});

function applyModeToUI() {
  const isSales = mode === "ventas";
  if (el.modeVentas) el.modeVentas.classList.toggle("mode--active", isSales);
  if (el.modeDevoluciones) el.modeDevoluciones.classList.toggle("mode--active", !isSales);

  // Tab label dinámico para la lista online
  if (el.tabVentas) el.tabVentas.textContent = `Ver lista de ${modeLabel()}`;

  // Títulos dinámicos
  if (el.pendingTitle) el.pendingTitle.textContent = `Pendientes (${modeLabel()})`;
  if (el.listTitle) el.listTitle.textContent = `Lista de ${modeLabel()}`;
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
  navigator.serviceWorker.register("./service-worker.js", { scope: "./" }).catch(() => {
    // ignora
  });
}

setNetStatus();
applyModeToUI();
pending = loadPending();
renderPending();
registerSW();


