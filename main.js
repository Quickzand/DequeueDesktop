const VERSION = "1.0.0";

const { app, BrowserWindow, Tray, Menu, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const os = require("os");
const fs = require("fs");
const http = require("http");
const robot = require("robotjs");
const bonjour = require("bonjour")();
const child_process = require("child_process");
const loudness = require("loudness");

const userDataPath = app.getPath("userData");
const codeFilePath = path.join(userDataPath, "code.txt");
const actionsFilePath = path.join(userDataPath, "actions.json");
const pageLayoutFilePath = path.join(userDataPath, "pageLayout.json");
const computerIDFilePath = path.join(userDataPath, "computerID.txt");

let tray = null;
let win = null;
let isQuitting = false; // Flag to indicate if the app is quitting

let comptuerID = "";

function createWindow() {
  win = new BrowserWindow({
    width: 250,
    height: 350,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win
    .loadFile("index.html")
    .catch((err) => console.error("Failed to load index.html:", err));

  win.on("close", (event) => {
    win = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  tray = new Tray("Gizmo Face.png");
  tray.setToolTip("This is my application.");
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Quit",
      click: () => {
        isQuitting = true; // Set the quitting flag
        console.log("QUITTING APP");
        app.quit();
      },
    },
  ]);

  tray.on("right-click", () => {
    tray.popUpContextMenu(contextMenu);
  });

  tray.on("click", () => {
    console.log(win);
    if (win) {
      win.isVisible() ? win.hide() : win.show();
    } else {
      createWindow();
    }
  });
  if (process.platform === "darwin") {
    // Check if the platform is macOS
    app.dock.hide(); // Hide the dock icon
  }

  autoUpdater.checkForUpdatesAndNotify();
});

autoUpdater.on("update-available", () => {
  // Notify your users that an update is available
});

autoUpdater.on("update-downloaded", (event, releaseNotes, releaseName) => {
  autoUpdater.quitAndInstall();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || isQuitting) {
    app.quit();
  }
});
const trayIconPath = path.join(__dirname, "Gizmo Face.png");

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", (event) => {
  console.log("Application is quitting");
  event.preventDefault();
  bonjour.unpublishAll(() => {
    bonjour.destroy();
    app.exit();
  });
});

var uniqueCode;

function generateUniqueCode() {
  uniqueCode = Math.floor(Math.random() * 9000) + 1000;
  return uniqueCode.toString();
}

function readOrCreateUniqueCode() {
  fs.readFile(codeFilePath, "utf8", (err, data) => {
    if (err) {
      const newCode = generateUniqueCode();
      fs.writeFile(codeFilePath, newCode, (err) => {
        if (err) {
          console.error("Error saving new code:", err);
        } else {
          console.log("New code generated and saved:", newCode);
        }
      });
    } else {
      console.log("Using existing code:", data);
      uniqueCode = data;
    }
  });
}

readOrCreateUniqueCode();

class Page {
  static maxColCount = 4;
  static maxRowCount = 6;
  constructor(actionIDs = []) {
    this.actions = actionIDs;
  }

  toJSON() {
    return { actions: this.actions };
  }
}

class Action {
  constructor(actionData) {
    this.name = actionData.name || "New Action";
    this.type = actionData.type || "key";
    this.key = actionData.key || "";
    this.ccKey = actionData.ccKey || "";
    this.modifiers = actionData.modifiers || {};
    this.ccModifiers = actionData.ccModifiers || {};
    this.icon = actionData.icon || "keyboard";
    this.color = actionData.color || "#FFFFFF";
    this.uid = actionData.uid || "0";
    this.nameVisible =
      actionData.nameVisible !== null ? actionData.nameVisible : true;
    this.siriShortcut = actionData.siriShortcut || "";
    this.ccSiriShortcut = actionData.ccSiriShortcut || "";
    this.text = actionData.text || "";
    this.textColor = actionData.textColor || "#FFFFFF";
    this.foregroundColor = actionData.foregroundColor || "#FFFFFF";
    this.displayType = actionData.displayType || "button";
    this.iconVisible =
      actionData.iconVisible !== null ? actionData.iconVisible : true;
    this.systemCommand = actionData.systemCommand || "";
    this.ccSystemCommand = actionData.ccSystemCommand || "";
    this.knobSensitivity = actionData.knobSensitivity || 50;
    this.textOpacity = actionData.textOpacity || 1;
    this.iconOpacity = actionData.iconOpacity || 1;
    this.backgroundOpacity = actionData.backgroundOpacity || 1;
  }
}

