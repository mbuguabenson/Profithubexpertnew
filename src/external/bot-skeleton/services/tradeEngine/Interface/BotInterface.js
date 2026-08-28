import { observer as globalObserver } from '../../../utils/observer';
import { createDetails } from '../utils/helpers';

const getBotInterface = tradeEngine => {
    const getDetail = i => createDetails(tradeEngine.data.contract)[i];

    return {
        init: (...args) => tradeEngine.init(...args),
        start: (...args) => tradeEngine.start(...args),
        stop: (...args) => tradeEngine.stop(...args),
        purchase: contract_type => tradeEngine.purchase(contract_type),
        bulkPurchase: (contract_type, count) => tradeEngine.bulkPurchase(contract_type, count),
        setBulkPurchaseCount: count => {
            tradeEngine.multiple_trades_count = count;
        },
        getAskPrice: contract_type => Number(getProposal(contract_type, tradeEngine).ask_price),
        getPayout: contract_type => Number(getProposal(contract_type, tradeEngine).payout),
        getPurchaseReference: () => tradeEngine.getPurchaseReference(),
        isSellAvailable: () => tradeEngine.isSellAtMarketAvailable(),
        sellAtMarket: () => tradeEngine.sellAtMarket(),
        getSellPrice: () => getSellPrice(tradeEngine),
        isResult: result => getDetail(10) === result,
        isTradeAgain: result => globalObserver.emit('bot.trade_again', result),
        readDetails: i => getDetail(i - 1),
        isDemoAccount: (id) => {
            const loginid = id || tradeEngine.accountInfo?.loginid || (typeof localStorage !== 'undefined' ? localStorage.getItem('active_loginid') : '') || '';
            return loginid.startsWith('VR') || loginid.startsWith('VRT') || loginid.startsWith('VRTC') || loginid.startsWith('VRW') || loginid.startsWith('DEM') || loginid.startsWith('DOT');
        },
        isRealAccount: (id) => {
            const loginid = id || tradeEngine.accountInfo?.loginid || (typeof localStorage !== 'undefined' ? localStorage.getItem('active_loginid') : '') || '';
            const isDemo = loginid.startsWith('VR') || loginid.startsWith('VRT') || loginid.startsWith('VRTC') || loginid.startsWith('VRW') || loginid.startsWith('DEM') || loginid.startsWith('DOT');
            return !isDemo && Boolean(loginid);
        },
        isVirtualAccount: function (id) { return this.isDemoAccount(id); },
        isVirtual: function (id) { return this.isDemoAccount(id); },
    };
};

const getProposal = (contract_type, tradeEngine) => {
    return tradeEngine.data.proposals.find(
        proposal =>
            proposal.contract_type === contract_type &&
            proposal.purchase_reference === tradeEngine.getPurchaseReference()
    );
};

const getSellPrice = tradeEngine => {
    return tradeEngine.getSellPrice();
};

export default getBotInterface;
