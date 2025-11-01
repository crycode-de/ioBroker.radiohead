"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var utils = __toESM(require("@iobroker/adapter-core"));
var import_core_decorators = require("core-decorators");
var import_radiohead_serial = require("radiohead-serial");
var import_tools = require("./lib/tools");
const infoCounters = ["receivedCount", "retransmissionsCount", "sentErrorCount", "sentOkCount"];
class RadioheadAdapter extends utils.Adapter {
  /**
   * Constructor to create a new instance of the adapter.
   * @param options The adapter options.
   */
  constructor(options = {}) {
    super({
      ...options,
      name: "radiohead"
    });
    /**
     * Address of this instance in the RadioHead network.
     */
    this.address = 0;
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
    this.rhsInitRetryTimeout = void 0;
    this.on("ready", this.onReady);
    this.on("objectChange", this.onObjectChange);
    this.on("stateChange", this.onStateChange);
    this.on("message", this.onMessage);
    this.on("unload", this.onUnload);
  }
  async onReady() {
    await this.setState("info.connection", false, true);
    this.log.debug("RHS version: " + import_radiohead_serial.version);
    this.log.debug("config: " + JSON.stringify(this.config));
    this.address = (0, import_tools.parseNumber)(this.config.address);
    if (isNaN(this.address) || this.address < 0 || this.address > 254) {
      this.log.error(`Config error: Invalid address ${this.config.address} (${this.address})!`);
      return;
    }
    for (const id of infoCounters) {
      const state = await this.getStateAsync("info." + id);
      this.log.debug(`loaded ${this.namespace}.info.${id} ` + JSON.stringify(state));
      if (state) {
        this[id] = state.val;
      } else {
        await this.setState("info." + id, 0, true);
      }
    }
    this.getForeignObjects(this.namespace + ".data.in.*", "state", (err, objects) => {
      if (err) {
        this.log.error("Error loading incoming data objects");
        return;
      }
      for (const objectId in objects) {
        const obj = objects[objectId];
        const parts = obj.native.data.split(";");
        parts.forEach((part, partIdx) => {
          if (part.length === 0) {
            this.log.warn(`Empty data part #${partIdx} in object ${objectId} ignored`);
            return;
          }
          const data = part.trim().split(",");
          const dataMatch = {
            from: (0, import_tools.parseAddress)(obj.native.fromAddress),
            to: this.config.promiscuous ? (0, import_tools.parseAddress)(obj.native.toAddress) : null,
            data: this.prepareDataForMatcher(data),
            objectId,
            role: obj.common.role,
            type: obj.common.type || "number",
            numParts: parts.length,
            matchedPart: partIdx,
            bufferDataType: obj.native.dataType,
            bufferDataStart: data.indexOf("D"),
            factor: obj.native.factor,
            offset: obj.native.offset,
            decimals: obj.native.decimals
          };
          this.incomingMatches.push(dataMatch);
        });
      }
      this.log.debug(`loaded ${this.incomingMatches.length} incoming matches`);
    });
    this.getForeignObjects(this.namespace + ".data.out.*", "state", (err, objects) => {
      var _a;
      if (err) {
        this.log.error("Error loading outgoing data objects");
        return;
      }
      for (const objectId in objects) {
        const obj = objects[objectId];
        const parts = obj.native.data.split(";").map((p) => p.trim().split(","));
        const data = [];
        parts.forEach((part) => {
          data.push(this.prepareDataForMatcher(part));
        });
        this.outgoingMatches[objectId] = {
          to: (_a = (0, import_tools.parseAddress)(obj.native.toAddress)) != null ? _a : 0,
          data: data.map((d) => Buffer.from(d)),
          role: obj.common.role,
          type: obj.common.type || "number",
          bufferDataType: obj.native.dataType,
          bufferDataStart: parts[0].indexOf("D")
        };
      }
      this.log.debug(`loaded ${Object.keys(this.outgoingMatches).length} outgoing matches`);
    });
    this.retransmissionsCountStart = this.retransmissionsCount;
    await this.rhsInit();
    this.subscribeStates("actions.*");
    this.subscribeStates("data.out.*");
  }
  /**
   * Initialize the RadioHeadSerial instance and connect to the serial port.
   *
   * On first call this will create a new RHS instance and set it up.
   * On next calls this will reinitialize the existing RHS instance to reinitialize the serial port.
   */
  async rhsInit() {
    try {
      if (!this.rhs) {
        this.rhs = new import_radiohead_serial.RadioHeadSerial({
          port: this.config.port,
          baud: parseInt(this.config.baud, 10),
          address: this.address,
          reliable: this.config.reliable,
          autoInit: false
        });
        this.rhs.on("error", this.onRhsError);
        this.rhs.on("close", this.onRhsClose);
        this.rhs.on("data", this.onRhsData);
        if (this.config.promiscuous) {
          this.rhs.setPromiscuous(true);
          this.log.info("Promiscuous mode enabled");
        }
      }
      await this.rhs.init();
      this.log.info("Manager initialized, my RadioHead address is " + (0, import_tools.hexNumber)(this.address));
      this.rhsInitRetryCounter = 0;
      await this.setState("info.connection", true, true);
    } catch (err) {
      this.log.warn(`Error on serial port initialization: ${err}`);
      this.rhsInitRetry();
      return;
    }
  }
  /**
   * Start a RHS initialize retry.
   *
   * This will setup a timeout which will then call a RHS init.
   * The timeout time depends on the retry counter.
   */
  rhsInitRetry() {
    if (this.rhsInitRetryTimeout) {
      clearTimeout(this.rhsInitRetryTimeout);
      this.rhsInitRetryTimeout = null;
    }
    this.rhsInitRetryCounter++;
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
    this.rhsInitRetryTimeout = this.setTimeout(() => {
      this.rhsInitRetryTimeout = null;
      void this.rhsInit();
    }, timeoutTime * 1e3);
  }
  async onUnload(callback) {
    try {
      this.reopenPortOnClose = false;
      if (this.rhsInitRetryTimeout) {
        this.clearTimeout(this.rhsInitRetryTimeout);
        this.rhsInitRetryTimeout = null;
      }
      if (this.rhs !== null) {
        this.log.info("Closing serial port...");
        try {
          await this.rhs.close();
        } catch (e) {
          this.log.warn(`Error closing serial port: ${e}`);
        }
        this.rhs = null;
      }
      await this.setState("info.connection", false, true);
      callback();
    } catch (_err) {
      callback();
    }
  }
  onRhsError(error) {
    this.log.error(`RadioHeadSerial Error: ${error}`);
  }
  onRhsClose() {
    void this.setState("info.connection", false, true);
    if (this.reopenPortOnClose) {
      this.log.warn("Serial port closed");
      this.rhsInitRetry();
    } else {
      this.log.info("Serial port closed");
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
      if (val === "*" || val === "D") {
        newData[idx] = null;
      } else {
        newData[idx] = (0, import_tools.parseNumber)(val);
      }
    });
    return newData;
  }
  async onRhsData(msg) {
    await Promise.all([
      this.setState("info.receivedCount", ++this.receivedCount, true),
      this.setState("info.lastReceived", (/* @__PURE__ */ new Date()).toISOString(), true)
    ]);
    if (this.config.logAllData) {
      this.log.info(`Received <${(0, import_tools.formatBufferAsHexString)(msg.data)}> from ${(0, import_tools.hexNumber)(msg.headerFrom)} to ${(0, import_tools.hexNumber)(msg.headerTo)} msgID ${(0, import_tools.hexNumber)(msg.headerId)}`);
    }
    const data = [...msg.data];
    await this.setState("data.incoming", { val: JSON.stringify({ ...msg, data }) }, true);
    for (const dataMatch of this.incomingMatches) {
      if (msg.headerFrom !== dataMatch.from && dataMatch.from !== null) continue;
      if (msg.headerTo !== dataMatch.to && dataMatch.to !== null) continue;
      if (this.checkDataMatch(data, dataMatch.data)) {
        this.log.debug(`received data ${JSON.stringify(msg)} matched ${JSON.stringify(dataMatch)}`);
        await this.handleMatchedMessage(msg, dataMatch);
      }
    }
  }
  async handleMatchedMessage(msg, dataMatch) {
    switch (dataMatch.role) {
      case "button":
        await this.setForeignStateAsync(dataMatch.objectId, true, true);
        break;
      case "indicator":
      case "switch":
        if (dataMatch.numParts === 1) {
          const oldState = await this.getForeignStateAsync(dataMatch.objectId);
          await this.setForeignStateAsync(dataMatch.objectId, !(oldState == null ? void 0 : oldState.val), true);
        } else {
          if (dataMatch.matchedPart === 0) {
            await this.setForeignStateAsync(dataMatch.objectId, true, true);
          } else {
            await this.setForeignStateAsync(dataMatch.objectId, false, true);
          }
        }
        break;
      default: {
        if (dataMatch.bufferDataStart < 0) return;
        let val;
        if (dataMatch.type === "boolean") {
          val = this.getValueFromBuffer(msg.data, "uint8", dataMatch.bufferDataStart, dataMatch.objectId);
          val = !!val;
        } else {
          val = this.getValueFromBuffer(msg.data, dataMatch.bufferDataType, dataMatch.bufferDataStart, dataMatch.objectId);
          val = val * dataMatch.factor + dataMatch.offset;
          if (typeof dataMatch.decimals === "number") {
            val = (0, import_tools.round)(val, dataMatch.decimals);
          }
        }
        await this.setForeignStateAsync(dataMatch.objectId, val, true);
      }
    }
  }
  /**
   * Helper method to check if some received data matches a predefined data.
   * @param  data    The data to check.
   * @param  matchTo The data to match.
   * @return         true is the data matches.
   */
  checkDataMatch(data, matchTo) {
    if (matchTo.length === 0) return false;
    if (data.length < matchTo.length) return false;
    const l = matchTo.length;
    for (let idx = 0; idx < l; idx++) {
      if (matchTo[idx] === null) continue;
      if (matchTo[idx] !== data[idx]) {
        return false;
      }
    }
    return true;
  }
  /**
   * Update the counter of retransmissions.
   * @return Promise which will be resolved when the state is set.
   */
  async updateRetransmissionsCount() {
    if (!this.rhs) return;
    const newRetr = this.retransmissionsCountStart + this.rhs.getRetransmissions();
    if (newRetr !== this.retransmissionsCount) {
      this.retransmissionsCount = this.retransmissionsCountStart + this.rhs.getRetransmissions();
      await this.setState("info.retransmissionsCount", this.retransmissionsCount, true);
    }
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
        case "int8":
          return buf.readInt8(start);
        case "uint8":
          return buf.readUInt8(start);
        case "int16_le":
          return buf.readInt16LE(start);
        case "int16_be":
          return buf.readInt16BE(start);
        case "uint16_le":
          return buf.readUInt16LE(start);
        case "uint16_be":
          return buf.readUInt16BE(start);
        case "int32_le":
          return buf.readInt32LE(start);
        case "int32_be":
          return buf.readInt32BE(start);
        case "uint32_le":
          return buf.readUInt32LE(start);
        case "uint32_be":
          return buf.readUInt32BE(start);
        case "float32_le":
          return buf.readFloatLE(start);
        case "float32_be":
          return buf.readFloatBE(start);
        case "double64_le":
          return buf.readDoubleLE(start);
        case "double64_be":
          return buf.readDoubleBE(start);
        default:
          this.log.warn(`${objectId} config error! Invalid data type ${type}`);
      }
    } catch (err) {
      this.log.warn(`${objectId} config error! Maybe there are too few byte in the buffer to read a ${type}? ${err}`);
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
        case "int8":
          buf.writeInt8(val, start);
          break;
        case "uint8":
          buf.writeUInt8(val, start);
          break;
        case "int16_le":
          buf.writeInt16LE(val, start);
          break;
        case "int16_be":
          buf.writeInt16BE(val, start);
          break;
        case "uint16_le":
          buf.writeUInt16LE(val, start);
          break;
        case "uint16_be":
          buf.writeUInt16BE(val, start);
          break;
        case "int32_le":
          buf.writeInt32LE(val, start);
          break;
        case "int32_be":
          buf.writeInt32BE(val, start);
          break;
        case "uint32_le":
          buf.writeUInt32LE(val, start);
          break;
        case "uint32_be":
          buf.writeUInt32BE(val, start);
          break;
        case "float32_le":
          buf.writeFloatLE(val, start);
          break;
        case "float32_be":
          buf.writeFloatBE(val, start);
          break;
        case "double64_le":
          buf.writeDoubleLE(val, start);
          break;
        case "double64_be":
          buf.writeDoubleBE(val, start);
          break;
        default:
          this.log.warn(`${objectId} config error! Invalid data type ${type}`);
          return false;
      }
    } catch (err) {
      this.log.warn(`${objectId} config error! Maybe there are too few byte in the buffer to write a ${type}? ${err}`);
      return false;
    }
    return true;
  }
  onObjectChange(id, obj) {
    if (obj) {
      this.log.debug(`object ${id} changed: ${JSON.stringify(obj)}`);
    } else {
      this.log.debug(`object ${id} deleted`);
    }
  }
  async onStateChange(id, state) {
    if (state) {
      this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack}) ` + JSON.stringify(state));
      if (state.ack === true || !this.rhs) return;
      switch (id) {
        case this.namespace + ".actions.resetCounters":
          this.log.info("Reset information counters");
          this.retransmissionsCountStart = 0;
          this.rhs.resetRetransmissions();
          for (const infoCounterId of infoCounters) {
            this[infoCounterId] = 0;
            await this.setState("info." + infoCounterId, 0, true);
          }
          await this.setState(id, state, true);
          return;
      }
      if (Object.prototype.hasOwnProperty.call(this.outgoingMatches, id)) {
        let buf = null;
        switch (this.outgoingMatches[id].role) {
          case "switch":
          case "indicator":
            if (this.outgoingMatches[id].data.length > 1 && !state.val) {
              buf = Buffer.from(this.outgoingMatches[id].data[1]);
              break;
            }
          // eslint-disable-next-line no-fallthrough
          default:
            buf = Buffer.from(this.outgoingMatches[id].data[0]);
        }
        if (this.outgoingMatches[id].bufferDataStart >= 0) {
          if (this.outgoingMatches[id].type === "boolean") {
            buf[this.outgoingMatches[id].bufferDataStart] = state.val ? 1 : 0;
          } else {
            if (!this.writeValueToBuffer(state.val, buf, this.outgoingMatches[id].bufferDataType, this.outgoingMatches[id].bufferDataStart, id)) {
              return;
            }
          }
        }
        await this.rhsSend(this.outgoingMatches[id].to, buf, id, state);
      }
    } else {
      this.log.debug(`state ${id} deleted`);
    }
  }
  async rhsSend(to, buf, sendingObjectId, stateAck) {
    var _a;
    if (!((_a = this.rhs) == null ? void 0 : _a.isInitDone())) {
      this.log.warn(`Unable to send new value of '${sendingObjectId}' because we are not ready to send`);
      return new Error("Unable to send, not ready");
    }
    if (this.config.logAllData) {
      this.log.info(`Sending <${(0, import_tools.formatBufferAsHexString)(buf)}> to ${(0, import_tools.hexNumber)(to)}`);
    }
    let err;
    await this.rhs.send(to, buf).then(() => {
      void this.setState("info.sentOkCount", ++this.sentOkCount, true);
      void this.setState("info.lastSentOk", (/* @__PURE__ */ new Date()).toISOString(), true);
      if (stateAck) {
        void this.setState(sendingObjectId, stateAck, true);
      }
    }).catch((e) => {
      void this.setState("info.sentErrorCount", ++this.sentErrorCount, true);
      void this.setState("info.lastSentError", (/* @__PURE__ */ new Date()).toISOString(), true);
      this.log.warn(`Error sending message for ${sendingObjectId} to ${(0, import_tools.hexNumber)(to)} - ${e}`);
      err = e;
    }).then(() => this.updateRetransmissionsCount());
    return err;
  }
  onMessage(obj) {
    this.log.debug("got message " + JSON.stringify(obj));
    if (typeof obj === "object" && obj.message) {
      if (obj.command === "send") {
        if (typeof obj.message !== "object") {
          this.log.warn(`Invalid send message from ${obj.from} received ` + JSON.stringify(obj.message));
          return;
        }
        const payload = obj.message;
        const to = (0, import_tools.parseAddress)(payload.to);
        let buf;
        try {
          buf = Buffer.from(payload.data);
        } catch (_err) {
          buf = null;
        }
        if (to === null || buf === null || buf.length === 0) {
          this.log.warn(`Invalid send message from ${obj.from} received ` + JSON.stringify(obj.message));
          return;
        }
        void this.rhsSend(to, buf, obj.from).then((error) => {
          if (obj.callback) {
            this.sendTo(obj.from, obj.command, { error }, obj.callback);
          }
        });
      }
    }
  }
}
__decorateClass([
  import_core_decorators.autobind
], RadioheadAdapter.prototype, "onReady", 1);
__decorateClass([
  import_core_decorators.autobind
], RadioheadAdapter.prototype, "onUnload", 1);
__decorateClass([
  import_core_decorators.autobind
], RadioheadAdapter.prototype, "onRhsError", 1);
__decorateClass([
  import_core_decorators.autobind
], RadioheadAdapter.prototype, "onRhsClose", 1);
__decorateClass([
  import_core_decorators.autobind
], RadioheadAdapter.prototype, "onRhsData", 1);
__decorateClass([
  import_core_decorators.autobind
], RadioheadAdapter.prototype, "handleMatchedMessage", 1);
__decorateClass([
  import_core_decorators.autobind
], RadioheadAdapter.prototype, "onObjectChange", 1);
__decorateClass([
  import_core_decorators.autobind
], RadioheadAdapter.prototype, "onStateChange", 1);
__decorateClass([
  import_core_decorators.autobind
], RadioheadAdapter.prototype, "rhsSend", 1);
__decorateClass([
  import_core_decorators.autobind
], RadioheadAdapter.prototype, "onMessage", 1);
if (require.main !== module) {
  module.exports = (options) => new RadioheadAdapter(options);
} else {
  (() => new RadioheadAdapter())();
}
//# sourceMappingURL=main.js.map
