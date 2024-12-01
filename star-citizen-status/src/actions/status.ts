import streamdeck, {
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
   
    /**
     * Called when the action appears on the Stream Deck.
     */
    override async onWillAppear(ev: WillAppearEvent<StatusSettings>): Promise<void> {
        if (!ev.action.isKey()) return;

        let { settings } = ev.payload;
        if (!settings.displayMode) {
            settings = { ...settings, displayMode: 'status' }; // Default to 'status'
            ev.action.setSettings(settings);
        }
        const username = settings.username || "Chris-Roberts";
        const shipInfo = settings.shipInfo || "100i";
        this.updateDisplay(settings, ev.action);
        //await this.refreshStarCitizenData(settings.fields || [], username, shipInfo, settings.displayMode || (''), ev.action);
    }

    /**
     * Called when settings are received from the Property Inspector.
     */
    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<StatusSettings>): Promise<void> {
        if (!ev.action.isKey()) return;
        const { settings } = ev.payload;
        const username = settings.username || "Chris-Roberts";
        const shipInfo = settings.shipInfo || "100i";
        this.updateDisplay(ev.payload.settings, ev.action);
        //await this.refreshStarCitizenData(settings.fields || [], username, shipInfo, settings.displayMode || (''), ev.action);
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

    /**
     * Updates the display based on the current settings.
     */
    private updateDisplay(settings: StatusSettings, action: KeyAction<StatusSettings>) {
        const title = settings.displayMode || 'N/A';
        //action.setTitle(title);
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