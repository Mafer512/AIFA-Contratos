// Ejecutar con:  node --experimental-strip-types scripts/test_servicio2027.mjs
//
// Ficha de captura de 2027: que cada campo caiga en su columna de
// estatus_2027, que los valores vayan y vengan sin ensuciarse, que sólo se
// guarde lo que cambió y que la validación diga algo útil.
import { readFileSync } from 'node:fs';
import {
  CAMPOS_2027, COLUMNAS_NUEVAS_2027, ETIQUETAS_CALENDARIO_2027, aFechaISO, tipoContratacionDe, valorFormulario,
  textoNoFecha, valoresIniciales, valorGuardar, camposDisponibles, columnasFaltantes, cambiosFicha, registroNuevo,
  validarFicha, estatusGeneral, numeroFolio, formatoFolio, siguienteFolio,
} from '../utils/servicio2027.ts';

let fallos = 0;
const ok = (nombre, real, esperado) => {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bien) fallos++;
  console.log(`${bien ? 'OK  ' : 'FALLA'} ${nombre.padEnd(64)} ${bien ? JSON.stringify(real) : `esperado ${JSON.stringify(esperado)}, dio ${JSON.stringify(real)}`}`);
};

// Columnas reales de estatus_2027 (de su migración) más las tres nuevas.
const sql = readFileSync(new URL('../supabase/migrations/20260916000000_create_estatus_2027.sql', import.meta.url), 'utf8');
const tabla = sql.slice(sql.indexOf('create table if not exists public.estatus_2027'), sql.indexOf('comment on table public.estatus_2027'));
const COLS_BASE = [...tabla.matchAll(/^\s+"([^"]+)"\s+\w/gm)].map((m) => m[1]);
const COLS = [...COLS_BASE, ...COLUMNAS_NUEVAS_2027];
const campo = (col) => CAMPOS_2027.find((c) => c.col === col);

console.log('=== Cada campo tiene su columna ===');
ok('la tabla tiene sus columnas', COLS_BASE.length > 60, true);
ok('todos los campos existen en estatus_2027 (o son de la migración nueva)', CAMPOS_2027.filter((c) => !COLS.includes(c.col)).map((c) => c.col), []);
ok('las fechas del calendario existen', Object.keys(ETIQUETAS_CALENDARIO_2027).filter((c) => !COLS.includes(c)), []);
ok('24 de la lista del área + tipo + 3 garantías + 17 del cronograma + observación', CAMPOS_2027.length, 24 + 1 + 3 + 17 + 1);
ok('sin columnas repetidas', new Set(CAMPOS_2027.map((c) => c.col)).size, CAMPOS_2027.length);
const migr = readFileSync(new URL('../supabase/migrations/20261123000000_estatus_2027_ficha.sql', import.meta.url), 'utf8');
ok('la migración agrega las 3 columnas nuevas', COLUMNAS_NUEVAS_2027.filter((c) => !migr.includes(`add column if not exists "${c}"`)), []);

console.log('\n=== Tabla → ficha ===');
ok('fecha ISO', aFechaISO('2027-03-15'), '2027-03-15');
ok('fecha dd/mm/aaaa', aFechaISO('15/03/2027'), '2027-03-15');
ok('"N/A" no es fecha', aFechaISO('N/A'), '');
ok('monto numérico', valorFormulario(campo('Monto solicitado anteproyecto 2027'), { 'Monto solicitado anteproyecto 2027': 1250000.5 }), '1250000.5');
ok('monto con $ y comas', valorFormulario(campo('Monto de Suficiencia presupuestal'), { 'Monto de Suficiencia presupuestal': '$1,200.00' }), '1200');
ok('casilla', valorFormulario(campo('Garantía de Calidad'), { 'Garantía de Calidad': true }), true);
ok('texto con espacios', valorFormulario(campo('Proveedor'), { Proveedor: '  ACME  ' }), 'ACME');
ok('avisa del texto que no era fecha', textoNoFecha(campo('Visita a las instalaciones'), { 'Visita a las instalaciones': 'N/A' }), 'N/A');
ok('no avisa si sí era fecha', textoNoFecha(campo('Visita a las instalaciones'), { 'Visita a las instalaciones': '01/02/2027' }), null);

console.log('\n=== Adquisición o servicio ===');
ok('por la columna', tipoContratacionDe({ 'Tipo de contratación': 'Adquisición', 'Nombre del Servicio.': 'Servicio de algo' }), 'Adquisición');
ok('sin columna: por el nombre', tipoContratacionDe({ 'Nombre del Servicio.': 'Adquisición de consumibles' }), 'Adquisición');
ok('sin acento también', tipoContratacionDe({ 'Nombre del Servicio.': 'ADQUISICION de equipo' }), 'Adquisición');
ok('lo demás es servicio', tipoContratacionDe({ 'Nombre del Servicio.': 'Estudios de cumplimiento ambiental' }), 'Servicio');

console.log('\n=== Ficha → tabla ===');
ok('vacío se guarda como null', valorGuardar(campo('Proveedor'), '   '), null);
ok('espacios de más se limpian', valorGuardar(campo('Proveedor'), '  ACME   SA  '), 'ACME SA');
ok('monto a número', valorGuardar(campo('Monto solicitado anteproyecto 2027'), '$1,250,000'), 1250000);