let pageLayouts = [];
let actions = {};

ipcMain.on("get-local-ip", (event) => {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === "IPv4" && !iface.internal) {
          event.returnValue = iface.address;
          return;
        }
      }
    }
    event.returnValue = "127.0.0.1";
  } catch (error) {
    console.error("Error getting local IP:", error);
    event.returnValue = "Error";
  }
});

ipcMain.on("get-unique-code", (event) => {
  fs.readFile(codeFilePath, "utf8", (err, data) => {
    if (err) {
      const uniqueCode = generateUniqueCode();
      fs.writeFile(codeFilePath, uniqueCode, (err) => {
        if (err) {
          console.error("Error writing unique code:", err);
          event.returnValue = "Error";
        } else {
          console.log("Unique code generated and saved:", uniqueCode);
          event.returnValue = uniqueCode;
        }
      });
    } else {
      event.returnValue = data;
    }
  });
});

function setupServer() {
  const server = http.createServer(handleRequest);

  // Listen on a random port
  server.listen(0, "0.0.0.0", () => {
    const address = server.address();
    const port = address.port;
    console.log(`Server listening on port ${port}`);

    // Now, advertise the service with the actual port
    advertiseService(port);
  });

  server.on("error", (err) => {
    console.error("Server encountered an error:", err);
  });
}

function advertiseService(port) {
  bonjour.publish({ name: "gizmo", type: "http", port: port });
  console.log(`Advertising service on port ${port}`);
}

function handleRequest(req, res) {
  switch (req.url) {
    case "/getDeviceInfo":
      handleGetDeviceInfo(req, res);
      break;
    case "/establishConnection":
      handleEstablishConnection(req, res);
      break;
    case "/createAction":
      handleCreateAction(req, res);
      break;
    case "/getActions":
      handleGetActions(req, res);
      break;
    case "/runAction":
      handleRunAction(req, res);
      break;
    case "/swapActions":
      handleSwapActions(req, res);
      break;
    case "/updateAction":
      handleUpdateAction(req, res);
      break;
    case "/getSiriShortcuts":
      handleGetSiriShortcuts(req, res);
      break;
    case "/getSystemCommands":
      handleGetSystemCommands(req, res);
      break;
    case "/deleteAction":
      handleDeleteAction(req, res);
      break;
    case "/resizeAction":
      handleResizeAction(req, res);
      break;
    default:
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      console.log("Not Found:", req.url);
  }
}

function handleResizeAction(req, res) {
  const code = req.headers["code"];
  if (code !== uniqueCode.toString()) {
    res.writeHead(401, { "Content-Type": "text/plain" });
    res.end("Unauthorized");
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", () => {
    try {
      const actionID = JSON.parse(body).actionID;
      const newSize = JSON.parse(body).newSize;
      const pageNum = JSON.parse(body).pageNum;
      resizeAction(actionID, newSize, pageNum);

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Action Resized");
    } catch (error) {
      console.error("Error handling /deleteAction:", error);
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Bad Request");
    }
  });
}

function resizeAction(actionID, newSize, pageNum) {
  // Find index of the action
  let actionIndex = -1;
  for (let i = 0; i < pageLayouts[pageNum].actions.length; i++) {
    if (pageLayouts[pageNum].actions[i] === actionID) {
      actionIndex = i;
      break;
    }
  }

  if (actionIndex === -1) {
    console.error("Action not found for resizing:", actionID);
    return;
  }

  // Calculate row and column position
  const rowPos = Math.floor(actionIndex / Page.maxColCount);
  const colPos = actionIndex % Page.maxColCount;

  // Check if action fits in the grid after resizing
  if (
    rowPos + newSize > Page.maxRowCount ||
    colPos + newSize > Page.maxColCount
  ) {
    console.error("Resized action does not fit in the grid");
    return;
  }

  // Clear all instances of the action
  pageLayouts[pageNum].actions = pageLayouts[pageNum].actions.map((id) =>
    id === actionID ? null : id
  );

  // Set the action in its new resized area
  for (let row = rowPos; row < rowPos + newSize; row++) {
    for (let col = colPos; col < colPos + newSize; col++) {
      let index = row * Page.maxColCount + col;
      pageLayouts[pageNum].actions[index] = actionID;
    }
  }

  // Save the updated layouts
  setPageLayouts();
}

