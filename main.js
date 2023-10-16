const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
var robot = require("robotjs");
const child_process = require('child_process');



const userDataPath = app.getPath('userData');
const codeFilePath = path.join(userDataPath, 'code.txt');
const actionsFilePath = path.join(userDataPath, 'actions.json');


function createWindow() {
    // Create the browser window.
    const win = new BrowserWindow({
        width: 250,
        height: 350,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,  // Ensure this is set to false
            contextIsolation: true   // It's good to have this set to true when using contextBridge
        }

    })
    getActions();
    win.loadFile('index.html')
}

ipcMain.on('get-local-ip', (event) => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                event.returnValue = iface.address;
                return;
            }
        }
    }
    event.returnValue = '127.0.0.1';
});



ipcMain.on('get-unique-code', (event) => {
    fs.readFile(codeFilePath, 'utf8', function (err, data) {
        if (err) {
            // Generate a unique 4 digit code
            uniqueCode = Math.floor(Math.random() * 9000) + 1000;
            uniqueCode += ""
            fs.writeFile(codeFilePath, uniqueCode, (err) => {
                if (err) throw err;
                console.log('Code saved to uniqueCode.txt');
            }
            );
            event.returnValue = uniqueCode;
        }
        event.returnValue = data;
    });
});

app.whenReady().then(() => {
    createWindow()
})


// Check if there is a 4 digit code in code.txt
// If there is, use that code
// If there isn't, generate a new code and save it to code.txt
var uniqueCode;


const pageColCount = 3;
const pageRowCount = 5;

fs.readFile(codeFilePath, 'utf8', function (err, data) {
    if (err) {
        // if there is no code.txt, generate a new code and save it
        uniqueCode = Math.floor(Math.random() * 9000) + 1000;
        uniqueCode += ""
        fs.writeFile(codeFilePath, uniqueCode, (err) => {
            if (err) throw err;
            console.log('Code saved to code.txt');
        });
        console.log("Your code is " + uniqueCode)
    } else {
        // if there is a code.txt, use that code
        console.log("Your code is " + data)
        uniqueCode = data;
    }
}
);

class Page {
    // Create a new 2d array of nulls with the size of the page grid
    actions = new Array(pageRowCount).fill(null).map(() => new Array(pageColCount).fill(null));
}

class Action {
    name;
    type;
    key;
    modifiers;
    icon;


    constructor(jsonString) {
        var actionData;
        console.log("PARSING " + jsonString)
        try {
            actionData = JSON.parse(jsonString);
        } catch (error) {
            console.log(error)
            console.log(jsonString)
            return;
        }

        var actionName = actionData.name ? actionData.name : "New Action"

        var actionType = actionData.type ? actionData.type : "key"

        var actionKey = actionData.key ? actionData.key : "a"

        var actionModifiers = actionData.modifiers ? actionData.modifiers : []

        var actionIcon = actionData.icon ? actionData.icon : "keyboard"

        var actionColor = actionData.color ? actionData.color : "#FFFFFF"

        var row = actionData.row ? actionData.row : 0

        var col = actionData.col ? actionData.col : 0

        var page = actionData.page ? actionData.page : 0

        var uid = actionData.uid ? actionData.uid : "0"

        var siriShortcut = actionData.siriShortcut ? actionData.siriShortcut : ""

        var text = actionData.text ? actionData.text : ""

        console.log('name visible ' + actionData.nameVisible)
        var nameVisible = actionData.nameVisible != null ? actionData.nameVisible : true


        this.name = actionName;
        this.type = actionType;
        this.key = actionKey;
        this.modifiers = actionModifiers;
        this.icon = actionIcon;
        this.color = actionColor;
        this.uid = uid;
        this.nameVisible = nameVisible;
        this.siriShortcut = siriShortcut;
        this.text = text;

        return this


    }
}


class Group {
    constructor(jsonString) {
        var groupData;
        console.log("PARSING " + jsonString)
        try {
            groupData = JSON.parse(jsonString);
        } catch (error) {
            console.log(error)
            console.log(jsonString)
            return;
        }

        var name = groupData.name ? groupData.name : "New Group"
        var uid = groupData.uid ? groupData.uid : "0"
        var row = groupData.row ? groupData.row : 0
        var col = groupData.col ? groupData.col : 0
        var page = groupData.page ? groupData.page : 0



        this.name = name;
        this.actions = [];
        this.uid = uid;
        this.row = row;
        this.col = col;
        this.page = page;
    }
}


