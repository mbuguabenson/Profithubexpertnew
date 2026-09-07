export const waitForDomElement = (selector: string, observingParent?: Element, timeoutMs = 1500) => {
    return new Promise(resolve => {
        const el = document.querySelector(selector);
        if (el) {
            resolve(el);
            return;
        }

        let timeoutId: any;
        const observer = new MutationObserver(() => {
            const foundEl = document.querySelector(selector);
            if (foundEl) {
                if (timeoutId) clearTimeout(timeoutId);
                observer.disconnect();
                resolve(foundEl);
            }
        });

        timeoutId = setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, timeoutMs);

        observer.observe(observingParent ?? document.body, {
            childList: true,
            subtree: true,
        });
    });
};
