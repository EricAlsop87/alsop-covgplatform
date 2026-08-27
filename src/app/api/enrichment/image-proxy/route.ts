import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/apiAuth';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const auth = await authenticateRequest(req, { requiredRole: ['admin', 'service', 'agent'] });
    if (isAuthError(auth)) return auth;

    const apiKey = env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        logger.error('ImageProxy', 'GOOGLE_MAPS_API_KEY not configured');
        return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 503 });
    }

    try {
        const { searchParams } = req.nextUrl;
        const type = searchParams.get('type');
        const address = searchParams.get('address');
        const lat = searchParams.get('lat');
        const lng = searchParams.get('lng');
        const zoom = searchParams.get('zoom') || '19';

        if (!type || !['satellite', 'streetview', 'geocode'].includes(type)) {
            return NextResponse.json(
                { error: "Invalid or missing type. Must be 'satellite', 'streetview', or 'geocode'." },
                { status: 400 }
            );
        }

        if (type === 'satellite') {
            if (!address) {
                return NextResponse.json(
                    { error: 'address parameter is required for satellite images.' },
                    { status: 400 }
                );
            }

            const url = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(address)}&zoom=${encodeURIComponent(zoom)}&size=640x400&maptype=satellite&key=${apiKey}`;
            const res = await fetch(url);

            if (!res.ok) {
                logger.error('ImageProxy', `Satellite static map fetch failed: ${res.status}`);
                return NextResponse.json(
                    { error: `Google Static Map error: ${res.statusText}` },
                    { status: res.status }
                );
            }

            const contentType = res.headers.get('content-type') || 'image/png';
            const imageBuffer = await res.arrayBuffer();

            return new NextResponse(imageBuffer, {
                status: 200,
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=86400',
                },
            });
        }

        if (type === 'streetview') {
            if (!lat || !lng) {
                return NextResponse.json(
                    { error: 'lat and lng parameters are required for streetview images.' },
                    { status: 400 }
                );
            }

            const url = `https://maps.googleapis.com/maps/api/streetview?location=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&size=640x440&pitch=0&key=${apiKey}`;
            const res = await fetch(url);

            if (!res.ok) {
                logger.error('ImageProxy', `Street view fetch failed: ${res.status}`);
                return NextResponse.json(
                    { error: `Google Street View error: ${res.statusText}` },
                    { status: res.status }
                );
            }

            const contentType = res.headers.get('content-type') || 'image/jpeg';
            const imageBuffer = await res.arrayBuffer();

            return new NextResponse(imageBuffer, {
                status: 200,
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=86400',
                },
            });
        }

        if (type === 'geocode') {
            if (!address) {
                return NextResponse.json(
                    { error: 'address parameter is required for geocoding.' },
                    { status: 400 }
                );
            }

            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
            const res = await fetch(url);

            if (!res.ok) {
                logger.error('ImageProxy', `Geocoding fetch failed: ${res.status}`);
                return NextResponse.json(
                    { error: `Google Geocoding error: ${res.statusText}` },
                    { status: res.status }
                );
            }

            const data = await res.json();
            return NextResponse.json(data, { status: 200 });
        }

        return NextResponse.json({ error: 'Unsupported type' }, { status: 400 });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('ImageProxy', `Unexpected error: ${msg}`);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
