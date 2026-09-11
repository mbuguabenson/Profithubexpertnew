import AppMain from './App/index';
import { TCoreStores } from '@deriv/stores/types';
import { TWebSocket } from 'Types';

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
