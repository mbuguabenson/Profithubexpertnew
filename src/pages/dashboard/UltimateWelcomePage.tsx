import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { motion } from 'framer-motion';
import Cookies from 'js-cookie';
import classNames from 'classnames';
import { useStore } from '@/hooks/useStore';
import { DBOT_TABS } from '@/constants/bot-contents';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import './UltimateWelcomePage.scss';

// Typing effect words
const TYPING_WORDS = [
    'AI Powered',
    'Digit Trading',
    'Automation',
    'Risk Management',
    'Market Analysis'
];

// SVG Icons for cards (sleek, minimal line icons)
const CardIcons = {
    computer: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
        </svg>
    ),
    cloud: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
            <path d="M13 13l-2 2 2 2" />
            <path d="M15 13l2 2-2 2" />
        </svg>
    ),
    bot: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <circle cx="12" cy="5" r="2" />
            <path d="M12 7v4" />
            <path d="M8 16h0" />
            <path d="M16 16h0" />
        </svg>
    ),
    lightning: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
    ),
};

export const UltimateWelcomePage = observer(({ handleTabChange: _handleTabChange }: { handleTabChange: (active_number: number) => void }) => {
    const store = useStore();
    if (!store) return null;
    const { dashboard, load_modal, quick_strategy, client, scanner } = store;
    const { toggleLoadModal, setActiveTabIndex } = load_modal;
    const { setActiveTab } = dashboard;
    const { setFormVisibility } = quick_strategy;
    const { isDesktop } = useDevice();

    const [greeting, setGreeting] = useState('');
    const [userName, setUserName] = useState('');
    const [typedText, setTypedText] = useState('');
    const [wordIndex, setWordIndex] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);
    const [activeMarketsCount, setActiveMarketsCount] = useState(0);
    const [botTemplatesCount, setBotTemplatesCount] = useState(0);

    // Determine Greeting & Username
    useEffect(() => {
        const hours = new Date().getHours();
        if (hours < 12) setGreeting(localize('Morning'));
        else if (hours < 18) setGreeting(localize('Afternoon'));
        else setGreeting(localize('Evening'));

        try {
            const infoCookie = Cookies.get('client_information');
            if (infoCookie) {
                const info = JSON.parse(infoCookie);
                if (info.first_name) {
                    setUserName(info.first_name);
                    return;
                }
            }
            const email = localStorage.getItem('client_email') || '';
            if (email) {
                setUserName(email.split('@')[0]);
                return;
            }
        } catch (e) {
            console.error('Failed to parse name info:', e);
        }
        setUserName('Trader');
    }, []);

    // Typing Effect Logic
    useEffect(() => {
        let typingTimeout: NodeJS.Timeout;
        const currentWord = TYPING_WORDS[wordIndex];
        const typingSpeed = isDeleting ? 40 : 80;

        if (!isDeleting && typedText === currentWord) {
            typingTimeout = setTimeout(() => setIsDeleting(true), 1500);
        } else if (isDeleting && typedText === '') {
            setIsDeleting(false);
            setWordIndex((prev) => (prev + 1) % TYPING_WORDS.length);
        } else {
            typingTimeout = setTimeout(() => {
                setTypedText(
                    isDeleting
                        ? currentWord.substring(0, typedText.length - 1)
                        : currentWord.substring(0, typedText.length + 1)
                );
            }, typingSpeed);
        }

        return () => clearTimeout(typingTimeout);
    }, [typedText, isDeleting, wordIndex]);

    // Statistics Counter Animation
    useEffect(() => {
        let startTime: number | null = null;
        const duration = 2000;

        const animateCounters = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const easeProgress = progress * (2 - progress);

            setActiveMarketsCount(Math.floor(easeProgress * 120));
            setBotTemplatesCount(Math.floor(easeProgress * 350));

            if (progress < 1) {
                requestAnimationFrame(animateCounters);
            }
        };

        requestAnimationFrame(animateCounters);
    }, []);

    // Card Callbacks
    const openFileLoader = () => {
        toggleLoadModal();
        setActiveTabIndex(isDesktop ? 1 : 0);
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    const openGoogleDriveDialog = () => {
        toggleLoadModal();
        setActiveTabIndex(isDesktop ? 2 : 1);
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    const openBotBuilder = () => {
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    const openQuickStrategy = () => {
        setActiveTab(DBOT_TABS.BOT_BUILDER);
        setFormVisibility(true);
    };

    const cardData = [
        {
            key: 'computer',
            icon: CardIcons.computer,
            title: localize('My Computer'),
            description: localize('Import saved trading bots from your local computer.'),
            onClick: openFileLoader,
            accentColor: '#3b82f6',
        },
        {
            key: 'cloud',
            icon: CardIcons.cloud,
            title: localize('Google Drive'),
            description: localize('Open bots stored securely inside Google Drive.'),
            onClick: openGoogleDriveDialog,
            accentColor: '#10b981',
        },
        {
            key: 'bot',
            icon: CardIcons.bot,
            title: localize('Bot Builder'),
            description: localize('Create powerful automated trading bots visually.'),
            onClick: openBotBuilder,
            accentColor: '#8b5cf6',
        },
        {
            key: 'lightning',
            icon: CardIcons.lightning,
            title: localize('Quick Strategy'),
            description: localize('Launch ready-made trading strategies instantly.'),
            onClick: openQuickStrategy,
            accentColor: '#f59e0b',
        },
    ];

    return (
        <div className='ultimate-landing'>
            {/* Ambient Background */}
            <div className='ultimate-landing__bg-mesh' />
            <div className='ultimate-landing__bg-glow ultimate-landing__bg-glow--primary' />
            <div className='ultimate-landing__bg-glow ultimate-landing__bg-glow--secondary' />

            {/* Subtle Grid */}
            <div className='ultimate-landing__grid-overlay'>
                <svg width='100%' height='100%' xmlns='http://www.w3.org/2000/svg' className='ultimate-landing__grid-svg'>
                    <defs>
                        <pattern id='grid-pattern' width='60' height='60' patternUnits='userSpaceOnUse'>
                            <path d='M 60 0 L 0 0 0 60' fill='none' stroke='rgba(255, 255, 255, 0.015)' strokeWidth='1' />
                        </pattern>
                    </defs>
                    <rect width='100%' height='100%' fill='url(#grid-pattern)' />
                </svg>
            </div>

            {/* Main Layout */}
            <div className='ultimate-landing__layout-grid'>
                {/* Left Column: Welcome & Action Cards */}
                <div className='ultimate-landing__left-col'>
                    <div className='ultimate-landing__hero'>
                        <motion.div
                            initial={{ opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.7, ease: 'easeOut' }}
                            className='ultimate-landing__welcome'
                        >
                            <span className='welcome-badge'>
                                <span className='welcome-badge__dot' />
                                {localize('Live Platform')}
                            </span>
                            <h2 className='welcome-greeting'>
                                {localize('Good')} {greeting}, {userName}
                            </h2>
                            <h3 className='welcome-subtitle'>
                                {localize('Welcome back to Ultimate Traders.')}
                            </h3>
                        </motion.div>

                        {/* Animated Typing Title */}
                        <motion.h1
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15, duration: 0.6 }}
                            className='ultimate-landing__title'
                        >
                            {localize('Build Intelligent')}
                            <span className='typing-text'> {typedText}</span>
                            <span className='typing-cursor'>|</span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3, duration: 0.6 }}
                            className='ultimate-landing__subtitle'
                        >
                            {localize('Import an existing bot, create one from scratch, or launch an intelligent strategy powered by AI.')}
                        </motion.p>
                    </div>

                    {/* Redesigned Premium Cards */}
                    <div className='ultimate-landing__cards-container'>
                        <div className='ultimate-landing__cards-grid'>
                            {cardData.map((card, index) => (
                                <motion.div
                                    key={card.key}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 + index * 0.08, duration: 0.5 }}
                                    whileHover={{ y: -4, scale: 1.015 }}
                                    className='ultimate-landing__card'
                                    onClick={card.onClick}
                                    style={{ '--card-accent': card.accentColor } as React.CSSProperties}
                                >
                                    <div className='card__accent-line' />
                                    <div className='card__icon-wrap'>
                                        {card.icon}
                                    </div>
                                    <div className='card__body'>
                                        <h3 className='card__title'>{card.title}</h3>
                                        <p className='card__description'>{card.description}</p>
                                    </div>
                                    <div className='card__arrow'>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M5 12h14" />
                                            <path d="M12 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                    <div className='card__hover-glow' />
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* CTA Buttons */}
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 0.5 }}
                        className='ultimate-landing__cta'
                    >
                        <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={openBotBuilder}
                            className='cta-btn cta-btn--primary'
                        >
                            {localize('Start Trading')} <span className='arrow'>→</span>
                        </motion.button>
                        <button
                            onClick={openQuickStrategy}
                            className='cta-btn cta-btn--secondary'
                        >
                            {localize('Explore Features')}
                        </button>
                    </motion.div>
                </div>

            </div>

            {/* Footer */}
            <footer className='ultimate-landing__footer'>
                <div className='footer-content'>
                    <div className='footer-left'>
                        {localize('Powered by Deriv API')}
                    </div>
                    <div className='footer-center'>
                        <span className='deriv-icon-glow' />
                        {localize('Ultimate Traders AI')} • {localize('Version 2.0')}
                    </div>
                    <div className='footer-right'>
                        {localize('Secure • Fast • Intelligent')}
                    </div>
                </div>
            </footer>
        </div>
    );
});

export default UltimateWelcomePage;
