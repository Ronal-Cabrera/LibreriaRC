## QR Offline Uploader (HTML/CSS/JS sin librerías)

Web simple para:
- **Escanear QR con cámara**
- **Subir** el valor al Google Apps Script agregándolo al final de la URL con `?producto=...`
- Si **no hay internet**, guardar el código en **`localStorage`** como pendiente
- Mostrar **lista de pendientes** y permitir **reintentos**
- Vista separada **“Ventas”** que solo carga con internet (URL configurable)

### Cómo funciona el envío (OK)

Cuando escaneas un QR, el texto (`rawValue`) se usa así:

`GAS_BASE_URL + "?producto=" + encodeURIComponent(CODIGO)`

Ejemplo (tu endpoint responde OK):
`https://script.google.com/macros/s/AKfycbyck6-dXBFcVuG_XtB4_DU4R2mJr_BBlhi5nZzANTUD-udJkjFKcf97dffjL7QW_zVp/exec?producto=PRUEBA123`

### Configuración (1 minuto)

Edita `app.js` y ajusta:
- `SALES_UPLOAD_BASE_URL` (URL para subir ventas)
- `RETURNS_UPLOAD_BASE_URL` (URL para subir devoluciones)
- `MODE_CONFIG.ventas.listUrl` (URL para lista online de ventas)
- `MODE_CONFIG.devoluciones.listUrl` (URL para lista online de devoluciones)

### Ejecutar (importante: usar servidor local)

En móviles la cámara requiere **HTTPS o localhost**.

Opciones rápidas:
- En VS Code: extensión “Live Server”
- O con Python (si lo tienes):

```bash
python -m http.server 8080
```

Luego abre `http://localhost:8080`.

### Deploy en GitHub Pages

- Sube estos archivos a tu repo (raíz del repo o carpeta `docs/` si así lo configuras).
- Activa GitHub Pages (Settings → Pages → Deploy from branch).
- Abre la URL de Pages: funciona con **HTTPS**, así que la cámara y el service worker funcionan.

La app usa rutas **relativas** (`./...`) para que funcione bien en subcarpetas tipo `https://usuario.github.io/tu-repo/`.

### Service worker (offline)

Se usa `service-worker.js` para cachear la “app shell” (HTML/CSS/JS/manifest/icon). Así, aunque no tengas internet o cierres y vuelvas a abrir, la web seguirá cargando y podrás **escanear y guardar pendientes offline**.

### Notas de compatibilidad

El escaneo se implementa con la API nativa `BarcodeDetector` (sin librerías). En navegadores que no la soporten, la app mostrará un aviso.


