const { google } = require('googleapis');
import { ProductInfo, SheetRow, ClientInfo, ClientUpdate } from '../types';

export class SheetsService {
  private sheets: any;
  private auth: any;

  constructor() {
    this.auth = new google.auth.GoogleAuth({
      keyFile: './creds.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }

  async getProductsFromSheet(): Promise<ProductInfo[]> {
    const PRODUCTS_SHEET_ID = process.env.PRODUCTS_SHEET_ID;
    
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: PRODUCTS_SHEET_ID,
        range: 'A:D',
      });

      const rows = response.data.values;
      if (!rows || rows.length <= 1) return [];

      const products = rows.slice(1).map((row: any[]) => {
        const precioStr = (row[3] || '0').toString().replace(/[$,]/g, '');
        const impuestoStr = (row[2] || '19%').toString().replace('%', '');
        
        return {
          codigo: row[0] || '',
          articulo: row[1] || '',
          impuesto: parseFloat(impuestoStr) || 19,
          precio: parseFloat(precioStr) || 0,
        };
      });

      console.log('📋 Productos cargados desde la hoja:');
      products.slice(0, 5).forEach(p => {
        console.log(`  ${p.codigo}: ${p.articulo} - $${p.precio} (IVA: ${p.impuesto}%)`);
      });
      console.log(`  ... y ${products.length - 5} productos más`);

      return products;
    } catch (error) {
      console.error('Error al obtener productos:', error);
      return [];
    }
  }

  async insertDataToSheet(data: SheetRow[]): Promise<boolean> {
    const DESTINATION_SHEET_ID = process.env.DESTINATION_SHEET_ID;
    
    try {
      const values = data.map(row => [
        row.codigo,
        row.articulo,
        row.cantidad,
        row.precioSinIva,
        row.total,
        row.factura,
        row.fecha,
        row.cliente,
        row.telefono,
        row.email,
      ]);

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: DESTINATION_SHEET_ID,
        range: 'A:J',
        valueInputOption: 'RAW',
        resource: {
          values,
        },
      });