let actionPages = [];


const server = http.createServer((req, res) => {
    if (req.url === '/getDeviceInfo') {
        const computerName = os.hostname();
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(computerName);
    }
    else if (req.url === '/establishConnection') {
        // check if the code is correct
        const code = req.headers['code'];

        if (code === uniqueCode.toString()) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            // send wether or not the computer is a mac as a true or false string
            res.end(os.platform() === "darwin" ? "true" : "false");
        }
        else {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Unauthorized');
        }
    }
    else if (req.url === '/createAction') {
        const code = req.headers['code'];

        if (code === uniqueCode.toString()) {
            // Get actionData from the request body
            var body = '';
            req.on('data', function (data) {
                body += data;
            });

            req.on('end', function () {
                console.log("ACTION  " + body)
                action = new Action(body)
                // Add the button to the end of the page specified, if no slots are available, go to the next page, if no pages are available, create a new page
                if (actionPages.length === 0) {
                    actionPages.push(new Page());
                }
                var page = actionPages[page] ? actionPages[page] : actionPages[actionPages.length - 1];
                var row = 0;
                var col = 0;
                var pageFound = false;
                for (var i = 0; i < actionPages.length; i++) {
                    for (var j = 0; j < actionPages[i].actions.length; j++) {
                        for (var k = 0; k < actionPages[i].actions[j].length; k++) {
                            if (actionPages[i].actions[j][k] === null) {
                                page = actionPages[i];
                                row = j;
                                col = k;
                                pageFound = true;
                                break;
                            }
                        }
                        if (pageFound) {
                            break;
                        }
                    }
                    if (pageFound) {
                        break;
                    }
                }
                page.actions[row][col] = action;
                setActions(actionPages);
                res.writeHead(200, { 'Content-Type': 'text/plain' });
            });
        }
        else {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Unauthorized');
        }
    }
    else if (req.url === '/getActions') {
        const code = req.headers['code'];
        console.log("Transmitting actions to client ... ")

        if (code === uniqueCode.toString()) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(JSON.stringify(actionPages));
        }
        else {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Unauthorized');
        }
    }
    else if (req.url === '/createGroup') {
        const code = req.headers['code'];

        if (code === uniqueCode.toString()) {
            // Get actionData from the request body
            var body = '';
            req.on('data', function (data) {
                body += data;
            });

            req.on('end', function () {
                console.log("GROUP  " + body)
                group = new Group(body)

                page.actions[row][col] = group;
                setGroups(actionPages);
                res.writeHead(200, { 'Content-Type': 'text/plain' });
            });
        }
        else {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Unauthorized');
        }
    }
    else if (req.url === '/runAction') {
        const code = req.headers['code'];

        if (code === uniqueCode.toString()) {
            // Get actionData from the request body
            var body = '';
            req.on('data', function (data) {
                body += data;
            });

            req.on('end', function () {
                console.log("ACTION  " + body)
                try {
                    var actionID = JSON.parse(body);
                    runAction(actionID);
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end("Success");


                } catch (error) {
                    console.log(error)
                    console.log(body)
                    res.writeHead(400, { 'Content-Type': 'text/plain' });
                    res.end("Bad Request");
                }
            })
        }
        else {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Unauthorized');
        }
    }
    else if (req.url === '/deleteAction') {
        console.log("HERE")
        const code = req.headers['code'];

        if (code === uniqueCode.toString()) {
            // Get actionData from the request body
            var body = '';
            req.on('data', function (data) {
                body += data;
            });

            req.on('end', function () {
                console.log("ACTION  " + body)
                try {
                    var actionID = JSON.parse(body);
                    actionID = actionID.actionID;
                    console.log("DELETING ACTION " + actionID)
                    deleteAction(actionID);
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end("Success");
                }
                catch (error) {
                    console.log(error)
                    console.log(body)
                }
            })
        }

        else {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Unauthorized');
        }
    }
    else if (req.url === '/swapAction') {
        const code = req.headers['code'];

        if (code === uniqueCode.toString()) {
            // Get swap data from the request body
            console.log("SWAPPING ACTIONS")
            let body = '';
            req.on('data', function (data) {
                body += data;
            });

            req.on('end', function () {
                try {
                    const swapData = JSON.parse(body);
                    const {
                        source,
                        targetPage, targetRow, targetCol
                    } = swapData;

                    // Perform the action swap
                    swapActions(
                        source, targetPage, targetRow, targetCol
                    );
                    console.log("SWAP SUCCESSFUL")

                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end("Swap Successful");
                } catch (error) {
                    console.error(error);
                    res.writeHead(400, { 'Content-Type': 'text/plain' });
                    res.end("Bad Request");
                }
            });
        } else {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Unauthorized');
        }
    }
    else if (req.url === '/updateAction') {
        const code = req.headers['code'];

        if (code === uniqueCode.toString()) {
            // Get swap data from the request body
            let body = '';
            req.on('data', function (data) {
                body += data;
            });

            req.on('end', function () {
                try {
                    console.log("UPDATING ACTION WITH THIS DATA ")
                    console.log(body)
                    updateAction(new Action(body));
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end("Swap Successful");
                } catch (error) {
                    console.error(error);
                    res.writeHead(400, { 'Content-Type': 'text/plain' });
                    res.end("Bad Request");
                }
            });
        } else {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Unauthorized');
        }
    }
    else if (req.url === '/getSiriShortcuts') {
        const code = req.headers['code'];

        if (code === uniqueCode.toString()) {
            // Get swap data from the request body
            let body = '';
            req.on('data', function (data) {
                body += data;
            });

            req.on('end', function () {
                try {
                    console.log("Getting siri shortcuts")
                    var shortcuts = getSiriShortcutsOnMachine();
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end(JSON.stringify(shortcuts));
                } catch (error) {
                    console.error(error);
                    res.writeHead(400, { 'Content-Type': 'text/plain' });
                    res.end("Bad Request");
                }
            });
        } else {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Unauthorized');
        }
    }
    else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        console.log("NOT FOUND " + req.url)
    }
});