function handleDeleteAction(req, res) {
  const code = req.headers["code"];
  if (code !== uniqueCode.toString()) {
    res.writeHead(401, { "Content-Type": "text/plain" });
    res.end("Unauthorized");
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", () => {
    try {
      const actionID = JSON.parse(body).actionID;
      deleteAction(actionID);

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Action Deleted");
    } catch (error) {
      console.error("Error handling /deleteAction:", error);
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Bad Request");
    }
  });
}

function handleGetSiriShortcuts(req, res) {
  const code = req.headers["code"];
  if (code === uniqueCode.toString()) {
    try {
      const shortcuts = child_process.execSync(`shortcuts list`).toString();
      // Put the shortcuts in an array
      // The first element is the header, so start at index 1
      const firstShortcutIndex = shortcuts.indexOf("Shortcut Name");
      const shortcutsArray = shortcuts
        .substring(firstShortcutIndex)
        .split("\n");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(shortcutsArray));
    } catch (error) {
      console.error("Error handling /getSiriShortcuts:", error);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  } else {
    res.writeHead(401, { "Content-Type": "text/plain" });
    res.end("Unauthorized");
  }
}

function handleGetSystemCommands(req, res) {
  const code = req.headers["code"];
  if (code === uniqueCode.toString()) {
    try {
      const systemCommands = [
        "Volume Increase",
        "Volume Decrease",
        "Toggle Mute",
        "Play / Pause",
        "Next Track",
        "Previous Track",
        "Increase Brightness",
        "Decrease Brightness",
      ];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(systemCommands));
    } catch (error) {
      console.error("Error handling /getSiriShortcuts:", error);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  } else {
    res.writeHead(401, { "Content-Type": "text/plain" });
    res.end("Unauthorized");
  }
}

function handleUpdateAction(req, res) {
  const code = req.headers["code"];
  if (code !== uniqueCode.toString()) {
    res.writeHead(401, { "Content-Type": "text/plain" });
    res.end("Unauthorized");
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", () => {
    try {
      const actionData = JSON.parse(body);
      const action = new Action(actionData);

      actions[action.uid] = action;
      setActions();

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Action Updated");
    } catch (error) {
      console.error("Error handling /updateAction:", error);
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Bad Request");
    }
  });
}

function handleGetDeviceInfo(req, res) {
  try {
    const computerName = os.hostname();
    res.writeHead(200, { "Content-Type": "text/plain" });
    output = {
      name: computerName,
      computerID: computerID,
      version: VERSION,
    };
    res.end(JSON.stringify(output));
  } catch (error) {
    console.error("Error handling /getDeviceInfo:", error);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
}

function handleSwapActions(req, res) {
  const code = req.headers["code"];
  if (code !== uniqueCode.toString()) {
    res.writeHead(401, { "Content-Type": "text/plain" });
    res.end("Unauthorized");
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", () => {
    try {
      const swapData = JSON.parse(body);
      const sourceActionID = swapData.source;
      const targetPage = swapData.targetPage;
      const targetIndex = swapData.targetIndex;

      swapAction(sourceActionID, targetPage, targetIndex);

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Action Swapped");
    } catch (error) {
      console.error("Error handling /swapActions:", error);
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Bad Request");
    }
  });
}

