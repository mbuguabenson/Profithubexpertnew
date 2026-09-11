import React from 'react';
import AppMain from './App/index';
import type { TCoreStores } from '@deriv/stores/types';
import type { TWebSocket } from 'Types';

type Apptypes = {
    passthrough: {
        root_store: TCoreStores;
        WS: TWebSocket;
    };
};

const App = ({ passthrough }: Apptypes) => {
    return <AppMain passthrough={passthrough} />;
};

export default App;
