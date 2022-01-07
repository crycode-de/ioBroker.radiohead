"use strict";
/**
 * RadioHead adapter for ioBroker
 *
 * Copyright (c) 2019-2022 Peter Müller <peter@crycode.de>
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils = require("@iobroker/adapter-core");
const core_decorators_1 = require("core-decorators");
const radiohead_serial_1 = require("radiohead-serial");
const tools_1 = require("./lib/tools");
const infoCounters = ['receivedCount', 'retransmissionsCount', 'sentErrorCount', 'sentOkCount'];
class RadioheadAdapter extends utils.Adapter {
    /**
     * Constructor to create a new instance of the adapter.
     * @param options The adapter options.
     */
    constructor(options = {}) {
        super(Object.assign(Object.assign({}, options), { name: 'radiohead' }));
        /**
         * Address of this instance in the RadioHead network.
         */
        this.address = 0x00;
        /**
         * Instance of the used RadioHeadSerial class
         * or `null` if not initialized.
         */
        this.rhs = null;
        /**
         * Counter for received RadioHead messages.
         */
        this.receivedCount = 0;
        /**
         * Counter for retransmitted RadioHead messages.
         */
        this.retransmissionsCount = 0;
        /**
         * Counter for falsy sent / not sent RadioHead messages.
         */
        this.sentErrorCount = 0;
        /**
         * Counter for successfully sent RadioHead messages.
         */
        this.sentOkCount = 0;
        /**
         * Internal storage for the retransmissions counter on instance start.
         * Used to calculate the total retransmissions count.
         */
        this.retransmissionsCountStart = 0;
        /**
         * Array of Objects for the incoming data matcher.
         */
        this.incomingMatches = [];
        /**
         * Object containing a mapping of objectIDs and the data to send for
         * outgoing data.
         */
        this.outgoingMatches = {};
        /**
         * If the serial port should be reopened on port close/errors.
         * Will be set to false on adapter unload.
         */
        this.reopenPortOnClose = true;
        /**
         * RHS init retry counter.
         * Will be increased on each init retry and set to 0 on successfull init.
         */
        this.rhsInitRetryCounter = 0;
        /**
         * Timeout for delayed init retry.
         */
        this.rhsInitRetryTimeout = null;
        this.on('ready', this.onReady);
        this.on('objectChange', this.onObjectChange);
        this.on('stateChange', this.onStateChange);
        this.on('message', this.onMessage);
        this.on('unload', this.onUnload);
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    onReady() {
        return __awaiter(this, void 0, void 0, function* () {
            // Reset the connection indicator during startup
            this.setState('info.connection', false, true);
            // Debug log the RHS version
            this.log.debug('RHS version: ' + radiohead_serial_1.version);
            // Debug log the current config
            this.log.debug('config: ' + JSON.stringify(this.config));
            // Parse and check the address of the adapter in the RadioHead network
            this.address = (0, tools_1.parseNumber)(this.config.address);
            if (isNaN(this.address) || this.address < 0 || this.address > 254) {
                this.log.error(`Config error: Invalid address ${this.config.address} (${this.address})!`);
                return;
            }
            // Load/initialize the info counters
            for (const id of infoCounters) {
                const state = yield this.getStateAsync('info.' + id);
                this.log.debug(`loaded ${this.namespace}.info.${id} ` + JSON.stringify(state));
                if (state) {
                    this[id] = state.val;
                }
                else {
                    yield this.setStateAsync('info.' + id, 0, true);
                }
            }
            // setup matcher for incoming data
            this.getForeignObjects(this.namespace + '.data.in.*', 'state', (err, objects) => {
                if (err) {
                    this.log.error('Error loading incoming data objects');
                    return;
                }
                for (const objectId in objects) {
                    const obj = objects[objectId];
                    const parts = obj.native.data.split(';');
                    parts.forEach((part, partIdx) => {
                        if (part.length === 0) {
                            this.log.warn(`Empty data part #${partIdx} in object ${objectId} ignored`);
                            return;
                        }
                        const data = part.trim().split(',');
                        const dataMatch = {
                            from: (0, tools_1.parseAddress)(obj.native.fromAddress),
                            to: this.config.promiscuous ? (0, tools_1.parseAddress)(obj.native.toAddress) : null,
                            data: this.prepareDataForMatcher(data),
                            objectId: objectId,
                            role: obj.common.role,
                            type: obj.common.type || 'number',
                            numParts: parts.length,
                            matchedPart: partIdx,
                            bufferDataType: obj.native.dataType,
                            bufferDataStart: data.indexOf('D'),
                            factor: obj.native.factor,
                            offset: obj.native.offset,
                            decimals: obj.native.decimals
                        };
                        this.incomingMatches.push(dataMatch);
                    });
                }
                this.log.debug(`loaded ${this.incomingMatches.length} incoming matches`);
            });
            // setup mapping for outgoing data
            this.getForeignObjects(this.namespace + '.data.out.*', 'state', (err, objects) => {
                if (err) {
                    this.log.error('Error loading outgoing data objects');
                    return;
                }
                for (const objectId in objects) {
                    const obj = objects[objectId];
                    const parts = obj.native.data.split(';').map((p) => p.trim().split(','));
                    const data = [];
                    parts.forEach((part) => {
                        data.push(this.prepareDataForMatcher(part));
                    });
                    this.outgoingMatches[objectId] = {
                        to: (0, tools_1.parseAddress)(obj.native.toAddress) || 0,
                        data: data.map((d) => Buffer.from(d)),
                        role: obj.common.role,
                        type: obj.common.type || 'number',
                        bufferDataType: obj.native.dataType,
                        bufferDataStart: parts[0].indexOf('D')
                    };
                }
                this.log.debug(`loaded ${Object.keys(this.outgoingMatches).length} outgoing matches`);
            });
            // set the start value for retransmissions counter
            this.retransmissionsCountStart = this.retransmissionsCount;
            // Init the radiohead-serial
            yield this.rhsInit();
            // subscribe needed states
            this.subscribeStates('actions.*');
            this.subscribeStates('data.out.*');
        });
    }
    /**
     * Initialize the RadioHeadSerial instance and connect to the serial port.
     *
     * On first call this will create a new RHS instance and set it up.
     * On next calls this will reinitialize the existing RHS instance to reinitialize the serial port.
     */
    rhsInit() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // setup rhs instance only on first init
                if (!this.rhs) {
                    this.rhs = new radiohead_serial_1.RadioHeadSerial({
                        port: this.config.port,
                        baud: parseInt(this.config.baud, 10),
                        address: this.address,
                        reliable: this.config.reliable,
                        autoInit: false
                    });
                    this.rhs.on('error', this.onRhsError);
                    this.rhs.on('close', this.onRhsClose);
                    this.rhs.on('data', this.onRhsData);
                    // enable promiscuous mode if configured
                    if (this.config.promiscuous) {
                        this.rhs.setPromiscuous(true);
                        this.log.info('Promiscuous mode enabled');
                    }
                }
                // init of rhs instance may be called multiple times, e.g. when the port was closed
                yield this.rhs.init();
                this.log.info('Manager initialized, my RadioHead address is ' + (0, tools_1.hexNumber)(this.address));
                // reset the retry counter
                this.rhsInitRetryCounter = 0;
                // set the connection state to connected
                this.setState('info.connection', true, true);
            }
            catch (err) {
                this.log.warn(`Error on serial port initialization: ${err}`);
                this.rhsInitRetry();
                return;
            }
        });
    }
    /**
     * Start a RHS initialize retry.
     *
     * This will setup a timeout which will then call a RHS init.
     * The timeout time depends on the retry counter.
     */
    rhsInitRetry() {
        // stop possible already existing timeout
        if (this.rhsInitRetryTimeout) {
            clearTimeout(this.rhsInitRetryTimeout);
            this.rhsInitRetryTimeout = null;
        }
        // increase retry counter
        this.rhsInitRetryCounter++;
        // define timeout time in seconds to increase the time between the first 5 tries
        let timeoutTime;
        switch (this.rhsInitRetryCounter) {
            case 1:
                timeoutTime = 5;
                break;
            case 2:
                timeoutTime = 10;
                break;
            case 3:
                timeoutTime = 30;
                break;
            case 4:
                timeoutTime = 60;
                break;
            default:
                timeoutTime = 120;
                break;
        }
        this.log.info(`Trying to reinitialize in ${timeoutTime}s (try #${this.rhsInitRetryCounter})`);
        // set timeout to init again
        this.rhsInitRetryTimeout = setTimeout(() => {
            this.rhsInitRetryTimeout = null;
            this.rhsInit();
        }, timeoutTime * 1000);
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // don't reopen the port
                this.reopenPortOnClose = false;
                // clear possible reinitialize timeout
                if (this.rhsInitRetryTimeout) {
                    clearTimeout(this.rhsInitRetryTimeout);
                    this.rhsInitRetryTimeout = null;
                }
                // close the serial port if rhs is initialized
                if (this.rhs !== null) {
                    this.log.info('Closing serial port...');
                    try {
                        yield this.rhs.close();
                    }
                    catch (e) {
                        this.log.warn(`Error closing serial port: ${e}`);
                    }
                    this.rhs = null;
                }
                // reset connection state
                yield this.setStateAsync('info.connection', false, true);
                callback();
            }
            catch (e) {
                callback();
            }
        });
    }
    /**
     * Handle RadioHeadSerial errors.
     * @param error The error.
     */
    onRhsError(error) {
        this.log.error('RadioHeadSerial Error: ' + error);
    }
    /**
     * Handle RadioHeadSerial close events.
     */
    onRhsClose() {
        this.setState('info.connection', false, true);
        // check if the port should be reopened
        if (this.reopenPortOnClose) {
            this.log.warn('Serial port closed');
            this.rhsInitRetry();
        }
        else {
            // close was expected... just log an info
            this.log.info('Serial port closed');
        }
    }
    /**
     * Prepare some data to be used with the matcher for incoming data.
     * @param  data Array of strings for the data to match including placeholders * and D.
     * @return      DataArray to be used with the matcher.
     */
    prepareDataForMatcher(data) {
        const newData = [];
        data.forEach((val, idx) => {
            if (val === '*' || val === 'D') {
                newData[idx] = null;
            }
            else {
                newData[idx] = (0, tools_1.parseNumber)(val);
            }
        });
        return newData;
    }
    /**
     * Handler for incoming RadioHead messages.
     * @param msg The received RadioHead message.
     */
    onRhsData(msg) {
        this.setStateAsync('info.receivedCount', ++this.receivedCount, true);
        this.setStateAsync('info.lastReceived', new Date().toISOString(), true);
        // log data if enabled
        if (this.config.logAllData) {
            this.log.info(`Received <${(0, tools_1.formatBufferAsHexString)(msg.data)}> from ${(0, tools_1.hexNumber)(msg.headerFrom)} to ${(0, tools_1.hexNumber)(msg.headerTo)} msgID ${(0, tools_1.hexNumber)(msg.headerId)}`);
        }
        const data = [...msg.data]; // convert buffer to array
        // set the msg as incoming data, replacing the data buffer by the array
        this.setStateAsync('data.incoming', { val: JSON.stringify(Object.assign(Object.assign({}, msg), { data })) }, true);
        // check for matches
        this.incomingMatches.forEach((dataMatch) => {
            // filter addresses
            if (msg.headerFrom !== dataMatch.from && dataMatch.from !== null)
                return;
            if (msg.headerTo !== dataMatch.to && dataMatch.to !== null)
                return;
            // check data
            if (this.checkDataMatch(data, dataMatch.data)) {
                // data matched!
                this.log.debug(`received data ${JSON.stringify(msg)} matched ${JSON.stringify(dataMatch)}`);
                this.handleMatchedMessage(msg, dataMatch);
            }
        });
    }
    /**
     * Handler for matched RadioHead messages.
     * @param  msg       The RadioHead message.
     * @param  dataMatch The matched incoming data.
     * @return           Promise which will be resolved when the corresponding state is updated.
     */
    handleMatchedMessage(msg, dataMatch) {
        return __awaiter(this, void 0, void 0, function* () {
            switch (dataMatch.role) {
                case 'button':
                    // buttons are pushed only
                    yield this.setForeignStateAsync(dataMatch.objectId, true, true);
                    break;
                case 'indicator':
                case 'switch':
                    // switch and indicator can be set true/false or toggled
                    if (dataMatch.numParts === 1) {
                        // only one part... toggle
                        const oldState = yield this.getForeignStateAsync(dataMatch.objectId);
                        yield this.setForeignStateAsync(dataMatch.objectId, !(oldState && oldState.val), true);
                    }
                    else {
                        // two parts ... part 0 = true, part 1 = false
                        if (dataMatch.matchedPart == 0) {
                            yield this.setForeignStateAsync(dataMatch.objectId, true, true);
                        }
                        else {
                            yield this.setForeignStateAsync(dataMatch.objectId, false, true);
                        }
                    }
                    break;
                default:
                    // check if data start is defined
                    if (dataMatch.bufferDataStart < 0)
                        return;
                    // get the value and set the state
                    let val;
                    if (dataMatch.type === 'boolean') {
                        val = this.getValueFromBuffer(msg.data, 'uint8', dataMatch.bufferDataStart, dataMatch.objectId);
                        val = !!val; // make is boolean
                    }
                    else { // number
                        val = this.getValueFromBuffer(msg.data, dataMatch.bufferDataType, dataMatch.bufferDataStart, dataMatch.objectId);
                        val = val * dataMatch.factor + dataMatch.offset;
                        if (typeof dataMatch.decimals === 'number') {
                            val = (0, tools_1.round)(val, dataMatch.decimals);
                        }
                    }
                    yield this.setForeignStateAsync(dataMatch.objectId, val, true);
            }
        });
    }
    /**
     * Helper method to check if some received data matches a predefined data.
     * @param  data    The data to check.
     * @param  matchTo The data to match.
     * @return         true is the data matches.
     */
    checkDataMatch(data, matchTo) {
        // check length
        if (matchTo.length === 0)
            return false;
        if (data.length < matchTo.length)
            return false;
        // loop through the bytes
        const l = matchTo.length;
        for (let idx = 0; idx < l; idx++) {
            // continue if the byte should be ignored (is null)
            if (matchTo[idx] === null)
                continue;
            // check if the byte matches
            if (matchTo[idx] !== data[idx]) {
                // byte doesn't match
                return false;
            }
        }
        // all bytes matched
        return true;
    }
    /**
     * Update the counter of retransmissions.
     * @return Promise which will be resolved when the state is set.
     */
    updateRetransmissionsCount() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.rhs)
                return;
            const newRetr = this.retransmissionsCountStart + this.rhs.getRetransmissions();
            if (newRetr !== this.retransmissionsCount) {
                this.retransmissionsCount = this.retransmissionsCountStart + this.rhs.getRetransmissions();
                yield this.setStateAsync('info.retransmissionsCount', this.retransmissionsCount, true);
            }
        });
    }
    /**
     * Helper method to get some value from a buffer.
     * @param  buf      The buffer to read from.
     * @param  type     The type of the value in the buffer.
     * @param  start    Start index in the buffer where the value starts.
     * @param  objectId ID of the object for which the value should be read.
     * @return          The read value or NaN in case of an error.
     */
    getValueFromBuffer(buf, type, start, objectId) {
        try {
            switch (type) {
                case 'int8': return buf.readInt8(start);
                case 'uint8': return buf.readUInt8(start);
                case 'int16_le': return buf.readInt16LE(start);
                case 'int16_be': return buf.readInt16BE(start);
                case 'uint16_le': return buf.readUInt16LE(start);
                case 'uint16_be': return buf.readUInt16BE(start);
                case 'int32_le': return buf.readInt32LE(start);
                case 'int32_be': return buf.readInt32BE(start);
                case 'uint32_le': return buf.readUInt32LE(start);
                case 'uint32_be': return buf.readUInt32BE(start);
                case 'float32_le': return buf.readFloatLE(start);
                case 'float32_be': return buf.readFloatBE(start);
                case 'double64_le': return buf.readDoubleLE(start);
                case 'double64_be': return buf.readDoubleBE(start);
                default:
                    this.log.warn(`${objectId} config error! Invalid data type ${type}`);
            }
        }
        catch (err) {
            this.log.warn(`${objectId} config error! Maybe there are too few byte in the buffer to read a ${type}? ` + err);
        }
        return NaN;
    }
    /**
     * Helper method to write some value into a buffer.
     * @param  val      The value to write.
     * @param  buf      The buffer to write into.
     * @param  type     The type of the value in the buffer.
     * @param  start    Start index in the buffer where the value starts.
     * @param  objectId ID of the object for which the value should be written.
     * @return          true if the value is written successfully or false in case of an error.
     */
    writeValueToBuffer(val, buf, type, start, objectId) {
        try {
            switch (type) {
                case 'int8':
                    buf.writeInt8(val, start);
                    break;
                case 'uint8':
                    buf.writeUInt8(val, start);
                    break;
                case 'int16_le':
                    buf.writeInt16LE(val, start);
                    break;
                case 'int16_be':
                    buf.writeInt16BE(val, start);
                    break;
                case 'uint16_le':
                    buf.writeUInt16LE(val, start);
                    break;
                case 'uint16_be':
                    buf.writeUInt16BE(val, start);
                    break;
                case 'int32_le':
                    buf.writeInt32LE(val, start);
                    break;
                case 'int32_be':
                    buf.writeInt32BE(val, start);
                    break;
                case 'uint32_le':
                    buf.writeUInt32LE(val, start);
                    break;
                case 'uint32_be':
                    buf.writeUInt32BE(val, start);
                    break;
                case 'float32_le':
                    buf.writeFloatLE(val, start);
                    break;
                case 'float32_be':
                    buf.writeFloatBE(val, start);
                    break;
                case 'double64_le':
                    buf.writeDoubleLE(val, start);
                    break;
                case 'double64_be':
                    buf.writeDoubleBE(val, start);
                    break;
                default:
                    this.log.warn(`${objectId} config error! Invalid data type ${type}`);
                    return false;
            }
        }
        catch (err) {
            this.log.warn(`${objectId} config error! Maybe there are too few byte in the buffer to write a ${type}? ` + err);
            return false;
        }
        return true;
    }
    /**
     * Is called if a subscribed object changes.
     * @param id  The ID of the object.
     * @param obj The ioBroker object.
     */
    onObjectChange(id, obj) {
        if (obj) {
            // The object was changed
            this.log.debug(`object ${id} changed: ${JSON.stringify(obj)}`);
        }
        else {
            // The object was deleted
            this.log.debug(`object ${id} deleted`);
        }
    }
    /**
     * Is called if a subscribed state changes.
     * @param id    The ID of the state.
     * @param state The ioBroker state.
     */
    onStateChange(id, state) {
        return __awaiter(this, void 0, void 0, function* () {
            if (state) {
                // The state was changed
                this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack}) ` + JSON.stringify(state));
                // don't do anything if ack is set
                // we aren't able to send something if rhs is not initialized
                if (state.ack === true || !this.rhs)
                    return;
                // handle special states
                switch (id) {
                    case this.namespace + '.actions.resetCounters':
                        this.log.info('Reset information counters');
                        this.retransmissionsCountStart = 0;
                        this.rhs.resetRetransmissions();
                        for (const infoCounterId of infoCounters) {
                            this[infoCounterId] = 0;
                            yield this.setStateAsync('info.' + infoCounterId, 0, true);
                        }
                        yield this.setStateAsync(id, state, true);
                        return;
                }
                // is this some outgoing data?
                if (this.outgoingMatches.hasOwnProperty(id)) {
                    // prepare the data for sending
                    let buf = null;
                    switch (this.outgoingMatches[id].role) {
                        case 'switch':
                        case 'indicator':
                            // switch or indicator uses the second data group for false value if provied
                            if (this.outgoingMatches[id].data.length > 1 && !state.val) {
                                // send false
                                buf = Buffer.from(this.outgoingMatches[id].data[1]); // copy the configured buffer to prevent issues
                                break;
                            }
                        default:
                            buf = Buffer.from(this.outgoingMatches[id].data[0]); // copy the configured buffer to prevent issues
                    }
                    // if there is a data start defined ...
                    if (this.outgoingMatches[id].bufferDataStart >= 0) {
                        if (this.outgoingMatches[id].type === 'boolean') {
                            // boolean type values is always 0x01 (true) or 0x00 (false)
                            buf[this.outgoingMatches[id].bufferDataStart] = (state.val) ? 0x01 : 0x00;
                        }
                        else {
                            // write the value into the buffer
                            if (!this.writeValueToBuffer(state.val, buf, this.outgoingMatches[id].bufferDataType, this.outgoingMatches[id].bufferDataStart, id)) {
                                return;
                            }
                        }
                    }
                    // send the data
                    yield this.rhsSend(this.outgoingMatches[id].to, buf, id, state);
                }
            }
            else {
                // The state was deleted
                this.log.debug(`state ${id} deleted`);
            }
        });
    }
    /**
     * Method to send some data using RadioHead.
     * @param  to              Address of the receiver.
     * @param  buf             The data to send as a buffer.
     * @param  sendingObjectId ID of the ioBroker object which triggered the sending.
     * @param  stateAck        ioBroker state so set the ack on when sent successfully.
     * @return                 A Promise which will be resolved when done. If there was an error the first argument will be the error.
     */
    rhsSend(to, buf, sendingObjectId, stateAck) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.rhs || !this.rhs.isInitDone()) {
                this.log.warn(`Unable to send new value of '${sendingObjectId}' because we are not ready to send`);
                return Promise.resolve(new Error('Unable to send, not ready'));
            }
            if (this.config.logAllData) {
                this.log.info(`Sending <${(0, tools_1.formatBufferAsHexString)(buf)}> to ${(0, tools_1.hexNumber)(to)}`);
            }
            let err = undefined;
            yield this.rhs.send(to, buf)
                .then(() => {
                // update ok info
                this.setStateAsync('info.sentOkCount', ++this.sentOkCount, true);
                this.setStateAsync('info.lastSentOk', new Date().toISOString(), true);
                // set the ack flag
                if (stateAck) {
                    this.setStateAsync(sendingObjectId, stateAck, true);
                }
            })
                .catch((e) => {
                // update error info
                this.setStateAsync('info.sentErrorCount', ++this.sentErrorCount, true);
                this.setStateAsync('info.lastSentError', new Date().toISOString(), true);
                this.log.warn(`Error sending message for ${sendingObjectId} to ${(0, tools_1.hexNumber)(to)} - ${e}`);
                err = e;
            })
                // in any case update the retransmissions counter
                .then(() => this.updateRetransmissionsCount());
            return err;
        });
    }
    /**
     * Some message was sent to this instance over message box (e.g. by a script).
     * @param obj The received ioBroker message.
     */
    onMessage(obj) {
        this.log.debug('got message ' + JSON.stringify(obj));
        if (typeof obj === 'object' && obj.message) {
            if (obj.command === 'send') {
                // we should send some message...
                if (typeof obj.message !== 'object') {
                    this.log.warn(`Invalid send message from ${obj.from} received ` + JSON.stringify(obj.message));
                    return;
                }
                const payload = obj.message;
                const to = (0, tools_1.parseAddress)(payload.to);
                let buf;
                try {
                    buf = Buffer.from(payload.data);
                }
                catch (e) {
                    buf = null;
                }
                if (to === null || buf === null || buf.length === 0) {
                    this.log.warn(`Invalid send message from ${obj.from} received ` + JSON.stringify(obj.message));
                    return;
                }
                this.rhsSend(to, buf, obj.from)
                    .then((error) => {
                    // Send response in callback if required
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, { error: error }, obj.callback);
                    }
                });
            }
        }
    }
}
__decorate([
    core_decorators_1.autobind
], RadioheadAdapter.prototype, "onReady", null);
__decorate([
    core_decorators_1.autobind
], RadioheadAdapter.prototype, "onUnload", null);
__decorate([
    core_decorators_1.autobind
], RadioheadAdapter.prototype, "onRhsError", null);
__decorate([
    core_decorators_1.autobind
], RadioheadAdapter.prototype, "onRhsClose", null);
__decorate([
    core_decorators_1.autobind
], RadioheadAdapter.prototype, "onRhsData", null);
__decorate([
    core_decorators_1.autobind
], RadioheadAdapter.prototype, "handleMatchedMessage", null);
__decorate([
    core_decorators_1.autobind
], RadioheadAdapter.prototype, "onObjectChange", null);
__decorate([
    core_decorators_1.autobind
], RadioheadAdapter.prototype, "onStateChange", null);
__decorate([
    core_decorators_1.autobind
], RadioheadAdapter.prototype, "rhsSend", null);
__decorate([
    core_decorators_1.autobind
], RadioheadAdapter.prototype, "onMessage", null);
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options) => new RadioheadAdapter(options);
}
else {
    // otherwise start the instance directly
    (() => new RadioheadAdapter())();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7OztHQUlHOzs7Ozs7Ozs7Ozs7Ozs7OztBQUVILGdEQUFnRDtBQUVoRCxxREFBMkM7QUFFM0MsdURBQWtIO0FBRWxILHVDQUFtRztBQW1CbkcsTUFBTSxZQUFZLEdBQThFLENBQUMsZUFBZSxFQUFFLHNCQUFzQixFQUFFLGdCQUFnQixFQUFFLGFBQWEsQ0FBQyxDQUFDO0FBRTNLLE1BQU0sZ0JBQWlCLFNBQVEsS0FBSyxDQUFDLE9BQU87SUFtRTFDOzs7T0FHRztJQUNILFlBQW1CLFVBQXlDLEVBQUU7UUFDNUQsS0FBSyxpQ0FDQSxPQUFPLEtBQ1YsSUFBSSxFQUFFLFdBQVcsSUFDakIsQ0FBQztRQXpFTDs7V0FFRztRQUNLLFlBQU8sR0FBVyxJQUFJLENBQUM7UUFFL0I7OztXQUdHO1FBQ0ssUUFBRyxHQUEyQixJQUFJLENBQUM7UUFFM0M7O1dBRUc7UUFDSyxrQkFBYSxHQUFXLENBQUMsQ0FBQztRQUVsQzs7V0FFRztRQUNLLHlCQUFvQixHQUFXLENBQUMsQ0FBQztRQUV6Qzs7V0FFRztRQUNLLG1CQUFjLEdBQVcsQ0FBQyxDQUFDO1FBRW5DOztXQUVHO1FBQ0ssZ0JBQVcsR0FBVyxDQUFDLENBQUM7UUFFaEM7OztXQUdHO1FBQ0ssOEJBQXlCLEdBQVcsQ0FBQyxDQUFDO1FBRTlDOztXQUVHO1FBQ0ssb0JBQWUsR0FBd0IsRUFBRSxDQUFDO1FBRWxEOzs7V0FHRztRQUNLLG9CQUFlLEdBQXNDLEVBQUUsQ0FBQztRQUVoRTs7O1dBR0c7UUFDSyxzQkFBaUIsR0FBWSxJQUFJLENBQUM7UUFFMUM7OztXQUdHO1FBQ0ssd0JBQW1CLEdBQVcsQ0FBQyxDQUFDO1FBRXhDOztXQUVHO1FBQ0ssd0JBQW1CLEdBQTBCLElBQUksQ0FBQztRQVl4RCxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDL0IsSUFBSSxDQUFDLEVBQUUsQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQzdDLElBQUksQ0FBQyxFQUFFLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUMzQyxJQUFJLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbkMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFRDs7T0FFRztJQUVXLE9BQU87O1lBQ25CLGdEQUFnRDtZQUNoRCxJQUFJLENBQUMsUUFBUSxDQUFDLGlCQUFpQixFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztZQUU5Qyw0QkFBNEI7WUFDNUIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsZUFBZSxHQUFHLDBCQUFXLENBQUMsQ0FBQztZQUU5QywrQkFBK0I7WUFDL0IsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFFekQsc0VBQXNFO1lBQ3RFLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBQSxtQkFBVyxFQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDaEQsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLElBQUksQ0FBQyxPQUFPLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxPQUFPLEdBQUcsR0FBRyxFQUFFO2dCQUNqRSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxpQ0FBaUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEtBQUssSUFBSSxDQUFDLE9BQU8sSUFBSSxDQUFDLENBQUM7Z0JBQzFGLE9BQU87YUFDUjtZQUVELG9DQUFvQztZQUNwQyxLQUFLLE1BQU0sRUFBRSxJQUFJLFlBQVksRUFBRTtnQkFDN0IsTUFBTSxLQUFLLEdBQUcsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUMsQ0FBQztnQkFDckQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxJQUFJLENBQUMsU0FBUyxTQUFTLEVBQUUsR0FBRyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDL0UsSUFBRyxLQUFLLEVBQUU7b0JBQ1IsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxHQUFhLENBQUM7aUJBQ2hDO3FCQUFNO29CQUNMLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztpQkFDakQ7YUFDRjtZQUVELGtDQUFrQztZQUNsQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLFNBQVMsR0FBRyxZQUFZLEVBQUUsT0FBTyxFQUFFLENBQUMsR0FBRyxFQUFFLE9BQU8sRUFBRSxFQUFFO2dCQUM5RSxJQUFJLEdBQUcsRUFBRTtvQkFDUCxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDO29CQUN0RCxPQUFPO2lCQUNSO2dCQUVELEtBQUssTUFBTSxRQUFRLElBQUksT0FBTyxFQUFFO29CQUM5QixNQUFNLEdBQUcsR0FBdUIsT0FBTyxDQUFDLFFBQVEsQ0FBdUIsQ0FBQztvQkFFeEUsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUN6QyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxFQUFFO3dCQUM5QixJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFOzRCQUNyQixJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsT0FBTyxjQUFjLFFBQVEsVUFBVSxDQUFDLENBQUM7NEJBQzNFLE9BQU87eUJBQ1I7d0JBQ0QsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQzt3QkFDcEMsTUFBTSxTQUFTLEdBQXNCOzRCQUNuQyxJQUFJLEVBQUUsSUFBQSxvQkFBWSxFQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDOzRCQUMxQyxFQUFFLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLElBQUEsb0JBQVksRUFBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJOzRCQUN2RSxJQUFJLEVBQUUsSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQzs0QkFDdEMsUUFBUSxFQUFFLFFBQVE7NEJBQ2xCLElBQUksRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUk7NEJBQ3JCLElBQUksRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxRQUFROzRCQUNqQyxRQUFRLEVBQUUsS0FBSyxDQUFDLE1BQU07NEJBQ3RCLFdBQVcsRUFBRSxPQUFPOzRCQUNwQixjQUFjLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFROzRCQUNuQyxlQUFlLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUM7NEJBQ2xDLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU07NEJBQ3pCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU07NEJBQ3pCLFFBQVEsRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLFFBQVE7eUJBQzlCLENBQUM7d0JBQ0YsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQ3ZDLENBQUMsQ0FBQyxDQUFDO2lCQUNKO2dCQUVELElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFVBQVUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLG1CQUFtQixDQUFDLENBQUM7WUFDM0UsQ0FBQyxDQUFDLENBQUM7WUFFSCxrQ0FBa0M7WUFDbEMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxTQUFTLEdBQUcsYUFBYSxFQUFFLE9BQU8sRUFBRSxDQUFDLEdBQUcsRUFBRSxPQUFPLEVBQUUsRUFBRTtnQkFDL0UsSUFBSSxHQUFHLEVBQUU7b0JBQ1AsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMscUNBQXFDLENBQUMsQ0FBQztvQkFDdEQsT0FBTztpQkFDUjtnQkFFRCxLQUFLLE1BQU0sUUFBUSxJQUFJLE9BQU8sRUFBRTtvQkFDOUIsTUFBTSxHQUFHLEdBQXVCLE9BQU8sQ0FBQyxRQUFRLENBQXVCLENBQUM7b0JBQ3hFLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFFekUsTUFBTSxJQUFJLEdBQWdCLEVBQUUsQ0FBQztvQkFDN0IsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFO3dCQUNyQixJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUM5QyxDQUFDLENBQUMsQ0FBQztvQkFFSCxJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxHQUFHO3dCQUMvQixFQUFFLEVBQUUsSUFBQSxvQkFBWSxFQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQzt3QkFDM0MsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQzFDLElBQUksRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUk7d0JBQ3JCLElBQUksRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxRQUFRO3dCQUNqQyxjQUFjLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRO3dCQUNuQyxlQUFlLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUM7cUJBQ3ZDLENBQUE7aUJBQ0Y7Z0JBRUQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxNQUFNLG1CQUFtQixDQUFDLENBQUM7WUFDeEYsQ0FBQyxDQUFDLENBQUM7WUFFSCxrREFBa0Q7WUFDbEQsSUFBSSxDQUFDLHlCQUF5QixHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQztZQUUzRCw0QkFBNEI7WUFDNUIsTUFBTSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFFckIsMEJBQTBCO1lBQzFCLElBQUksQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDbEMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNyQyxDQUFDO0tBQUE7SUFFRDs7Ozs7T0FLRztJQUNXLE9BQU87O1lBQ25CLElBQUk7Z0JBQ0Ysd0NBQXdDO2dCQUN4QyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtvQkFDYixJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksa0NBQWUsQ0FBQzt3QkFDN0IsSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSTt3QkFDdEIsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUM7d0JBQ3BDLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTzt3QkFDckIsUUFBUSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUTt3QkFDOUIsUUFBUSxFQUFFLEtBQUs7cUJBQ2hCLENBQUMsQ0FBQztvQkFFSCxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO29CQUN0QyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO29CQUN0QyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO29CQUVwQyx3Q0FBd0M7b0JBQ3hDLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUU7d0JBQzNCLElBQUksQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDO3dCQUM5QixJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO3FCQUMzQztpQkFDRjtnQkFFRCxtRkFBbUY7Z0JBQ25GLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFFdEIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsK0NBQStDLEdBQUcsSUFBQSxpQkFBUyxFQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUV6RiwwQkFBMEI7Z0JBQzFCLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxDQUFDLENBQUM7Z0JBRTdCLHdDQUF3QztnQkFDeEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7YUFFOUM7WUFBQyxPQUFPLEdBQUcsRUFBRTtnQkFDWixJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyx3Q0FBd0MsR0FBRyxFQUFFLENBQUMsQ0FBQztnQkFDN0QsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUNwQixPQUFPO2FBQ1I7UUFDSCxDQUFDO0tBQUE7SUFFRDs7Ozs7T0FLRztJQUNLLFlBQVk7UUFDbEIseUNBQXlDO1FBQ3pDLElBQUksSUFBSSxDQUFDLG1CQUFtQixFQUFFO1lBQzVCLFlBQVksQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztZQUN2QyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxDQUFDO1NBQ2pDO1FBRUQseUJBQXlCO1FBQ3pCLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBRTNCLGdGQUFnRjtRQUNoRixJQUFJLFdBQW1CLENBQUM7UUFDeEIsUUFBUSxJQUFJLENBQUMsbUJBQW1CLEVBQUU7WUFDaEMsS0FBSyxDQUFDO2dCQUFFLFdBQVcsR0FBRyxDQUFDLENBQUM7Z0JBQUMsTUFBTTtZQUMvQixLQUFLLENBQUM7Z0JBQUUsV0FBVyxHQUFHLEVBQUUsQ0FBQztnQkFBQyxNQUFNO1lBQ2hDLEtBQUssQ0FBQztnQkFBRSxXQUFXLEdBQUcsRUFBRSxDQUFDO2dCQUFDLE1BQU07WUFDaEMsS0FBSyxDQUFDO2dCQUFFLFdBQVcsR0FBRyxFQUFFLENBQUM7Z0JBQUMsTUFBTTtZQUNoQztnQkFBUyxXQUFXLEdBQUcsR0FBRyxDQUFDO2dCQUFDLE1BQU07U0FDbkM7UUFFRCxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyw2QkFBNkIsV0FBVyxXQUFXLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxDQUFDLENBQUM7UUFFOUYsNEJBQTRCO1FBQzVCLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxVQUFVLENBQUMsR0FBRyxFQUFFO1lBQ3pDLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUM7WUFDaEMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2pCLENBQUMsRUFBRSxXQUFXLEdBQUcsSUFBSSxDQUFDLENBQUM7SUFDekIsQ0FBQztJQUVEOztPQUVHO0lBRVcsUUFBUSxDQUFDLFFBQW9COztZQUN6QyxJQUFJO2dCQUNGLHdCQUF3QjtnQkFDeEIsSUFBSSxDQUFDLGlCQUFpQixHQUFHLEtBQUssQ0FBQztnQkFFL0Isc0NBQXNDO2dCQUN0QyxJQUFJLElBQUksQ0FBQyxtQkFBbUIsRUFBRTtvQkFDNUIsWUFBWSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO29CQUN2QyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxDQUFDO2lCQUNqQztnQkFFRCw4Q0FBOEM7Z0JBQzlDLElBQUksSUFBSSxDQUFDLEdBQUcsS0FBSyxJQUFJLEVBQUU7b0JBQ3JCLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUM7b0JBQ3hDLElBQUk7d0JBQ0YsTUFBTSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDO3FCQUN4QjtvQkFBQyxPQUFPLENBQUMsRUFBRTt3QkFDVixJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyw4QkFBOEIsQ0FBQyxFQUFFLENBQUMsQ0FBQztxQkFDbEQ7b0JBQ0QsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUM7aUJBQ2pCO2dCQUVELHlCQUF5QjtnQkFDekIsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFFekQsUUFBUSxFQUFFLENBQUM7YUFDWjtZQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUNWLFFBQVEsRUFBRSxDQUFDO2FBQ1o7UUFDSCxDQUFDO0tBQUE7SUFFRDs7O09BR0c7SUFFSyxVQUFVLENBQUUsS0FBWTtRQUM5QixJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyx5QkFBeUIsR0FBRyxLQUFLLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBRUQ7O09BRUc7SUFFSyxVQUFVO1FBQ2hCLElBQUksQ0FBQyxRQUFRLENBQUMsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRTlDLHVDQUF1QztRQUN2QyxJQUFJLElBQUksQ0FBQyxpQkFBaUIsRUFBRTtZQUMxQixJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1lBQ3BDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztTQUNyQjthQUFNO1lBQ0wseUNBQXlDO1lBQ3pDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUM7U0FDckM7SUFDSCxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNLLHFCQUFxQixDQUFFLElBQWM7UUFDM0MsTUFBTSxPQUFPLEdBQWMsRUFBRSxDQUFDO1FBQzlCLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUU7WUFDeEIsSUFBSSxHQUFHLEtBQUssR0FBRyxJQUFJLEdBQUcsS0FBSyxHQUFHLEVBQUU7Z0JBQzlCLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUM7YUFDckI7aUJBQU07Z0JBQ0wsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUEsbUJBQVcsRUFBQyxHQUFHLENBQUMsQ0FBQzthQUNqQztRQUNILENBQUMsQ0FBQyxDQUFDO1FBRUgsT0FBTyxPQUFPLENBQUM7SUFDakIsQ0FBQztJQUVEOzs7T0FHRztJQUVLLFNBQVMsQ0FBRSxHQUFvQjtRQUNyQyxJQUFJLENBQUMsYUFBYSxDQUFDLG9CQUFvQixFQUFFLEVBQUUsSUFBSSxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNyRSxJQUFJLENBQUMsYUFBYSxDQUFDLG1CQUFtQixFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFeEUsc0JBQXNCO1FBQ3RCLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUU7WUFDMUIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxJQUFBLCtCQUF1QixFQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxJQUFBLGlCQUFTLEVBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxPQUFPLElBQUEsaUJBQVMsRUFBQyxHQUFHLENBQUMsUUFBUSxDQUFDLFVBQVUsSUFBQSxpQkFBUyxFQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7U0FDbks7UUFFRCxNQUFNLElBQUksR0FBYyxDQUFDLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsMEJBQTBCO1FBRWpFLHVFQUF1RTtRQUN2RSxJQUFJLENBQUMsYUFBYSxDQUFDLGVBQWUsRUFBRSxFQUFFLEdBQUcsRUFBRSxJQUFJLENBQUMsU0FBUyxpQ0FBSyxHQUFHLEtBQUUsSUFBSSxJQUFFLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUVuRixvQkFBb0I7UUFDcEIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxTQUFTLEVBQUUsRUFBRTtZQUV6QyxtQkFBbUI7WUFDbkIsSUFBSSxHQUFHLENBQUMsVUFBVSxLQUFLLFNBQVMsQ0FBQyxJQUFJLElBQUksU0FBUyxDQUFDLElBQUksS0FBSyxJQUFJO2dCQUFFLE9BQU87WUFDekUsSUFBSSxHQUFHLENBQUMsUUFBUSxLQUFLLFNBQVMsQ0FBQyxFQUFFLElBQUksU0FBUyxDQUFDLEVBQUUsS0FBSyxJQUFJO2dCQUFFLE9BQU87WUFFbkUsYUFBYTtZQUNiLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFO2dCQUM3QyxnQkFBZ0I7Z0JBQ2hCLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGlCQUFpQixJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxZQUFZLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUM1RixJQUFJLENBQUMsb0JBQW9CLENBQUMsR0FBRyxFQUFFLFNBQVMsQ0FBQyxDQUFDO2FBQzNDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQ7Ozs7O09BS0c7SUFFVyxvQkFBb0IsQ0FBRSxHQUFvQixFQUFFLFNBQTRCOztZQUNwRixRQUFRLFNBQVMsQ0FBQyxJQUFJLEVBQUU7Z0JBQ3RCLEtBQUssUUFBUTtvQkFDWCwwQkFBMEI7b0JBQzFCLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUNoRSxNQUFNO2dCQUVSLEtBQUssV0FBVyxDQUFDO2dCQUNqQixLQUFLLFFBQVE7b0JBQ1gsd0RBQXdEO29CQUN4RCxJQUFJLFNBQVMsQ0FBQyxRQUFRLEtBQUssQ0FBQyxFQUFFO3dCQUM1QiwwQkFBMEI7d0JBQzFCLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQzt3QkFDckUsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsUUFBUSxJQUFJLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztxQkFDeEY7eUJBQU07d0JBQ0wsOENBQThDO3dCQUM5QyxJQUFJLFNBQVMsQ0FBQyxXQUFXLElBQUksQ0FBQyxFQUFFOzRCQUM5QixNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQzt5QkFDakU7NkJBQU07NEJBQ0wsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7eUJBQ2xFO3FCQUNGO29CQUNELE1BQU07Z0JBRVI7b0JBQ0UsaUNBQWlDO29CQUNqQyxJQUFJLFNBQVMsQ0FBQyxlQUFlLEdBQUcsQ0FBQzt3QkFBRSxPQUFPO29CQUUxQyxrQ0FBa0M7b0JBQ2xDLElBQUksR0FBbUIsQ0FBQztvQkFDeEIsSUFBSSxTQUFTLENBQUMsSUFBSSxLQUFLLFNBQVMsRUFBRTt3QkFDaEMsR0FBRyxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxTQUFTLENBQUMsZUFBZSxFQUFFLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQzt3QkFDaEcsR0FBRyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxrQkFBa0I7cUJBQ2hDO3lCQUFNLEVBQUUsU0FBUzt3QkFDaEIsR0FBRyxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxjQUFjLEVBQUUsU0FBUyxDQUFDLGVBQWUsRUFBRSxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUM7d0JBQ2pILEdBQUcsR0FBRyxHQUFHLEdBQUcsU0FBUyxDQUFDLE1BQU0sR0FBRyxTQUFTLENBQUMsTUFBTSxDQUFDO3dCQUNoRCxJQUFJLE9BQU8sU0FBUyxDQUFDLFFBQVEsS0FBSyxRQUFRLEVBQUU7NEJBQzFDLEdBQUcsR0FBRyxJQUFBLGFBQUssRUFBQyxHQUFHLEVBQUUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDO3lCQUN0QztxQkFDRjtvQkFDRCxNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQzthQUNsRTtRQUNILENBQUM7S0FBQTtJQUVEOzs7OztPQUtHO0lBQ0ssY0FBYyxDQUFFLElBQWUsRUFBRSxPQUFrQjtRQUN6RCxlQUFlO1FBQ2YsSUFBSSxPQUFPLENBQUMsTUFBTSxLQUFLLENBQUM7WUFBRSxPQUFPLEtBQUssQ0FBQztRQUN2QyxJQUFJLElBQUksQ0FBQyxNQUFNLEdBQUcsT0FBTyxDQUFDLE1BQU07WUFBRSxPQUFPLEtBQUssQ0FBQztRQUMvQyx5QkFBeUI7UUFDekIsTUFBTSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQztRQUN6QixLQUFLLElBQUksR0FBRyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxFQUFFO1lBQ2hDLG1EQUFtRDtZQUNuRCxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxJQUFJO2dCQUFFLFNBQVM7WUFFcEMsNEJBQTRCO1lBQzVCLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRTtnQkFDOUIscUJBQXFCO2dCQUNyQixPQUFPLEtBQUssQ0FBQzthQUNkO1NBQ0Y7UUFFRCxvQkFBb0I7UUFDcEIsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBRUQ7OztPQUdHO0lBQ1csMEJBQTBCOztZQUN0QyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUc7Z0JBQUUsT0FBTztZQUV0QixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMseUJBQXlCLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQy9FLElBQUksT0FBTyxLQUFLLElBQUksQ0FBQyxvQkFBb0IsRUFBRTtnQkFDekMsSUFBSSxDQUFDLG9CQUFvQixHQUFHLElBQUksQ0FBQyx5QkFBeUIsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLGtCQUFrQixFQUFFLENBQUM7Z0JBQzNGLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQywyQkFBMkIsRUFBRSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLENBQUM7YUFDeEY7UUFDSCxDQUFDO0tBQUE7SUFFRDs7Ozs7OztPQU9HO0lBQ0ssa0JBQWtCLENBQUUsR0FBVyxFQUFFLElBQW9CLEVBQUUsS0FBYSxFQUFFLFFBQWdCO1FBQzVGLElBQUk7WUFDRixRQUFRLElBQUksRUFBRTtnQkFDWixLQUFLLE1BQU0sQ0FBQyxDQUFDLE9BQU8sR0FBRyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDeEMsS0FBSyxPQUFPLENBQUMsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQzFDLEtBQUssVUFBVSxDQUFDLENBQUMsT0FBTyxHQUFHLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUMvQyxLQUFLLFVBQVUsQ0FBQyxDQUFDLE9BQU8sR0FBRyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDL0MsS0FBSyxXQUFXLENBQUMsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ2pELEtBQUssV0FBVyxDQUFDLENBQUMsT0FBTyxHQUFHLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNqRCxLQUFLLFVBQVUsQ0FBQyxDQUFDLE9BQU8sR0FBRyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDL0MsS0FBSyxVQUFVLENBQUMsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQy9DLEtBQUssV0FBVyxDQUFDLENBQUMsT0FBTyxHQUFHLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNqRCxLQUFLLFdBQVcsQ0FBQyxDQUFDLE9BQU8sR0FBRyxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDakQsS0FBSyxZQUFZLENBQUMsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ2pELEtBQUssWUFBWSxDQUFDLENBQUMsT0FBTyxHQUFHLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNqRCxLQUFLLGFBQWEsQ0FBQyxDQUFDLE9BQU8sR0FBRyxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDbkQsS0FBSyxhQUFhLENBQUMsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ25EO29CQUNFLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsUUFBUSxvQ0FBb0MsSUFBSSxFQUFFLENBQUMsQ0FBQzthQUN4RTtTQUNGO1FBQUMsT0FBTyxHQUFHLEVBQUU7WUFDWixJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLFFBQVEsdUVBQXVFLElBQUksSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDO1NBQ2pIO1FBQ0QsT0FBTyxHQUFHLENBQUM7SUFDYixDQUFDO0lBRUQ7Ozs7Ozs7O09BUUc7SUFDSyxrQkFBa0IsQ0FBRSxHQUFXLEVBQUUsR0FBVyxFQUFFLElBQW9CLEVBQUUsS0FBYSxFQUFFLFFBQWdCO1FBQ3pHLElBQUk7WUFDRixRQUFRLElBQUksRUFBRTtnQkFDWixLQUFLLE1BQU07b0JBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7b0JBQUMsTUFBTTtnQkFDOUMsS0FBSyxPQUFPO29CQUFFLEdBQUcsQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUFDLE1BQU07Z0JBQ2hELEtBQUssVUFBVTtvQkFBRSxHQUFHLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFBQyxNQUFNO2dCQUNyRCxLQUFLLFVBQVU7b0JBQUUsR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7b0JBQUMsTUFBTTtnQkFDckQsS0FBSyxXQUFXO29CQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUFDLE1BQU07Z0JBQ3ZELEtBQUssV0FBVztvQkFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFBQyxNQUFNO2dCQUN2RCxLQUFLLFVBQVU7b0JBQUUsR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7b0JBQUMsTUFBTTtnQkFDckQsS0FBSyxVQUFVO29CQUFFLEdBQUcsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUFDLE1BQU07Z0JBQ3JELEtBQUssV0FBVztvQkFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFBQyxNQUFNO2dCQUN2RCxLQUFLLFdBQVc7b0JBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7b0JBQUMsTUFBTTtnQkFDdkQsS0FBSyxZQUFZO29CQUFFLEdBQUcsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUFDLE1BQU07Z0JBQ3ZELEtBQUssWUFBWTtvQkFBRSxHQUFHLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFBQyxNQUFNO2dCQUN2RCxLQUFLLGFBQWE7b0JBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7b0JBQUMsTUFBTTtnQkFDekQsS0FBSyxhQUFhO29CQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUFDLE1BQU07Z0JBQ3pEO29CQUNFLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsUUFBUSxvQ0FBb0MsSUFBSSxFQUFFLENBQUMsQ0FBQztvQkFDckUsT0FBTyxLQUFLLENBQUM7YUFDaEI7U0FDRjtRQUFDLE9BQU8sR0FBRyxFQUFFO1lBQ1osSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxRQUFRLHdFQUF3RSxJQUFJLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQztZQUNqSCxPQUFPLEtBQUssQ0FBQztTQUNkO1FBQ0QsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBRUQ7Ozs7T0FJRztJQUVLLGNBQWMsQ0FBQyxFQUFVLEVBQUUsR0FBdUM7UUFDeEUsSUFBSSxHQUFHLEVBQUU7WUFDUCx5QkFBeUI7WUFDekIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLGFBQWEsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7U0FDaEU7YUFBTTtZQUNMLHlCQUF5QjtZQUN6QixJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDLENBQUM7U0FDeEM7SUFDSCxDQUFDO0lBRUQ7Ozs7T0FJRztJQUVXLGFBQWEsQ0FBQyxFQUFVLEVBQUUsS0FBd0M7O1lBQzlFLElBQUksS0FBSyxFQUFFO2dCQUNULHdCQUF3QjtnQkFDeEIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLGFBQWEsS0FBSyxDQUFDLEdBQUcsV0FBVyxLQUFLLENBQUMsR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUVsRyxrQ0FBa0M7Z0JBQ2xDLDZEQUE2RDtnQkFDN0QsSUFBSSxLQUFLLENBQUMsR0FBRyxLQUFLLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHO29CQUFFLE9BQU87Z0JBRTVDLHdCQUF3QjtnQkFDeEIsUUFBUSxFQUFFLEVBQUU7b0JBQ1YsS0FBSyxJQUFJLENBQUMsU0FBUyxHQUFHLHdCQUF3Qjt3QkFDNUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLENBQUMsQ0FBQzt3QkFFNUMsSUFBSSxDQUFDLHlCQUF5QixHQUFHLENBQUMsQ0FBQzt3QkFDbkMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO3dCQUVoQyxLQUFLLE1BQU0sYUFBYSxJQUFJLFlBQVksRUFBRTs0QkFDeEMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQzs0QkFDeEIsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sR0FBRyxhQUFhLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO3lCQUM1RDt3QkFFRCxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQzt3QkFDMUMsT0FBTztpQkFDVjtnQkFFRCw4QkFBOEI7Z0JBQzlCLElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLEVBQUU7b0JBQzNDLCtCQUErQjtvQkFDL0IsSUFBSSxHQUFHLEdBQWtCLElBQUksQ0FBQztvQkFDOUIsUUFBUSxJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRTt3QkFDckMsS0FBSyxRQUFRLENBQUM7d0JBQ2QsS0FBSyxXQUFXOzRCQUNkLDRFQUE0RTs0QkFDNUUsSUFBSSxJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRTtnQ0FDMUQsYUFBYTtnQ0FDYixHQUFHLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBLENBQUMsK0NBQStDO2dDQUNuRyxNQUFNOzZCQUNQO3dCQUVIOzRCQUNFLEdBQUcsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUEsQ0FBQywrQ0FBK0M7cUJBQ3RHO29CQUVELHVDQUF1QztvQkFDdkMsSUFBSSxJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFDLGVBQWUsSUFBSSxDQUFDLEVBQUU7d0JBQ2pELElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLEtBQUssU0FBUyxFQUFFOzRCQUMvQyw0REFBNEQ7NEJBQzVELEdBQUcsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQzt5QkFDM0U7NkJBQU07NEJBQ0wsa0NBQWtDOzRCQUNsQyxJQUFJLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxHQUFhLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDLENBQUMsZUFBZSxFQUFFLEVBQUUsQ0FBQyxFQUFFO2dDQUM3SSxPQUFPOzZCQUNSO3lCQUNGO3FCQUNGO29CQUVELGdCQUFnQjtvQkFDaEIsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7aUJBQ2pFO2FBQ0Y7aUJBQU07Z0JBQ0wsd0JBQXdCO2dCQUN4QixJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsVUFBVSxDQUFDLENBQUM7YUFDdkM7UUFDSCxDQUFDO0tBQUE7SUFFRDs7Ozs7OztPQU9HO0lBRVcsT0FBTyxDQUFFLEVBQVUsRUFBRSxHQUFXLEVBQUUsZUFBdUIsRUFBRSxRQUF5Qjs7WUFDaEcsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxFQUFFO2dCQUN2QyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxnQ0FBZ0MsZUFBZSxvQ0FBb0MsQ0FBQyxDQUFDO2dCQUNuRyxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxLQUFLLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxDQUFDO2FBQ2hFO1lBRUQsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRTtnQkFDMUIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxJQUFBLCtCQUF1QixFQUFDLEdBQUcsQ0FBQyxRQUFRLElBQUEsaUJBQVMsRUFBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7YUFDaEY7WUFFRCxJQUFJLEdBQUcsR0FBc0IsU0FBUyxDQUFDO1lBQ3ZDLE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQztpQkFDekIsSUFBSSxDQUFDLEdBQUcsRUFBRTtnQkFDVCxpQkFBaUI7Z0JBQ2pCLElBQUksQ0FBQyxhQUFhLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxJQUFJLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUNqRSxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBRXRFLG1CQUFtQjtnQkFDbkIsSUFBSSxRQUFRLEVBQUU7b0JBQ1osSUFBSSxDQUFDLGFBQWEsQ0FBQyxlQUFlLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO2lCQUNyRDtZQUNILENBQUMsQ0FBQztpQkFDRCxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTtnQkFDWCxvQkFBb0I7Z0JBQ3BCLElBQUksQ0FBQyxhQUFhLENBQUMscUJBQXFCLEVBQUUsRUFBRSxJQUFJLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUN2RSxJQUFJLENBQUMsYUFBYSxDQUFDLG9CQUFvQixFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQ3pFLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLDZCQUE2QixlQUFlLE9BQU8sSUFBQSxpQkFBUyxFQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3pGLEdBQUcsR0FBRyxDQUFDLENBQUM7WUFDVixDQUFDLENBQUM7Z0JBQ0YsaURBQWlEO2lCQUNoRCxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLDBCQUEwQixFQUFFLENBQUMsQ0FBQztZQUVqRCxPQUFPLEdBQUcsQ0FBQztRQUNiLENBQUM7S0FBQTtJQUVEOzs7T0FHRztJQUVLLFNBQVMsQ0FBQyxHQUFxQjtRQUNyQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRXJELElBQUksT0FBTyxHQUFHLEtBQUssUUFBUSxJQUFJLEdBQUcsQ0FBQyxPQUFPLEVBQUU7WUFDMUMsSUFBSSxHQUFHLENBQUMsT0FBTyxLQUFLLE1BQU0sRUFBRTtnQkFDMUIsaUNBQWlDO2dCQUNqQyxJQUFJLE9BQU8sR0FBRyxDQUFDLE9BQU8sS0FBSyxRQUFRLEVBQUU7b0JBQ25DLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLDZCQUE2QixHQUFHLENBQUMsSUFBSSxZQUFZLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztvQkFDL0YsT0FBTztpQkFDUjtnQkFFRCxNQUFNLE9BQU8sR0FBdUIsR0FBRyxDQUFDLE9BQTZCLENBQUM7Z0JBQ3RFLE1BQU0sRUFBRSxHQUFHLElBQUEsb0JBQVksRUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBRXBDLElBQUksR0FBa0IsQ0FBQztnQkFDdkIsSUFBSTtvQkFDRixHQUFHLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBVSxDQUFDLENBQUM7aUJBQ3ZDO2dCQUFDLE9BQU8sQ0FBQyxFQUFFO29CQUNWLEdBQUcsR0FBRyxJQUFJLENBQUM7aUJBQ1o7Z0JBRUQsSUFBSSxFQUFFLEtBQUssSUFBSSxJQUFJLEdBQUcsS0FBSyxJQUFJLElBQUksR0FBRyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7b0JBQ25ELElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLDZCQUE2QixHQUFHLENBQUMsSUFBSSxZQUFZLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztvQkFDL0YsT0FBTztpQkFDUjtnQkFFRCxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQztxQkFDNUIsSUFBSSxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUU7b0JBQ2Qsd0NBQXdDO29CQUN4QyxJQUFJLEdBQUcsQ0FBQyxRQUFRLEVBQUU7d0JBQ2hCLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsT0FBTyxFQUFFLEVBQUMsS0FBSyxFQUFFLEtBQUssRUFBQyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztxQkFDbEU7Z0JBQ0gsQ0FBQyxDQUFDLENBQUM7YUFDTjtTQUNGO0lBQ0gsQ0FBQztDQUVGO0FBaG9CQztJQURDLDBCQUFROytDQTBHUjtBQXdGRDtJQURDLDBCQUFRO2dEQThCUjtBQU9EO0lBREMsMEJBQVE7a0RBR1I7QUFNRDtJQURDLDBCQUFRO2tEQVlSO0FBeUJEO0lBREMsMEJBQVE7aURBNkJSO0FBU0Q7SUFEQywwQkFBUTs0REEyQ1I7QUF3SEQ7SUFEQywwQkFBUTtzREFTUjtBQVFEO0lBREMsMEJBQVE7cURBaUVSO0FBV0Q7SUFEQywwQkFBUTsrQ0FrQ1I7QUFPRDtJQURDLDBCQUFRO2lEQW9DUjtBQUlILElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUU7SUFDM0IseUNBQXlDO0lBQ3pDLE1BQU0sQ0FBQyxPQUFPLEdBQUcsQ0FBQyxPQUFrRCxFQUFFLEVBQUUsQ0FBQyxJQUFJLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFDO0NBQ3hHO0tBQU07SUFDTCx3Q0FBd0M7SUFDeEMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLGdCQUFnQixFQUFFLENBQUMsRUFBRSxDQUFDO0NBQ2xDIn0=