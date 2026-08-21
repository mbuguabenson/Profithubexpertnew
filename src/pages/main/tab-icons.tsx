import React from 'react';

type TTabIconProps = {
    iconKey: string;
    label: string;
};

export const TabIcon: React.FC<TTabIconProps> = ({ iconKey, label }) => {
    const renderIcon = () => {
        switch (iconKey) {
            case 'dashboard':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <rect x='3' y='3' width='8' height='9' rx='2' />
                        <rect x='13' y='3' width='8' height='5' rx='2' />
                        <rect x='13' y='10' width='8' height='11' rx='2' />
                        <rect x='3' y='14' width='8' height='7' rx='2' />
                    </svg>
                );
            case 'bot_builder':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M12 2v4' />
                        <path d='M6.8 7.5L4 5.3' />
                        <path d='M17.2 7.5L20 5.3' />
                        <rect x='4' y='9' width='16' height='12' rx='3' />
                        <circle cx='9' cy='14' r='1.5' />
                        <circle cx='15' cy='14' r='1.5' />
                        <path d='M9 18h6' />
                    </svg>
                );
            case 'chart':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M3 20h18' />
                        <path d='M7 16V10' />
                        <path d='M7 10l3.5-4L14 9l4-5' />
                        <circle cx='7' cy='16' r='1' fill='currentColor' />
                        <circle cx='10.5' cy='6' r='1' fill='currentColor' />
                        <circle cx='14' cy='9' r='1' fill='currentColor' />
                        <circle cx='18' cy='4' r='1' fill='currentColor' />
                    </svg>
                );
            case 'trading_bots':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M13 2L3 14h9l-1 8 10-12h-9l1-8z' />
                    </svg>
                );
            case 'analysis_tool':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M12 20V10' />
                        <path d='M6 20V4' />
                        <path d='M18 20v-4' />
                        <circle cx='6' cy='4' r='2' />
                        <circle cx='12' cy='10' r='2' />
                        <circle cx='18' cy='16' r='2' />
                    </svg>
                );
            case 'copy_trading':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <circle cx='9' cy='7' r='3' />
                        <path d='M9 12c-4 0-6 2-6 5v1h12v-1c0-3-2-5-6-5z' />
                        <circle cx='17' cy='8' r='2.5' />
                        <path d='M21 18v-1c0-2-1.2-3.5-3-4' />
                    </svg>
                );
            case 'tradingview':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <rect x='2' y='3' width='20' height='14' rx='2' />
                        <path d='M6 10l3-3 3 3 4-4' />
                        <path d='M8 21h8' />
                        <path d='M12 17v4' />
                    </svg>
                );
            case 'signals':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M2 12h2' />
                        <path d='M6 8v8' />
                        <path d='M10 5v14' />
                        <path d='M14 8v8' />
                        <path d='M18 3v18' />
                        <path d='M22 12h-2' />
                    </svg>
                );
            case 'auto_trades':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M17 1l4 4-4 4' />
                        <path d='M3 11V9a4 4 0 014-4h14' />
                        <path d='M7 23l-4-4 4-4' />
                        <path d='M21 13v2a4 4 0 01-4 4H3' />
                    </svg>
                );
            case 'scanner':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />
                        <path d='M9 12l2 2 4-4' />
                    </svg>
                );
            case 'manual_trading':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <circle cx='12' cy='12' r='9' />
                        <path d='M12 8v4l3 3' />
                        <path d='M8 3.5L12 2l4 1.5' />
                    </svg>
                );
            case 'easy_tool':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z' />
                    </svg>
                );
            case 'signal_centre':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <circle cx='12' cy='12' r='2' fill='currentColor' />
                        <path d='M16.24 7.76a6 6 0 010 8.49' />
                        <path d='M7.76 16.24a6 6 0 010-8.49' />
                        <path d='M19.07 4.93a10 10 0 010 14.14' />
                        <path d='M4.93 19.07a10 10 0 010-14.14' />
                    </svg>
                );
            case 'marketkiller':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M12 2L2 7l10 5 10-5-10-5z' />
                        <path d='M2 17l10 5 10-5' />
                        <path d='M2 12l10 5 10-5' />
                    </svg>
                );
            case 'multi_trader':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <rect x='2' y='2' width='9' height='9' rx='2' />
                        <rect x='13' y='2' width='9' height='9' rx='2' />
                        <rect x='2' y='13' width='9' height='9' rx='2' />
                        <rect x='13' y='13' width='9' height='9' rx='2' />
                    </svg>
                );
            case 'ai_compounding_engine':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <circle cx='12' cy='12' r='3' />
                        <path d='M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z' />
                    </svg>
                );
            case 'dtrader':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M22 12h-4l-3 9L9 3l-3 9H2' />
                    </svg>
                );
            case 'digitflow':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M3 3v18h18' />
                        <path d='M18.7 8l-5.1 5.2-2.8-2.7L7 14.3' />
                    </svg>
                );
            case 'ai_trading_engine':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <rect x='4' y='4' width='16' height='16' rx='2' />
                        <rect x='9' y='9' width='6' height='6' />
                        <line x1='9' y1='1' x2='9' y2='4' />
                        <line x1='15' y1='1' x2='15' y2='4' />
                        <line x1='9' y1='20' x2='9' y2='23' />
                        <line x1='15' y1='20' x2='15' y2='23' />
                        <line x1='20' y1='9' x2='23' y2='9' />
                        <line x1='20' y1='15' x2='23' y2='15' />
                        <line x1='1' y1='9' x2='4' y2='9' />
                        <line x1='1' y1='15' x2='4' y2='15' />
                    </svg>
                );
            case 'market_hunter_pro':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <circle cx='11' cy='11' r='8' />
                        <line x1='21' y1='21' x2='16.65' y2='16.65' />
                        <path d='M8 11h6' />
                        <path d='M11 8v6' />
                    </svg>
                );
            case 'dcircles':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <circle cx='12' cy='12' r='10' />
                        <circle cx='12' cy='12' r='6' />
                        <circle cx='12' cy='12' r='2' />
                    </svg>
                );
            case 'account_center':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' />
                        <circle cx='12' cy='7' r='4' />
                    </svg>
                );
            case 'system_center':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <circle cx='12' cy='12' r='3' />
                        <path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' />
                    </svg>
                );
            case 'pro_journal':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20' />
                        <path d='M8 7h6' />
                        <path d='M8 11h8' />
                    </svg>
                );
            case 'elite_pro':
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <polygon points='12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' />
                        <circle cx='12' cy='12' r='3' />
                    </svg>
                );
            default:
                return (
                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'>
                        <circle cx='12' cy='12' r='10' />
                    </svg>
                );
        }
    };

    return (
        <span className='main-tab-icon-wrapper' title={label}>
            {renderIcon()}
            <span className='main-tab-label-text'>{label}</span>
        </span>
    );
};
