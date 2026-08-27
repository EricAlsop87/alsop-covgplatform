'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import styles from './HighSeverityTab.module.css';

interface SeverityFlag {
    id: string;
    policyNumber: string;
    insuredName: string;
    flagType: string;
    severity: 'high' | 'medium';
    description: string;
    dateAdded: string;
}

const highSeverityFlags: SeverityFlag[] = [
    {
        id: '1',
        policyNumber: 'HO-555005-05',
        insuredName: 'Charles Thomas',
        flagType: 'Wildfire Zone',
        severity: 'high',
        description: 'Property located in extreme wildfire risk zone with recent fire history',
        dateAdded: '2024-01-28',
    },
    {
        id: '2',
        policyNumber: 'HO-666777-88',
        insuredName: 'Alice Cooper',
        flagType: 'Old Construction',
        severity: 'high',
        description: 'Building constructed in 1955, requires structural assessment',
        dateAdded: '2024-01-27',
    },
    {
        id: '3',
        policyNumber: 'HO-555004-04',
        insuredName: 'Jennifer Anderson',
        flagType: 'Windstorm',
        severity: 'high',
        description: 'Coastal property in hurricane-prone area, requires enhanced coverage',
        dateAdded: '2024-01-26',
    },
    {
        id: '4',
        policyNumber: 'HO-555010-10',
        insuredName: 'Nancy Thompson',
        flagType: 'Missing Info',
        severity: 'high',
        description: 'Critical policy information missing from declarations page',
        dateAdded: '2024-01-25',
    },
    {
        id: '5',
        policyNumber: 'HO-983274-23',
        insuredName: 'John & Jane Doe',
        flagType: 'High Value',
        severity: 'high',
        description: 'Dwelling limit exceeds standard coverage threshold',
        dateAdded: '2024-01-24',
    },
];

export function HighSeverityTab() {
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerContent}>
                    <AlertTriangle className={styles.headerIcon} />
                    <div>
                        <h2 className={styles.title}>High Priority Flags</h2>
                        <p className={styles.subtitle}>
                            Policies requiring immediate attention - {highSeverityFlags.length} total
                        </p>
                    </div>
                </div>
            </div>

            <div className={styles.flagsList}>
                {highSeverityFlags.map((flag) => (
                    <div key={flag.id} className={styles.flagCard}>
                        <div className={styles.flagHeader}>
                            <div className={styles.flagHeaderLeft}>
                                <span
                                    className={`${styles.severityBadge} ${flag.severity === 'high' ? styles.critical : styles.high
                                        }`}
                                >
                                    {flag.severity.toUpperCase()}
                                </span>
                                <span className={styles.flagType}>{flag.flagType}</span>
                            </div>
                            <span className={styles.date}>{flag.dateAdded}</span>
                        </div>

                        <div className={styles.flagBody}>
                            <div className={styles.policyInfo}>
                                <span className={styles.policyNumber}>{flag.policyNumber}</span>
                                <span className={styles.separator}>•</span>
                                <span className={styles.insuredName}>{flag.insuredName}</span>
                            </div>
                            <p className={styles.description}>{flag.description}</p>
                        </div>

                        <div className={styles.flagActions}>
                            <button className={styles.actionButton}>Review Policy</button>
                            <button className={`${styles.actionButton} ${styles.secondary}`}>Resolve</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
