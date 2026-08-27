import React from 'react';
import DuplicateReview from '@/components/admin/DuplicateReview';

export default function DuplicatesPage() {
    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem', minHeight: 'calc(100vh - 70px)' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-high)', letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
                    Identity Resolution Center
                </h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '600px', lineHeight: '1.5' }}>
                    Review, resolve, and merge flagged duplicate records identified during ingestion mapping. The platform algorithm targets high-probability duplicate objects for your review.
                </p>
            </div>
            
            <DuplicateReview />
        </div>
    );
}
