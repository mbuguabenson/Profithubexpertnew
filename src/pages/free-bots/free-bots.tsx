import { useEffect, useState, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { TBotsManifestItem, getXmlUploadsManifest, fetchXmlWithCache } from '@/utils/freebots-cache';
import { getUploadedBots } from '@/utils/supabase-copy';
import './free-bots.scss';

interface BotData {
    name: string;
    description: string;
    difficulty: string;
    strategy: string;
    features: string[];
    xml: string;
}


const DEFAULT_FEATURES = ['Automated Trading', 'Risk Management', 'Profit Optimization'];

// Icon mapping for each bot
const BOT_ICONS: Record<string, string> = {
    OVER: '📈',
    UNDER: '📉',
    EVEN: '⚡',
    ODD: '🔄',
    DEFAULT: '🤖',
};

const getBotIcon = (name: string): string => {
    for (const key of Object.keys(BOT_ICONS)) {
        if (name.toUpperCase().includes(key)) return BOT_ICONS[key];
    }
    return BOT_ICONS.DEFAULT;
};

const BOT_META: Record<string, { tags: string[]; win: string; type: string }> = {
    'OVER DESTROYER': { tags: ['Over Market', 'R32'], win: '82%', type: 'Aggressive' },
    'OVER DESTRYER 2 PRO BOT': { tags: ['Over Market', 'R43'], win: '78%', type: 'Pro' },
    'EVEN ODD SPEEDY': { tags: ['Even/Odd', 'Speed'], win: '74%', type: 'Speed' },
    'OVER UNDER PRO BOT': { tags: ['Over/Under', 'Blast'], win: '80%', type: 'Pro' },
    'UNDER DESTROYER PRO BOT': { tags: ['Under Market', 'R56'], win: '77%', type: 'Pro' },
    'UNDER DESTROYER': { tags: ['Under Market', 'R67'], win: '75%', type: 'Standard' },
};

const getBotMeta = (name: string) => {
    if (BOT_META[name]) return BOT_META[name];
    for (const key of Object.keys(BOT_META)) {
        if (name.includes(key)) return BOT_META[key];
    }
    return { tags: ['Auto Trading', 'AI'], win: '73%', type: 'Standard' };
};

const getBotDescription = (botName: string): string => {
    const descriptions: Record<string, string> = {
        'OVER DESTROYER':
            'Professional Over trading bot with R32 recovery strategy. Optimized for high win rates with intelligent recovery mechanisms and risk management.',
        'OVER DESTRYER 2 PRO BOT':
            'Advanced Over bot featuring R43 recovery system. Designed for consistent profits with sophisticated entry points and recovery strategies.',
        'EVEN ODD SPEEDY':
            'Premium Even Odd Speedy trading bot with multi-strategy approach. Combines technical analysis with automated execution for maximum profitability.',
        'OVER UNDER PRO BOT':
            'High-performance Over Under trading bot with blast strategy. Optimized for rapid execution and high-probability trades in Under markets.',
        'UNDER DESTROYER PRO BOT':
            'Professional Under Destroyer Pro bot with R56 recovery mechanism. Features intelligent risk management and recovery strategies for consistent returns.',
        'UNDER DESTROYER':
            'Advanced Under Destroyer trading bot with R67 recovery system. Designed for optimal performance with sophisticated pattern recognition and recovery.',
    };

    if (descriptions[botName]) return descriptions[botName];
    for (const key in descriptions) {
        if (botName.includes(key) || key.includes(botName)) return descriptions[key];
    }
    return `Advanced trading bot: ${botName}. Features automated trading, risk management, and profit optimization.`;
};

// ─── Star Rating ──────────────────────────────────────────────────────────────
const StarRating = ({ count = 5 }: { count?: number }) => (
    <div className='free-bot-card__rating'>
        {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className='star' style={{ opacity: i < count ? 1 : 0.2 }}>★</span>
        ))}
    </div>
);

