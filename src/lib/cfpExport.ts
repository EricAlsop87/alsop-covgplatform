import ExcelJS from 'exceljs';
import type { CFPTermRow } from '@/app/api/cfp-summary/route';

export async function exportCFPToExcel(terms: CFPTermRow[], filterDescription: string) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Coverage Check';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('CFP Summary', {
        views: [{ state: 'frozen', ySplit: 1 }],
    });

    // Define Columns
    worksheet.columns = [
        { header: 'Policy Number', key: 'policy_number', width: 22 },
        { header: 'Base Policy', key: 'base_policy', width: 18 },
        { header: 'Suffix', key: 'suffix', width: 10 },
        { header: 'Named Insured', key: 'named_insured', width: 26 },
        { header: 'Property Address', key: 'property_address', width: 34 },
        { header: 'Carrier', key: 'carrier_name', width: 22 },
        { header: 'Effective Date', key: 'effective_date', width: 15 },
        { header: 'Expiration Date', key: 'expiration_date', width: 15 },
        { header: 'Annual Premium', key: 'annual_premium', width: 16 },
        { header: 'DEC Page', key: 'has_dec', width: 14 },
        { header: 'RCE', key: 'has_rce', width: 14 },
        { header: 'DIC', key: 'has_dic', width: 14 },
        { header: 'Quote / E&S', key: 'has_es', width: 14 },
        { header: 'Bamboo Full Coverage', key: 'has_bamboo', width: 22 },
        { header: 'Payment Status', key: 'payment_status', width: 16 },
        { header: 'Payment Plan', key: 'payment_plan', width: 15 },
    ];

    // Style Header Row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 28;
    headerRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' }, // Dark Slate Navy
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Align text headers to left, and indicators to center
    worksheet.getColumn('policy_number').alignment = { vertical: 'middle', horizontal: 'left' };
    worksheet.getColumn('base_policy').alignment = { vertical: 'middle', horizontal: 'left' };
    worksheet.getColumn('named_insured').alignment = { vertical: 'middle', horizontal: 'left' };
    worksheet.getColumn('property_address').alignment = { vertical: 'middle', horizontal: 'left' };
    worksheet.getColumn('carrier_name').alignment = { vertical: 'middle', horizontal: 'left' };

    // Add Data Rows
    for (const term of terms) {
        const row = worksheet.addRow({
            policy_number: term.policy_number,
            base_policy: term.base_policy,
            suffix: term.suffix || '',
            named_insured: term.named_insured || '',
            property_address: term.property_address || '',
            carrier_name: term.carrier_name || '',
            effective_date: term.effective_date || '',
            expiration_date: term.expiration_date || '',
            annual_premium: term.annual_premium ?? '',
            payment_status: term.payment_status || '',
            payment_plan: term.payment_plan || '',
            has_dec: term.has_dec ? 'Uploaded' : 'Missing',
            has_rce: term.rce_carrier || (term.has_rce ? 'Uploaded' : 'Missing'),
            has_dic: term.dic_carrier || (term.has_dic ? 'Verified' : 'Missing'),
            has_es: term.has_es ? 'Uploaded' : 'Missing',
            has_bamboo: term.has_bamboo_coverage ? 'Yes' : 'No',
        });

        row.height = 20;
        row.alignment = { vertical: 'middle' };

        // Format Currency
        if (term.annual_premium) {
            const cell = row.getCell('annual_premium');
            cell.numFmt = '$#,##0.00';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
        }

        // Center align indicator columns
        ['suffix', 'effective_date', 'expiration_date', 'has_dec', 'has_rce', 'has_dic', 'has_es', 'has_bamboo'].forEach(col => {
            const cell = row.getCell(col);
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        // Color coding for DEC, RCE, DIC, Quote
        if (!term.has_dec) {
            row.getCell('has_dec').font = { color: { argb: 'FFDC2626' }, bold: true };
        } else {
            row.getCell('has_dec').font = { color: { argb: 'FF16A34A' }, bold: true };
        }

        if (!term.has_rce) {
            row.getCell('has_rce').font = { color: { argb: 'FFDC2626' }, bold: true };
        } else {
            row.getCell('has_rce').font = { color: { argb: 'FF16A34A' }, bold: true };
        }

        if (!term.has_dic) {
            row.getCell('has_dic').font = { color: { argb: 'FFDC2626' }, bold: true };
        } else {
            row.getCell('has_dic').font = { color: { argb: 'FF16A34A' }, bold: true };
        }

        if (!term.has_es) {
            row.getCell('has_es').font = { color: { argb: 'FFDC2626' }, bold: true };
        } else {
            row.getCell('has_es').font = { color: { argb: 'FF16A34A' }, bold: true };
        }
    }

    // Generate buffer & trigger browser download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const dateStr = new Date().toISOString().split('T')[0];
    const cleanFilter = filterDescription.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `CFP_Summary_${cleanFilter}_${dateStr}.xlsx`;

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}
