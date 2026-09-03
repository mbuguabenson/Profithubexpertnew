import { extractInfoFromShortcode, isHighLow } from '../shortcode';
import { getMarketName, getTradeTypeName } from './market-underlying';

export const POSITIONS_V2_TAB_NAME = {
    OPEN: 'Open',
    CLOSED: 'Closed',
};

export const getPositionsV2TabIndexFromURL = () => {
    const searchParams = new URLSearchParams(window.location.search);
    const positions_v2_tab_names_array = Object.keys(POSITIONS_V2_TAB_NAME).map(key => key.toLowerCase());

    if (searchParams.toString()) {
        const current_opened_tab = [...searchParams.values()].filter(value =>
            positions_v2_tab_names_array.includes(value?.toLowerCase())
        );
        return current_opened_tab[0]?.toLowerCase() === POSITIONS_V2_TAB_NAME.OPEN.toLowerCase() ||
            !current_opened_tab[0]
            ? 0
            : 1;
    }
    return 0;
};

export const getTradeNotificationMessage = (shortcode: string) => {
    const extracted_info_from_shortcode = extractInfoFromShortcode(shortcode);
    const trade_type_name = getTradeTypeName(extracted_info_from_shortcode.category, isHighLow({ shortcode }));
    const market_name = getMarketName(extracted_info_from_shortcode.underlying);
    return `${trade_type_name} ${market_name ? `trade on ${market_name}` : ''} position has been placed.`;
};