function swapAction(sourceActionID, targetPage, targetIndex) {
  // Ensure the target page exists
  if (!pageLayouts[targetPage]) {
    pageLayouts[targetPage] = new Page();
  }

  // Extend the target page's actions array if needed
  while (pageLayouts[targetPage].actions.length <= targetIndex) {
    pageLayouts[targetPage].actions.push(null);
  }

  // Get the action at the target position
  const targetActionID = pageLayouts[targetPage].actions[targetIndex];

  // If the target position is null, move the source action there and set all instances of the source action to null
  if (targetActionID === null) {
    pageLayouts.forEach((page) => {
      page.actions = page.actions.map((actionID) =>
        actionID === sourceActionID ? null : actionID
      );
    });
    pageLayouts[targetPage].actions[targetIndex] = sourceActionID;
  } else {
    // Swap all instances of the source action with the target action
    pageLayouts.forEach((page) => {
      page.actions = page.actions.map((actionID) => {
        if (actionID === sourceActionID) return targetActionID;
        if (actionID === targetActionID) return sourceActionID;
        return actionID;
      });
    });
  }

  setPageLayouts();
}

function handleEstablishConnection(req, res) {
  const code = req.headers["code"];
  if (code === uniqueCode.toString()) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(os.platform() === "darwin" ? "true" : "false");
  } else {
    res.writeHead(401, { "Content-Type": "text/plain" });
    res.end("Unauthorized");
  }
}

function handleCreateAction(req, res) {
  const code = req.headers["code"];
  if (code !== uniqueCode.toString()) {
    res.writeHead(401, { "Content-Type": "text/plain" });
    res.end("Unauthorized");
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", () => {
    try {
      const actionData = JSON.parse(body);
      const action = new Action(actionData);
      // Find the first empty slot in the action's page
      let page = pageLayouts[action.page ?? 0];
      if (!page) {
        page = new Page();
        pageLayouts[action.page ?? 0] = page;
      }
      let spaceFound = false;
      for (let i = 0; i < page.actions.length; i++) {
        if (!page.actions[i]) {
          page.actions[i] = action.uid;
          spaceFound = true;
          break;
        }
      }
      if (!spaceFound) {
        page.actions.push(action.uid);
      }

      actions[action.uid] = action;
      setActions();
      setPageLayouts();

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Action Created");
    } catch (error) {
      console.error("Error handling /createAction:", error);
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Bad Request");
    }
  });
}

function handleGetActions(req, res) {
  const code = req.headers["code"];
  if (code === uniqueCode.toString()) {
    // Map each page to an object with an 'actions' property

    returnData = {
      actions: actions,
      layout: pageLayouts,
    };
    console.log(returnData);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(returnData));
  } else {
    res.writeHead(401, { "Content-Type": "text/plain" });
    res.end("Unauthorized");
  }
}

function handleRunAction(req, res) {
  const code = req.headers["code"];
  if (code !== uniqueCode.toString()) {
    res.writeHead(401, { "Content-Type": "text/plain" });
    res.end("Unauthorized");
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", () => {
    try {
      temp = JSON.parse(body);
      var actionID = temp.actionID;
      var direction = temp.direction;
      console.log("Running action:", actionID);
      runAction(actionID, direction);

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Action Created");
    } catch (error) {
      console.error("Error handling /runAction:", error);
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Bad Request");
    }
  });
}

setupServer();
function setActions() {
  fs.writeFile(actionsFilePath, JSON.stringify(actions), (err) => {
    if (err) {
      console.error("Error saving to actions.json:", err);
    } else {
      console.log("Actions saved to actions.json");
    }
  });
}

function setPageLayouts() {
  fs.writeFile(pageLayoutFilePath, JSON.stringify(pageLayouts), (err) => {
    if (err) {
      console.error("Error saving to pageLayout.json:", err);
    } else {
      console.log("Page layouts saved to pageLayout.json");
    }
  });
}

function getActions() {
  fs.readFile(actionsFilePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading actions.json:", err);
      return;
    }
    try {
      actions = JSON.parse(data);
    } catch (parseErr) {
      console.error("Error parsing actions.json:", parseErr);
    }
  });
}

function getPageLayouts() {
  fs.readFile(pageLayoutFilePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading pageLayout.json:", err);
      return;
    }
    try {
      pageLayouts = JSON.parse(data);
    } catch (parseErr) {
      console.error("Error parsing pageLayout.json:", parseErr);
    }
  });
}

function deleteAction(actionID) {
  for (let i = 0; i < pageLayouts.length; i++) {
    let page = pageLayouts[i];
    for (let j = 0; j < page.actions.length; j++) {
      if (page.actions[j] === actionID) {
        page.actions[j] = null;
      }
    }
  }
  delete actions[actionID];
  setActions();
  setPageLayouts();

  console.error("Action not found for deletion:", actionID);
}

