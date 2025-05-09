import streamDeck, { LogLevel } from "@elgato/streamdeck";
import * as PImage from "pureimage";
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { PassThrough } from "stream";
import { Readable } from 'stream';
import { Status } from "./actions/status";

// Convert import.meta.url to a file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stateFilePath = path.join(__dirname, 'state.json');

// Global refresh interval
let globalRefreshInterval: NodeJS.Timeout | null = null;

function saveLastState(result: any, settings: any) {
    const state = { result, settings };
    try {
        fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2));
        streamDeck.logger.trace("Saved last state:", state);
    } catch (error) {
        streamDeck.logger.error("Error saving state:", error);
    }
}

async function loadLastState() {
    try {
        // Always return status mode settings
        return {
            result: {
                "Platform": "Loading...",
                "Persistent Universe": "Loading...",
                "Arena Commander": "Loading..."
            },
            settings: {
                displayMode: 'status',
                fields: [],
                automaticRefresh: true
            }
        };
    } catch (error) {
        streamDeck.logger.error("Error loading last state:", error);
        return {
            result: {
                "Platform": "Loading...",
                "Persistent Universe": "Loading...",
                "Arena Commander": "Loading..."
            },
            settings: {
                displayMode: 'status',
                fields: [],
                automaticRefresh: true
            }
        };
    }
}

// Enable "trace" logging
streamDeck.logger.setLevel(LogLevel.TRACE);

// Register the status action.
streamDeck.actions.registerAction(new Status());

// Connect to the Stream Deck.
streamDeck.connect().then(() => {
    streamDeck.logger.trace("Connected to Stream Deck");
    streamDeck.logger.trace("Global settings:", streamDeck.settings.getGlobalSettings());
  
    // Initialize the plugin and show status immediately
    initializePlugin();
    
    // Start the global refresh mechanism
    startGlobalRefresh();
    
    // Force status display for the current action
    if (streamDeck.ui.current?.action) {
        const settings = {
            displayMode: 'status',
            fields: [],
            automaticRefresh: true
        };
        streamDeck.ui.current.action.setSettings(settings);
        updateStarCitizenStatus(settings);
    }
});

// Function to start global refresh that doesn't depend on action selection
function startGlobalRefresh() {
    if (globalRefreshInterval) {
        clearInterval(globalRefreshInterval);
    }
    
    globalRefreshInterval = setInterval(() => {
        streamDeck.logger.trace("Global refresh running");
        
        // Fetch and update all actions
        const actions = streamDeck.actions;
        streamDeck.logger.trace(`Found ${actions.length} actions to refresh`);
        
        // Update each action with new data
        actions.forEach(action => {
            if (action.isKey()) {
                action.getSettings().then(settings => {
                    // Respect the current display mode and refresh accordingly
                    const displayMode = settings.displayMode || 'status';
                    
                    switch (displayMode) {
                        case 'stats':
                            getStarCitizenStats((result) => {
                                streamDeck.logger.trace(`Updating action ${action.id} with stats`);
                                if (result.error) {
                                    streamDeck.logger.error("Error fetching stats:", result.error);
                                } else {
                                    saveLastState(result, settings);
                                    updateCanvasWithStatus(result, settings, true, action);
                                }
                            });
                            break;
                        case 'status':
                            getStarCitizenData(safeGetFields(settings), (result) => {
                                streamDeck.logger.trace(`Updating action ${action.id} with status`);
                                if (result.error) {
                                    streamDeck.logger.error("Error fetching data:", result.error);
                                } else {
                                    saveLastState(result, settings);
                                    updateCanvasWithStatus(result, settings, true, action);
                                }
                            });
                            break;
                        case 'username':
                            if (settings.username) {
                                getUsernameData(String(settings.username), (result) => {
                                    streamDeck.logger.trace(`Updating action ${action.id} with username data`);
                                    if (result.error) {
                                        streamDeck.logger.error("Error fetching username data:", result.error);
                                    } else {
                                        saveLastState(result, settings);
                                        updateCanvasWithStatus(result, settings, true, action);
                                    }
                                });
                            }
                            break;
                        case 'ship':
                            if (settings.shipInfo) {
                                getShipData(String(settings.shipInfo), (result) => {
                                    streamDeck.logger.trace(`Updating action ${action.id} with ship data`);
                                    if (result.error) {
                                        streamDeck.logger.error("Error fetching ship data:", result.error);
                                    } else {
                                        saveLastState(result, settings);
                                        updateCanvasWithStatus(result, settings, true, action);
                                    }
                                });
                            }
                            break;
                        default:
                            // Default to status mode if unknown mode
                            getStarCitizenData(safeGetFields(settings), (result) => {
                                streamDeck.logger.trace(`Updating action ${action.id} with default status`);
                                if (result.error) {
                                    streamDeck.logger.error("Error fetching data:", result.error);
                                } else {
                                    saveLastState(result, settings);
                                    updateCanvasWithStatus(result, settings, true, action);
                                }
                            });
                    }
                }).catch(err => {
                    streamDeck.logger.error(`Error getting settings for action ${action.id}:`, err);
                });
            }
        });
    }, 60000); // Every 1 minute
    
    streamDeck.logger.trace("Global refresh started");
}

