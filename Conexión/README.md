# Conexión — Base de cuentas valores únicos

Módulo Node.js (sin dependencias externas) para leer y modificar el archivo CSV del CRM Bitrix.

**Herramienta:** Node.js v24 — módulo `fs` nativo  
**Separador:** `;`  
**Encoding:** `latin1`  
**Archivo por defecto:** `Base de cuentas valores únicos.csv`  
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

## Configuración

Variables de entorno soportadas:

| Variable | Uso |
|---|---|
| `BITRIX_WEBHOOK_URL` | URL completa del webhook Bitrix24 para `crm.company.add.json` |
| `CRM_CSV_PATH` | Ruta alternativa al CSV activo |
| `PORT` | Puerto del servidor frontend/API. Por defecto `3000` |

PowerShell:

```powershell
$env:BITRIX_WEBHOOK_URL="https://tu-dominio.bitrix24.com/rest/USUARIO/TOKEN/crm.company.add.json"
npm start
```

Si se desea trabajar con la base completa incluida como copia:

```powershell
$env:CRM_CSV_PATH="C:\ruta\al\proyecto\Base de cuentas valores únicos - copia.csv"
npm start
```

---

## API local

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/datos` | Devuelve filas paginadas con búsqueda opcional |
| `GET` | `/api/columnas` | Devuelve columnas disponibles |
| `PUT` | `/api/celda` | Actualiza una celda por `IDENTIFICACION FISCAL` |
| `POST` | `/api/fila` | Agrega una fila |
| `GET` | `/api/sync/estado` | Estado, resumen y últimos registros de sincronización |
| `POST` | `/api/sync/iniciar` | Inicia sincronización de pendientes |
| `POST` | `/api/sync/pausar` | Solicita pausa al terminar el registro actual |
| `POST` | `/api/sync/reanudar` | Continúa la sincronización |
| `POST` | `/api/sync/reintentar-errores` | Devuelve registros con error a pendiente |

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

## Ejecutar aplicación y pruebas

```
npm start
npm test
```
