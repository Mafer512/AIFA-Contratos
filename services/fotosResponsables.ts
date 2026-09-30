import { supabase } from './supabaseClient';

// Fotografías del personal, guardadas en Supabase Storage.
//
// Antes la única manera de ponerle foto a alguien era copiar el archivo a
// public/images/responsables/ y volver a desplegar el sitio: algo que el área
// no puede hacer. Con esto la sube quien da de alta a la persona, desde la
// misma pantalla.
//
// Las fotos viejas siguen funcionando: son rutas que empiezan con /images/ y el
// navegador las sirve igual. No hay que migrarlas.

export const BUCKET_FOTOS = 'responsables';

/** Lo más grande que se guarda. Una ficha no necesita más. */
const LADO_MAXIMO = 512;
const CALIDAD_JPEG = 0.85;

/** Tope de lo que se acepta del disco, antes de redimensionar. */
const MAX_BYTES_ORIGEN = 12 * 1024 * 1024;

const TIPOS_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/**
 * Reduce la imagen antes de subirla.
 *
 * Una foto de celular pesa varios megabytes y aquí se ve en un cuadro de 72
 * píxeles. Subirla tal cual gastaría almacenamiento y, sobre todo, haría que la
 * pantalla de responsables tardara en cargar catorce imágenes enormes.
 *
 * Se recorta al centro en cuadrado: las tarjetas y el organigrama muestran la
 * foto en cuadro, y así se elige el encuadre una sola vez en vez de dejar que
 * cada vista corte por donde le toque.
 */
const redimensionar = async (archivo: File): Promise<Blob> => {
  // imageOrientation respeta el EXIF: sin esto, las fotos tomadas con el
  // teléfono de lado se guardan giradas.
  const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' });

  const lado = Math.min(bitmap.width, bitmap.height);
  const recorteX = (bitmap.width - lado) / 2;
  const recorteY = (bitmap.height - lado) / 2;
  const destino = Math.min(lado, LADO_MAXIMO);

  const lienzo = document.createElement('canvas');
  lienzo.width = destino;
  lienzo.height = destino;

  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('El navegador no pudo procesar la imagen.');

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, recorteX, recorteY, lado, lado, 0, 0, destino, destino);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    lienzo.toBlob(resolve, 'image/jpeg', CALIDAD_JPEG)
  );
  if (!blob) throw new Error('No se pudo preparar la imagen.');
  return blob;
};

/** Nombre de archivo a partir del nombre de la persona. */
const nombreArchivo = (catalogValue: string): string => {
  const base = catalogValue
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 60) || 'persona';
  // El sufijo de tiempo evita que el navegador siga enseñando la foto anterior
  // desde su caché cuando alguien la reemplaza.
  return `${base}-${Date.now()}.jpg`;
};

export interface ResultadoSubida {
  url: string;
  /** Tamaño final, para poder decirle a la persona cuánto se redujo. */
  bytes: number;
}

/**
 * Sube la fotografía de alguien y devuelve su URL pública.
 *
 * El bucket es público: estas fotos ya se servían desde public/images/, así que
 * no cambia quién las puede ver, y una URL pública se puede poner directo en un
 * <img> sin tener que renovar enlaces firmados cada hora.
 */
export const subirFoto = async (archivo: File, catalogValue: string): Promise<ResultadoSubida> => {
  if (!TIPOS_ACEPTADOS.includes(archivo.type)) {
    throw new Error('Elige una imagen (JPG, PNG o WEBP).');
  }
  if (archivo.size > MAX_BYTES_ORIGEN) {
    throw new Error('La imagen pesa más de 12 MB. Usa una más ligera.');
  }

  const blob = await redimensionar(archivo);
  const ruta = nombreArchivo(catalogValue);

  const { error } = await supabase.storage
    .from(BUCKET_FOTOS)
    .upload(ruta, blob, { contentType: 'image/jpeg', upsert: false });

  if (error) {
    const msg = error.message ?? '';
    if (/bucket not found/i.test(msg)) {
      throw new Error('Falta crear el almacén de fotos en Supabase. Ejecuta la migración supabase/migrations/20260930010000_fotos_responsables.sql.');
    }
    if (/row-level security|not authorized|403/i.test(msg)) {
      throw new Error('Tu perfil no tiene permiso para subir fotografías.');
    }
    throw new Error(`No se pudo subir la imagen: ${msg}`);
  }

  const { data } = supabase.storage.from(BUCKET_FOTOS).getPublicUrl(ruta);
  return { url: data.publicUrl, bytes: blob.size };
};

/**
 * Borra del almacén una foto que ya no se usa.
 *
 * Sólo toca las que viven en el bucket: las rutas viejas de /images/ son
 * archivos del propio sitio y no se pueden ni se deben borrar desde aquí.
 */
export const eliminarFoto = async (url: string): Promise<void> => {
  if (!url || !url.includes(`/${BUCKET_FOTOS}/`)) return;
  const ruta = url.split(`/${BUCKET_FOTOS}/`).pop();
  if (!ruta) return;
  const { error } = await supabase.storage.from(BUCKET_FOTOS).remove([ruta.split('?')[0]]);
  // Una foto huérfana en el almacén no rompe nada; interrumpir el guardado por
  // eso sí sería un problema.
  if (error) console.warn('No se pudo borrar la foto anterior:', error.message);
};

/** Formatea bytes para el acuse ("245 KB"). */
export const formatearPeso = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B`
    : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
