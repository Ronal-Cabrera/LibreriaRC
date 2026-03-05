# Cambios en el Sistema de Escaneo QR

## Resumen
Se ha actualizado el sistema para soportar el nuevo formato de códigos QR y permitir el escaneo de múltiples productos en una sola sesión.

## Nuevo Formato de QR

Los códigos QR ahora deben tener el siguiente formato, separado por asteriscos (`*`):

```
codigo*nombre*cantidadPorPrecio*precioUnitario
```

### Ejemplos:
- `a100003*CUADERNO CALIGRAFIA MONZA 2DO BASICO*1*17`
- `b10001*COMPAS ESCOLAR MAPED TRENDY*1*7.5`

### Componentes:
1. **codigo**: Identificador único del producto (ej: `a100003`)
2. **nombre**: Nombre descriptivo del producto
3. **cantidadPorPrecio**: Cantidad por la que se divide el precio (normalmente 1)
4. **precioUnitario**: Precio base del producto

## Flujo de Trabajo

### 1. Escaneo de Productos
- El usuario abre el escáner con el botón "Escanear QR"
- Puede escanear múltiples productos consecutivamente
- Cada producto escaneado se muestra en una lista en tiempo real
- El botón "Finalizar" muestra el contador de productos escaneados

### 2. Revisión y Edición
Al finalizar el escaneo, se abre una tabla con los siguientes campos:

| Columna | Descripción | Editable |
|---------|-------------|----------|
| Nombre | Nombre del producto | No |
| Cantidad | Cantidad a registrar | Sí |
| Precio Unit. | Precio unitario del QR | No |
| Precio Manual | Precio personalizado | Sí |
| Total | Total calculado | No |

### 3. Cálculo de Totales

El total de cada fila se calcula de la siguiente manera:

#### Si Precio Manual > 0:
```
Total = Precio Manual
```

#### Si Precio Manual = 0:
```
Total = (Cantidad / CantidadPorPrecio) × PrecioUnitario
```

**Ejemplo:**
- Cantidad: 2
- CantidadPorPrecio: 1
- PrecioUnitario: 17
- Total: (2 / 1) × 17 = Q 34.00

### 4. Envío a la API

Al guardar, se envía un array de registros con el siguiente formato:

```javascript
{
  registros: [
    {
      codigo: "a100003",
      cantidad: 2,
      fecha: "2026-03-04T10:30:00-06:00",
      precio_manual: 0
    },
    {
      codigo: "b10001",
      cantidad: 1,
      fecha: "2026-03-04T10:30:00-06:00",
      precio_manual: 15.5
    }
  ]
}
```

## Cambios en la API (Google Apps Script)

La función `insertarMovimiento` debe esperar:

```javascript
function insertarMovimiento(e, nombreHoja) {
  const registros = JSON.parse(e.parameter.registros || "[]");

  if (!Array.isArray(registros) || registros.length === 0) {
    return salida({
      error: "Debes enviar un array 'registros'"
    });
  }

  registros.forEach(r => {
    const codigo = r.codigo;
    const cantidad = r.cantidad;
    const fecha = r.fecha;
    const precioManual = r.precio_manual; // NUEVO CAMPO
    
    // Tu lógica de inserción aquí
  });
}
```

## Características Adicionales

### Modo Offline
- Los productos escaneados se guardan localmente si no hay internet
- Se pueden reintentar individualmente o todos a la vez
- Se mantiene el historial de intentos

### Interfaz Mejorada
- Contador visual de productos escaneados
- Lista en tiempo real de productos agregados
- Total general calculado automáticamente
- Confirmación antes de cancelar con productos escaneados

### Compatibilidad
- El sistema mantiene compatibilidad con registros antiguos
- Los pendientes antiguos se convierten automáticamente al nuevo formato al reintentarlos

## Archivos Modificados

1. **index.html**
   - Nuevo modal de tabla de productos
   - Botón "Finalizar" en el escáner
   - Lista de productos escaneados en tiempo real

2. **app.js**
   - Función `parseQRCode()`: Parsea el nuevo formato
   - Función `calcularTotal()`: Calcula totales con la nueva lógica
   - Función `openProductsModal()`: Modal de revisión de productos
   - Función `uploadMovimientos()`: Envía array de registros
   - Función `addPendingMovimientos()`: Guarda array en localStorage
   - Funciones actualizadas: `renderPending()`, `retryOne()`, `scanLoop()`

## Pruebas Recomendadas

1. ✅ Escanear un solo producto
2. ✅ Escanear múltiples productos
3. ✅ Editar cantidades en la tabla
4. ✅ Usar precio manual
5. ✅ Verificar cálculo de totales
6. ✅ Probar modo offline
7. ✅ Reintentar pendientes
8. ✅ Cancelar con productos escaneados

