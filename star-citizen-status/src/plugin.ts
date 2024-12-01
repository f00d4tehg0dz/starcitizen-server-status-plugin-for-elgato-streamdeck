import streamDeck, { LogLevel } from "@elgato/streamdeck";
import * as PImage from "pureimage";
import * as fs from "fs";
import { PassThrough } from "stream";
import { Readable } from 'stream';
import { Status } from "./actions/status";

// Enable "trace" logging
streamDeck.logger.setLevel(LogLevel.TRACE);

// Register the status action.
streamDeck.actions.registerAction(new Status());

// Connect to the Stream Deck.
streamDeck.connect().then(() => {
    streamDeck.logger.trace("Connected to Stream Deck");
    streamDeck.logger.trace("Global settings:", streamDeck.settings.getGlobalSettings());
});

const Star_Citizen_Key = ""

let intervals: { [key: string]: ReturnType<typeof setInterval> } = {};
let stateStore: { [key: string]: any } = {}; // In-memory state store

streamDeck.settings.onDidReceiveSettings((jsonObj) => {
    //streamDeck.logger.trace("ON APPEAR", jsonObj.payload.settings);
    const settings = jsonObj.payload.settings;
    streamDeck.logger.trace("Settings on did appear:", settings);
    initiateStarCitizenStatus(settings);
});

streamDeck.actions.onWillAppear((jsonObj) => {
    //streamDeck.logger.trace("On Will Appear", jsonObj);
    const settings = jsonObj.payload.settings;
    streamDeck.logger.trace("Settings on will appear:", jsonObj.payload.settings);
    initiateStarCitizenStatus(settings);
});

streamDeck.ui.onDidAppear((jsonObj) => {
    streamDeck.logger.trace("On Did Appear", jsonObj);
    const settings = jsonObj.action.getSettings()
    const lastState = loadLastState(settings);
    if (lastState) {
        streamDeck.logger.trace("Loading last state:", lastState);
        updateCanvasWithStatus(lastState.result, settings, false);
    } else {
        displayErrorMessage("Something Broke");
    }

});

streamDeck.actions.onKeyUp((jsonObj) => {
    streamDeck.logger.trace("Received keyUp event:", jsonObj);
    const settings = jsonObj.payload.settings;
    streamDeck.logger.trace("Settings on keyUp:", settings);
    initiateStarCitizenStatus(settings);
});

function initiateStarCitizenStatus(settings: any) {
    streamDeck.logger.trace(`Display Mode: ${settings.displayMode}`);
    settings.displayMode = settings.displayMode || 'status'; // Default to 'status' if not set
    streamDeck.logger.trace(`Initiating StarCitizen status for context:`, settings);
    clearInterval(intervals[settings]);
    updateStarCitizenStatus(settings);
    if (settings.automaticRefresh) {
        streamDeck.logger.trace(`Setting automatic refresh for context: ${settings}`);
        intervals[settings] = setInterval(() => updateStarCitizenStatus(settings), 5 * 60 * 1000); // 5 minutes
    }
}

function updateStarCitizenStatus(settings: any) {
    streamDeck.logger.trace(`Updating StarCitizen status for context:`, settings.displayMode);
    setTitle("Updating");
    // Determine which data to fetch based on settings
    switch (settings.displayMode) {
        case 'stats':
            getStarCitizenStats((result) => handleDataResult(result, settings));
            break;
        case 'status':
            getStarCitizenData(settings.fields, (result) => handleDataResult(result, settings));
            break;
        case 'username':
            getUsernameData(settings.username, (result) => handleDataResult(result, settings));
            break;
        case 'ship':
            getShipData(settings.shipInfo, (result) => handleDataResult(result, settings));
            break;
        default:
            streamDeck.logger.error("Unknown display mode:", settings.displayMode);
            clearTitle();
            displayErrorMessage("Invalid Display Mode");
    }
}

function handleDataResult(result: any, settings: any) {
    //streamDeck.logger.trace("Received data:", result);
    clearTitle();
    if (result.error) {
        streamDeck.logger.error("Error fetching data:", result.error);
        const lastState = loadLastState(settings);
        if (lastState) {
            //streamDeck.logger.trace("Loading last state:", lastState);
            updateCanvasWithStatus(lastState.result, settings, false);
        } else {
            displayErrorMessage("Something Broke");
        }
    } else {
        saveLastState(result, settings);
        updateCanvasWithStatus(result, settings, true);
    }
}

function displayErrorMessage(message: string) {
    const canvas = PImage.make(144, 144);
    const ctx = canvas.getContext('2d');
    if (ctx) {
        drawBackground(ctx);
        drawErrorMessage(ctx, message);
        const outStream = new PassThrough();
        PImage.encodePNGToStream(canvas, outStream).then(() => {
            const jpegData: Buffer[] = [];
            outStream.on('data', (chunk) => jpegData.push(chunk));
            outStream.on('end', () => {
                const buf = Buffer.concat(jpegData);
                const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
                streamDeck.ui.current?.action.setImage(dataUrl);
            });
        });
    }
}

