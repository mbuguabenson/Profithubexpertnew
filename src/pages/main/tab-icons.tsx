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
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <rect x='3' y='3' width='7' height='7' rx='1.5' />
                        <rect x='14' y='3' width='7' height='7' rx='1.5' />
                        <rect x='14' y='14' width='7' height='7' rx='1.5' />
                        <rect x='3' y='14' width='7' height='7' rx='1.5' />
                    </svg>
                );
            case 'bot_builder':
                return (
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M19.439 7.85c-.049-.322.059-.648.289-.878l1.568-1.568a1.5 1.5 0 0 0-2.121-2.121l-1.568 1.568c-.23.23-.556.338-.878.289A4.003 4.003 0 0 0 12 8a3.993 3.993 0 0 0-2.88 1.157c-.23.23-.556.338-.878.289L6.674 8.01a1.5 1.5 0 0 0-2.121 2.121l1.436 1.436c.23.23.338.556.289.878A4.003 4.003 0 0 0 8 15a4.003 4.003 0 0 0 2.85 3.439c.322.049.648-.059.878-.289l1.568-1.568a1.5 1.5 0 0 0 2.121 2.121l1.568-1.568c.23-.23.556-.338.878-.289A4.003 4.003 0 0 0 20 12a3.993 3.993 0 0 0-0.561-4.15z' />
                        <path d='M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z' />
                    </svg>
                );
            case 'chart':
                return (
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M3 3v18h18' />
                        <path d='M18 9l-5 5-4-4-5 5' />
                    </svg>
                );
            case 'trading_bots':
                return (
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <rect x='3' y='11' width='18' height='10' rx='2' />
                        <circle cx='12' cy='5' r='2' />
                        <path d='M12 7v4' />
                        <line x1='8' y1='15' x2='8.01' y2='15' strokeWidth='3' />
                        <line x1='16' y1='15' x2='16.01' y2='15' strokeWidth='3' />
                    </svg>
                );
            case 'analysis_tool':
                return (
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M21 21l-4.35-4.35' />
                        <circle cx='11' cy='11' r='7' />
                        <path d='M8 11l2 2 4-4' />
                    </svg>
                );
            case 'copy_trading':
                return (
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' />
                        <circle cx='9' cy='7' r='4' />
                        <path d='M22 21v-2a4 4 0 0 0-3-3.87' />
                        <path d='M16 3.13a4 4 0 0 1 0 7.75' />
                    </svg>
                );
            case 'tradingview':
                return (
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M4 18h16' />
                        <path d='M8 14v4' />
                        <path d='M12 8v10' />
                        <path d='M16 11v7' />
                        <path d='M6 6l6-3 6 3' />
                    </svg>
                );
            case 'signals':
                return (
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M4.93 4.93a10 10 0 0 1 14.14 0' />
                        <path d='M7.76 7.76a6 6 0 0 1 8.48 0' />
                        <path d='M10.59 10.59a2 2 0 0 1 2.83 0' />
                        <circle cx='12' cy='17' r='1' fill='currentColor' />
                    </svg>
                );
            case 'auto_trades':
                return (
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <polygon points='13 2 3 14 12 14 11 22 21 10 12 10 13 2' />
                    </svg>
                );
            case 'scanner':
                return (
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />
                        <circle cx='12' cy='11' r='3' />
                    </svg>
                );
            case 'manual_trading':
                return (
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0' />
                        <path d='M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6' />
                        <path d='M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8' />
                        <path d='M18 8a2 2 0 0 1 2 2v4a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15' />
                    </svg>
                );
            case 'easy_tool':
                return (
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M12 3l1.91 5.88H20l-4.95 3.6 1.9 5.88L12 14.76l-4.95 3.6 1.9-5.88L4 8.88h6.09L12 3z' />
                    </svg>
                );
            case 'signal_centre':
                return (
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <circle cx='12' cy='12' r='10' />
                        <circle cx='12' cy='12' r='6' />
                        <circle cx='12' cy='12' r='2' fill='currentColor' />
                    </svg>
                );
            case 'marketkiller':
                return (
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5z' />
                    </svg>
                );
            case 'multi_trader':
                return (
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <rect x='3' y='3' width='18' height='18' rx='2' />
                        <line x1='12' y1='3' x2='12' y2='21' />
                        <line x1='3' y1='12' x2='21' y2='12' />
                    </svg>
                );
            case 'ai_compounding_engine':
                return (
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='#10b981' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 14a4 4 0 1 1 4-4 4 4 0 0 1-4 4z' />
                        <path d='M12 6v2m0 8v2m-6-6h2m8 0h2' />
                    </svg>
                );
            case 'dtrader':
                return (
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='#3b82f6' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z' />
                        <path d='M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.35 22.35 0 0 1-3.95 2z' />
                    </svg>
                );
            case 'ai_trading_engine':
                return (
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='#10b981' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
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
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='#00f2fe' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <circle cx='11' cy='11' r='8' />
                        <line x1='21' y1='21' x2='16.65' y2='16.65' />
                        <line x1='11' y1='8' x2='11' y2='14' />
                        <line x1='8' y1='11' x2='14' y2='11' />
                    </svg>
                );
            case 'dcircles':
                return (
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='#a78bfa' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <circle cx='12' cy='12' r='10' />
                        <circle cx='12' cy='12' r='6' />
                        <circle cx='12' cy='12' r='2' />
                    </svg>
                );
            default:
                return (
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
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
