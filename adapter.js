'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const manifest = require('./manifest.json');
const mkdirp = require('mkdirp');
const os = require('os');
const path = require('path');

const {
  Adapter,
  Database,
  Device,
  Event,
  Property,
} = require('gateway-addon');

const flic = require(path.join(__dirname,
                               'fliclib-linux-hci',
                               'clientlib',
                               'nodejs',
                               'fliclibNodeJs.js'));

function getDataPath(dataDir) {
  if (dataDir) {
    return path.join(dataDir, 'flic-button-adapter');
  }

  let profileDir;
  if (process.env.hasOwnProperty('MOZIOT_HOME')) {
    profileDir = process.env.MOZIOT_HOME;
  } else {
    profileDir = path.join(os.homedir(), '.mozilla-iot');
  }

  return path.join(profileDir, 'data', 'flic-button-adapter');
}

function getConfigPath(configDir) {
  if (configDir) {
    return configDir;
  }

  if (process.env.hasOwnProperty('MOZIOT_HOME')) {
    return path.join(process.env.MOZIOT_HOME, 'config');
  }

  return path.join(os.homedir(), '.mozilla-iot', 'config');
}

function getBinaryPath() {
  return path.join(__dirname, 'fliclib-linux-hci', 'bin', 'flicd');
}

class ReadOnlyProperty extends Property {
  constructor(device, name, description, value) {
    description.readOnly = true;
    super(device, name, description);
    this.setCachedValue(value);
  }

  setValue() {
    return Promise.reject('Read-only property');
  }
}

class FlicButton extends Device {
  constructor(adapter, bdAddr, cc, client, name) {
    super(adapter, `flic-${bdAddr}`);
    if (name) {
      this.name = name;
    } else {
      this.name = `Flic button ${bdAddr}`;
    }
    this.bdAddr = bdAddr;
    this.cc = cc;
    this['@type'] = ['PushButton'];

    this.properties.set('battery', new ReadOnlyProperty(this, 'battery', {
      type: 'number',
      unit: 'percent',
      title: 'Battery Level',
      '@type': 'LevelProperty',
    }, 100));
    this.properties.set('pushed', new ReadOnlyProperty(this, 'pushed', {
      type: 'boolean',
      '@type': 'PushedProperty',
      title: 'Pushed',
    }, false));

    this.addEvent('hold', {
      '@type': 'LongPressedEvent',
      title: 'Hold',
    });
    this.addEvent('doubleClick', {
      '@type': 'DoublePressedEvent',
      title: 'Double click',
    });
    this.addEvent('singleClick', {
      '@type': 'PressedEvent',
      title: 'Single click',
    });

    this.cc.on('buttonUpOrDown', (clickType) => {
      const property = this.findProperty('pushed');
      property.setCachedValue(clickType === 'ButtonDown');
      this.notifyPropertyChanged(property);
    });

    this.cc.on('buttonSingleOrDoubleClickOrHold', (clickType) => {
      switch (clickType) {
        case 'ButtonHold':
          this.eventNotify(new Event(this, 'hold'));
          break;
        case 'ButtonDoubleClick':
          this.eventNotify(new Event(this, 'doubleClick'));
          break;
        case 'ButtonSingleClick':
          this.eventNotify(new Event(this, 'singleClick'));
          break;
      }
    });

    this.batteryStatusListener = new flic.FlicBatteryStatusListener(bdAddr);
    this.batteryStatusListener.on('batteryStatus', (percentage) => {
      const prop = this.findProperty('battery');
      prop.setCachedValue(percentage);
      this.notifyPropertyChanged(prop);
    });

    this.adapter.client.addBatteryStatusListener(this.batteryStatusListener);

    this.adapter.handleDeviceAdded(this);
  }

  unload() {
    this.cc.removeAllListeners('buttonUpOrDown');
    this.adapter.client.removeConnectionChannel(this.cc);
    this.adapter.client.removeBatteryStatusListener(this.batteryStatusListener);
  }
}

class FlicButtonAdapter extends Adapter {
  static get PORT() {
    return 5551;
  }

  constructor(addonManager, reportError) {
    super(addonManager, manifest.id, manifest.id);
    this.ready = false;
    this.connecting = new Set();

    this.db = new Database(manifest.id);
    this.db.open().then(() => {
      return this.db.loadConfig();
    }).then((config) => {
      this.config = config;

      this.startDaemon(
        this.config.device,
        (e) => reportError(manifest.id, e)
      );

      this.flicdReady.then(() => {
        this.client = new flic.FlicClient('localhost', FlicButtonAdapter.PORT);
        this.client.once('error', (e) => {
          console.error(e);
          this.client.close();
          delete this.client;
          this.ready = false;
          if (this.flicd) {
            reportError(
              manifest.id,
              // eslint-disable-next-line max-len
              'Error connecting to local flic daemon. Possibly couldn\'t bind to its port or the Bluetooth device.'
            );
          } else {
            reportError(
              manifest.id,
              // eslint-disable-next-line max-len
              `Could not connect to flic daemon. Please start it on port ${FlicButtonAdapter.PORT} and reload this add-on.`
            );
          }
        });
        this.client.once('ready', () => {
          this.client.getInfo((info) => {
            for (const bdAddr of info.bdAddrOfVerifiedButtons) {
              // eslint-disable-next-line no-undefined
              this.addDevice(bdAddr, undefined, false);
            }
          });
          addonManager.addAdapter(this);
          this.ready = true;
        });
      });
    }).catch(console.error);
  }

