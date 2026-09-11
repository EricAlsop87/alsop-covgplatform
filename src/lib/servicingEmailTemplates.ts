/**
 * Servicing Email Templates
 *
 * Generates responsive, professional HTML and plain text email content
 * for the Servicing Team to dispatch renewal packages to assigned agents.
 */

export interface ServicingRenewalEmailParams {
    agentName: string;
    agentEmail: string;
    senderName: string;
    policyNumber: string;
    namedInsured: string;
    propertyAddress: string;
    carrierName: string;
    expirationDate: string | null;
    hasFullCoverage: boolean;
    hasQuoteAttached: boolean;
    hasRceAttached: boolean;
    hasDicAttached: boolean;
    noDicAvailable: boolean;
    customRemarks?: string;
    policyId: string;
}

export function generateServicingRenewalEmail(params: ServicingRenewalEmailParams): {
    subject: string;
    htmlBody: string;
    textBody: string;
} {
    const {
        agentName,
        senderName,
        policyNumber,
        namedInsured,
        propertyAddress,
        carrierName,
        expirationDate,
        hasFullCoverage,
        hasQuoteAttached,
        hasRceAttached,
        hasDicAttached,
        noDicAvailable,
        customRemarks,
        policyId,
    } = params;

    const formattedExpDate = expirationDate
        ? new Date(expirationDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
          })
        : 'Pending / Not set';

    const subject = `[Policy Renewal Package] ${namedInsured} — ${policyNumber} (Exp: ${formattedExpDate})`;

    // Attached docs list text
    const attachedDocNames: string[] = [];
    if (hasQuoteAttached) attachedDocNames.push('Quote');
    if (hasRceAttached) attachedDocNames.push('Replacement Cost Estimate (RCE)');
    if (hasDicAttached) attachedDocNames.push('Difference in Conditions (DIC)');

    let docSummaryLine = '';
    if (attachedDocNames.length > 0) {
        docSummaryLine = `Attached to this email are the verified <strong>${attachedDocNames.join(', ')}</strong> documents ready for you to send to the insured policyholder.`;
        if (noDicAvailable && !hasDicAttached) {
            docSummaryLine += ` <em>(Note: No DIC available in all carriers for this policy).</em>`;
        }
    } else {
        docSummaryLine = `Please find the renewal summary details below for the insured policyholder.`;
    }

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 620px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.03);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #2243B6; padding: 22px 28px; text-align: left;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #93c5fd; margin-bottom: 4px;">
                      Alsop Coverage Check Now — Servicing Center
                    </div>
                    <div style="font-size: 18px; font-weight: 700; color: #ffffff;">
                      Policy Renewal Package for Insured
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 28px;">
              <p style="font-size: 15px; margin-top: 0; margin-bottom: 16px; color: #0f172a;">
                Hi <strong>${agentName}</strong>,
              </p>
              
              <p style="font-size: 14px; margin-bottom: 20px; color: #334155; line-height: 1.6;">
                This policy is up for renewal and has been prepared by our team. ${docSummaryLine}
              </p>

              <!-- Policy Summary Card -->
              <table role="presentation" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px; border-collapse: collapse;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; width: 35%; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">
                    Policy Number
                  </td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 700; color: #2243B6;">
                    ${policyNumber}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">
                    Named Insured
                  </td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 600; color: #0f172a;">
                    ${namedInsured}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">
                    Property Address
                  </td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155;">
                    ${propertyAddress}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">
                    Carrier
                  </td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155;">
                    ${carrierName}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">
                    Expiration Date
                  </td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 700; color: #dc2626;">
                    ${formattedExpDate}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">
                    Full Coverage
                  </td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155;">
                    ${hasFullCoverage ? '✓ Yes' : 'No'}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">
                    Attached Documents
                  </td>
                  <td style="padding: 12px 16px; font-size: 13px; color: #0f172a;">
                    ${attachedDocNames.length > 0 ? attachedDocNames.map(d => `📄 ${d}`).join('<br/>') : 'None attached'}
                    ${noDicAvailable ? '<br/><span style="color:#64748b;font-size:12px;">🚫 No DIC available in all carriers</span>' : ''}
                  </td>
                </tr>
              </table>

              ${
                  customRemarks
                      ? `
              <!-- Servicing Remarks -->
              <div style="background-color: #fefce8; border-left: 4px solid #eab308; padding: 12px 16px; border-radius: 4px; margin-bottom: 24px;">
                <div style="font-size: 12px; font-weight: 700; color: #854d0e; text-transform: uppercase; margin-bottom: 4px;">
                  Servicing Team Remarks / Notes:
                </div>
                <div style="font-size: 13px; color: #713f12; line-height: 1.5;">
                  ${customRemarks.replace(/\n/g, '<br/>')}
                </div>
              </div>
              `
                      : ''
              }

              <p style="font-size: 14px; margin-bottom: 24px; color: #334155; line-height: 1.5;">
                Please review the attached documents and forward the renewal package to the insured. You can reply directly to this email with any update or when the renewal is approved to proceed.
              </p>

              <!-- Sign-off -->
              <div style="border-top: 1px solid #e2e8f0; padding-top: 18px; margin-top: 24px;">
                <p style="font-size: 14px; margin: 0; color: #334155;">
                  Best regards,
                </p>
                <p style="font-size: 15px; font-weight: 700; margin: 4px 0 2px 0; color: #0f172a;">
                  ${senderName || 'Servicing Team'}
                </p>
                <p style="font-size: 12px; margin: 0; color: #64748b;">
                  Alsop Coverage Check Now — Servicing Team
                </p>
              </div>

            </td>
          </tr>

          <!-- Tracking Footer -->
          <tr>
            <td style="background-color: #f1f5f9; padding: 14px 28px; text-align: center; border-top: 1px solid #e2e8f0;">
              <span style="font-size: 11px; color: #94a3b8;">
                Reference ID: [REF-POL-${policyId}] • Reply directly to this email to update the Servicing Hub.
              </span>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    const textBody = `
Hi ${agentName},

This policy is up for renewal and has been prepared by our team.
${attachedDocNames.length > 0 ? `Attached are: ${attachedDocNames.join(', ')}` : ''}
${noDicAvailable && !hasDicAttached ? '(Note: No DIC available in all carriers for this policy).' : ''}

Policy Summary:
- Policy Number: ${policyNumber}
- Named Insured: ${namedInsured}
- Property Address: ${propertyAddress}
- Carrier: ${carrierName}
- Expiration Date: ${formattedExpDate}
- Full Coverage: ${hasFullCoverage ? 'Yes' : 'No'}

${customRemarks ? `Servicing Notes:\n${customRemarks}\n\n` : ''}
Please review and forward to the insured policyholder. Reply directly to this email with your updates.

Best regards,
${senderName || 'Servicing Team'}
Alsop Coverage Check Now — Servicing Team
Reference ID: [REF-POL-${policyId}]
`.trim();

    return { subject, htmlBody, textBody };
}
