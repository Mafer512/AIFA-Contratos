// Ejecutar con:  node --experimental-strip-types scripts/test_organigrama.mjs
//
// Comprueba que la estructura orgánica se arma como la lee el área en su
// plantilla: el gerente arriba, cada coordinación con su gente, y nadie
// perdido por el camino.
import { construirEstructura, contarPersonas, ORGANIGRAMA_BASE } from '../data/organigrama.ts';
import { RESPONSABLE_PROFILES_CON_ORGANIGRAMA } from '../data/responsables.ts';

let fallos = 0;
const ok = (nombre, bien, detalle = '') => {
  if (!bien) fallos++;
  console.log(`${bien ? 'OK   ' : 'FALLA'} ${nombre.padEnd(56)} ${detalle}`);
};

const personas = [...RESPONSABLE_PROFILES_CON_ORGANIGRAMA];
const e = construirEstructura(personas);

console.log('=== Plantilla real (14 personas) ===\n');
ok('las 14 personas tienen ficha', personas.length === 14, `${personas.length}`);
ok('todas tienen lugar en la estructura',
   Object.keys(ORGANIGRAMA_BASE).length === 14, `${Object.keys(ORGANIGRAMA_BASE).length} en el organigrama`);

ok('el gerente es Samuel Gomez Cerrada',
   e.gerente?.catalogValue === 'SAMUEL GÓMEZ CERRADA', e.gerente?.fullName ?? 'ninguno');
ok('hay 3 coordinaciones', e.coordinaciones.length === 3, `${e.coordinaciones.length}`);
ok('nadie queda sin asignar', e.sinAsignar.length === 0,
   e.sinAsignar.length ? `⚠ ${e.sinAsignar.map(p => p.fullName).join(', ')}` : '');
ok('la estructura cubre a las 14', contarPersonas(e) === 14, `${contarPersonas(e)}`);

console.log('\n=== Equipos segun la plantilla ===\n');
const esperado = {
  'DANIELA ELIZABETH MERCADO ISLAS': ['GILBERTO AYALA RAMÍREZ', 'MONSERRAT ALONSO MARTÍNEZ', 'IRMA KARINA VARGAS GARCÍA'],
  'MARTHA CASTELÁN GARCÍA': ['ADRIANA PÉREZ MALDONADO', 'SAMMANTHA DELGADO SERRANO', 'DAYREN FLORICELA DE LEÓN GONZÁLEZ', 'MARI CARMEN ALVAREZ REYES'],
  'ARACELI ESMERALDA SÁNCHEZ TORRES': ['LILIAN ELIZABETH PÉREZ GONZÁLEZ', 'ESMERALDA EMILY RODRÍGUEZ MARTÍNEZ', 'SANDY OSIRIS MENDOZA LEONIDEZ'],
};

for (const [coord, equipoEsperado] of Object.entries(esperado)) {
  const nodo = e.coordinaciones.find(c => c.persona.catalogValue === coord);
  ok(`existe la coordinacion de ${coord.split(' ')[0]}`, !!nodo);
  if (!nodo) continue;
  const real = nodo.equipo.map(p => p.catalogValue);
  ok(`  tiene ${equipoEsperado.length} personas`, real.length === equipoEsperado.length, `${real.length}`);
  // El orden importa: es el de partida, el mismo de la plantilla oficial.
  ok(`  en el orden de la plantilla`, JSON.stringify(real) === JSON.stringify(equipoEsperado),
     JSON.stringify(real) === JSON.stringify(equipoEsperado) ? '' : real.join(' | '));
}

console.log('\n=== Los coordinadores salen ordenados por partida ===\n');
const partidas = e.coordinaciones.map(c => c.persona.partida);
ok('coordinaciones en orden 2, 3, 4', JSON.stringify(partidas) === '[2,3,4]', JSON.stringify(partidas));

console.log('\n=== Casos raros ===\n');

// Alguien recien dado de alta, sin jefe todavia: debe verse, no desaparecer.
const conHuerfano = [...personas, {
  catalogValue: 'PERSONA NUEVA', fullName: 'Persona Nueva',
  employeeNumber: '9999', academicDegree: '', aifaTenure: '', photoUrl: '',
  nivelOrganico: 'COLABORADOR', reportaA: null, partida: 99, activo: true,
}];
const e2 = construirEstructura(conHuerfano);
ok('un alta sin jefe NO se pierde', e2.sinAsignar.length === 1, e2.sinAsignar[0]?.fullName ?? 'se perdio');
ok('y sigue contando en el total', contarPersonas(e2) === 15, `${contarPersonas(e2)}`);

// Quien se va: se marca inactivo y desaparece de la estructura viva.
const conBaja = personas.map(p =>
  p.catalogValue === 'MARI CARMEN ALVAREZ REYES' ? { ...p, activo: false } : p);
const e3 = construirEstructura(conBaja);
const equipoMartha = e3.coordinaciones.find(c => c.persona.catalogValue === 'MARTHA CASTELÁN GARCÍA');
ok('una baja sale de su equipo', equipoMartha?.equipo.length === 3, `${equipoMartha?.equipo.length}`);
ok('y del total', contarPersonas(e3) === 13, `${contarPersonas(e3)}`);

// Si se va un coordinador, su gente no debe desaparecer de la pantalla.
const sinCoordinador = personas.map(p =>
  p.catalogValue === 'DANIELA ELIZABETH MERCADO ISLAS' ? { ...p, activo: false } : p);
const e4 = construirEstructura(sinCoordinador);
ok('si se va un coordinador, su gente queda visible', e4.sinAsignar.length === 3,
   e4.sinAsignar.map(p => p.fullName.split(' ')[0]).join(', '));
ok('y nadie se pierde del total', contarPersonas(e4) === 13, `${contarPersonas(e4)}`);

// El acento no debe romper la relación jefe-subordinado.
const sinAcentos = personas.map(p =>
  p.catalogValue === 'GILBERTO AYALA RAMÍREZ'
    ? { ...p, reportaA: 'DANIELA ELIZABETH MERCADO ISLAS'.normalize('NFD').replace(/[̀-ͯ]/g, '') }
    : p);
const e5 = construirEstructura(sinAcentos);
const equipoDaniela = e5.coordinaciones.find(c => c.persona.catalogValue === 'DANIELA ELIZABETH MERCADO ISLAS');
ok('el jefe se encuentra aunque falten acentos', equipoDaniela?.equipo.length === 3, `${equipoDaniela?.equipo.length}`);

console.log('\n' + (fallos === 0 ? 'TODAS LAS PRUEBAS PASARON' : `${fallos} PRUEBA(S) FALLARON`));
process.exit(fallos === 0 ? 0 : 1);