function setTitle(title: string) {
    streamDeck.ui.current?.action.setTitle(title);
}

function clearTitle() {
    streamDeck.ui.current?.action.setTitle("");
}

// Register and load the font
const font = PImage.registerFont("./font/source-sans-pro-regular.ttf", "SourceSansPro");
font.loadSync();

function updateCanvasWithStatus(result: any, settings: any, isNew: boolean) {
    const statusLines = prepareStatusLines(result, settings.fields, settings);
    const canvas = PImage.make(144, 144);
    const ctx = canvas.getContext('2d');

    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = "20pt 'SourceSansPro'";

        drawHeaderText(ctx);
        // Draw status text
        drawStatusText(ctx, statusLines);

        // Check if there's an image URL to draw
        const imageUrl = result.imageUrl;
        if (imageUrl) {
            streamDeck.logger.trace("Drawing Image from URL", imageUrl);
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

                    // Convert canvas to base64 and set image
                    const outStream = new PassThrough();
                    PImage.encodePNGToStream(canvas, outStream)
                        .then(() => {
                            const jpegData: Buffer[] = [];
                            outStream.on('data', (chunk) => jpegData.push(chunk));
                            outStream.on('end', () => {
                                const buf = Buffer.concat(jpegData);
                                const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
                                streamDeck.ui.current?.action.setImage(dataUrl);
                            });
                        })
                        .catch(err => {
                            streamDeck.logger.error("Error encoding PNG to stream:", err);
                        });
                })
                .catch(err => {
                    streamDeck.logger.error("Error loading image:", err);
                });
        } else {
            // If no image URL, just convert the canvas to base64 and set image
            const outStream = new PassThrough();
            PImage.encodePNGToStream(canvas, outStream)
                .then(() => {
                    const jpegData: Buffer[] = [];
                    outStream.on('data', (chunk) => jpegData.push(chunk));
                    outStream.on('end', () => {
                        const buf = Buffer.concat(jpegData);
                        const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
                        streamDeck.ui.current?.action.setImage(dataUrl);
                    });
                })
                .catch(err => {
                    streamDeck.logger.error("Error encoding PNG to stream:", err);
                });
        }
    }
}

function drawBackground(ctx: any) {
    PImage.decodePNGFromStream(fs.createReadStream('./imgs/plugin/bg.png')).then((bg) => {
        ctx.drawImage(bg, 0, 0);
    });
}

function drawErrorMessage(ctx: any, message: string) {
    ctx.fillStyle = 'red';
    ctx.font = 'bold 20pt SourceSansPro';
    ctx.clearRect(0, 0, 144, 144);
    ctx.fillText(message, 72, 50);
}


function drawHeaderText(ctx: any) {
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.fillText("Status", 72, 30); // Centered at the top
    //ctx.fillText("Status", 72, 50); // Centered below the first line
}
function drawStatusText(ctx: any, lines: any[]) {
    ctx.fillStyle = 'black'; // Default text color
    ctx.font = "24pt 'SourceSansPro'"; // Set font style
    ctx.textAlign = 'left'; // Align text to the left

    lines.forEach(({ text, color }, i) => {
        if (text) {
            ctx.fillStyle = color; // Set text color
            ctx.fillText(text, 10, 60 + 30 * i); // Draw text starting below the header
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


function prepareStatusLines(result: any, fields: string[], settings: any) {
    if (settings.displayMode === 'stats') {
        return [
            { text: `Live: ${result.current_live || 'N/A'}`, color: "#008000" },
            { text: `Fans: ${result.fans || 'N/A'}`, color: "yellow" },
            { text: `Funds: ${result.funds || 'N/A'}`, color: "red" }
        ];
    } else if (settings.displayMode === 'status') {
        return Object.keys(result).map(systemName => {
            const status = result[systemName] || 'N/A';
            return { text: `${status}`, color: "#008000" };
        });
    } else if (settings.displayMode === 'username') {
    return [
        { text: `${result.username || 'N/A'}`, color: "#008000" },
        { imageUrl: `${result.imageUrl || 'N/A'}` , color: "yellow" }, // Ensure imageUrl is set correctly
    ];
}

else if (settings.displayMode === 'ship') {
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
                const userImage = userProfile.image; // Extract the user's profile image URL

                // Pass the image URL directly to the callback
                callback({ username, imageUrl: userImage });
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
                        
                        // Pass the avatar URL directly to the callback
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
function saveLastState(result: any, settings: any) {
    const state = { result, settings };
    stateStore[settings] = state; // Save to in-memory store
    //streamDeck.logger.trace("Saved last state:", state);
}

function loadLastState(settings: any) {
    const state = stateStore[settings] || null; // Retrieve from in-memory store
    //streamDeck.logger.trace("Loaded last state:", state);
    return state;
}