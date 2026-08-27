// Postmark connection test script
// Run with: node scripts/test-postmark.js

const TOKEN = '7bb81615-aa63-4e42-94b0-dc50d0784100';
const FROM = 'reports@coveragechecknow.com';
const TO = 'carlospaz@allstate.com';

async function testConnection() {
    console.log('\n🔌 Testing Postmark connection...\n');

    // Step 1: Verify server token
    console.log('Step 1: Validating server token...');
    const serverRes = await fetch('https://api.postmarkapp.com/server', {
        headers: {
            'Accept': 'application/json',
            'X-Postmark-Server-Token': TOKEN,
        },
    });
    const server = await serverRes.json();

    if (server.ErrorCode) {
        console.error('❌ Token invalid:', server.Message);
        process.exit(1);
    }
    console.log(`✅ Server token valid`);
    console.log(`   Server name: ${server.Name}`);
    console.log(`   Server ID:   ${server.ID}`);
    console.log(`   Delivery:    ${server.DeliveryType}\n`);

    // Step 2: Send a real test email
    console.log(`Step 2: Sending test email to ${TO}...`);
    const sendRes = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': TOKEN,
        },
        body: JSON.stringify({
            From: FROM,
            To: TO,
            Subject: '[CFP Platform] Postmark Connection Test',
            TextBody: [
                'CFP Platform — Postmark Connection Test',
                '========================================',
                '',
                'This confirms the Postmark integration is working.',
                '',
                `Server:    ${server.Name} (ID: ${server.ID})`,
                `Stream:    outbound (Default Transactional)`,
                `From:      ${FROM}`,
                `To:        ${TO}`,
                `Sent at:   ${new Date().toISOString()}`,
                '',
                'The email safety gate is active.',
                'All client emails are currently rerouted to this address.',
            ].join('\n'),
            HtmlBody: `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1e293b;">
  <h2 style="color:#4f46e5;margin-bottom:4px;">✅ Postmark Connection Confirmed</h2>
  <p style="color:#64748b;font-size:14px;">CFP Platform — Integration Test</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;"/>
  <table style="font-size:14px;width:100%;border-collapse:collapse;">
    <tr><td style="color:#64748b;padding:4px 0;width:100px;">Server</td><td style="font-weight:600;">${server.Name} (ID: ${server.ID})</td></tr>
    <tr><td style="color:#64748b;padding:4px 0;">Stream</td><td style="font-weight:600;">outbound (Default Transactional)</td></tr>
    <tr><td style="color:#64748b;padding:4px 0;">From</td><td style="font-weight:600;">${FROM}</td></tr>
    <tr><td style="color:#64748b;padding:4px 0;">To</td><td style="font-weight:600;">${TO}</td></tr>
    <tr><td style="color:#64748b;padding:4px 0;">Sent at</td><td style="font-weight:600;">${new Date().toISOString()}</td></tr>
  </table>
  <div style="margin-top:20px;padding:12px 16px;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;font-size:13px;">
    <strong>Safety gate is active.</strong> All client-directed emails are currently redirected to this address (carlospaz@allstate.com).
  </div>
</div>`,
            MessageStream: 'outbound',
        }),
    });

    const result = await sendRes.json();

    if (result.ErrorCode) {
        console.error(`\n❌ Send failed (ErrorCode ${result.ErrorCode}): ${result.Message}`);
        if (result.ErrorCode === 400) {
            console.error('\n⚠️  This likely means the From address (reports@coveragechecknow.com) is not yet');
            console.error('   verified as a sender signature in Postmark.');
            console.error('   Go to: https://account.postmarkapp.com/signature_domains');
            console.error('   And add/verify: reports@coveragechecknow.com\n');
        }
        process.exit(1);
    }

    console.log(`✅ Email sent successfully!`);
    console.log(`   Message ID: ${result.MessageID}`);
    console.log(`   Submitted: ${result.SubmittedAt}`);
    console.log(`\n🎉 Postmark is fully connected and working.`);
    console.log(`   Check ${TO} inbox for the test email.\n`);
}

testConnection().catch(err => {
    console.error('Unexpected error:', err.message);
    process.exit(1);
});
