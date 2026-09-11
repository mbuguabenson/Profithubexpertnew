import React from 'react';
import { makeLazyLoader, moduleLoader } from '@deriv/shared';
import { Loading } from '@deriv/components';
import { TCoreStores } from '@deriv/stores/types';
import { TWebSocket } from 'Types';

type Apptypes = {
    passthrough: {
        root_store: TCoreStores;
        WS: TWebSocket;
    };
};

const AppLoader = makeLazyLoader(
    () => moduleLoader(() => import(/* webpackChunkName: "trader-app", webpackPreload: true */ './App/index')),
    () => <Loading />
)() as React.ComponentType<Apptypes>;

const App = ({ passthrough }: Apptypes) => {
    return <AppLoader passthrough={passthrough} />;
};

export default App;