const Star_Citizen_Key = "435ccc1f79cf6b3c9d5f095cf582ec0b"

let intervals: { [key: string]: ReturnType<typeof setInterval> } = {};

function initializePlugin() {
    loadLastState()
        .then(lastState => {
            // Instead of relying on streamDeck.ui.current, update all visible actions
            const actions = streamDeck.actions;
            if (actions.length > 0) {
                for (const action of actions) {
                    if (action.isKey()) {
                        updateCanvasWithStatus({
                            "Platform": "Loading...",
                            "Persistent Universe": "Loading...",
                            "Arena Commander": "Loading..."
                        }, lastState.settings, false, action);
                    }
                }
            }
            
            streamDeck.logger.trace("Set loading status in UI");
            
            // Immediately fetch data
            getStarCitizenData([], (result) => {
                handleDataResult(result, lastState.settings);
            });
        })
        .catch(error => {
            streamDeck.logger.error("Error initializing plugin:", error);
        });
}

streamDeck.settings.onDidReceiveSettings((jsonObj) => {
    const settings = jsonObj.payload.settings;
    streamDeck.logger.trace("Received settings:", settings);
    
    // If automaticRefresh is explicitly false, we're in editing mode
    if (settings.automaticRefresh === false) {
        streamDeck.logger.trace("Edit mode detected - not refreshing");
        return; // Skip refresh in editing mode
    }
    
    initiateStarCitizenStatus(settings);  
});

streamDeck.settings.onDidReceiveGlobalSettings((jsonObj) => {
    const settings = jsonObj.settings;
    streamDeck.logger.trace("Settings on did receive global settings:", settings);
    initiateStarCitizenStatus(settings);
})

streamDeck.actions.onWillAppear((jsonObj) => {
    streamDeck.logger.trace("On Will Appear", jsonObj);
    const settings = jsonObj.action.getSettings();
    const lastState = loadLastState();
    if (lastState && typeof lastState === 'object' && 'result' in lastState) {
        streamDeck.logger.trace("Loading last state:", lastState);
        updateCanvasWithStatus(lastState.result, settings, false, jsonObj.action);
    } else {
        displayErrorMessage("Something Broke", jsonObj.action);
    }
});

streamDeck.actions.onTitleParametersDidChange((jsonObj) => {
    streamDeck.logger.trace("On Title Parameters Did Change", jsonObj);
    const settings = jsonObj.action.getSettings()
    const lastState = loadLastState();
    if (lastState && typeof lastState === 'object' && 'result' in lastState) {
        streamDeck.logger.trace("Loading last state:", lastState);
        updateCanvasWithStatus(lastState.result, settings, false, jsonObj.action);
    } else {
        displayErrorMessage("Something Broke", jsonObj.action);
    }
})

streamDeck.ui.onDidAppear((jsonObj) => {
    streamDeck.logger.trace("On Did Appear", jsonObj);
    const settings = jsonObj.action.getSettings()
    const lastState = loadLastState();
    if (lastState && typeof lastState === 'object' && 'result' in lastState) {
        streamDeck.logger.trace("Loading last state:", lastState);
        updateCanvasWithStatus(lastState.result, settings, false, jsonObj.action);
    } else {
        displayErrorMessage("Something Broke", jsonObj.action);
    }
});

streamDeck.actions.onKeyUp((jsonObj) => {
    streamDeck.logger.trace("Received keyUp event:", jsonObj);
    const settings = jsonObj.payload.settings;
    streamDeck.logger.trace("Settings on keyUp:", settings);
    initiateStarCitizenStatus(settings);
});

