const getScannerInterface = () => {
    return {
        getScannerBestMarket: () => {
            const scanner = window.scanner_store;
            if (!scanner) return 'R_100';
            return scanner.current_signal?.symbol || scanner.single_market_symbol || 'R_100';
        },
        getScannerLastDigit: () => {
            const scanner = window.scanner_store;
            if (!scanner) return 0;
            if (scanner.single_market_last_digit !== null && scanner.single_market_last_digit !== undefined) {
                return Number(scanner.single_market_last_digit);
            }
            const sym = scanner.single_market_symbol;
            const analysis = scanner.symbol_analysis ? scanner.symbol_analysis[sym] : null;
            return analysis && analysis.lastDigits && analysis.lastDigits.length > 0
                ? Number(analysis.lastDigits[analysis.lastDigits.length - 1])
                : 0;
        },
        getScannerConfidence: () => {
            const scanner = window.scanner_store;
            if (!scanner) return 50;
            return scanner.current_signal ? Math.round(scanner.current_signal.confidence * 100) : 50;
        },
        getScannerOverUnderBias: () => {
            const scanner = window.scanner_store;
            if (!scanner) return 'OVER';
            const sym = scanner.single_market_symbol;
            const analysis = scanner.symbol_analysis ? scanner.symbol_analysis[sym] : null;
            if (!analysis) return 'OVER';
            return analysis.lowPercentage >= analysis.highPercentage ? 'UNDER' : 'OVER';
        },
        getScannerColdestDigit: () => {
            const scanner = window.scanner_store;
            if (!scanner) return 4;
            const sym = scanner.single_market_symbol;
            const analysis = scanner.symbol_analysis ? scanner.symbol_analysis[sym] : null;
            if (!analysis || !analysis.digitFrequencies || !analysis.digitFrequencies.length) return 4;
            const sorted = [...analysis.digitFrequencies].sort((a, b) => a.percentage - b.percentage);
            return Number(sorted[0].digit);
        },
        getScannerHottestDigit: () => {
            const scanner = window.scanner_store;
            if (!scanner) return 7;
            const sym = scanner.single_market_symbol;
            const analysis = scanner.symbol_analysis ? scanner.symbol_analysis[sym] : null;
            if (!analysis || !analysis.digitFrequencies || !analysis.digitFrequencies.length) return 7;
            const sorted = [...analysis.digitFrequencies].sort((a, b) => b.percentage - a.percentage);
            return Number(sorted[0].digit);
        },
        getScannerIsStrongSignal: () => {
            const scanner = window.scanner_store;
            if (!scanner) return false;
            return scanner.current_signal ? scanner.current_signal.confidence >= 0.70 : false;
        },
    };
};

export default getScannerInterface;
