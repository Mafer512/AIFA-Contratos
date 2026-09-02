export interface ResponsableProfile {
  fullName: string;
  catalogValue: string;
  employeeNumber: string;
  academicDegree: string;
  aifaTenure: string;
  photoUrl: string;
  aliases?: string[];
}

export const RESPONSABLE_PROFILES: readonly ResponsableProfile[] = [
  {
    fullName: 'Daniela Elizabeth Mercado Islas',
    catalogValue: 'DANIELA ELIZABETH MERCADO ISLAS',
    employeeNumber: '363',
    academicDegree: 'Licenciada en Ciencias Políticas y Administración Pública',
    aifaTenure: '4 años 9 meses 14 días',
    photoUrl: '/images/responsables/daniela-elizabeth-mercado-islas.jpg',
  },
  {
    fullName: 'Monserrat Alonso Martínez',
    catalogValue: 'MONSERRAT ALONSO MARTÍNEZ',
    employeeNumber: '1322',
    academicDegree: 'Licenciatura en Economía',
    aifaTenure: '1 año 5 meses 15 días',
    photoUrl: '/images/responsables/monserrat-alonso-martinez.jpg',
  },
  {
    fullName: 'Irma Karina Vargas García',
    catalogValue: 'IRMA KARINA VARGAS GARCÍA',
    employeeNumber: '1602',
    academicDegree: 'Licenciatura en Comercio Exterior',
    aifaTenure: '8 meses 22 días',
    photoUrl: '/images/responsables/irma-karina-vargas-garcia.jpg',
  },
  {
    fullName: 'Lilian Elizabeth Pérez González',
    catalogValue: 'LILIAN ELIZABETH PÉREZ GONZÁLEZ',
    employeeNumber: '744',
    academicDegree: 'Licenciatura en Contaduría Pública',
    aifaTenure: '4 años 4 meses y 25 días',
    photoUrl: '/images/responsables/lilian-elizabeth-perez-gonzalez.jpg',
  },
  {
    fullName: 'Esmeralda Emily Rodríguez Martínez',
    catalogValue: 'ESMERALDA EMILY RODRÍGUEZ MARTÍNEZ',
    employeeNumber: '1279',
    academicDegree: 'Licenciatura en Relaciones Internacionales',
    aifaTenure: '2 años 1 mes 8 días',
    photoUrl: '/images/responsables/esmeralda-emily-rodriguez-martinez.jpg',
  },
  {
    fullName: 'Sandy Osiris Mendoza Leonidez',
    catalogValue: 'SANDY OSIRIS MENDOZA LEONIDEZ',
    employeeNumber: '1685',
    academicDegree: 'Licenciatura en Ciencia Política y Administración Urbana; Maestría en Gestión Pública para la Buena Administración',
    aifaTenure: '4 meses 16 días',
    photoUrl: '/images/responsables/sandy-osiris-mendoza-leonidez.jpg',
    aliases: ['SANDY OSIRIS MENDONZA LEONÍDEZ'],
  },
  {
    fullName: 'Martha Castelán García',
    catalogValue: 'MARTHA CASTELÁN GARCÍA',
    employeeNumber: '1057',
    academicDegree: 'Licenciada en Administración y Gestión de Pequeñas y medianas empresas.',
    aifaTenure: '3 años 4 meses 26 días',
    photoUrl: '/images/responsables/martha-castelan-garcia.jpg',
  },
  {
    fullName: 'Dayren Floricela de León González',
    catalogValue: 'DAYREN FLORICELA DE LEÓN GONZÁLEZ',
    employeeNumber: '1250',
    academicDegree: 'Licenciatura en Turismo',
    aifaTenure: '2 años 3 meses 3 días',
    photoUrl: '/images/responsables/dayren-floricela-de-leon-gonzalez.jpg',
  },
  {
    fullName: 'Adriana Pérez Maldonado',
    catalogValue: 'ADRIANA PÉREZ MALDONADO',
    employeeNumber: '467',
    academicDegree: 'Licenciatura en Contaduría Pública',
    aifaTenure: '4 años 8 meses 3 días',
    photoUrl: '/images/responsables/adriana-perez-maldonado.jpg',
  },
  {
    fullName: 'Araceli Esmeralda Sánchez Torres',
    catalogValue: 'ARACELI ESMERALDA SÁNCHEZ TORRES',
    employeeNumber: '461',
    academicDegree: 'Licenciatura en Derecho',
    aifaTenure: '4 años 8 meses 3 días',
    photoUrl: '/images/responsables/araceli-esmeralda-sanchez-torres.jpg',
  },
  {
    fullName: 'Sammantha Delgado Serrano',
    catalogValue: 'SAMMANTHA DELGADO SERRANO',
    employeeNumber: '1727',
    academicDegree: 'Licenciatura en Contaduría Pública',
    aifaTenure: '2 meses 7 días',
    photoUrl: '/images/responsables/sammantha-delgado-serrano.jpg',
  },
  {
    fullName: 'Gilberto Ayala Ramírez',
    catalogValue: 'GILBERTO AYALA RAMÍREZ',
    employeeNumber: '1059',
    academicDegree: 'Ingeniero Constructor',
    aifaTenure: '3 años 4 meses 26 días',
    photoUrl: '/images/responsables/gilberto-ayala-ramirez.jpg',
  },
  {
    fullName: 'Samuel Gómez Cerrada',
    catalogValue: 'SAMUEL GÓMEZ CERRADA',
    employeeNumber: '823',
    academicDegree: 'Licenciatura en Administración Énfasis Finanzas',
    aifaTenure: '4 años 3 meses 14 días',
    photoUrl: '/images/responsables/samuel-gomez-cerrada.jpg',
  },
] as const;

export const RESPONSABLES = RESPONSABLE_PROFILES.map(({ catalogValue }) => catalogValue);

export const normalizeResponsableKey = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();

const profileByKey = new Map<string, ResponsableProfile>();

RESPONSABLE_PROFILES.forEach((profile) => {
  [profile.catalogValue, profile.fullName, ...(profile.aliases ?? [])].forEach((name) => {
    profileByKey.set(normalizeResponsableKey(name), profile);
  });
});

export const getResponsableProfile = (value: unknown): ResponsableProfile | undefined =>
  profileByKey.get(normalizeResponsableKey(value));

export const getCanonicalResponsableValue = (value: unknown): string => {
  const rawValue = String(value ?? '').trim();
  return getResponsableProfile(rawValue)?.catalogValue ?? rawValue;
};
