"use strict";

const path = require("path");
const childProcess = require("child_process");
const flic = require("./fliclib-linux-hci/clientlib/nodejs/fliclibNodeJs.js");

let Adapter, Device, Property, Event;
try {
    Adapter = require('../adapter');
    Device = require('../device');
    Property = require('../property');
    Event = require('../event');
}
catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') {
        throw e;
    }

    const gwa = require('gateway-addon');
    Adapter = gwa.Adapter;
    Device = gwa.Device;
    Property = gwa.Property;
    Event = gwa.Event;
}

class ReadonlyProperty extends Property {
    constructor(device, name, description, value) {
        description.writable = false;
        super(device, name, description, value);
    }

    setValue(value) {
        return Promise.reject("Read only property");
    }
}

class FlicButton extends Device {
    constructor(adapter, bdAddr, cc, client, name) {
        super(adapter, bdAddr);
        if(name) {
            this.name = name;
        }
        this.cc = cc;
        //this["@type"] = [ "MultiLevelSensor" ];

        this.properties.set('battery', new ReadonlyProperty(this, 'battery', {
            type: 'number',
            unit: 'percent'
        }));

        this.addEvent('click', {
            type: "string",
            name: 'clickType'
        });

        this.cc.on("buttonSingleOrDoubleClickOrHold", (clickType) => {
            console.log(clickType);
            this.eventNotify(new Event(this, 'click', clickType));
        });

        this.batteryStatusListener = new flic.FlicBatteryStatusListener(bdAddr);
        this.batteryStatusListener.on('batteryStatus', (percentage) => {
            const prop = this.findProperty('battery');
            prop.setCachedValue(percentage);
            this.notifyPropertyChanged(property);
        });

        this.adapter.client.addBatteryStatusListener(this.batteryStatusListener);

        this.adapter.handleDeviceAdded(this);
    }
}

class FlicAdapter extends Adapter {
    static get PORT() {
        return "5551";
    }

    static getBinaryFolder() {
        switch(process.arch) {
            case 'arm':
            case 'arm64':
                return 'armv6l';
            case 'ia32':
            case 'x32':
                return 'i386';
            case 'x64':
                return 'x86_64';
            default:
                throw new Error("Platform " + process.arch + " not supported");
        }
    }

    static getBinaryPath() {
        if(process.platform !== 'linux') {
            throw new Error("No binary bundled for this platform");
        }
        const folder = this.getBinaryFolder();
        return path.join(__dirname, 'fliclib-linux-hci', 'bin', folder, 'flicd');
    }

    constructor(addonManager, packageName, config) {
        super(addonManager, 'FlicButtonAdapter', packageName);
        addonManager.addAdapter(this);

        this.startDaemon();
        if(this.flicd) {
            this.client = new flic.FlicClient("localhost", FlicAdapter.PORT);

            this.client.once("ready", () => {
                this.client.getInfo((info) => {
                    for(const bdAddr of info.bdAddrOfVerifiedButtons) {
                        this.addDevice(bdAddr);
                    }
                });
            });
        }
    }

    startDaemon() {
        if(process.platform !== 'linux') {
            console.warn("You have to manually start the flic daemon");
            return;
        }

        const binaryPath = FlicAdapter.getBinaryPath();
        const args = [
            '-f=flicdb.sqlite',
            '-p ' + FlicAdapter.PORT,
            '-w'
        ];
        this.flicd = childProcess.execFile(binaryPath, args, {
            cwd: __dirname,
            env: process.env,
            uid: 0,
            gid: 0
        }, (e) => {
            this.flicd = undefined;
            console.error(e);
            this.unload();
        });
        this.hasDaemon = true;
    }

    async addDevice(bdAddr, name) {
        const cc = new flic.FlicConnectionChannel(bdAddr);
        let timeout;
        const p = new Promise((resolve, reject) => {
            cc.on("createResponse", function(error, connectionStatus) {
                if(connectionStatus == "Ready") {
                    // Got verified by someone else between scan result and this event
                    resolve(cc);
                }
                else if(error != "NoError") {
                    reject("Too many pending connections");
                }
                else {
                    console.log("Found a public button. Now connecting...");
                    timeout = setTimeout(function() {
                        client.removeConnectionChannel(cc);
                    }, 30 * 1000);
                }
            });
            cc.on("connectionStatusChanged", function(connectionStatus, disconnectReason) {
                if (connectionStatus == "Ready") {
                    resolve(cc);
                }
            });
            cc.on("removed", function(removedReason) {
                if (removedReason == "RemovedByThisClient") {
                    reject("Timed out");
                }
                else {
                    reject(removedReason);
                }
            });
        });
        try {
            const cc = await p;
        }
        catch(e) {
            console.error(e);
        }
        finally {
            if(timeout) {
                clearTimeout(timeout);
            }
        }
        new FlicButton(this, bdAddr, cc, name);
    }

    startPairing(timeoutSeconds) {
        if(!this.timeout) {
            this.scanner = new flic.FlicScanner();

            this.timeout = setTimeout(() => this.cancelPairing(), timeoutSeconds * 1000);

            this.scanner.on("advertisementPacket", (bdAddr, name, rssi, isPrivate, alreadyVerified) => {
                if (isPrivate) {
                    console.log("Your button", name, "is private. Hold down for 7 seconds to make it public.");
                    return;
                }
                this.addDevice(bdAddr, name);
            });
            this.client.addScanner(this.scanner);
        }
    }

    cancelPairing() {
        this.client.removeScanner(this.scanner);
        clearTimeout(this.timeout);
        this.timeout = undefined;
    }

    unload() {
        if(this.client) {
            this.client.close();
        }
        if(this.flicd) {
            this.flicd.kill();
        }
        super.unload();
    }
}

module.exports = (addonManager, manifest) => {
    const adapter = new FlicAdapter(addonManager, manifest.name);
};
