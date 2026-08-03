import ExcelJS from 'exceljs';

export const extractTextFromExcel = async (file: File): Promise<string> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);
        
        let fullText = "";

        workbook.eachSheet((sheet) => {
            sheet.eachRow((row) => {
                // Ensure values are properly converted to string, joining with commas to simulate CSV
                const rowValues = row.values as any[];
                // row.values is 1-indexed in ExcelJS, so slice(1)
                const rowString = rowValues.slice(1).map(val => val?.toString() || '').join(',');
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

