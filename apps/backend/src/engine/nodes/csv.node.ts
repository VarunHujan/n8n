import { INode, NodeExecutionInput, NodeExecutionOutput } from '../node.interface';

export class CsvNode implements INode {
  type = 'csv_input';

  async execute(config: NodeExecutionInput): Promise<NodeExecutionOutput> {
    const csvString = config.parameters.csvData || '';
    if (!csvString) {
      return { success: false, error: 'No CSV data provided' };
    }

    try {
      const lines = csvString.trim().split('\n');
      const headers = lines[0].split(',').map((h: string) => h.trim());
      
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map((v: string) => v.trim());
        const rowObj: any = {};
        headers.forEach((h: string, index: number) => {
          rowObj[h] = values[index] || '';
        });
        rows.push(rowObj);
      }

      return {
        success: true,
        data: rows
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to parse CSV: ${e.message}`
      };
    }
  }
}
