# Conexión — Base de cuentas valores únicos

Módulo Node.js (sin dependencias externas) para leer y modificar el archivo CSV del CRM Bitrix.

**Herramienta:** Node.js v24 — módulo `fs` nativo  
**Separador:** `;`  
**Encoding:** `latin1`  
**Filas detectadas:** 2 060  
**Columnas detectadas:** 36  

---

## Funciones disponibles

| Función | Descripción |
|---|---|
| `leerCSV()` | Lee el archivo y devuelve `{ headers, rows }` |
| `guardarCSV(headers, rows)` | Guarda los datos de vuelta al CSV |
| `obtenerColumnas()` | Devuelve el array de nombres de columna |
| `buscarPorColumna(columna, valor)` | Filtra filas por texto en una columna |
| `actualizarCelda(identificacion, columna, nuevoValor)` | Modifica una celda y guarda |
| `agregarFila(nuevaFila)` | Agrega una nueva fila y guarda |

---

## Ejemplos de uso

```js
const csv = require("./Conexión/conexion_csv");

// Leer todo el archivo
const { headers, rows } = csv.leerCSV();

// Buscar un cliente por nombre
const resultado = csv.buscarPorColumna("NOMBRE DE CLIENTE", "ABDESA");
console.log(resultado);

// Actualizar el estado de carga de un registro
csv.actualizarCelda("9.92632E+11", "ESTADO_CARGA", "ejecutado");

// Agregar una nueva fila
csv.agregarFila({
  "IDENTIFICACION FISCAL": "1234567890",
  "NOMBRE DE CLIENTE": "NUEVO CLIENTE SA",
  "PAIS": "Ecuador",
});
```

---

## Ejecutar prueba rápida

```
node Conexión/conexion_csv.js
```
