import React, { useEffect, useState } from 'react';
import './risk-disclaimer.scss';

export const RiskDisclaimer: React.FC = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [isClosing, setIsClosing] = useState(false);

    useEffect(() => {
        const isAccepted = localStorage.getItem('risk_disclaimer_accepted');
        if (!isAccepted) {
            const timer = setTimeout(() => {
                setIsVisible(true);
            }, 1200);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleDismiss = () => {
        setIsClosing(true);
        setTimeout(() => {
            setIsVisible(false);
            setIsClosing(false);
            localStorage.setItem('risk_disclaimer_accepted', 'true');
        }, 300);
    };

    if (!isVisible) return null;

    return (
        <aside
            className={`risk-disclaimer-float ${isClosing ? 'risk-disclaimer-float--closing' : ''}`}
            role='complementary'
            aria-label='Risk Disclaimer'
        >
            <div className='risk-disclaimer-float__card'>
                <div className='risk-disclaimer-float__glow-line' />
                <div className='risk-disclaimer-float__header'>
                    <div className='risk-disclaimer-float__badge'>
                        <svg
                            className='risk-disclaimer-float__badge-icon'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='2'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                        >
                            <path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />
                            <line x1='12' y1='8' x2='12' y2='12' />
                            <line x1='12' y1='16' x2='12.01' y2='16' />
                        </svg>
                        <span className='risk-disclaimer-float__title'>Risk Notice</span>
                    </div>
                    <button
                        className='risk-disclaimer-float__close'
                        onClick={handleDismiss}
                        aria-label='Hide risk disclaimer completely'
                        title='Close'
                    >
                        <svg viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='currentColor' strokeWidth='2.2'>
                            <line x1='18' y1='6' x2='6' y2='18' />
                            <line x1='6' y1='6' x2='18' y2='18' />
                        </svg>
                    </button>
                </div>

                <p className='risk-disclaimer-float__text'>
                    Financial derivatives and automated trading carry a high level of risk and may not be suitable for all investors.
                    You may lose some or all of your invested capital. Trade responsibly and test strategies on demo accounts first.
                </p>

                <div className='risk-disclaimer-float__footer'>
                    <button className='risk-disclaimer-float__btn' onClick={handleDismiss}>
                        <span>I Understand & Accept</span>
                    </button>
                </div>
            </div>
        </aside>
    );
};
