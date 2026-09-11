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
        { header: 'Bamboo', key: 'bamboo', width: 24 },
        { header: 'Aegis', key: 'aegis', width: 24 },
        { header: 'AM', key: 'am', width: 24 },
        { header: 'SageSure', key: 'sagesure', width: 24 },
        { header: 'PSIC', key: 'psic', width: 24 },
        { header: 'Title Pro', key: 'title_pro', width: 22 },
        { header: 'Notes', key: 'notes_preview', width: 32 },
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

    const formatQuote = (q: any) => {
        if (!q) return 'Unquoted';
        if (q.coverage_type === 'UNAVAILABLE') return `Unavailable${q.notes ? ` (${q.notes})` : ''}`;
        return `${q.coverage_type}${q.quote_number ? ` (#${q.quote_number})` : ''}${q.premium ? ` - $${Number(q.premium).toLocaleString()}` : ''}`;
    };

    // Add Data Rows
    for (const term of terms) {
        const quotes = term.carrier_quotes || ({} as any);

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
            bamboo: formatQuote(quotes.bamboo),
            aegis: formatQuote(quotes.aegis),
            am: formatQuote(quotes.am),
            sagesure: formatQuote(quotes.sagesure),
            psic: formatQuote(quotes.psic),
            title_pro: term.title_pro
                ? `${term.title_pro.match_status === 'matched' ? 'Matched' : term.title_pro.match_status === 'partial' ? 'Trust/LLC' : 'Mismatch'} (${term.title_pro.title_name})`
                : 'Unverified',
            notes_preview: term.latest_note_preview || (term.note_count > 0 ? `${term.note_count} note(s)` : ''),
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
        ['suffix', 'effective_date', 'expiration_date', 'has_dec', 'has_rce', 'bamboo', 'aegis', 'am', 'sagesure', 'psic', 'title_pro'].forEach(col => {
            const cell = row.getCell(col);
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        // Color coding for DEC, RCE, Carriers, Title Pro
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

        // Style Carrier Quote cells
        const carrierColKeys = ['bamboo', 'aegis', 'am', 'sagesure', 'psic'] as const;
        for (const cKey of carrierColKeys) {
            const q = quotes[cKey];
            const cell = row.getCell(cKey);
            if (!q) {
                cell.font = { color: { argb: 'FF64748B' } };
            } else if (q.coverage_type === 'FULL') {
                cell.font = { color: { argb: 'FF16A34A' }, bold: true };
            } else if (q.coverage_type === 'DIC') {
                cell.font = { color: { argb: 'FF2563EB' }, bold: true };
            } else if (q.coverage_type === 'UNAVAILABLE') {
                cell.font = { color: { argb: 'FFDC2626' }, bold: true };
            }
        }

        if (term.title_pro?.match_status === 'matched') {
            row.getCell('title_pro').font = { color: { argb: 'FF16A34A' }, bold: true };
        } else if (term.title_pro?.match_status === 'partial') {
            row.getCell('title_pro').font = { color: { argb: 'FFD97706' }, bold: true };
        } else if (term.title_pro?.match_status === 'mismatch') {
            row.getCell('title_pro').font = { color: { argb: 'FFDC2626' }, bold: true };
        } else {
            row.getCell('title_pro').font = { color: { argb: 'FF64748B' } };
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
