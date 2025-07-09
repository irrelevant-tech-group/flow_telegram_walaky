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
  }