/**
 * Reportes descargables de Pagos (Excel, Word y PDF).
 *
 * Las librerías de cada formato pesan; se cargan sólo al pedir el reporte.
 */
import { construirReportePagos, type PagoEntrada, type ReportePagos } from './datos';
import { dibujarGraficas } from './graficas';
import { nombreArchivo, type EntradaFormato, type FormatoReporte, type Logo, type TipoReporte } from './comun';

export type { FormatoReporte, TipoReporte } from './comun';
export type { PagoEntrada, ReportePagos } from './datos';

export interface OpcionesReporte {
  formato: FormatoReporte;
  tipo: TipoReporte;
  pagos: PagoEntrada[];
  anio: number;
  usuario: string;
  /** Ruta del logotipo; si no carga, el reporte sale sin él. */
  logoUrl?: string;
}

const cargarLogo = async (url: string): Promise<Logo | null> => {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    // El ícono trae un marco gris de 1 px y fondo cuadrado: se recorta en
    // círculo para que en el encabezado se vea sólo el emblema.
    const imagen = await createImageBitmap(await resp.blob());
    const borde = 3;
    const lado = Math.min(imagen.width, imagen.height) - borde * 2;
    const canvas = document.createElement('canvas');
    canvas.width = lado;
    canvas.height = lado;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.beginPath();
    ctx.arc(lado / 2, lado / 2, lado / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(imagen, borde, borde, lado, lado, 0, 0, lado, lado);
    const dataUrl = canvas.toDataURL('image/png');
    const binario = atob(dataUrl.split(',')[1]);
    const png = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) png[i] = binario.charCodeAt(i);
    return { png, dataUrl };
  } catch {
    return null;
  }
};

export const generarReportePagos = async (o: OpcionesReporte): Promise<{ blob: Blob; nombre: string; reporte: ReportePagos }> => {
  if (!o.pagos.length) throw new Error('No hay registros de pagos para el reporte.');
  const reporte = construirReportePagos(o.pagos, { anio: o.anio, usuario: o.usuario });
  const [logo, generar] = await Promise.all([
    cargarLogo(o.logoUrl ?? '/images/aifa-icon-192.png'),
    o.formato === 'excel'
      ? import('./excel').then((m) => m.generarExcel)
      : o.formato === 'word'
        ? import('./word').then((m) => m.generarWord)
        : import('./pdf').then((m) => m.generarPdf),
  ]);
  const entrada: EntradaFormato = { reporte, graficas: dibujarGraficas(reporte), tipo: o.tipo, logo };
  const blob = await generar(entrada);
  return { blob, nombre: nombreArchivo(o.tipo, o.formato, reporte), reporte };
};

export const descargarArchivo = (blob: Blob, nombre: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export const descargarReportePagos = async (o: OpcionesReporte) => {
  const { blob, nombre, reporte } = await generarReportePagos(o);
  descargarArchivo(blob, nombre);
  return reporte;
};
