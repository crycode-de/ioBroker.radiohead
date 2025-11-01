![Logo](admin/radiohead.png)

# ioBroker.radiohead

[![NPM version](https://img.shields.io/npm/v/iobroker.radiohead.svg)](https://www.npmjs.com/package/iobroker.radiohead)
[![Downloads](https://img.shields.io/npm/dm/iobroker.radiohead.svg)](https://www.npmjs.com/package/iobroker.radiohead)
![Number of Installations (latest)](https://iobroker.live/badges/radiohead-installed.svg)
![Number of Installations (stable)](https://iobroker.live/badges/radiohead-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.radiohead.png?downloads=true)](https://nodei.co/npm/iobroker.radiohead/)

**Tests:** ![Test and Release](https://github.com/crycode-de/iobroker.radiohead/workflows/Test%20and%20Release/badge.svg)

## RadioHead adapter for ioBroker

This is an ioBroker-Adapter to integrate a RadioHead network using a serial interface.

[RadioHead](http://www.airspayce.com/mikem/arduino/RadioHead/) is a open source Packet Radio library for embedded microprocessors. It provides addressed, reliable, retransmitted, acknowledged variable length messages.

* **[Description in English](./docs/en/radiohead.md)**

---

Dies ist ein ioBroker-Adapter zur Integration eines RadioHead Netzwerkes über eine serielle Schnittstelle.

[RadioHead](http://www.airspayce.com/mikem/arduino/RadioHead/) ist eine Open Source paketbasierte Funkmodul-Bibliothek für Mikroprozessoren. Es bietet adressierte, zuverlässige, wiederholt übertragene und bestätigte Nachrichten in variabler Länge.

* **[Beschreibung in Deutsch](./docs/de/radiohead.md)**

---

**This adapter uses Sentry libraries to automatically report exceptions and code errors to the developers.** For more details and for information how to disable the error reporting see [Sentry-Plugin Documentation](https://github.com/ioBroker/plugin-sentry#plugin-sentry)! Sentry reporting is used starting with js-controller 3.0.

## Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->
### **WORK IN PROGRESS**

* (crycode-de) Node.js >= 20, js-controller >= 6.0.11, Admin >= 7.6.17 required
* (crycode-de) Updated to latest ioBroker adapter toolset
* (crycode-de) Updated dependencies and fixed resulting issues
* (crycode-de) Updated Sentry DSN

### 1.3.0 (2022-01-07)

* (crycode-de) Handling of serial port close events
* (crycode-de) Try to reinitialize the serial port on close/errors
* (crycode-de) Fixed spelling of indicator role
* (crycode-de) Log messages now starts with an uppercase letter
* (crycode-de) Debug log RHS version on adapter startup
* (crycode-de) Some internal refracturing
* (crycode-de) Updated dependencies

### 1.2.0 (2021-09-17)

* (crycode-de) Use stringified json for data.incoming state

### 1.1.1 (2021-01-09)

* (crycode-de) Small fixes
* (crycode-de) Updated dependencies

### 1.1.0 (2020-12-23)

* (crycode-de) Added Sentry error reporting
* (crycode-de) Updated dependencies
* (crycode-de) Compatibility with Node.js 14.x
* (crycode-de) Optimized npm package

### 1.0.7 (2020-06-01)

* (crycode-de) Fixed bug on deleting incoming data entries.

### 1.0.5 (2020-04-14)

* (crycode-de) Fixed bug in grouping in/out data.
* (crycode-de) Added missing translations.
* (crycode-de) Fixed bug with promiscuous mode.
* (crycode-de) Updated dependencies.

### 1.0.4 (2020-02-03)

* (crycode-de) Updated connectionType and dataSource in io-package.json.

### 1.0.3 (2020-01-23)

* (crycode-de) Better handling of changed objects in admin.
* (crycode-de) Added `connectionType` in `io-package.json` and updated dependencies.

### 1.0.2 (2019-09-08)

* (crycode-de) dependency updates and bugfixes

### 1.0.1 (2019-07-30)

* (crycode-de) license  update

### 1.0.0 (2019-07-28)

* (crycode-de) initial release

## License

GNU General Public License Version 2

Copyright (c) 2019-2025 Peter Müller <peter@crycode.de>

See [LICENSE](./LICENSE) for details.
