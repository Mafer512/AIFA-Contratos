// Ejecutar con:  node --experimental-strip-types scripts/test_fotos_usuarios.mjs
//
// Emparejar usuarios con su ficha del organigrama por el nombre (de ahí sale
// su foto). Los casos difíciles son los reales: nombres incompletos, en otro
// orden, sin acentos o con una letra cambiada.
import { buscarPorNombre, mismoNombre } from '../utils/coincidenciaNombres.ts';
import { RESPONSABLE_PROFILES } from '../data/responsables.ts';

let fallos = 0;
const ok = (nombre, real, esperado) => {
  const bien = real === esperado;
  if (!bien) fallos++;
  console.log(`${bien ? 'OK  ' : 'FALLA'} ${nombre.padEnd(58)} ${bien ? real : `esperado "${esperado}", dio "${real}"`}`);
};

const fichas = RESPONSABLE_PROFILES;
const nombresDe = (f) => [f.fullName, f.catalogValue, ...(f.aliases ?? [])];
const ficha = (nombre) => buscarPorNombre(nombre, fichas, nombresDe)?.fullName ?? null;

console.log('=== Le encuentra su ficha ===');
ok('nombre idéntico', ficha('Irma Karina Vargas García'), 'Irma Karina Vargas García');
ok('espacio de más al final', ficha('Martha Castelán García '), 'Martha Castelán García');
ok('sólo nombre y primer apellido', ficha('Adriana Pérez'), 'Adriana Pérez Maldonado');
ok('sin segundo apellido', ficha('Lilian Elizabeth Pérez'), 'Lilian Elizabeth Pérez González');
ok('sin segundo nombre', ficha('Daniela Mercado'), 'Daniela Elizabeth Mercado Islas');
ok('nombres en otro orden', ficha('Emily Esmeralda Rodríguez Martínez'), 'Esmeralda Emily Rodríguez Martínez');
ok('sin acentos', ficha('Samuel Gomez'), 'Samuel Gómez Cerrada');
ok('una letra de más ("Florricela")', ficha('Dayren Florricela'), 'Dayren Floricela de León González');
ok('una letra cambiada ("Carrada")', ficha('Samuel Gómez Carrada'), 'Samuel Gómez Cerrada');
ok('en mayúsculas, como el catálogo', ficha('SANDY OSIRIS MENDOZA LEONIDEZ'), 'Sandy Osiris Mendoza Leonidez');

console.log('\n=== No inventa ===');
ok('alguien que no está en el organigrama', ficha('Juan Carlos Hernández Ruiz'), null);
ok('una sola palabra no basta', ficha('Daniela'), null);
ok('nombre vacío', ficha(''), null);
ok('nulo', ficha(null), null);
ok('palabras cortas no se aproximan ("Ana" ≠ "Ama")', mismoNombre('Ana López', 'Ama López'), false);
ok('apellido con dos letras cambiadas no cuenta', mismoNombre('Samuel Gómez Corredo', 'Samuel Gómez Cerrada'), false);
ok('mismo nombre, otro apellido', mismoNombre('Adriana López', 'Adriana Pérez Maldonado'), false);

console.log('\n=== Si le quedan dos fichas, ninguna ===');
const ambiguas = [
  { fullName: 'María José Pérez López', catalogValue: 'MARÍA JOSÉ PÉREZ LÓPEZ' },
  { fullName: 'María José Pérez Ruiz', catalogValue: 'MARÍA JOSÉ PÉREZ RUIZ' },
];
ok('"María Pérez" con dos candidatas → ninguna', buscarPorNombre('María Pérez', ambiguas, nombresDe), null);
ok('con el segundo apellido ya es una', buscarPorNombre('María Pérez Ruiz', ambiguas, nombresDe)?.fullName, 'María José Pérez Ruiz');

console.log(`\n${fallos === 0 ? 'TODO BIEN' : `${fallos} FALLA(S)`}`);
process.exitCode = fallos ? 1 : 0;
