import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = 'https://coveragechecknow.com';
    const now = new Date();

    return [
        {
            url: baseUrl,
            lastModified: now,
            changeFrequency: 'weekly',
            priority: 1.0,
        },
        {
            url: `${baseUrl}/submit`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/auth/signin`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.6,
        },
        {
            url: `${baseUrl}/legal/privacy`,
            lastModified: now,
            changeFrequency: 'yearly',
            priority: 0.3,
        },
        {
            url: `${baseUrl}/legal/terms`,
            lastModified: now,
            changeFrequency: 'yearly',
            priority: 0.3,
        },
        {
            url: `${baseUrl}/legal/cookies`,
            lastModified: now,
            changeFrequency: 'yearly',
            priority: 0.3,
        },
        {
            url: `${baseUrl}/support`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.5,
        },
    ];
}