export async function initiateStarCitizenStatus(settings: any) {
    streamDeck.logger.trace(`Display Mode!: ${settings.displayMode}`);
    settings.displayMode = settings.displayMode || 'status'; // Default to 'status' if not set
    streamDeck.logger.trace(`Initiating StarCitizen status for context:`, settings);
    clearInterval(intervals[settings]);
    updateStarCitizenStatus(settings);
}

export async function updateStarCitizenStatus(settings: any) {
    // Skip updates if automaticRefresh is explicitly set to false
    if (settings.automaticRefresh === false) {
        streamDeck.logger.trace("Skipping auto refresh - disabled by user");
        return;
    }

    streamDeck.logger.trace(`Updating StarCitizen status for context:`, settings.displayMode);
    setTitle("Updating");
    // Determine which data to fetch based on settings
    switch (settings.displayMode) {
        case 'stats':
            getStarCitizenStats((result) => handleDataResult(result, settings));
            break;
        case 'status':
            getStarCitizenData(safeGetFields(settings), (result) => handleDataResult(result, settings));
            break;
        case 'username':
            getUsernameData(String(settings.username), (result) => handleDataResult(result, settings));
            break;
        case 'ship':
            getShipData(String(settings.shipInfo), (result) => handleDataResult(result, settings));
            break;
        default:
            streamDeck.logger.error("Unknown display mode:", settings.displayMode);
            clearTitle();
            getStarCitizenData(safeGetFields(settings), (result) => handleDataResult(result, settings));
            displayErrorMessage("Invalid Display Mode");
    }
}

function handleDataResult(result: any, settings: any) {
    //streamDeck.logger.trace("Received data:", result);
    clearTitle();
    if (result.error) {
        streamDeck.logger.error("Error fetching data:", result.error);
        const lastState = loadLastState();
        if (lastState && typeof lastState === 'object' && 'result' in lastState) {
            //streamDeck.logger.trace("Loading last state:", lastState);
            updateCanvasWithStatus(lastState.result, settings, false);
        } else {
            displayErrorMessage("Something Broke");
        }
    } else {
        saveLastState(result, settings);
        
        // Try to update all actions with the new data
        const actions = streamDeck.actions;
        if (actions.length > 0) {
            for (const action of actions) {
                if (action.isKey()) {
                    updateCanvasWithStatus(result, settings, true, action);
                }
            }
        } else {
            // Fall back to the old method if no actions are found
            updateCanvasWithStatus(result, settings, true);
        }
    }
}

function displayErrorMessage(message: string, specificAction?: any) {
    const canvas = PImage.make(144, 144);
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, 144, 144);
        ctx.fillStyle = '#969AE8';
        ctx.font = 'bold 16pt SourceSansPro';
        ctx.textAlign = 'center';
        ctx.fillText(message, 72, 72);
        
        const outStream = new PassThrough();
        PImage.encodePNGToStream(canvas, outStream).then(() => {
            const jpegData: Buffer[] = [];
            outStream.on('data', (chunk) => jpegData.push(chunk));
            outStream.on('end', () => {
                const buf = Buffer.concat(jpegData);
                const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
                
                if (specificAction && specificAction.isKey && specificAction.isKey()) {
                    specificAction.setImage(dataUrl);
                } else if (streamDeck.ui.current?.action) {
                    streamDeck.ui.current.action.setImage(dataUrl);
                } else {
                    // Try to update all visible actions
                    const actions = streamDeck.actions;
                    if (actions.length > 0) {
                        for (const action of actions) {
                            if (action.isKey()) {
                                action.setImage(dataUrl);
                            }
                        }
                    }
                }
            });
        });
    }
}

function setTitle(title: string) {
    if (streamDeck.ui.current?.action) {
        streamDeck.ui.current.action.setTitle(title);
    }
}

function clearTitle() {
    if (streamDeck.ui.current?.action) {
        streamDeck.ui.current.action.setTitle("");
    }
}

// Register and load the font
const font = PImage.registerFont("./font/source-sans-pro-regular.ttf", "SourceSansPro");
font.loadSync();