function runAction(actionID, direction) {
  action = actions[actionID];
  switch (action.type) {
    case "shortcut":
      if (direction == "clockwise") {
        let modifiersArray = Object.keys(action.modifiers)
          .filter((key) => action.modifiers[key])
          .map((key) => key.toLowerCase()); // Convert to lowercase
        if (action.displayType == "toggle") {
          console.log(action.key.toLowerCase());
          robot.keyToggle(action.key.toLowerCase(), "down", modifiersArray);
        } else {
          robot.keyTap(action.key.toLowerCase(), modifiersArray);
        }
      } else {
        let modifiersArray = Object.keys(action.ccModifiers)
          .filter((key) => action.ccModifiers[key])
          .map((key) => key.toLowerCase()); // Convert to lowercase)
        robot.keyTap(action.ccKey.toLowerCase(), modifiersArray);
      }
      break;
    case "siriShortcut":
      console.log("Running siri shortcut with command:", action.siriShortcut);
      try {
        if (direction == "clockwise") {
          child_process.execSync(`shortcuts run "${action.siriShortcut}"`);
        } else {
          child_process.execSync(`shortcuts run "${action.ccSiriShortcut}"`);
        }
      } catch (error) {
        console.error("Error running siri shortcut:", error);
      }
      break;
    case "text":
      robot.typeString(action.text);
      break;
    case "systemCommand":
      console.log("Running system command %s", action.systemCommand);
      if (direction == "clockwise") {
        runSystemCommand(action.systemCommand);
      } else {
        runSystemCommand(action.ccSystemCommand);
      }
      break;
    // Add additional action types here
  }
  return;
}

function runSystemCommand(command) {
  switch (command) {
    case "Volume Increase":
      robot.keyTap("audio_vol_up");
      console.log(`Increased volume by 10%`);
      break;
    case "Volume Decrease":
      robot.keyTap("audio_vol_down");
      console.log(`Volume Decreased`);
      break;
    case "Toggle Mute":
      loudness.getMuted().then((muted) => {
        loudness.setMuted(!muted);
        console.log(`Mute toggled`);
      });
      console.log("Toggled Mute");
      break;
    case "Play / Pause":
      robot.keyTap("audio_play");
      console.log("Play / Pause");
      break;
    case "Next Track":
      robot.keyTap("audio_next");
      console.log("Next Track");
      break;
    case "Previous Track":
      robot.keyTap("audio_prev");
      console.log("Previous Track");
      break;
    case "Increase Brightness":
      robot.keyTap("brightness_up");
      console.log("Increase Brightness");
      break;
    case "Decrease Brightness":
      robot.keyTap("brightness_down");
      console.log("Decrease Brightness");
      break;
    default:
      console.log("Unknown system command: ", command);
  }
}

async function changeVolume(changeBy) {
  try {
    // Get current volume
    const currentVolume = await loudness.getVolume();

    // Calculate new volume, ensuring it doesn't exceed 100
    let newVolume = currentVolume + changeBy;
    newVolume = Math.min(newVolume, 100);

    // Set the new volume
    await loudness.setVolume(newVolume);
    console.log(`Volume increased to ${newVolume}%`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

function getFirstIndexOfID(id, pageNum) {
  for (let i = 0; i < pageLayouts[pageNum].actions.length; i++) {
    if (pageLayouts[pageNum].actions[i] === id) {
      return i;
    }
  }
  return -1;
}

getActions();
getPageLayouts();

// Get the computer ID, or generate a new one if it doesn't exist
fs.readFile(computerIDFilePath, "utf8", (err, data) => {
  if (err) {
    // Make a really long UID string
    const newID = Array(64)
      .fill("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")
      .map(function (x) {
        return x[Math.floor(Math.random() * x.length)];
      })
      .join("");
    computerID = newID;
    fs.writeFile(computerIDFilePath, newID, (err) => {
      if (err) {
        console.error("Error saving new computer ID:", err);
      } else {
        console.log("New computer ID generated and saved:", newID);
      }
    });
  } else {
    console.log("Using existing computer ID:", data);
    computerID = data;
  }
});