  startDaemon(device, reportError) {
    const binaryPath = getBinaryPath();

    const dataDir = getDataPath(this.userProfile.dataDir);
    const dbPath = path.join(dataDir, 'flicdb.sqlite');
    if (!fs.existsSync(dataDir)) {
      mkdirp.sync(dataDir, {mode: 0o755});
    }

    // Move database, if necessary
    const oldDbPath = path.join(
      getConfigPath(this.userProfile.configDir),
      'flicdb.sqlite'
    );
    if (fs.existsSync(oldDbPath)) {
      fs.renameSync(oldDbPath, dbPath);
    }

    this.flicd = childProcess.spawn(
      'sudo',
      [
        '-n', // we can't have any interaction for this.
        binaryPath,
        '-f',
        dbPath,
        '-p',
        FlicButtonAdapter.PORT,
        '-w',
        '-h',
        device,
      ],
      {
        cwd: __dirname,
        env: process.env,
      });

    if (this.flicd.error) {
      console.error(this.flicd.error);
      delete this.flicd;
      this.unload();
      reportError('Could not start the flic daemon. Please check the logs.');
    }

    this.flicd.stdout.on('data', (data) => {
      console.log(`flicd[stdout]: ${data}`);
    });

    this.flicdReady = new Promise((resolve) => {
      this.flicd.stderr.on('data', (data) => {
        console.log(`flicd[stderr]: ${data}`);
        if (data.indexOf('Flic server is now up and running') > -1) {
          resolve();
        }
      });
    });

    this.flicd.on('exit', (code) => {
      delete this.flicd;
      console.log(`flicd: exited with status ${code}`);
      // TODO: instead unset the client here and don't unload so it reports a
      // pairingError
      this.unload();
      if (!this.client) {
        reportError('Could not start the flic daemon. Please check the logs.');
      }
    });
  }

  async addDevice(bdAddr, name, tryToConnect = true) {
    if (`flic-${bdAddr}` in this.devices || this.connecting.has(bdAddr)) {
      return;
    }
    const cc = new flic.FlicConnectionChannel(bdAddr);
    if (tryToConnect) {
      let timeout;
      this.connecting.add(bdAddr);
      const p = new Promise((resolve, reject) => {
        cc.on('createResponse', function(error, connectionStatus) {
          if (connectionStatus == 'Ready') {
            // Got verified by someone else between scan result and this event
            resolve(cc);
          } else if (error != 'NoError') {
            reject('Too many pending connections');
          } else {
            timeout = setTimeout(function() {
              this.client.removeConnectionChannel(cc);
            }, 30 * 1000);
          }
        });
        cc.on('connectionStatusChanged', function(connectionStatus) {
          if (connectionStatus == 'Ready') {
            resolve(cc);
          }
        });
        cc.on('removed', function(removedReason) {
          if (removedReason == 'RemovedByThisClient') {
            reject('Timed out');
          } else {
            reject(removedReason);
          }
        });
      });
      try {
        this.client.addConnectionChannel(cc);
        await p;
      } catch (e) {
        console.error(e);
        this.client.removeConnectionChannel(cc);
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
        cc.removeAllListeners('createResponse');
        cc.removeAllListeners('connectionStatusChanged');
        cc.removeAllListeners('removed');
        this.connecting.delete(bdAddr);
      }
    } else {
      this.client.addConnectionChannel(cc);
    }
    new FlicButton(this, bdAddr, cc, name);
  }

  removeThing(thing) {
    thing.unload();
    this.client.deleteButton(thing.bdAddr);
    super.removeThing(thing);
  }

  startPairing(timeoutSeconds) {
    if (!this.timeout) {
      this.scanner = new flic.FlicScanner();

      this.timeout =
        setTimeout(() => this.cancelPairing(), timeoutSeconds * 1000);

      const promptedDevices = new Set();
      this.scanner.on(
        'advertisementPacket',
        (bdAddr, name, rssi, isPrivate) => {
          if (isPrivate) {
            if (!promptedDevices.has(bdAddr)) {
              console.warn(
                name || bdAddr,
                'is already paired. Press the button 7 for seconds to make it',
                'available for pairing.'
              );
              promptedDevices.add(bdAddr);
            }
            return;
          }
          promptedDevices.delete(bdAddr);
          this.addDevice(bdAddr, name);
        }
      );
      this.client.addScanner(this.scanner);
    }
  }

  cancelPairing() {
    if (this.client) {
      this.client.removeScanner(this.scanner);
    }
    clearTimeout(this.timeout);
    delete this.timeout;
    this.connecting.clear();
  }

  async unload() {
    if (this.client) {
      console.log('Disconnecting client');
      this.client.close();
    }

    if (this.flicd) {
      console.log('Killing flicd');
      await new Promise((resolve, reject) => {
        this.flicd.once('exit', resolve);
        this.flicd.once('error', reject);
        // We have to kill it with sudo because raspbian's SELinux makes
        // the sudo be owned by root, so we can't kill it as normal user.
        // Killing the child process of sudo, since somehow sudo doesn't
        // want to be killed with child.
        childProcess.spawnSync('sudo', [
          '-n',
          'pkill',
          '-9',
          '-P',
          this.flicd.pid,
        ]);
      });
    }

    return super.unload();
  }
}

module.exports = (addonManager, _, reportError) => {
  new FlicButtonAdapter(addonManager, reportError);
};