function updateCanvasWithStatus(result: any, settings: any, isNew: boolean, specificAction?: any) {
    streamDeck.logger.trace("Updating canvas with status:", { resultKeys: Object.keys(result), settings });
    
    const statusLines = prepareStatusLines(result, settings.fields, settings);
    const canvas = PImage.make(144, 144);
    const ctx = canvas.getContext('2d');

    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'black'; // Set background color
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = "20pt 'SourceSansPro'";

        drawHeaderText(ctx);
        // Draw status text
        drawStatusText(ctx, statusLines);

        // Check if there's an image URL to draw
        const imageUrl = result.imageUrl;
        if (imageUrl) {
            streamDeck.logger.trace("Drawing Image from URL", imageUrl);
            
            try {
                fetch(imageUrl)
                    .then(res => {
                        if (!res.body) throw new Error("No response body");
                        return fetchToNodeReadable(res.body);
                    })
                    .then(stream => {
                        if (imageUrl.endsWith('.png')) {
                            return PImage.decodePNGFromStream(stream);
                        } else if (imageUrl.endsWith('.jpg') || imageUrl.endsWith('.jpeg')) {
                            return PImage.decodeJPEGFromStream(stream);
                        } else {
                            throw new Error("Unsupported image format");
                        }
                    })
                    .then((img) => {
                        ctx.drawImage(img, 0, 0, 144, 144); // Draw the image on the canvas
                        // Now encode and set the image with the specific action if available
                        setImageFromCanvas(canvas, specificAction);
                    })
                    .catch(err => {
                        streamDeck.logger.error("Error loading image:", err);
                        // Fall back to setting the image without the loaded image
                        setImageFromCanvas(canvas, specificAction);
                    });
            } catch (err) {
                streamDeck.logger.error("Error loading image:", err);
                setImageFromCanvas(canvas, specificAction);
            }
        } else {
            // No image URL, just set the image directly
            setImageFromCanvas(canvas, specificAction);
        }
    }
}

// Helper function to set the image from canvas
function setImageFromCanvas(canvas: any, specificAction?: any) {
    const outStream = new PassThrough();
    PImage.encodePNGToStream(canvas, outStream)
        .then(() => {
            const jpegData: Buffer[] = [];
            outStream.on('data', (chunk) => jpegData.push(chunk));
            outStream.on('end', () => {
                const buf = Buffer.concat(jpegData);
                const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
                
                // Set the image on the specific action if provided
                if (specificAction && specificAction.isKey && specificAction.isKey()) {
                    specificAction.setImage(dataUrl);
                    return;
                }
                
                // Otherwise, set on current UI action if available
                if (streamDeck.ui.current?.action) {
                    streamDeck.ui.current.action.setImage(dataUrl);
                    return;
                }
                
                // Last resort: try to update all visible actions
                const actions = streamDeck.actions;
                if (actions.length > 0) {
                    for (const action of actions) {
                        if (action.isKey()) {
                            action.setImage(dataUrl);
                        }
                    }
                }
            });
        })
        .catch(err => {
            streamDeck.logger.error("Error encoding PNG to stream:", err);
        });
}

function drawHeaderText(ctx: any) {
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.fillText("Status", 72, 30); // #969AE8 at the top
}

function drawStatusText(ctx: any, lines: any[]) {
    ctx.fillStyle = 'black'; // Default text color
    ctx.font = "24pt 'SourceSansPro'"; // Set font style
    ctx.textAlign = 'left'; // Align text to the left

    // Define the color profile mapping
    const colorProfile: { [key: string]: string } = {
        "degraded": "#969AE8", // purple
        "operational": "rgb(81, 174, 122)", // green
        "maintenance": "#aab5bb", // grey
        "partial": "#e8944a" // orange
    };

    // Only show first 3 lines to avoid overflow
    const visibleLines = lines.slice(0, 3);
    
    visibleLines.forEach(({ text, color, imageUrl }, i) => {
        if (text) {
            // Determine the color based on the text content
            const lowerText = text.toLowerCase();
            const textColor = colorProfile[lowerText] || color || 'white'; // Use default color if no match

            ctx.fillStyle = textColor; // Set text color
            ctx.fillText(text, 12, 60 + 30 * i); // Draw text starting below the header
        }
    });
}

// Utility function to convert a Fetch API ReadableStream to a Node.js Readable stream
function fetchToNodeReadable(fetchStream: ReadableStream<Uint8Array>): Readable {
    const reader = fetchStream.getReader();
    return new Readable({
        async read() {
            const { done, value } = await reader.read();
            if (done) {
                this.push(null);
            } else {
                this.push(Buffer.from(value));
            }
        }
    });
}

