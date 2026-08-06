import React, { useEffect, useState } from 'react';
import './risk-disclaimer.scss';

export const RiskDisclaimer = () => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const isAccepted = localStorage.getItem('risk_disclaimer_accepted');
        if (!isAccepted) {
            // Show after a short delay for smooth slide-in effect
            const timer = setTimeout(() => {
                setIsVisible(true);
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleDismiss = () => {
        setIsVisible(false);
        localStorage.setItem('risk_disclaimer_accepted', 'true');
    };

    if (!isVisible) return null;

    return (
        <div className="risk-disclaimer-float">
            <div className="risk-disclaimer-float__card">
                <div className="risk-disclaimer-float__header">
                    <span className="risk-disclaimer-float__title">Risk Warning</span>
                    <button className="risk-disclaimer-float__close" onClick={handleDismiss} aria-label="Close">
                        ×
                    </button>
                </div>
                <p className="risk-disclaimer-float__text">
                    Options trading involves significant risk and can result in the loss of your invested capital. 
                    Please ensure that you fully understand the risks involved before trading.
                </p>
                <div className="risk-disclaimer-float__actions">
                    <button className="risk-disclaimer-float__btn" onClick={handleDismiss}>
                        I Understand
                    </button>
                </div>
            </div>
        </div>
    );
};