      return true;
    } catch (error) {
      console.error('Error al insertar datos:', error);
      return false;
    }
  }

  async getClientByEmail(email: string): Promise<ClientInfo | null> {
    const CLIENTS_SHEET_ID = process.env.CLIENTS_SHEET_ID;
    
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: CLIENTS_SHEET_ID,
        range: 'A:L',
      });

      const rows = response.data.values;
      if (!rows || rows.length <= 1) return null;

      // Buscar cliente por email (columna D, índice 3)
      const clientRow = rows.find((row: any[], index: number) => {
        if (index === 0) return false; // Skip header
        return row[3] && row[3].toLowerCase() === email.toLowerCase();
      });

      if (!clientRow) return null;

      return {
        id: clientRow[0] || '',
        nombre: clientRow[1] || '',
        cedula: clientRow[2] || '',
        email: clientRow[3] || '',
        fechaCumpleanos: clientRow[4] || '',
        numeroCompras: parseInt(clientRow[5]) || 0,
        totalGastado: parseFloat(clientRow[6]) || 0,
        ticketPromedio: parseFloat(clientRow[7]) || 0,
        productosUnicos: parseInt(clientRow[8]) || 0,
        frecuenciaCompra: parseInt(clientRow[9]) || 0,
        primeraCompra: clientRow[10] || '',
        ultimaCompra: clientRow[11] || '',
      };

    } catch (error) {
      console.error('Error al buscar cliente:', error);
      return null;
    }
  }

  async updateClient(email: string, updates: ClientUpdate): Promise<boolean> {
    const CLIENTS_SHEET_ID = process.env.CLIENTS_SHEET_ID;
    
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: CLIENTS_SHEET_ID,
        range: 'A:L',
      });

      const rows = response.data.values;
      if (!rows || rows.length <= 1) return false;

      // Encontrar la fila del cliente
      const clientRowIndex = rows.findIndex((row: any[], index: number) => {
        if (index === 0) return false;
        return row[3] && row[3].toLowerCase() === email.toLowerCase();
      });

      if (clientRowIndex === -1) return false;

      // Actualizar la fila (clientRowIndex + 1 porque las filas en Google Sheets empiezan en 1)
      const rowNumber = clientRowIndex + 1;
      
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: CLIENTS_SHEET_ID,
        range: `F${rowNumber}:L${rowNumber}`, // Columnas F a L (Número Compras hasta Última Compra)
        valueInputOption: 'RAW',
        resource: {
          values: [[
            updates.numeroCompras,
            updates.totalGastado,
            updates.ticketPromedio,
            updates.productosUnicos,
            updates.frecuenciaCompra,
            updates.primeraCompra,
            updates.ultimaCompra
          ]]
        }
      });

      return true;
    } catch (error) {
      console.error('Error al actualizar cliente:', error);
      return false;
    }
  }

  async addNewClient(clientInfo: ClientInfo): Promise<boolean> {
    const CLIENTS_SHEET_ID = process.env.CLIENTS_SHEET_ID;
    
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: CLIENTS_SHEET_ID,
        range: 'A:L',
        valueInputOption: 'RAW',
        resource: {
          values: [[
            clientInfo.id,
            clientInfo.nombre,
            clientInfo.cedula,
            clientInfo.email,
            clientInfo.fechaCumpleanos,
            clientInfo.numeroCompras,
            clientInfo.totalGastado,
            clientInfo.ticketPromedio,
            clientInfo.productosUnicos,
            clientInfo.frecuenciaCompra,
            clientInfo.primeraCompra,
            clientInfo.ultimaCompra
          ]]
        }
      });

      return true;
    } catch (error) {
      console.error('Error al agregar nuevo cliente:', error);
      return false;
    }
  }

  async getNextClientId(): Promise<string> {
    const CLIENTS_SHEET_ID = process.env.CLIENTS_SHEET_ID;
    
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: CLIENTS_SHEET_ID,
        range: 'A:A', // Solo columna A (ID)
      });
  
      const rows = response.data.values;
      if (!rows || rows.length <= 1) {
        // Si no hay datos o solo hay header, empezar con 001
        return '001';
      }
  
      // Obtener todos los IDs (saltando el header)
      const ids = rows.slice(1).map((row: any[]) => {
        const id = row[0];
        // Convertir a número si es posible, sino retornar 0
        return id && !isNaN(parseInt(id)) ? parseInt(id) : 0;
      });
  
      // Encontrar el ID más alto
      const maxId = Math.max(...ids);
      
      // Generar el siguiente ID secuencial con padding de 3 dígitos
      const nextId = (maxId + 1).toString().padStart(3, '0');
      
      console.log(`🔢 Próximo ID de cliente: ${nextId} (último ID encontrado: ${maxId})`);
      
      return nextId;
  
    } catch (error) {
      console.error('Error al obtener próximo ID de cliente:', error);
      // En caso de error, retornar un ID por defecto
      return '001';
    }
  }

  async getClientPurchaseHistory(email: string): Promise<SheetRow[]> {
    const DESTINATION_SHEET_ID = process.env.DESTINATION_SHEET_ID;
    
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: DESTINATION_SHEET_ID,
        range: 'A:J',
      });

      const rows = response.data.values;
      if (!rows || rows.length <= 1) return [];

      // Filtrar compras por email (columna J, índice 9)
      const clientPurchases = rows.filter((row: any[], index: number) => {
        if (index === 0) return false; // Skip header
        return row[9] && row[9].toLowerCase() === email.toLowerCase();
      }).map((row: any[]) => ({
        codigo: row[0] || '',
        articulo: row[1] || '',
        cantidad: parseInt(row[2]) || 0,
        precioSinIva: parseFloat(row[3]) || 0,
        total: parseFloat(row[4]) || 0,
        factura: row[5] || '',
        fecha: row[6] || '',
        cliente: row[7] || '',
        telefono: row[8] || '',
        email: row[9] || '',
      }));

      return clientPurchases;
    } catch (error) {
      console.error('Error al obtener historial de compras:', error);
      return [];
    }
  }
}