function formatNumberInMillions(value: number): string {
    if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(1)}M`;
    }
    return value.toString();
}

function prepareStatusLines(result: any, fields: string[], settings: any) {
    if (settings.displayMode === 'stats') {
        return [
            { text: `Live: ${result.current_live || 'N/A'}`, color: "rgb(81, 174, 122)" },
            { text: `Fans: ${result.fans ? formatNumberInMillions(result.fans) : 'N/A'}`, color: "#e8944a" },
            { text: `$$$: ${result.funds ? formatNumberInMillions(result.funds) : 'N/A'}`, color: "#969AE8" }
        ];
    } else if (settings.displayMode === 'status') {
        return Object.keys(result).map(systemName => {
            const status = result[systemName] || 'N/A';
            return { text: `${status}`, color: "rgb(81, 174, 122)" };
        });
    } else if (settings.displayMode === 'username') {
        return [
            { text: `${result.username || 'N/A'}`, color: "rgb(81, 174, 122)" },
            { text: `${result.badge || 'N/A'}`, color: "#e8944a" },
            { text: `${result.organization || 'N/A'}`, color: "#969AE8" },
        ];
    } else if (settings.displayMode === 'ship') {
        return [{ imageUrl: result.image || 'N/A' }]; // Ensure imageUrl is set correctly
    }
    return [{ text: 'N/A', color: 'white' }];
}

function getStarCitizenData(fields: string[], callback: (result: any) => void) {
    streamDeck.logger.trace("Fetching Star Citizen data for fields:", fields);
    const endpoint = "https://status.robertsspaceindustries.com/index.json";
    fetch(endpoint)
        .then(response => response.json())
        .then(response => {
            streamDeck.logger.trace("Received response from API:", response);
            const result: any = {};
            response.systems.forEach((system: any) => {
                streamDeck.logger.trace(`Found system:`, system);
                result[system.name] = system.status;
            });
            streamDeck.logger.trace("Final result object:", result);
            callback(result);
        })
        .catch((error) => {
            streamDeck.logger.error("Failed to fetch data:", error);
            callback({ error: error.message });
        });
}

function getStarCitizenStats(callback: (result: any) => void) {
    const endpoint = `https://api.starcitizen-api.com/${Star_Citizen_Key}/v1/live/stats`;
    fetch(endpoint)
        .then(response => response.json())
        .then(data => {
            streamDeck.logger.trace("Received stats data:", data);
            callback(data.data); // Ensure the correct data structure is passed
        })
        .catch(error => {
            streamDeck.logger.error("Failed to fetch stats:", error);
            callback({ error: error.message });
        });
}

function getUsernameData(username: string, callback: (result: any) => void) {
    const mode = "live"; // You can change this to "cache", "auto", or "eager" as needed
    const endpoint = `https://api.starcitizen-api.com/${Star_Citizen_Key}/v1/${mode}/user/${username}`;

    fetch(endpoint)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const userProfile = data.data.profile;
                const userBadge = userProfile.badge;
                const userOrg = data.data.organization.name;
                callback({ username, badge: userBadge, organization: userOrg });
            } else {
                callback({ error: "User not found" });
            }
        })
        .catch(error => handleError("Failed to fetch user data", error, callback));
}

function handleError(message: string, error: any, callback: (result: any) => void) {
    streamDeck.logger.error(message, error);
    callback({ error: message });
}

function getShipData(shipInfo: string, callback: (result: any) => void) {
    const endpoint = `https://api.starcitizen-api.com/${Star_Citizen_Key}/v1/live/ships?name=${shipInfo}&page_max=1`;

    fetch(endpoint)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.data.length > 0) {
                const ship = data.data[0];
                if (ship.media && ship.media.length > 0) {
                    const avatarPath = ship.media[0].images.avatar;
                    if (avatarPath) {
                        const avatarUrl = `${avatarPath}`; // Ensure full URL
                        streamDeck.logger.trace("Avatar URL:", avatarUrl);
                        callback({ shipName: ship.name, imageUrl: avatarUrl });
                    } else {
                        callback({ error: "Avatar image not found" });
                    }
                } else {
                    callback({ error: "No media found for the ship" });
                }
            } else {
                callback({ error: "No ships found" });
            }
        })
        .catch(error => {
            streamDeck.logger.error("Failed to fetch ship data:", error);
            callback({ error: error.message });
        });
}

// Helper function to safely get fields as string array
function safeGetFields(settings: any): string[] {
    if (settings && settings.fields && Array.isArray(settings.fields)) {
        // Ensure all elements are strings
        return settings.fields.map((field: any) => String(field));
    }
    return [];
}

// start plugin
initializePlugin();