import { NextResponse, NextRequest } from 'next/server';
import { DuplicateEngine } from '@/lib/duplicateEngine';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { logger } from '@/lib/logger';


export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    try {
        const [clients, policies] = await Promise.all([
            DuplicateEngine.findClientDuplicates(),
            DuplicateEngine.findPolicyDuplicates()
        ]);

        return NextResponse.json({
            success: true,
            clients,
            policies,
            count: clients.length + policies.length
        });
    } catch (error: any) {
        logger.error('Find', "Duplicate Engine API Error:", error)
        return NextResponse.json({ error: error.message || "Failed to find duplicates" }, { status: 500 });
    }
}
