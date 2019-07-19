"use strict";
/*
 * Created with @iobroker/create-adapter v1.15.1
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
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
    constructor(options = {}) {
        super(Object.assign({}, options, { name: 'radiohead' }));
        this.address = 0x00;
        this.rhs = null;
        this.receivedCount = 0;
        this.retransmissionsCount = 0;
        this.sentErrorCount = 0;
        this.sentOkCount = 0;
        /**
         * Internal storage for the retransmissions counter on instance start.
         */
        this.retransmissionsCountStart = 0;
        this.incomingMatches = [];
        this.outgoingMatches = {};
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
            // Initialize your adapter here
            // Reset the connection indicator during startup
            this.setState('info.connection', false, true);
            this.log.debug('config: ' + JSON.stringify(this.config));
            this.address = tools_1.parseNumber(this.config.address);
            if (isNaN(this.address) || this.address < 0 || this.address > 254) {
                this.log.error(`Config error: Invalid address ${this.config.address} (${this.address})!`);
                return;
            }
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
            // set the start value for retransmissions counter
            this.retransmissionsCountStart = this.retransmissionsCount;
            if (!this.config.port) {
                this.log.warn(`No serial port defined! Adapter will not work...`);
                return;
            }
            this.rhs = new radiohead_serial_1.RadioHeadSerial(this.config.port, parseInt(this.config.baud, 10), this.address, this.config.reliable);
            this.rhs.on('error', this.onRhsError);
            this.rhs.on('init-done', this.onRhsInitDone);
            this.rhs.on('data', this.onRhsData);
            // in this template all states changes inside the adapters namespace are subscribed
            this.subscribeStates('actions.*');
            //this.subscribeStates('data.in.*');
            this.subscribeStates('data.out.*');
        });
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (this.rhs !== null) {
                    this.log.info('closing serial port...');
                    yield this.rhs.close();
                    this.log.info('serial port closed');
                }
                this.setState('info.connection', false, true);
                callback();
            }
            catch (e) {
                callback();
            }
        });
    }
    onRhsError(error) {
        this.log.error('RadioHeadSerial Errro: ' + error);
    }
    prepareDataForMatcher(data) {
        const newData = [];
        data.forEach((val, idx) => {
            if (val === '*' || val === 'D') {
                newData[idx] = null;
            }
            else {
                newData[idx] = tools_1.parseNumber(val);
            }
        });
        return newData;
    }
    onRhsInitDone() {
        this.log.info('manager initialized, my address is ' + tools_1.hexNumber(this.address));
        this.setState('info.connection', true, true);
        this.getForeignObjects(this.namespace + '.data.in.*', 'state', (err, objects) => {
            if (err) {
                this.log.error('error loading incoming data objects');
                return;
            }
            for (const objectId in objects) {
                const obj = objects[objectId];
                const parts = obj.native.data.split(';');
                parts.forEach((part, partIdx) => {
                    if (part.length === 0) {
                        this.log.warn(`empty data part #${partIdx} in object ${objectId} ignored`);
                        return;
                    }
                    const data = part.trim().split(',');
                    const dataMatch = {
                        from: tools_1.parseAddress(obj.native.fromAddress),
                        to: this.config.promiscuous ? tools_1.parseAddress(obj.native.toAddress) : null,
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
        });
        this.getForeignObjects(this.namespace + '.data.out.*', 'state', (err, objects) => {
            if (err) {
                this.log.error('error loading outgoing data objects');
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
                    to: tools_1.parseAddress(obj.native.toAddress) || 0,
                    data: data.map((d) => Buffer.from(d)),
                    role: obj.common.role,
                    type: obj.common.type || 'number',
                    bufferDataType: obj.native.dataType,
                    bufferDataStart: parts[0].indexOf('D')
                };
            }
        });
    }
    onRhsData(msg) {
        this.setStateAsync('info.receivedCount', ++this.receivedCount, true);
        this.setStateAsync('info.lastReceived', new Date().toISOString(), true);
        // log data if enabled
        if (this.config.logAllData) {
            this.log.info(`receied <${tools_1.formatBufferAsHexString(msg.data)}> from ${tools_1.hexNumber(msg.headerFrom)} to ${tools_1.hexNumber(msg.headerTo)} msgID ${tools_1.hexNumber(msg.headerId)}`);
        }
        const data = [...msg.data]; // convert buffer to array
        // set the msg as incoming data, replacing the data buffer by the array
        this.setStateAsync('data.incoming', { val: Object.assign({}, msg, { data }) }, true);
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
    handleMatchedMessage(msg, dataMatch) {
        return __awaiter(this, void 0, void 0, function* () {
            switch (dataMatch.role) {
                case 'button':
                    yield this.setForeignStateAsync(dataMatch.objectId, true, true);
                    break;
                case 'indecator':
                case 'switch':
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
                            val = tools_1.round(val, dataMatch.decimals);
                        }
                    }
                    yield this.setForeignStateAsync(dataMatch.objectId, val, true);
            }
        });
    }
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
     * Is called if a subscribed object changes
     */
    onObjectChange(id, obj) {
        if (obj) {
            // The object was changed
            this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
        }
        else {
            // The object was deleted
            this.log.info(`object ${id} deleted`);
        }
    }
    /**
     * Is called if a subscribed state changes
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
                switch (id) {
                    case this.namespace + '.actions.resetCounters':
                        this.log.info('reset information counters');
                        this.retransmissionsCountStart = 0;
                        this.rhs.resetRetransmissions();
                        for (const id of infoCounters) {
                            this[id] = 0;
                            yield this.setStateAsync('info.' + id, 0, true);
                        }
                        yield this.setStateAsync(id, state, true);
                        return;
                }
                // is this some outgoing data?
                if (this.outgoingMatches.hasOwnProperty(id)) {
                    let buf = null;
                    switch (this.outgoingMatches[id].role) {
                        case 'switch':
                        case 'indecator':
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
    rhsSend(to, buf, sendingObjectId, stateAck) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.rhs)
                return new Error('Not initialized');
            if (this.config.logAllData) {
                this.log.info(`sending <${tools_1.formatBufferAsHexString(buf)}> to ${tools_1.hexNumber(to)}`);
            }
            let err = undefined;
            yield this.rhs.send(to, buf)
                .then(() => {
                this.setStateAsync('info.sentOkCount', ++this.sentOkCount, true);
                this.setStateAsync('info.lastSentOk', new Date().toISOString(), true);
                // set the ack flag
                if (stateAck) {
                    this.setStateAsync(sendingObjectId, stateAck, true);
                }
            })
                .catch((e) => {
                this.setStateAsync('info.sentErrorCount', ++this.sentErrorCount, true);
                this.setStateAsync('info.lastSentError', new Date().toISOString(), true);
                this.log.warn(`error sending message for ${sendingObjectId} to ${tools_1.hexNumber(to)} - ${e}`);
                err = e;
            })
                .then(() => this.updateRetransmissionsCount());
            return err;
        });
    }
    /**
     * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
     * Using this method requires "common.message" property to be set to true in io-package.json
     */
    onMessage(obj) {
        this.log.debug('got message ' + JSON.stringify(obj));
        if (typeof obj === 'object' && obj.message) {
            if (obj.command === 'send') {
                if (typeof obj.message !== 'object') {
                    this.log.warn(`invalid send message from ${obj.from} received ` + JSON.stringify(obj.message));
                    return;
                }
                const payload = obj.message;
                const to = tools_1.parseAddress(payload.to);
                let buf;
                try {
                    buf = Buffer.from(payload.data);
                }
                catch (e) {
                    buf = null;
                }
                if (to === null || buf === null || buf.length === 0) {
                    this.log.warn(`invalid send message from ${obj.from} received ` + JSON.stringify(obj.message));
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
], RadioheadAdapter.prototype, "onRhsInitDone", null);
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
if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options) => new RadioheadAdapter(options);
}
else {
    // otherwise start the instance directly
    (() => new RadioheadAdapter())();
}
