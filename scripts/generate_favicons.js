const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function generate() {
    const publicDir = path.join(__dirname, '..', 'public');

    // SVG for standalone emblem (transparent background with clean transparent floor cut)
    const emblemSvg = `
    <svg width="512" height="512" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Left Side (Upper + Lower) -->
        <path d="M24 4 L4 14 V28 C4 29.41 4.16 30.74 4.47 32 H24 Z" fill="#1E40AF" />
        <path d="M24 36 H6.08 C9.2 41.35 15.63 44.91 24 47 Z" fill="#1E40AF" />
        
        <!-- Right Side (Upper + Lower) -->
        <path d="M24 4 L32 8 V4 H38 V11 L44 14 V28 C44 29.41 43.84 30.74 43.53 32 H24 Z" fill="#3B82F6" />
        <path d="M24 36 H41.92 C38.8 41.35 32.37 44.91 24 47 Z" fill="#3B82F6" />
        
        <!-- Precision White Checkmark -->
        <path d="M16 20 L22 26 L32 14" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    `;

    // 1. Generate icon.png (512x512)
    const icon512Buffer = await sharp(Buffer.from(emblemSvg))
        .resize(512, 512)
        .png()
        .toBuffer();
    fs.writeFileSync(path.join(publicDir, 'icon.png'), icon512Buffer);
    console.log('✓ Created public/icon.png (512x512)');

    // 2. Generate icon-192.png (192x192)
    const icon192Buffer = await sharp(Buffer.from(emblemSvg))
        .resize(192, 192)
        .png()
        .toBuffer();
    fs.writeFileSync(path.join(publicDir, 'icon-192.png'), icon192Buffer);
    console.log('✓ Created public/icon-192.png (192x192)');

    // 3. Generate icon-48.png (48x48 - Google Search preferred size)
    const icon48Buffer = await sharp(Buffer.from(emblemSvg))
        .resize(48, 48)
        .png()
        .toBuffer();
    fs.writeFileSync(path.join(publicDir, 'icon-48.png'), icon48Buffer);
    console.log('✓ Created public/icon-48.png (48x48)');

    // 4. Generate apple-touch-icon.png (180x180 with dark midnight background)
    const appleTouchSvg = `
    <svg width="180" height="180" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="180" height="180" rx="36" fill="#0F172A" />
        <g transform="translate(36, 36) scale(2.25)">
            <path d="M24 4 L4 14 V28 C4 29.41 4.16 30.74 4.47 32 H24 Z" fill="#2563EB" />
            <path d="M24 36 H6.08 C9.2 41.35 15.63 44.91 24 47 Z" fill="#2563EB" />
            <path d="M24 4 L32 8 V4 H38 V11 L44 14 V28 C44 29.41 43.84 30.74 43.53 32 H24 Z" fill="#60A5FA" />
            <path d="M24 36 H41.92 C38.8 41.35 32.37 44.91 24 47 Z" fill="#60A5FA" />
            <path d="M16 20 L22 26 L32 14" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
        </g>
    </svg>
    `;
    const appleTouchBuffer = await sharp(Buffer.from(appleTouchSvg))
        .resize(180, 180)
        .png()
        .toBuffer();
    fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleTouchBuffer);
    console.log('✓ Created public/apple-touch-icon.png (180x180)');

    // 5. Generate favicon.ico (Standard 32x32 / 48x48 binary ICO format)
    const icon32Buffer = await sharp(Buffer.from(emblemSvg))
        .resize(32, 32)
        .png()
        .toBuffer();
    
    // Construct single-entry ICO wrapping the 32x32 PNG
    const icoHeader = Buffer.alloc(6);
    icoHeader.writeUInt16LE(0, 0); // Reserved
    icoHeader.writeUInt16LE(1, 2); // Type 1 = ICO
    icoHeader.writeUInt16LE(1, 4); // 1 Image

    const icoEntry = Buffer.alloc(16);
    icoEntry.writeUInt8(32, 0); // Width
    icoEntry.writeUInt8(32, 1); // Height
    icoEntry.writeUInt8(0, 2);  // Palette colors (0 = no palette)
    icoEntry.writeUInt8(0, 3);  // Reserved
    icoEntry.writeUInt16LE(1, 4); // Color planes
    icoEntry.writeUInt16LE(32, 6); // Bits per pixel
    icoEntry.writeUInt32LE(icon32Buffer.length, 8); // Image size in bytes
    icoEntry.writeUInt32LE(22, 12); // Offset of image data (6 header + 16 entry = 22)

    const icoBuffer = Buffer.concat([icoHeader, icoEntry, icon32Buffer]);
    fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
    console.log('✓ Created public/favicon.ico (Multi-size standard)');

    // 6. Generate og-image.png (1200x630 static OpenGraph banner)
    const ogSvg = `
    <svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="1200" height="630" fill="#0F172A" />
        <rect width="1200" height="630" fill="url(#bgGrad)" />
        <defs>
            <linearGradient id="bgGrad" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
                <stop stop-color="#0B1120" />
                <stop offset="0.5" stop-color="#172554" />
                <stop offset="1" stop-color="#1E3A8A" />
            </linearGradient>
        </defs>

        <!-- Brand Emblem & Typography Header -->
        <g transform="translate(80, 70)">
            <g transform="scale(1.5)">
                <path d="M24 4 L4 14 V28 C4 29.41 4.16 30.74 4.47 32 H24 Z" fill="#2563EB" />
                <path d="M24 36 H6.08 C9.2 41.35 15.63 44.91 24 47 Z" fill="#2563EB" />
                <path d="M24 4 L32 8 V4 H38 V11 L44 14 V28 C44 29.41 43.84 30.74 43.53 32 H24 Z" fill="#60A5FA" />
                <path d="M24 36 H41.92 C38.8 41.35 32.37 44.91 24 47 Z" fill="#60A5FA" />
                <path d="M16 20 L22 26 L32 14" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
            </g>
            <text x="90" y="46" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="44" letter-spacing="-1.5">
                <tspan fill="#FFFFFF">Coverage</tspan><tspan fill="#60A5FA">Check</tspan><tspan fill="#FFFFFF">Now</tspan>
            </text>
            <text x="90" y="70" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="15" fill="#94A3B8" letter-spacing="1.5">
                ALSOP AND ASSOCIATES INSURANCE AGENCY
            </text>
        </g>

        <!-- Badge -->
        <g transform="translate(80, 210)">
            <rect width="360" height="42" rx="21" fill="rgba(59, 130, 246, 0.2)" stroke="rgba(96, 165, 250, 0.4)" stroke-width="1.5" />
            <text x="24" y="27" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="17" fill="#93C5FD">
                🛡️ Policy Analysis &amp; Coverage Review
            </text>
        </g>

        <!-- Main Headline -->
        <text x="80" y="325" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="52" fill="#FFFFFF" letter-spacing="-1">
            Policy Analysis, Replacement Cost &amp;
        </text>
        <text x="80" y="385" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="52" fill="#FFFFFF" letter-spacing="-1">
            Coverage Review Platform
        </text>

        <!-- Subtitle -->
        <text x="80" y="445" font-family="system-ui, -apple-system, sans-serif" font-weight="500" font-size="22" fill="#94A3B8">
            Automatic dec page ingestion, RCE verification, and Allstate CoPilot prompt generation.
        </text>

        <!-- Footer Bar -->
        <line x1="80" y1="520" x2="1120" y2="520" stroke="rgba(148, 163, 184, 0.2)" stroke-width="1" />
        <text x="80" y="565" font-family="system-ui, -apple-system, sans-serif" font-weight="600" font-size="18" fill="#CBD5E1">
            ✓ Instant Dec Parser     ✓ RCE Verification     ✓ CoPilot Generator
        </text>
        <text x="940" y="565" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="18" fill="#93C5FD">
            coveragechecknow.com
        </text>
    </svg>
    `;

    const ogBuffer = await sharp(Buffer.from(ogSvg))
        .resize(1200, 630)
        .png()
        .toBuffer();
    fs.writeFileSync(path.join(publicDir, 'og-image.png'), ogBuffer);
    console.log('✓ Created public/og-image.png (1200x630)');
}

generate().catch(console.error);