const campos = camposDisponibles(COLS);
const fila = {
  ID: 7, 'Nombre del Servicio.': 'Adquisición de consumibles', 'Visita a las instalaciones': '15/03/2027',
  'Monto solicitado anteproyecto 2027': 500000, Estatus: 'En IM', 'Garantía de cumplimiento': false, 'Fecha fallo': null, Fallo: null,
};
const ini = valoresIniciales(fila, campos);
ok('sin tocar nada no hay cambios (aunque la fecha venía como 15/03/2027)', cambiosFicha(campos, ini, { ...ini }, COLS), {});
ok('sólo lo que cambió', cambiosFicha(campos, ini, { ...ini, Proveedor: 'ACME', 'Garantía de cumplimiento': true }, COLS), { Proveedor: 'ACME', 'Garantía de cumplimiento': true });
ok('el fallo se guarda en sus dos columnas', cambiosFicha(campos, ini, { ...ini, 'Fecha fallo': '2027-06-30' }, COLS), { 'Fecha fallo': '2027-06-30', Fallo: '2027-06-30' });
ok('borrar un dato lo deja en null', cambiosFicha(campos, ini, { ...ini, 'Monto solicitado anteproyecto 2027': '' }, COLS), { 'Monto solicitado anteproyecto 2027': null });
ok('alta: sólo lo que se llenó', registroNuevo(campos, { ...valoresIniciales({}, campos), 'Nombre del Servicio.': 'Servicio de jardinería', 'Tipo de contratación': 'Servicio', 'Clave cucop': '35102-0003' }, COLS),
  { 'Tipo de contratación': 'Servicio', 'Nombre del Servicio.': 'Servicio de jardinería', 'Clave cucop': '35102-0003' });

console.log('\n=== Sin la migración nueva ===');
ok('sin las columnas nuevas no se muestran esos campos', camposDisponibles(COLS_BASE).some((c) => COLUMNAS_NUEVAS_2027.includes(c.col)), false);
ok('y avisa cuáles faltan', columnasFaltantes(COLS_BASE), [...COLUMNAS_NUEVAS_2027]);
ok('con la migración no falta nada', columnasFaltantes(COLS), []);

console.log('\n=== Validación ===');
const vacio = valoresIniciales({}, campos);
ok('el nombre es obligatorio', Object.keys(validarFicha(campos, vacio)), ['Nombre del Servicio.']);
const base = { ...vacio, 'Nombre del Servicio.': 'Servicio de limpieza' };
ok('todo bien → sin errores', validarFicha(campos, base), {});
ok('CUCOP con letras', Object.keys(validarFicha(campos, { ...base, 'Clave cucop': '35A02' })), ['Clave cucop']);
ok('CUCOP con guion está bien', validarFicha(campos, { ...base, 'Clave cucop': '35102-0003' }), {});
ok('monto con letras', Object.keys(validarFicha(campos, { ...base, 'Monto de Suficiencia presupuestal': 'mil pesos' })), ['Monto de Suficiencia presupuestal']);
ok('vigencia al revés', Object.keys(validarFicha(campos, { ...base, 'Vigencia de inicio': '2027-05-01', 'Vigencia de Término': '2027-04-01' })), ['Vigencia de Término']);
ok('fase del Gantt al revés', Object.keys(validarFicha(campos, { ...base, 'Fecha remisión IM': '2027-02-10', 'Fecha recepción IM': '2027-02-01' })), ['Fecha recepción IM']);

console.log('\n=== Número interno GPyC ===');
ok('formato con 3 dígitos', [formatoFolio(1), formatoFolio(27), formatoFolio(1000)], ['GPyC-001', 'GPyC-027', 'GPyC-1000']);
ok('lee el número sin importar mayúsculas', [numeroFolio('GPyC-007'), numeroFolio('gpyc-12'), numeroFolio('123'), numeroFolio(null)], [7, 12, null, null]);
ok('sin ninguno: el 001', siguienteFolio([]), 'GPyC-001');
ok('el que sigue al mayor (con huecos)', siguienteFolio([{ 'No. GPYC': 'GPyC-001' }, { 'No. GPYC': 'GPyC-005' }, { 'No. GPYC': null }, { 'No. GPYC': 'otro' }]), 'GPyC-006');
ok('la ficha nunca escribe el número', cambiosFicha(campos, ini, { ...ini, 'No. GPYC': 'GPyC-999' }, COLS), {});
ok('ni al dar de alta', 'No. GPYC' in registroNuevo(campos, { ...valoresIniciales({}, campos), 'Nombre del Servicio.': 'X servicio', 'No. GPYC': 'GPyC-1' }, COLS), false);

console.log('\n=== Estatus general ===');
ok('En IM → En proceso', estatusGeneral('En IM'), 'En proceso');
ok('Adjudicado', estatusGeneral('Adjudicado'), 'Adjudicado');
ok('Cancelado', estatusGeneral('Cancelado'), 'Cancelado');
ok('Desierta (agregada) → En proceso', estatusGeneral('Desierta'), 'En proceso');
ok('vacío → Sin estatus', estatusGeneral(''), 'Sin estatus');

console.log(fallos ? `\n${fallos} prueba(s) FALLARON` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
