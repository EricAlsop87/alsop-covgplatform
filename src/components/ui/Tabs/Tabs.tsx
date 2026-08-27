'use client';

import { useState, useEffect } from 'react';
import styles from './Tabs.module.css';

export interface Tab {
    id: string;
    label: string;
}

interface TabsProps {
    tabs: Tab[];
    defaultTab?: string;
    activeTab?: string;           // NEW: externally controlled
    onChange?: (tabId: string) => void;
}

export function Tabs({ tabs, defaultTab, activeTab: externalTab, onChange }: TabsProps) {
    const [internalTab, setInternalTab] = useState(defaultTab || tabs[0]?.id);

    // Sync internal state when external prop changes
    useEffect(() => {
        if (externalTab && externalTab !== internalTab) {
            setInternalTab(externalTab);
        }
    }, [externalTab]);

    const current = externalTab ?? internalTab;

    const handleTabClick = (tabId: string) => {
        setInternalTab(tabId);
        onChange?.(tabId);
    };

    return (
        <div className={styles.tabsContainer}>
            <div className={styles.tabList}>
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        className={`${styles.tab} ${current === tab.id ? styles.active : ''}`}
                        onClick={() => handleTabClick(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
