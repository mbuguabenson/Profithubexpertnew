import React from 'react';
import FreeBots from './free-bots';
import './trading-bots.scss';

const TradingBots: React.FC = () => {
    return (
        <div className='trading-bots'>
            <div className='trading-bots__content'>
                <FreeBots />
            </div>
        </div>
    );
};

export default TradingBots;
