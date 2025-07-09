const { google } = require('googleapis');
import { ProductInfo, SheetRow } from '../types';

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
}