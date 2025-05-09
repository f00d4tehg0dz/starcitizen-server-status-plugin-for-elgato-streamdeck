import streamDeck, {
    action,
    KeyDownEvent,
    SingletonAction,
    WillAppearEvent,
    DidReceiveSettingsEvent,
    KeyAction
} from "@elgato/streamdeck";

/**
 * Status Action.
 */
@action({ UUID: "com.f00d4tehg0dz.star-citizen-status.status" })
export class Status extends SingletonAction<StatusSettings> {
    private refreshInterval: NodeJS.Timeout | null = null;
   
    constructor() {
        super();
        // Initialize display immediately when the action is created
        this.initializeDisplay({
            displayMode: 'status',
            fields: [],
            automaticRefresh: true
        });
    }

    /**
     * Called when the action appears on the Stream Deck.
     */
    override async onWillAppear(ev: WillAppearEvent<StatusSettings>): Promise<void> {
        if (!ev.action.isKey()) return;

        // Force status mode and start fetching immediately
        const settings = {
            displayMode: 'status',
            fields: [],
            automaticRefresh: true
        };

        // Save settings and start fetching
        ev.action.setSettings(settings);
   
    }

    /**
     * Called when settings are received from the Property Inspector.
     */
    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<StatusSettings>): Promise<void> {
        if (!ev.action.isKey()) return;

        // Force status mode on startup
        const settings = {
            displayMode: 'status',
            fields: [],
            automaticRefresh: true
        };

        // Save settings and start fetching
        ev.action.setSettings(settings);
    }

    /**
     * Called when the user presses a key with this action on their Stream Deck.
     */
    override async onKeyDown(ev: KeyDownEvent<StatusSettings>): Promise<void> {
        if (!ev.action.isKey()) return;

        const { settings } = ev.payload;
	
        const username = settings.username || "Chris-Roberts";
        const shipInfo = settings.shipInfo || "100i";
        await this.refreshStarCitizenData(settings.fields || [], username, shipInfo, settings.displayMode || (''), ev.action);
    }

    private async initializeDisplay(settings: StatusSettings) {
        try {
           
            // Fetch server status immediately
            const response = await fetch("https://status.robertsspaceindustries.com/index.json");
            const data = await response.json();
            const result: any = {};
            data.systems.forEach((system: any) => {
                result[system.name] = system.status;
            });
            return result;
        } catch (error) {
            streamDeck.logger.error("Error initializing display:", error);
            return { displayMode: 'server', fields: [] }; // Default state
        }
    }

    /**
     * Load the last state from global settings.
     */
    private async loadLastState(): Promise<any> {
        try {
            const settings = await streamDeck.settings.getGlobalSettings();
            return settings.lastState || { displayMode: 'server', fields: [] }; // Default state
        } catch (error) {
            streamDeck.logger.error("Error loading last state:", error);
            return { displayMode: 'server', fields: [] }; // Default state
        }
    }

    /**
     * Function to refresh Star Citizen data based on selected fields.
     */
    private async refreshStarCitizenData(fields: string[], username: string, shipInfo: string, displayMode: string, action: KeyAction<StatusSettings>) {
        console.log("Refreshing Star Citizen data for fields:", fields, "Username:", username, "Ship Info:", shipInfo, "displayMode", displayMode);
        await action.setSettings({
            fields,
            username,
            shipInfo,
            displayMode
        });
    }
    
  
    override onWillDisappear(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }
}

   
/**
 * Settings for {@link Status}.
 */
type StatusSettings = {
    fields?: string[];
    automaticRefresh?: boolean;
    username?: string;
    shipInfo?: string;
    displayMode?: string;
};