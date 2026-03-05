// EJEMPLO DE CÓDIGO BACKEND (Google Apps Script)
// Este es un ejemplo de cómo debe actualizarse la función insertarMovimiento

function doGet(e) {
  const accion = e.parameter.accion || "";
  
  if (accion === "vender") {
    return insertarMovimiento(e, "Ventas");
  } else if (accion === "devolver") {
    return insertarMovimiento(e, "Devoluciones");
  } else if (accion === "ventas") {
    return obtenerVentas();
  } else if (accion === "devoluciones") {
    return obtenerDevoluciones();
  } else if (accion === "stock") {
    return obtenerStock();
  }
  
  return salida({ error: "Acción no válida" });
}

function insertarMovimiento(e, nombreHoja) {
  try {
    // NUEVO: Parsear el array de registros
    const registros = JSON.parse(e.parameter.registros || "[]");

    if (!Array.isArray(registros) || registros.length === 0) {
      return salida({
        error: "Debes enviar un array 'registros'"
      });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName(nombreHoja);

    if (!hoja) {
      return salida({ error: `La hoja ${nombreHoja} no existe` });
    }

    let filaNueva = hoja.getLastRow() + 1;
    let procesados = [];

    // Procesar cada registro del array
    registros.forEach(r => {
      const codigo = r.codigo;
      const cantidad = r.cantidad;
      const fecha = r.fecha;
      const precioManual = r.precio_manual; // NUEVO CAMPO

      // Buscar el producto en la hoja de productos
      const hojaProductos = ss.getSheetByName("Productos");
      const datosProductos = hojaProductos.getDataRange().getValues();
      
      let productoEncontrado = null;
      for (let i = 1; i < datosProductos.length; i++) {
        if (datosProductos[i][0] === codigo) { // Asumiendo que el código está en la columna A
          productoEncontrado = {
            codigo: datosProductos[i][0],
            nombre: datosProductos[i][1],
            precioBase: datosProductos[i][2],
            // ... otros campos
          };
          break;
        }
      }

      if (!productoEncontrado) {
        Logger.log(`Producto no encontrado: ${codigo}`);
        return;
      }

      // Calcular el precio final
      let precioFinal;
      if (precioManual > 0) {
        // Si hay precio manual, usar ese
        precioFinal = precioManual;
      } else {
        // Si no, usar el precio base del producto
        precioFinal = productoEncontrado.precioBase * cantidad;
      }

      // Insertar en la hoja
      hoja.getRange(filaNueva, 1).setValue(codigo);
      hoja.getRange(filaNueva, 2).setValue(productoEncontrado.nombre);
      hoja.getRange(filaNueva, 3).setValue(cantidad);
      hoja.getRange(filaNueva, 4).setValue(precioFinal);
      hoja.getRange(filaNueva, 5).setValue(fecha);
      hoja.getRange(filaNueva, 6).setValue(precioManual > 0 ? "Manual" : "Automático");

      procesados.push({
        codigo: codigo,
        nombre: productoEncontrado.nombre,
        cantidad: cantidad,
        precio: precioFinal
      });

      filaNueva++;
    });

    return salida({
      ok: true,
      mensaje: `${procesados.length} producto(s) registrado(s)`,
      procesados: procesados
    });

  } catch (error) {
    return salida({
      error: error.toString()
    });
  }
}

function salida(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function obtenerVentas() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName("Ventas");
    const datos = hoja.getDataRange().getValues();
    
    // Saltar la primera fila (encabezados)
    const registros = datos.slice(1).map(fila => [
      fila[0], // código
      fila[1], // nombre
      fila[2], // cantidad
      fila[4]  // fecha
    ]);
    
    return salida({
      ok: true,
      data: registros,
      total: registros.length
    });
  } catch (error) {
    return salida({
      error: error.toString()
    });
  }
}

function obtenerDevoluciones() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoja = ss.getSheetByName("Devoluciones");
    const datos = hoja.getDataRange().getValues();
    
    const registros = datos.slice(1).map(fila => [
      fila[0], // código
      fila[1], // nombre
      fila[2], // cantidad
      fila[4]  // fecha
    ]);
    
    return salida({
      ok: true,
      data: registros,
      total: registros.length
    });
  } catch (error) {
    return salida({
      error: error.toString()
    });
  }
}

function obtenerStock() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hojaProductos = ss.getSheetByName("Productos");
    const hojaVentas = ss.getSheetByName("Ventas");
    const hojaCompras = ss.getSheetByName("Compras");
    
    const productos = hojaProductos.getDataRange().getValues().slice(1);
    const ventas = hojaVentas.getDataRange().getValues().slice(1);
    const compras = hojaCompras.getDataRange().getValues().slice(1);
    
    const stock = productos.map(producto => {
      const codigo = producto[0];
      const nombre = producto[1];
      
      const totalComprado = compras
        .filter(c => c[0] === codigo)
        .reduce((sum, c) => sum + (c[2] || 0), 0);
      
      const totalVendido = ventas
        .filter(v => v[0] === codigo)
        .reduce((sum, v) => sum + (v[2] || 0), 0);
      
      return {
        codigo: codigo,
        nombre: nombre,
        comprado: totalComprado,
        vendido: totalVendido,
        disponible: totalComprado - totalVendido
      };
    });
    
    return salida({
      ok: true,
      data: stock,
      total: stock.length
    });
  } catch (error) {
    return salida({
      error: error.toString()
    });
  }
}

