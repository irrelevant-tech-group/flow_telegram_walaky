export interface ProductInfo {
  codigo: string;
  articulo: string;
  impuesto: number;
  precio: number;
}

export interface ExtractedData {
  productos: Array<{
    codigo: string;
    articulo: string;
    cantidad: number;
    precioSinIva: number;
    total: number;
  }>;
  factura: string;
  fecha: string;
  cliente: string;
  telefono: string;
  email: string;
  fechaCumpleanos: string;
}

export interface SheetRow {
  codigo: string;
  articulo: string;
  cantidad: number;
  precioSinIva: number;
  total: number;
  factura: string;
  fecha: string;
  cliente: string;
  telefono: string;
  email: string;
  isBot?: boolean;
}

export interface ClientInfo {
  id: string;
  nombre: string;
  cedula: string;
  email: string;
  fechaCumpleanos: string;
  numeroCompras: number;
  totalGastado: number;
  ticketPromedio: number;
  productosUnicos: number;
  frecuenciaCompra: number;
  primeraCompra: string;
  ultimaCompra: string;
}

export interface ClientUpdate {
  numeroCompras: number;
  totalGastado: number;
  ticketPromedio: number;
  productosUnicos: number;
  frecuenciaCompra: number;
  primeraCompra: string;
  ultimaCompra: string;
}