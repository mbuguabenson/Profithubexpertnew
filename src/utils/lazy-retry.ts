import React from 'react';

/**
 * Wraps dynamic React.lazy imports with retry logic and automatic cache-busting page reload
 * in case a chunk hash has changed following a new deployment.
 */
export const lazyRetry = <T extends React.ComponentType<any>>(
    componentImport: () => Promise<{ default: T }>,
    name = 'module'
): React.LazyExoticComponent<T> => {
    return React.lazy(async () => {
        const storageKey = `retry_chunk_${name}`;
        const hasRefreshed = sessionStorage.getItem(storageKey) === 'true';

        try {
            const component = await componentImport();
            sessionStorage.removeItem(storageKey);
            return component;
        } catch (error: any) {
            const isChunkError =
                error?.name === 'ChunkLoadError' ||
                /loading chunk/i.test(error?.message || '') ||
                /failed to fetch dynamically imported module/i.test(error?.message || '') ||
                /importing a module script failed/i.test(error?.message || '') ||
                /error loading dynamically imported module/i.test(error?.message || '');

            if (isChunkError && !hasRefreshed) {
                console.warn(`[LazyRetry] Chunk load failed for ${name}. Reloading application for new deployment...`);
                sessionStorage.setItem(storageKey, 'true');
                window.location.reload();
                return { default: (() => null) as unknown as T };
            }

            sessionStorage.removeItem(storageKey);
            throw error;
        }
    });
};
