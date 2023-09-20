// Open a port on 2326 and listen for connections
const http = require('http');
const os = require('os');
const fs = require('fs');

// Check if there is a 4 digit code in code.txt
// If there is, use that code
// If there isn't, generate a new code and save it to code.txt
var uniqueCode;


const pageColCount = 3;
const pageRowCount = 5;

fs.readFile('code.txt', 'utf8', function (err, data) {
    if (err) {
        // if there is no code.txt, generate a new code and save it
        uniqueCode = Math.floor(Math.random() * 9000) + 1000;
        uniqueCode += ""
        fs.writeFile('code.txt', uniqueCode, (err) => {
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
            res.end('Success');
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
                try {
                    var actionData = JSON.parse(body);
                } catch (error) {
                    console.log(error)
                    console.log(body)
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



                var action = new Action();
                action.name = actionName;
                action.type = actionType;
                action.key = actionKey;
                action.modifiers = actionModifiers;
                action.icon = actionIcon;
                action.color = actionColor;
                action.uid = uid;
                getActions();
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

        if (code === uniqueCode.toString()) {
            getActions();
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(JSON.stringify(actionPages));
        }
        else {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('Unauthorized');
        }
    }
    else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

server.listen(2326, () => {
    console.log('Server listening on port 2326');
});


// Gets actions from action.json
function getActions() {
    fs.readFile('actions.json', 'utf8', function (err, data) {
        if (err) {
            console.log(err);
        } else {
            actionPages = JSON.parse(data);
        }
    });
}

function setActions(newActions) {
    fs.writeFile('actions.json', JSON.stringify(newActions), (err) => {
        if (err) throw err;
        console.log('Actions saved to actions.json');
    });

}