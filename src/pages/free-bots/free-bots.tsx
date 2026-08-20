import { useEffect, useState, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { TBotsManifestItem, getXmlUploadsManifest, fetchXmlWithCache } from '@/utils/freebots-cache';
import { getUploadedBots } from '@/utils/supabase-copy';
import { Search, Sparkles, Zap, Flame, BarChart3, Filter, Play, CheckCircle2, X } from 'lucide-react';
import './free-bots.scss';

interface BotData {
    name: string;
    description: string;
    difficulty: string;
    strategy: string;
    features: string[];
    xml: string;
}

const DEFAULT_FEATURES = ['Automated Execution', 'Smart Risk Guard', 'Loss Recovery Engine'];

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

const BOT_META: Record<string, { tags: string[]; win: string; type: string; risk: string; speed: string }> = {
    'OVER DESTROYER': { tags: ['Over Market', 'R32'], win: '82%', type: 'Aggressive', risk: 'Medium Risk', speed: 'Ultra Fast' },
    'OVER DESTRYER 2 PRO BOT': { tags: ['Over Market', 'R43'], win: '78%', type: 'Pro', risk: 'Low Risk', speed: 'High Speed' },
    'EVEN ODD SPEEDY': { tags: ['Even/Odd', 'Speed'], win: '74%', type: 'Speed', risk: 'Medium Risk', speed: '1-Tick Speedy' },
    'OVER UNDER PRO BOT': { tags: ['Over/Under', 'Blast'], win: '80%', type: 'Pro', risk: 'Low Risk', speed: 'Instant' },
    'UNDER DESTROYER PRO BOT': { tags: ['Under Market', 'R56'], win: '77%', type: 'Pro', risk: 'Low Risk', speed: 'High Speed' },
    'UNDER DESTROYER': { tags: ['Under Market', 'R67'], win: '75%', type: 'Standard', risk: 'Low Risk', speed: 'Normal' },
};

const getBotMeta = (name: string) => {
    if (BOT_META[name]) return BOT_META[name];
    for (const key of Object.keys(BOT_META)) {
        if (name.includes(key)) return BOT_META[key];
    }
    return { tags: ['Auto Trading', 'AI'], win: '76%', type: 'Standard', risk: 'Balanced Risk', speed: 'Standard' };
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

// ─── Single Bot Card Component ────────────────────────────────────────────────
const BotCard = ({
    bot,
    onLoad,
    onPreview,
}: {
    bot: BotData;
    onLoad: (bot: BotData) => void;
    onPreview: (bot: BotData) => void;
}) => {
    const meta = getBotMeta(bot.name);
    const icon = getBotIcon(bot.name);
    const isLoaded = !!bot.xml;
    const winNumeric = parseInt(meta.win) || 75;

    const getTypeClass = (type: string) => {
        switch (type.toLowerCase()) {
            case 'aggressive': return 'type-tag--aggressive';
            case 'pro': return 'type-tag--pro';
            case 'speed': return 'type-tag--speed';
            default: return 'type-tag--standard';
        }
    };

    return (
        <div className={`pro-bot-card ${!isLoaded ? 'pro-bot-card--loading' : ''}`}>
            <div className="pro-bot-card__top-glow" />

            <div className="pro-bot-card__inner">
                {/* Header: Icon + Category Badge */}
                <div className="pro-bot-card__header">
                    <div className="pro-bot-card__icon-box">
                        <span className="icon-emoji">{icon}</span>
                    </div>

                    <div className="pro-bot-card__badges">
                        <span className={`type-tag ${getTypeClass(meta.type)}`}>
                            {meta.type === 'Aggressive' && <Flame size={13} />}
                            {meta.type === 'Pro' && <Sparkles size={13} />}
                            {meta.type === 'Speed' && <Zap size={13} />}
                            {meta.type} Strategy
                        </span>
                    </div>
                </div>

                {/* Bot Title & Sub-tags */}
                <div className="pro-bot-card__title-group">
                    <h3 className="pro-bot-card__name">{bot.name}</h3>
                    <div className="pro-bot-card__sub-tags">
                        {meta.tags.map((tag, idx) => (
                            <span key={idx} className="sub-tag">{tag}</span>
                        ))}
                    </div>
                </div>

                {/* Description */}
                <p className="pro-bot-card__desc">{bot.description}</p>

                {/* Win Rate Performance Meter */}
                <div className="pro-bot-card__meter-box">
                    <div className="meter-label-row">
                        <span className="meter-title">
                            <BarChart3 size={14} /> Target Win Rate
                        </span>
                        <span className="meter-val">{meta.win}</span>
                    </div>
                    <div className="meter-track">
                        <div className="meter-fill" style={{ width: `${winNumeric}%` }} />
                    </div>
                </div>

                {/* Key Specs Row */}
                <div className="pro-bot-card__specs-grid">
                    <div className="spec-item">
                        <span className="spec-label">Execution</span>
                        <span className="spec-val">{meta.speed}</span>
                    </div>
                    <div className="spec-item">
                        <span className="spec-label">Capital Risk</span>
                        <span className="spec-val spec-val--risk">{meta.risk}</span>
                    </div>
                    <div className="spec-item">
                        <span className="spec-label">Engine Status</span>
                        <span className={`spec-val ${isLoaded ? 'spec-val--ready' : 'spec-val--pending'}`}>
                            {isLoaded ? '● Ready' : '⏳ Syncing'}
                        </span>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="pro-bot-card__actions">
                    <button
                        type="button"
                        className="btn-preview"
                        onClick={() => onPreview(bot)}
                        title="View strategy breakdown"
                    >
                        Preview
                    </button>
                    <button
                        type="button"
                        className="btn-load-bot"
                        onClick={() => onLoad(bot)}
                        disabled={!isLoaded}
                    >
                        {isLoaded ? (
                            <>
                                <Play size={15} className="btn-icon" /> Load Strategy ⚡
                            </>
                        ) : (
                            'Preparing Bot…'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Preview Modal Component ──────────────────────────────────────────────────
const BotPreviewModal = ({
    bot,
    onClose,
    onLoad,
}: {
    bot: BotData;
    onClose: () => void;
    onLoad: (bot: BotData) => void;
}) => {
    const meta = getBotMeta(bot.name);
    const icon = getBotIcon(bot.name);

    return (
        <div className="bot-preview-overlay" onClick={onClose}>
            <div className="bot-preview-dialog" onClick={e => e.stopPropagation()}>
                <button type="button" className="dialog-close-btn" onClick={onClose}>
                    <X size={18} />
                </button>

                <div className="dialog-header">
                    <div className="dialog-icon-wrap">{icon}</div>
                    <div>
                        <h3 className="dialog-title">{bot.name}</h3>
                        <span className="dialog-type-badge">{meta.type} Strategy • {meta.win} Target Win</span>
                    </div>
                </div>

                <div className="dialog-body">
                    <div className="info-block">
                        <h4>Strategy Overview</h4>
                        <p>{bot.description}</p>
                    </div>

                    <div className="info-grid">
                        <div className="info-card">
                            <span className="info-card__lbl">Target Win Rate</span>
                            <span className="info-card__val text-green">{meta.win}</span>
                        </div>
                        <div className="info-card">
                            <span className="info-card__lbl">Risk Profile</span>
                            <span className="info-card__val text-yellow">{meta.risk}</span>
                        </div>
                        <div className="info-card">
                            <span className="info-card__lbl">Execution Speed</span>
                            <span className="info-card__val text-cyan">{meta.speed}</span>
                        </div>
                    </div>

                    <div className="features-list">
                        <h4>Key Features Included</h4>
                        <ul>
                            {DEFAULT_FEATURES.map((feat, idx) => (
                                <li key={idx}>
                                    <CheckCircle2 size={16} className="check-icon" />
                                    <span>{feat}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="dialog-footer">
                    <button type="button" className="btn-cancel" onClick={onClose}>
                        Close
                    </button>
                    <button
                        type="button"
                        className="btn-confirm-load"
                        onClick={() => {
                            onClose();
                            onLoad(bot);
                        }}
                    >
                        <Play size={16} /> Load into Bot Builder ⚡
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Main Trading Bots Tab View ───────────────────────────────────────────────
const FreeBots = observer(() => {
    const { dashboard } = useStore();
    const { setActiveTab, setPendingFreeBot } = dashboard;
    const [defaultBots, setDefaultBots] = useState<BotData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [previewBot, setPreviewBot] = useState<BotData | null>(null);

    const loadBotIntoBuilder = async (bot: BotData) => {
        if (!bot.xml) return;
        setPendingFreeBot({ name: bot.name, xml: bot.xml });
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    useEffect(() => {
        const loadBots = async () => {
            setError(null);

            const manifest: TBotsManifestItem[] = (await getXmlUploadsManifest()) || [];

            if (manifest.length === 0) {
                setIsLoading(false);
                return;
            }

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

    // Search Logic
    const filteredBots = useMemo(() => {
        if (!searchQuery.trim()) return combinedBots;
        const query = searchQuery.toLowerCase();
        return combinedBots.filter(bot => {
            const matchName = bot.name.toLowerCase().includes(query);
            const matchDesc = bot.description.toLowerCase().includes(query);
            const matchStrat = bot.strategy.toLowerCase().includes(query);
            return matchName || matchDesc || matchStrat;
        });
    }, [combinedBots, searchQuery]);

    return (
        <div className="trading-bots-view">
            <div className="trading-bots-container">

                {/* Clean Top Header & Search Bar */}
                <div className="tb-controls-bar">
                    <div className="tb-header-title-box">
                        <h2 className="tb-page-title">Trading Bots</h2>
                        <span className="tb-count-badge">{combinedBots.length} Strategies Available</span>
                    </div>

                    {/* Search Input Box */}
                    <div className="tb-search-box">
                        <Search size={18} className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search strategy by name or market..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="search-input"
                        />
                        {searchQuery && (
                            <button type="button" className="clear-search-btn" onClick={() => setSearchQuery('')}>
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Bot Cards Grid View */}
                {isLoading ? (
                    <div className="tb-status-box">
                        <div className="tb-spinner" />
                        <span>Loading Trading Bots Library…</span>
                    </div>
                ) : error ? (
                    <div className="tb-status-box tb-status-box--error">
                        <p>{error}</p>
                        <button type="button" onClick={() => window.location.reload()} className="btn-retry">
                            Retry Loading
                        </button>
                    </div>
                ) : filteredBots.length === 0 ? (
                    <div className="tb-status-box tb-status-box--empty">
                        <Filter size={36} className="empty-icon" />
                        <h3>No Trading Bots Match Your Search</h3>
                        <p>Try clearing your search query to view all available strategies.</p>
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="btn-reset-filter"
                        >
                            Show All Bots
                        </button>
                    </div>
                ) : (
                    <div className="tb-cards-grid">
                        {filteredBots.map((bot, index) => (
                            <BotCard
                                key={index}
                                bot={bot}
                                onLoad={loadBotIntoBuilder}
                                onPreview={b => setPreviewBot(b)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Quick Strategy Preview Modal */}
            {previewBot && (
                <BotPreviewModal
                    bot={previewBot}
                    onClose={() => setPreviewBot(null)}
                    onLoad={loadBotIntoBuilder}
                />
            )}
        </div>
    );
});

export default FreeBots;
