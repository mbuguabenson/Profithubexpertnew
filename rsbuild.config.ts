import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import path from 'path';
import 'dotenv/config';

export default defineConfig({
    plugins: [
        pluginSass({
            sassLoaderOptions: {
                sourceMap: false,
                additionalData: (content: string | Buffer, loaderContext: any) => {
                    const contentStr = typeof content === 'string' ? content : content.toString();
                    const normalized = (loaderContext?.resourcePath || '').replace(/\\/g, '/');
                    if (normalized.includes('/src/external/')) {
                        const constPath = path
                            .resolve(__dirname, 'src/external/shared/styles/constants.scss')
                            .replace(/\\/g, '/');
                        const mixinPath = path
                            .resolve(__dirname, 'src/external/shared/styles/mixins.scss')
                            .replace(/\\/g, '/');
                        const fontsPath = path
                            .resolve(__dirname, 'src/external/shared/styles/fonts.scss')
                            .replace(/\\/g, '/');
                        const iconsPath = path
                            .resolve(__dirname, 'src/external/shared/styles/inline-icons.scss')
                            .replace(/\\/g, '/');
                        const devicesPath = path
                            .resolve(__dirname, 'src/external/shared/styles/devices.scss')
                            .replace(/\\/g, '/');
                        return `
                            @import "${constPath}";
                            @import "${mixinPath}";
                            @import "${fontsPath}";
                            @import "${iconsPath}";
                            @import "${devicesPath}";
                            ${contentStr}
                        `;
                    }
                    return contentStr;
                },
                sassOptions: {
                    includePaths: [
                        path.resolve(__dirname, './src/external/trader/src/sass'),
                        path.resolve(__dirname, './src/external/shared/styles'),
                        path.resolve(__dirname, './src/external/components/src'),
                    ],
                },
            },
        }),
        pluginReact(),
    ],
    source: {
        entry: {
            index: './src/main.tsx',
        },
        define: {
            'process.env': {
                APP_ENV: JSON.stringify(process.env.APP_ENV),
                CLIENT_ID: JSON.stringify(process.env.CLIENT_ID),
                APP_ID: JSON.stringify(process.env.APP_ID),
                GD_CLIENT_ID: JSON.stringify(process.env.GD_CLIENT_ID),
                GD_APP_ID: JSON.stringify(process.env.GD_APP_ID),
                GD_API_KEY: JSON.stringify(process.env.GD_API_KEY),
                DTRADER_URL: JSON.stringify(process.env.DTRADER_URL),
            },
        },
    },
    resolve: {
        alias: {
            react: path.resolve(__dirname, './node_modules/react'),
            'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
            '@/external': path.resolve(__dirname, './src/external'),
            '@/components': path.resolve(__dirname, './src/components'),
            '@/hooks': path.resolve(__dirname, './src/hooks'),
            '@/utils': path.resolve(__dirname, './src/utils'),
            '@/constants': path.resolve(__dirname, './src/constants'),
            '@/stores': path.resolve(__dirname, './src/stores'),
            '@/pages': path.resolve(__dirname, './src/pages'),
            '@/app': path.resolve(__dirname, './src/app'),
            '@/services': path.resolve(__dirname, './src/services'),
            '@/types': path.resolve(__dirname, './src/types'),
            App: path.resolve(__dirname, './src/external/trader/src/App'),
            AppV2: path.resolve(__dirname, './src/external/trader/src/AppV2'),
            Modules: path.resolve(__dirname, './src/external/trader/src/Modules'),
            Stores: path.resolve(__dirname, './src/external/trader/src/Stores'),
            Sass: path.resolve(__dirname, './src/external/trader/src/sass'),
            Assets: path.resolve(__dirname, './src/external/trader/src/Assets'),
            Types: path.resolve(__dirname, './src/external/trader/src/Types'),
            _common: path.resolve(__dirname, './src/external/trader/src/_common'),
            '@deriv/components': path.resolve(__dirname, './src/external/components/src'),
            '@deriv/shared': path.resolve(__dirname, './src/external/shared'),
            '@deriv/stores/types': path.resolve(__dirname, './src/external/stores/types.ts'),
            '@deriv/stores': path.resolve(__dirname, './src/external/stores/src'),
            '@deriv/hooks': path.resolve(__dirname, './src/external/hooks/src'),
            '@deriv/translations': path.resolve(__dirname, './src/external/translations/src'),
            '@deriv/deriv-charts': path.resolve(__dirname, './node_modules/@deriv-com/smartcharts-champion'),
            '@deriv/utils': path.resolve(__dirname, './src/external/utils'),
            withRouterShim: path.resolve(__dirname, './src/external/trader/src/withRouterShim'),
            'victory-vendor/d3-shape': path.resolve(__dirname, './node_modules/victory-vendor/es/d3-shape.js'),
            'victory-vendor/d3-array': path.resolve(__dirname, './node_modules/victory-vendor/es/d3-array.js'),
            'victory-vendor/d3-scale': path.resolve(__dirname, './node_modules/victory-vendor/es/d3-scale.js'),
            'victory-vendor/d3-interpolate': path.resolve(__dirname, './node_modules/victory-vendor/es/d3-interpolate.js'),
            'victory-vendor/d3-ease': path.resolve(__dirname, './node_modules/victory-vendor/es/d3-ease.js'),
            'victory-vendor/d3-time': path.resolve(__dirname, './node_modules/victory-vendor/es/d3-time.js'),
            'victory-vendor/d3-timer': path.resolve(__dirname, './node_modules/victory-vendor/es/d3-timer.js'),
            'victory-vendor/d3-color': path.resolve(__dirname, './node_modules/victory-vendor/es/d3-color.js'),
            'victory-vendor/d3-format': path.resolve(__dirname, './node_modules/victory-vendor/es/d3-format.js'),
            'victory-vendor/d3-path': path.resolve(__dirname, './node_modules/victory-vendor/es/d3-path.js'),
            'victory-vendor/d3-time-format': path.resolve(__dirname, './node_modules/victory-vendor/es/d3-time-format.js'),
        },
    },
    output: {
        minify: false,
        sourceMap: {
            js: false,
            css: false,
        },
        assetPrefix: '/',
    },
    html: {
        template: './index.html',
    },
    server: {
        port: 8443,
        compress: true,
        historyApiFallback: true,
        proxy: {
            '/api': {
                target: 'http://localhost:4000',
                changeOrigin: true,
            },
        },
    },
    dev: {
        hmr: true,
        lazyCompilation: false,
    },
    performance: {
        // Configure Rsbuild's native bundle analyzer
        bundleAnalyze:
            process.env.BUNDLE_ANALYZE === 'true'
                ? {
                      analyzerMode: 'server',
                      analyzerHost: 'localhost',
                      analyzerPort: 8888,
                      openAnalyzer: true,
                      generateStatsFile: true,
                      statsFilename: 'stats.json',
                  }
                : undefined,
    },
    tools: {
        rspack: {
            plugins: [],
            resolve: {
                modules: [
                    'node_modules',
                    path.resolve(__dirname, './src/external/trader/src'),
                    path.resolve(__dirname, './src/external'),
                    path.resolve(__dirname, './src'),
                ],
                extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.scss', '.css', '.mjs'],
            },
            module: {
                rules: [
                    {
                        test: /\.xml$/,
                        exclude: /node_modules/,
                        use: 'raw-loader',
                    },
                ],
            },
        },
    },
});