server.listen(2326, () => {
    console.log('Server listening on port 2326');
});


// Gets actions from action.json
function getActions() {
    fs.readFile(actionsFilePath, 'utf8', function (err, data) {
        if (err) {
            console.log('Error reading actions.json:', err);
            return;
        }

        if (!data) {
            console.log('actions.json is empty or not properly formatted.');
            return;
        }

        try {
            actionPages = JSON.parse(data);
            // turn the json into Action objects 

            for (var i = 0; i < actionPages.length; i++) {
                for (var j = 0; j < actionPages[i].actions.length; j++) {
                    for (var k = 0; k < actionPages[i].actions[j].length; k++) {
                        if (actionPages[i].actions[j][k] === null)
                            continue;
                        actionPages[i].actions[j][k] = new Action(JSON.stringify(actionPages[i].actions[j][k]));
                    }
                }
            }
        } catch (parseErr) {
            console.log('Error parsing actions.json:', parseErr);
        }
    });
}

function setActions(newActions) {
    fs.writeFile(actionsFilePath, JSON.stringify(newActions), (err) => {
        if (err) {
            console.error('Error saving to actions.json:', err);
            return;
        }
        console.log('Actions saved to actions.json');
    });
}






function updateAction(newActionData) {
    // Find the action witth the matching ID and replace it with the new action data
    var actionFound = false;
    for (var i = 0; i < actionPages.length; i++) {
        for (var j = 0; j < actionPages[i].actions.length; j++) {
            for (var k = 0; k < actionPages[i].actions[j].length; k++) {
                if (actionPages[i].actions[j][k] === null)
                    continue;
                if (actionPages[i].actions[j][k].uid === newActionData.uid) {
                    actionFound = true;
                    action = actionPages[i].actions[j][k];
                    actionPages[i].actions[j][k] = newActionData;
                    break;
                }
            }
            if (actionFound)
                break;
        }
        if (actionFound)
            break;
    }

    // now save 
    console.log("HERE")
    setActions(actionPages);
    console.log("THERE")
}




function searchForAction(actionID) {
    // run through all actions and find the one with the matching ID
    var actionFound = false;
    var action;
    for (var i = 0; i < actionPages.length; i++) {
        for (var j = 0; j < actionPages[i].actions.length; j++) {
            for (var k = 0; k < actionPages[i].actions[j].length; k++) {
                if (actionPages[i].actions[j][k] === null)
                    continue;
                if (actionPages[i].actions[j][k].uid === actionID) {
                    actionFound = true;
                    action = actionPages[i].actions[j][k];
                    break;
                }
            }
            if (actionFound)
                break;
        }
        if (actionFound)
            break;
    }
    if (!actionFound) {
        console.log("Action " + actionID + " not found")
        return;
    }
    return action;
}


