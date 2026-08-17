import AppStore from './app-store';
import BlocklyStore from './blockly-store';
import ChartStore from './chart-store';
import ClientStore from './client-store';
import CommonStore from './common-store';
import DashboardStore from './dashboard-store';
import DataCollectionStore from './data-collection-store';
import FlyoutHelpStore from './flyout-help-store';
import FlyoutStore from './flyout-store';
import GoogleDriveStore from './google-drive-store';
import JournalStore from './journal-store';
import LoadModalStore from './load-modal-store';
import QuickStrategyStore from './quick-strategy-store';
import RunPanelStore from './run-panel-store';
import SaveModalStore from './save-modal-store';
import SummaryCardStore from './summary-card-store';
import ToolbarStore from './toolbar-store';
import ToolboxStore from './toolbox-store';
import TransactionsStore from './transactions-store';
import UiStore from './ui-store';
import ScannerStore from './scanner-store';
import AccountFlipperStore from './account-flipper-store';
import AutoTraderStore from './auto-trader-store';
import DigitCrackerStore from './digit-cracker-store';
import MarketkillerStore from './marketkiller-store';
import OverUnderStore from './over-under-store';
import SmartAutoStore from './smart-auto-store';
import SmartTradingStore from './smart-trading-store';
import CopyTraderStore from './copy-trader-store';
import FreeBotsStore from './free-bots-store';
import DollarflipperStore from './dollarflipper-store';
import DollarmineStore from './dollarmine-store';
import AnalysisStore from './analysis-store';
import EntryScannerStore from './entry-scanner-store';
import TraderStore from './trader-store';

// TODO: need to write types for the individual classes and convert them to ts
export default class RootStore {
    public dbot;
    public app: AppStore;
    public summary_card: SummaryCardStore;
    public flyout: FlyoutStore;
    public flyout_help: FlyoutHelpStore;
    public google_drive: GoogleDriveStore;
    public journal: JournalStore;
    public load_modal: LoadModalStore;
    public run_panel: RunPanelStore;
    public save_modal: SaveModalStore;
    public transactions: TransactionsStore;
    public toolbar: ToolbarStore;
    public toolbox: ToolboxStore;
    public quick_strategy: QuickStrategyStore;
    public scanner: ScannerStore;
    public analysis: AnalysisStore;
    public entry_scanner: EntryScannerStore;
    public trader: TraderStore;

    public dashboard: DashboardStore;

    public account_flipper: AccountFlipperStore;
    public auto_trader: AutoTraderStore;
    public digit_cracker: DigitCrackerStore;
    public marketkiller: MarketkillerStore;
    public over_under: OverUnderStore;
    public smart_auto: SmartAutoStore;
    public smart_trading: SmartTradingStore;
    public copy_trader: CopyTraderStore;
    public free_bots: FreeBotsStore;
    public dollarflipper: DollarflipperStore;
    public dollarmine: DollarmineStore;

    public chart_store: ChartStore;
    public blockly_store: BlocklyStore;
    public data_collection_store: DataCollectionStore;

    public ui: UiStore;
    public client: ClientStore;
    public common: CommonStore;

    core = {
        ui: {},
        client: {},
        common: {},
    };

    constructor(dbot: unknown) {
        this.dbot = dbot;

        // Need to fix later without using this.core
        this.ui = new UiStore();
        this.client = new ClientStore();
        this.common = new CommonStore();
        this.core.ui = this.ui;
        this.core.client = this.client;
        this.core.common = this.common;

        this.analysis = new AnalysisStore(this);
        this.entry_scanner = new EntryScannerStore(this);
        this.trader = new TraderStore(this);

        this.app = new AppStore(this, this.core);
        this.summary_card = new SummaryCardStore(this, this.core);
        this.flyout = new FlyoutStore(this);
        this.flyout_help = new FlyoutHelpStore(this);
        this.google_drive = new GoogleDriveStore(this);
        this.journal = new JournalStore(this, this.core);
        this.load_modal = new LoadModalStore(this, this.core);
        this.run_panel = new RunPanelStore(this, this.core);
        this.save_modal = new SaveModalStore(this);
        this.transactions = new TransactionsStore(this, this.core);
        this.toolbar = new ToolbarStore(this);
        this.toolbox = new ToolboxStore(this, this.core);
        this.quick_strategy = new QuickStrategyStore(this);
        this.scanner = new ScannerStore(this);
        this.dollarflipper = new DollarflipperStore(this);
        this.dollarmine = new DollarmineStore(this);

        this.account_flipper = new AccountFlipperStore(this);
        this.auto_trader = new AutoTraderStore(this);
        this.digit_cracker = new DigitCrackerStore(this);
        this.marketkiller = new MarketkillerStore(this);
        this.over_under = new OverUnderStore(this);
        this.smart_auto = new SmartAutoStore(this);
        this.smart_trading = new SmartTradingStore(this);
        this.copy_trader = new CopyTraderStore(this);
        this.free_bots = new FreeBotsStore(this);

        this.dashboard = new DashboardStore(this, this.core);

        // need to be at last for dependency
        this.chart_store = new ChartStore(this);
        this.blockly_store = new BlocklyStore(this);
        this.data_collection_store = new DataCollectionStore(this, this.core);

        this.app.setDBotEngineStores();
    }
}
