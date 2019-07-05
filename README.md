# flic-button-adapter
Flic button adapter for the [Mozilla IoT gateway](https://iot.mozilla.org).

Bridges the flic daemon to the gateway so it can interact with Flic buttons.

## Issues
- Does not work if any other service or adapter sends commands on the same
  bluetooth dongle/device, so you can not have the HomeKit adapter enabled.
- Only works out of the box on a Linux system without sudo password.

## Usage
When not on a Linux system without sudo password, start the flic daemon. See
https://github.com/50ButtonsEach for different daemons.

# Credits

This add-on was originally created by Martin Giger (@freaktechnik).
