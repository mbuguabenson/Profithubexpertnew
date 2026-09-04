import { observer } from 'mobx-react-lite';
import { getSiteConfig } from '@/utils/supabase-copy';
import { getBrandLabel } from '@/components/shared/utils/brand/brand';
import './app-logo.scss';

type TBrandLogoProps = {
    width?: number;
    height?: number;
    fill?: string;
    className?: string;
    showTagline?: boolean;
};

export const BrandLogo = observer(({ height = 36, className = '', showTagline = true }: TBrandLogoProps) => {
    const cfg = getSiteConfig();
    const customLogo = cfg?.logoBase64;
    const brandName = getBrandLabel() || 'Legacy Trading Hub';

    return (
        <div className={`lth-brand-logo ${className}`}>
            <div className='lth-brand-logo__row'>
                {customLogo ? (
                    <img
                        src={customLogo}
                        alt={brandName}
                        style={{ height: `${height}px`, width: 'auto', display: 'block', objectFit: 'contain' }}
                    />
                ) : (
                    <svg
                        xmlns='http://www.w3.org/2000/svg'
                        viewBox='0 0 160 160'
                        fill='none'
                        className='lth-brand-logo__icon'
                        style={{ height: `${height}px`, width: `${height}px` }}
                    >
                        <defs>
                            <linearGradient id='baseGrad' x1='0%' y1='0%' x2='100%' y2='100%'>
                                <stop offset='0%' className='base-stop-1' />
                                <stop offset='50%' className='base-stop-2' />
                                <stop offset='100%' className='base-stop-3' />
                            </linearGradient>

                            <linearGradient id='limeGrad1' x1='0%' y1='0%' x2='0%' y2='100%'>
                                <stop offset='0%' stopColor='#a3e635' />
                                <stop offset='100%' stopColor='#65a30d' />
                            </linearGradient>

                            <linearGradient id='limeGrad2' x1='0%' y1='0%' x2='0%' y2='100%'>
                                <stop offset='0%' stopColor='#bef264' />
                                <stop offset='50%' stopColor='#84cc16' />
                                <stop offset='100%' stopColor='#4d7c0f' />
                            </linearGradient>

                            <linearGradient id='limeGrad3' x1='0%' y1='0%' x2='0%' y2='100%'>
                                <stop offset='0%' stopColor='#86efac' />
                                <stop offset='50%' stopColor='#22c55e' />
                                <stop offset='100%' stopColor='#15803d' />
                            </linearGradient>

                            <linearGradient id='arrowGrad' x1='0%' y1='100%' x2='100%' y2='0%'>
                                <stop offset='0%' stopColor='#047857' />
                                <stop offset='40%' stopColor='#059669' />
                                <stop offset='75%' stopColor='#10b981' />
                                <stop offset='100%' stopColor='#34d399' />
                            </linearGradient>

                            <linearGradient id='goldAccent' x1='0%' y1='0%' x2='100%' y2='100%'>
                                <stop offset='0%' stopColor='#fde047' />
                                <stop offset='100%' stopColor='#eab308' />
                            </linearGradient>

                            <filter id='barShadow' x='-10%' y='-10%' width='120%' height='120%'>
                                <feDropShadow dx='0' dy='3' stdDeviation='3' floodColor='#000000' floodOpacity='0.2' />
                            </filter>
                        </defs>

                        <g className='logo-glow'>
                            {/* Background Chart Bars */}
                            <rect x='52' y='58' width='13' height='60' rx='3' fill='url(#limeGrad1)' filter='url(#barShadow)' />
                            <rect x='53' y='59' width='11' height='4' rx='1.5' fill='#ffffff' fillOpacity='0.4' />

                            <rect x='71' y='36' width='14' height='82' rx='3' fill='url(#limeGrad2)' filter='url(#barShadow)' />
                            <rect x='72' y='37' width='12' height='5' rx='1.5' fill='#ffffff' fillOpacity='0.5' />

                            <rect x='91' y='62' width='13' height='56' rx='3' fill='url(#limeGrad1)' filter='url(#barShadow)' />
                            <rect x='92' y='63' width='11' height='4' rx='1.5' fill='#ffffff' fillOpacity='0.4' />

                            <rect x='110' y='70' width='13' height='48' rx='3' fill='url(#limeGrad3)' filter='url(#barShadow)' />
                            <rect x='111' y='71' width='11' height='4' rx='1.5' fill='#ffffff' fillOpacity='0.4' />

                            <rect x='129' y='54' width='13' height='64' rx='3' fill='url(#limeGrad2)' filter='url(#barShadow)' />
                            <rect x='130' y='55' width='11' height='4' rx='1.5' fill='#ffffff' fillOpacity='0.4' />

                            {/* Adaptive Architectural Base */}
                            <path d='M28 54 C28 50 31 48 35 48 L45 48 C47 48 48 49 48 51 L48 108 L28 108 Z' className='base-fill' />
                            <path d='M28 116 L152 116 C155 116 157 118 157 121 L157 130 C157 133 155 135 152 135 L28 135 C25 135 23 133 23 130 L23 121 C23 118 25 116 28 116 Z' className='base-fill' />
                            <line x1='28' y1='116' x2='152' y2='116' stroke='url(#goldAccent)' strokeWidth='1.5' strokeLinecap='round' />

                            {/* Ascending Arrow */}
                            <path d='M28 104 L75 52 L94 74 L136 32' className='base-stroke' strokeWidth='12' strokeLinecap='round' strokeLinejoin='round' />
                            <path d='M30 103 L75 53 L94 75 L134 33' stroke='url(#arrowGrad)' strokeWidth='4.5' strokeLinecap='round' strokeLinejoin='round' />
                            <polygon points='120,16 158,22 144,56 136,38 116,38' fill='url(#arrowGrad)' filter='url(#barShadow)' />
                            <polygon points='124,20 154,25 142,51 136,38 120,38' className='base-fill' />
                            <polygon points='132,24 150,26 142,42 138,36' fill='url(#arrowGrad)' />
                            <circle cx='154' cy='24' r='2.5' fill='#ffffff' />
                        </g>
                    </svg>
                )}
                <div className='lth-brand-logo__text-col'>
                    <div className='lth-brand-logo__title-row'>
                        <span className='lth-brand-logo__legacy'>LEGACY</span>
                    </div>
                    <span className='lth-brand-logo__trading-hub'>TRADING HUB</span>
                    {showTagline && <span className='lth-brand-logo__subtitle'>WHERE STRATEGY MEETS PRECISION.</span>}
                </div>
            </div>
        </div>
    );
});
