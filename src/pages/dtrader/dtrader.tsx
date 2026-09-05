import React from 'react';
import DTraderIframeContainer from '@/components/iframe-bridge/dtrader-iframe-container';

const DTraderPage: React.FC = () => {
    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
            <DTraderIframeContainer />
        </div>
    );
};

export default DTraderPage;
