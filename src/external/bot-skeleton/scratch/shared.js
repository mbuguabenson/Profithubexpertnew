import filesaver from 'file-saver';
import { getContractTypeOptions as getContractTypeOptionsFromCommon } from '../../../components/shared/utils/common-data';
import { config } from '../constants/config';

export const saveAs = ({ data, filename, type }) => {
    const blob = new Blob([data], { type });
    filesaver.saveAs(blob, filename);
};

export const getContractTypeOptions = (contract_type, trade_type) => {
    // First try to get from config
    if (trade_type && trade_type !== 'na' && trade_type !== '') {
        const raw_key = (trade_type || '').toUpperCase();
        const stripped_key = (trade_type || '').replace(/_/g, '').toUpperCase();
        const trade_types = config().opposites[raw_key] || config().opposites[stripped_key];

        if (trade_types) {
            const contract_options = trade_types.map(type => Object.entries(type)[0].reverse());

            // Deduplicate options by value
            const seen = new Set();
            const unique_options = contract_options.filter(option => {
                if (seen.has(option[1])) return false;
                seen.add(option[1]);
                return true;
            });

            // When user selected a specific contract, only return the contract type they selected.
            if (contract_type !== 'both') {
                const filtered_options = unique_options.filter(option => option[1] === contract_type);
                return filtered_options;
            }
            return unique_options;
        }
    }

    // Fallback to common data
    return getContractTypeOptionsFromCommon(contract_type, trade_type);
};