// ─── Single Card ──────────────────────────────────────────────────────────────
const BotCard = ({
    bot,
    onLoad,
}: {
    bot: BotData;
    onLoad: (bot: BotData) => void;
}) => {
    const meta = getBotMeta(bot.name);
    const icon = getBotIcon(bot.name);
    const isLoaded = !!bot.xml;

    return (
        <div className={`free-bot-card${!isLoaded ? ' loading' : ''}`}>
            {/* Gradient top bar */}
            <div className='free-bot-card__glow-bar' />

            <div className='free-bot-card__body'>
                {/* Header row: icon + premium tag */}
                <div className='free-bot-card__header'>
                    <div className='free-bot-card__icon-wrap'>{icon}</div>
                    <span className='free-bot-card__premium-tag'>★ Premium</span>
                </div>

                {/* Title + rating */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <h3 className='free-bot-card__title'>{bot.name}</h3>
                    <StarRating count={5} />
                </div>

                {/* Meta tags */}
                <div className='free-bot-card__meta'>
                    {meta.tags.map((tag, i) => (
                        <span key={i} className='free-bot-card__meta-tag'>{tag}</span>
                    ))}
                    <span className='free-bot-card__meta-tag' style={{ color: 'rgba(52,211,153,0.9)', borderColor: 'rgba(52,211,153,0.3)', background: 'rgba(16,185,129,0.1)' }}>
                        {meta.type}
                    </span>
                </div>

                {/* Description */}
                <p className='free-bot-card__description'>{bot.description}</p>

                <div className='free-bot-card__divider' />

                {/* Footer stats */}
                <div className='free-bot-card__footer'>
                    <div className='free-bot-card__stat'>
                        <span className='free-bot-card__stat-label'>Win Rate</span>
                        <span className='free-bot-card__stat-value'>{meta.win}</span>
                    </div>
                    <div className='free-bot-card__stat'>
                        <span className='free-bot-card__stat-label'>Type</span>
                        <span className='free-bot-card__stat-value' style={{ color: 'rgba(167,139,250,0.9)' }}>{meta.type}</span>
                    </div>
                    <div className='free-bot-card__stat'>
                        <span className='free-bot-card__stat-label'>Status</span>
                        <span className='free-bot-card__stat-value' style={{ color: isLoaded ? 'rgba(52,211,153,0.9)' : 'rgba(255,200,80,0.9)' }}>
                            {isLoaded ? 'Ready' : 'Loading…'}
                        </span>
                    </div>
                </div>

                {/* Load button */}
                <button
                    className='free-bot-card__load-btn'
                    onClick={() => onLoad(bot)}
                    disabled={!isLoaded}
                    type='button'
                    aria-label={`Load ${bot.name} into Bot Builder`}
                >
                    {isLoaded ? '⚡ LOAD PREMIUM BOT' : 'Preparing Bot…'}
                </button>
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const FreeBots = observer(() => {
    const { dashboard } = useStore();
    const { setActiveTab, setPendingFreeBot } = dashboard;
    const [defaultBots, setDefaultBots] = useState<BotData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadBotIntoBuilder = async (bot: BotData) => {
        if (!bot.xml) return;
        setPendingFreeBot({ name: bot.name, xml: bot.xml });
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    useEffect(() => {
        const loadBots = async () => {
            setError(null);

            // Load exclusively from public/xml-uploads/bots.json
            const manifest: TBotsManifestItem[] = (await getXmlUploadsManifest()) || [];

            if (manifest.length === 0) {
                setIsLoading(false);
                return;
            }

            // Render skeleton cards immediately
            const initialSkeleton: BotData[] = manifest.map(item => {
                const botName = (item.name || item.file.replace('.xml', '')).replace(/[_-]/g, ' ');
                return {
                    name: botName,
                    description: item.description || getBotDescription(botName),
                    difficulty: item.difficulty || 'Intermediate',
                    strategy: item.strategy || 'Multi-Strategy',
                    features: DEFAULT_FEATURES,
                    xml: '',
                };
            });
            setDefaultBots(initialSkeleton);
            setIsLoading(false);

            // Progressively load XML content
            try {
                const loadedBots: BotData[] = [];
                for (let i = 0; i < manifest.length; i++) {
                    const item = manifest[i];
                    try {
                        const xml = await fetchXmlWithCache(item.file, item.basePath ?? '/xml-uploads/');
                        if (xml) {
                            const botName = (item.name || item.file.replace('.xml', '')).replace(/[_-]/g, ' ');
                            loadedBots.push({
                                name: botName,
                                description: item.description || getBotDescription(botName),
                                difficulty: item.difficulty || 'Intermediate',
                                strategy: item.strategy || 'Multi-Strategy',
                                features: DEFAULT_FEATURES,
                                xml,
                            });
                            setDefaultBots([...loadedBots, ...initialSkeleton.slice(loadedBots.length)]);
                        }
                    } catch (err) {
                        console.warn(`Failed to load ${item.file}:`, err);
                    }
                }
            } catch (err) {
                console.error('Error loading bots:', err);
                setError('Failed to load bots. Please try again.');
            }
        };

        loadBots();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const combinedBots = useMemo(() => {
        const uploaded = getUploadedBots().map(b => ({
            name: b.name,
            description: b.description,
            difficulty: 'Custom',
            strategy: 'User Uploaded',
            features: ['Custom Bot', 'Automated Execution'],
            xml: b.xml
        }));
        return [...uploaded, ...defaultBots];
    }, [defaultBots]);

    return (
        <div className='free-bots'>
            <div className='free-bots__container'>
                {/* Header */}
                <div className='free-bots__header'>
                    <h2 className='free-bots__header-title' style={{ marginBottom: 0 }}>
                        Trading Bots
                    </h2>
                </div>

                {/* States */}
                {isLoading ? (
                    <div className='free-bots__loading'>
                        <div className='free-bots__loading-spinner' />
                        <span>Initializing bots…</span>
                    </div>
                ) : error ? (
                    <div className='free-bots__error'>
                        {error}
                        <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '10px 24px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                            Retry
                        </button>
                    </div>
                ) : combinedBots.length === 0 ? (
                    <div className='free-bots__empty'>No bots available at the moment.</div>
                ) : (
                    <div className='free-bots__grid'>
                        {combinedBots.map((bot, index) => (
                            <BotCard key={index} bot={bot} onLoad={loadBotIntoBuilder} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
});

export default FreeBots;
