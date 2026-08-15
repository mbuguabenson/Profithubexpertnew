const getScannerInterface = () => {
    return {
        getScannerBestMarket: () => {
            const scanner = typeof window !== 'undefined' ? window.scanner_store : null;
            if (!scanner) return 'R_100';

            // Auto-start scanning in background if not already active
            if (!scanner.is_scanning) {
                try {
                    scanner.startScanning();
                } catch (e) {
                    console.warn('[ScannerInterface] Error starting scanner in background:', e);
                }
            }

            return (
                scanner.current_signal?.symbol ||
                (scanner.signals && scanner.signals.length > 0 ? scanner.signals[0].symbol : null) ||
                scanner.single_market_symbol ||
                'R_100'
            );
        },
        getScannerLastDigit: () => {
            const scanner = typeof window !== 'undefined' ? window.scanner_store : null;
            if (!scanner) return 0;

            if (scanner.single_market_last_digit !== null && scanner.single_market_last_digit !== undefined) {
                return Number(scanner.single_market_last_digit);
            }

            const sym = scanner.current_signal?.symbol || scanner.single_market_symbol || 'R_100';
            const analysis = scanner.symbol_analysis ? scanner.symbol_analysis[sym] : null;
            return analysis && analysis.lastDigits && analysis.lastDigits.length > 0
                ? Number(analysis.lastDigits[analysis.lastDigits.length - 1])
                : 0;
        },
        getScannerConfidence: () => {
            const scanner = typeof window !== 'undefined' ? window.scanner_store : null;
            if (!scanner) return 75;

            if (scanner.current_signal?.confidence) {
                return Math.round(scanner.current_signal.confidence * 100);
            }
            if (scanner.signals && scanner.signals.length > 0 && scanner.signals[0].confidence) {
                return Math.round(scanner.signals[0].confidence * 100);
            }
            return 75;
        },
        getScannerOverUnderBias: () => {
            const scanner = typeof window !== 'undefined' ? window.scanner_store : null;
            if (!scanner) return 'OVER';

            const sym = scanner.current_signal?.symbol || scanner.single_market_symbol || 'R_100';
            const analysis = scanner.symbol_analysis ? scanner.symbol_analysis[sym] : null;
            if (!analysis) return 'OVER';
            return (analysis.lowPercentage || 0) >= (analysis.highPercentage || 0) ? 'UNDER' : 'OVER';
        },
        getScannerColdestDigit: () => {
            const scanner = typeof window !== 'undefined' ? window.scanner_store : null;
            if (!scanner) return 4;

            const sym = scanner.current_signal?.symbol || scanner.single_market_symbol || 'R_100';
            const analysis = scanner.symbol_analysis ? scanner.symbol_analysis[sym] : null;
            if (!analysis || !analysis.digitFrequencies || !analysis.digitFrequencies.length) return 4;
            const sorted = [...analysis.digitFrequencies].sort((a, b) => a.percentage - b.percentage);
            return Number(sorted[0].digit);
        },
        getScannerHottestDigit: () => {
            const scanner = typeof window !== 'undefined' ? window.scanner_store : null;
            if (!scanner) return 7;

            const sym = scanner.current_signal?.symbol || scanner.single_market_symbol || 'R_100';
            const analysis = scanner.symbol_analysis ? scanner.symbol_analysis[sym] : null;
            if (!analysis || !analysis.digitFrequencies || !analysis.digitFrequencies.length) return 7;
            const sorted = [...analysis.digitFrequencies].sort((a, b) => b.percentage - a.percentage);
            return Number(sorted[0].digit);
        },
        getScannerIsStrongSignal: () => {
            const scanner = typeof window !== 'undefined' ? window.scanner_store : null;
            if (!scanner) return true;

            const conf =
                scanner.current_signal?.confidence ??
                (scanner.signals && scanner.signals.length > 0 ? scanner.signals[0].confidence : null);
            return conf !== null && conf !== undefined ? conf >= 0.65 : true;
        },
    };
};

export default getScannerInterface;
