import { ImageResponse } from 'next/og';
import OgImage, { size as ogSize, contentType as ogContentType, alt as ogAlt } from './opengraph-image';

export const runtime = 'edge';
export const size = ogSize;
export const contentType = ogContentType;
export const alt = ogAlt;

export default async function Image() {
    return OgImage();
}