function searchForLocationOfAction(actionID) {
    // run through all actions and find the one with the matching ID
    var actionFound = false;
    var action;
    var page;
    var row;
    var col;
    for (var i = 0; i < actionPages.length; i++) {
        for (var j = 0; j < actionPages[i].actions.length; j++) {
            for (var k = 0; k < actionPages[i].actions[j].length; k++) {
                if (actionPages[i].actions[j][k] === null)
                    continue;
                if (actionPages[i].actions[j][k].uid === actionID) {
                    actionFound = true;
                    action = actionPages[i].actions[j][k];
                    page = i;
                    row = j;
                    col = k;
                    break;

                }
            }
            if (actionFound)
                break;
        }
        if (actionFound)
            break;
    }
    if (!actionFound) {
        console.log("Action " + actionID + " not found")
        return;
    }
    return { page: page, row: row, col: col };
}

function runAction(actionID) {
    actionID = actionID.actionID;
    console.log("RUNNING ACTION " + actionID)
    var action = searchForAction(actionID);
    if (!action)
        return;

    console.log(action)
    if (action.type === "shortcut") {
        // ACTUALLY RUN THE SHORTCUT
        console.log("RUNNING SHORTCUT")
        var key = action.key.toLowerCase();
        var modifiers = [];

        // Convert the modifiers object to an array format that robot.js expects
        for (var modifier in action.modifiers) {
            if (action.modifiers[modifier]) {
                modifiers.push(modifier.toLowerCase()); // robot.js expects lowercase modifier names
            }
        }
        console.log(key)
        console.log(modifiers)

        // Execute the shortcut
        robot.keyTap(key, modifiers);
    }
    else if (action.type === "siriShortcut") {
        console.log("RUNNING SIRI SHORTCUT \"" + action.siriShortcut + "\"")
        child_process.execSync("shortcuts run \"" + action.siriShortcut + "\"");
    }
    else if (action.type == "text") {
        console.log("TYPING TEXT \"" + action.text + "\"")
        robot.typeString(action.text);
    }


}


function deleteAction(actionID) {
    console.log("Attempting to delete action ... " + actionID)
    // run through all actions and find the one with the matching ID
    var actionFound = false;
    var action;
    for (var i = 0; i < actionPages.length; i++) {
        for (var j = 0; j < actionPages[i].actions.length; j++) {
            for (var k = 0; k < actionPages[i].actions[j].length; k++) {
                if (actionPages[i].actions[j][k] === null)
                    continue;
                if (actionPages[i].actions[j][k].uid === actionID) {
                    actionFound = true;
                    action = actionPages[i].actions[j][k];
                    break;
                }
            }
            if (actionFound)
                break;
        }
        if (actionFound)
            break;
    }
    if (!actionFound) {
        console.log("Action " + actionID + " not found")
        return;
    }
    console.log(action)
    actionPages[i].actions[j][k] = null;
    setActions(actionPages);
    return;

}

function swapActions(source, targetPage, targetRow, targetCol) {
    // Check for out of bounds
    if (!actionPages[targetPage] || !actionPages[targetPage].actions[targetRow]) {
        return -1;
    }

    // Get the source action
    sourceLocation = searchForLocationOfAction(source);
    if (!sourceLocation) {
        return -1;
    }

    sourcePage = sourceLocation.page;
    sourceRow = sourceLocation.row;
    sourceCol = sourceLocation.col;

    // Do the swap
    const temp = actionPages[sourcePage].actions[sourceRow][sourceCol];
    actionPages[sourcePage].actions[sourceRow][sourceCol] = actionPages[targetPage].actions[targetRow][targetCol];
    actionPages[targetPage].actions[targetRow][targetCol] = temp;

    // Persist the swapped actions
    setActions(actionPages);
    return 1
}

function getSiriShortcutsOnMachine() {
    var shortcuts = []
    child_process.execSync("shortcuts list").toString().split("\n").forEach(function (line) {
        if (line === "")
            return;
        shortcuts.push(line)
    });
    return shortcuts
}

getSiriShortcutsOnMachine()