import * as DerivUtils from '@deriv-com/utils';

export * from '@deriv-com/utils';

export const safeParse = (str: string) => {
    try {
        return JSON.parse(str);
    } catch {
        return null;
    }
};

export const Chat = {
    open: () => {
        window.open('https://deriv.com', '_blank');
    },
    close: () => {},
};

export default {
    ...DerivUtils,
    safeParse,
    Chat,
};
