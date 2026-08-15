import ExcelJS from 'exceljs';

/**
 * Safely extracts raw primitive/string/Date value from any ExcelJS cell representation,
 * handling formula objects, rich text arrays, hyperlinks, etc.
 */
export function extractCellValue(val: any): any {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
        if (val instanceof Date) return val;
        // Formula cell result
        if ('result' in val && val.result !== undefined && val.result !== null) {
            return extractCellValue(val.result);
        }
        // Rich text cell
        if ('richText' in val && Array.isArray(val.richText)) {
            return val.richText.map((t: any) => t?.text || '').join('');
        }
        // Hyperlink or text object
        if ('text' in val && val.text !== undefined) {
            return extractCellValue(val.text);
        }
        // Wrapped value property
        if ('value' in val && val.value !== undefined) {
            return extractCellValue(val.value);
        }
    }
    return val;
}

export const extractTextFromExcel = async (file: File): Promise<string> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);
        
        let fullText = "";

        workbook.eachSheet((sheet) => {
            sheet.eachRow((row) => {
                const rowValues = row.values as any[];
                // row.values is 1-indexed in ExcelJS, so slice(1)
                const rowString = (Array.isArray(rowValues) ? rowValues.slice(1) : [])
                    .map(val => {
                        const cellVal = extractCellValue(val);
                        return cellVal !== null && cellVal !== undefined ? String(cellVal) : '';
                    })
                    .join(',');
                fullText += rowString + "\n";
            });
        });
        
        return fullText;
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Excel processing error: ${error.message}`);
        } else {
            throw new Error("An unknown error occurred during Excel processing.");
        }
    }
};


