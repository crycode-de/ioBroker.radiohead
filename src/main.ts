/**
 * RadioHead adapter for ioBroker
 *
 * Copyright (c) 2019-2020 Peter Müller <peter@crycode.de>
 */

import * as utils from '@iobroker/adapter-core';

import { autobind } from 'core-decorators';

import { RadioHeadSerial, RH_ReceivedMessage as ReceivedMessage } from 'radiohead-serial';

import { parseNumber, parseAddress, hexNumber, round, formatBufferAsHexString } from './lib/tools';

// Augment the adapter.config object with the actual types
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ioBroker {
    interface AdapterConfig {
      port: string;
      baud: string;
      address: string;
      reliable: boolean;
      retries: number;
      timeout: number;
      promiscuous: boolean;
      logAllData: boolean;
    }
  }
}

const infoCounters: ('receivedCount'|'retransmissionsCount'|'sentErrorCount'|'sentOkCount')[] = ['receivedCount', 'retransmissionsCount', 'sentErrorCount', 'sentOkCount'];

class RadioheadAdapter extends utils.Adapter {

  /**
   * Address of this instance in the RadioHead network.
   */
  private address: number = 0x00;

  /**
   * Instance of the used RadioHeadSerial class
   * or `null` if not initialized.
   */
  private rhs: RadioHeadSerial | null = null;

  /**
   * Conuter for received RadioHead messages.
   */
  private receivedCount: number = 0;

  /**
   * Counter for retransmitted RadioHead messages.
   */
  private retransmissionsCount: number = 0;

  /**
   * Counter for falsy sent / not sent RadioHead messages.
   */
  private sentErrorCount: number = 0;

  /**
   * Counter for successfully sent RadioHead messages.
   */
  private sentOkCount: number = 0;

  /**
   * Internal storage for the retransmissions counter on instance start.
   * Used to calculate the total retransmissions count.
   */
  private retransmissionsCountStart: number = 0;

  /**
   * Array of Objects for the incoming data matcher.
   */
  private incomingMatches: IncomingDataMatch[] = [];

  /**
   * Object containing a mapping of objectIDs and the data to send for
   * outgoing data.
   */
  private outgoingMatches: Record<string, OutgoingDataMatch> = {};

  /**
   * Constructor to create a new instance of the adapter.
   * @param options The adapter options.
   */
  public constructor(options: Partial<utils.AdapterOptions> = {}) {
    super({
      ...options,
      name: 'radiohead',
    });

    this.on('ready', this.onReady);
    this.on('objectChange', this.onObjectChange);
    this.on('stateChange', this.onStateChange);
    this.on('message', this.onMessage);
    this.on('unload', this.onUnload);
  }

  /**
   * Is called when databases are connected and adapter received configuration.
   */
  @autobind
  private async onReady(): Promise<void> {
    // Reset the connection indicator during startup
    this.setState('info.connection', false, true);

    // Debug log the current config
    this.log.debug('config: ' + JSON.stringify(this.config));

    // Parse and check the address of the adapter in the RadioHead network
    this.address = parseNumber(this.config.address);
    if (isNaN(this.address) || this.address < 0 || this.address > 254) {
      this.log.error(`Config error: Invalid address ${this.config.address} (${this.address})!`);
      return;
    }

    // Load/initialize the info counters
    for (const id of infoCounters) {
      const state = await this.getStateAsync('info.' + id);
      this.log.debug(`loaded ${this.namespace}.info.${id} ` + JSON.stringify(state));
      if(state) {
        this[id] = state.val as number;
      } else {
        await this.setStateAsync('info.' + id, 0, true);
      }
    }

    // setup matcher for incoming data
    this.getForeignObjects(this.namespace + '.data.in.*', 'state', (err, objects) => {
      if (err) {
        this.log.error('error loading incoming data objects');
        return;
      }

      for (const objectId in objects) {
        const obj: IncomingDataObject = objects[objectId] as IncomingDataObject;

        const parts = obj.native.data.split(';');
        parts.forEach((part, partIdx) => {
          if (part.length === 0) {
            this.log.warn(`empty data part #${partIdx} in object ${objectId} ignored`);
            return;
          }
          const data = part.trim().split(',');
          const dataMatch: IncomingDataMatch = {
            from: parseAddress(obj.native.fromAddress),
            to: this.config.promiscuous ? parseAddress(obj.native.toAddress) : null,
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
        this.log.error('error loading outgoing data objects');
        return;
      }

      for (const objectId in objects) {
        const obj: OutgoingDataObject = objects[objectId] as OutgoingDataObject;
        const parts = obj.native.data.split(';').map((p) => p.trim().split(','));

        const data: DataArray[] = [];
        parts.forEach((part) => {
          data.push(this.prepareDataForMatcher(part));
        });

        this.outgoingMatches[objectId] = {
          to: parseAddress(obj.native.toAddress) || 0,
          data: data.map((d: any) => Buffer.from(d)),
          role: obj.common.role,
          type: obj.common.type || 'number',
          bufferDataType: obj.native.dataType,
          bufferDataStart: parts[0].indexOf('D')
        }
      }

      this.log.debug(`loaded ${Object.keys(this.outgoingMatches).length} outgoing matches`);
    });

    // set the start value for retransmissions counter
    this.retransmissionsCountStart = this.retransmissionsCount;

    // Init the radiohead-serial and catch/log possible errors
    try {
      this.rhs = new RadioHeadSerial({
        port: this.config.port,
        baud: parseInt(this.config.baud, 10),
        address: this.address,
        reliable: this.config.reliable,
        autoInit: false
      });

      this.rhs.on('error', this.onRhsError);
      this.rhs.on('data', this.onRhsData);

      // enable promiscuous mode if configured
      if (this.config.promiscuous) {
        this.rhs.setPromiscuous(true);
        this.log.info('promiscuous mode enabled');
      }

      await this.rhs.init()
        .then(() => {
          this.log.info('manager initialized, my RadioHead address is ' + hexNumber(this.address));

          // set the connection state to connected
          this.setState('info.connection', true, true);
        });

    } catch (err) {
      this.log.warn(`Error on serial port init: ` + err);
      this.log.warn(`Adapter will not work...`);
      return;
    }

    // subscribe needed states
    this.subscribeStates('actions.*');
    this.subscribeStates('data.out.*');
  }

  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   */
  @autobind
  private async onUnload(callback: () => void): Promise<void> {
    try {
      // close the serial port if rhs is initialized
      if (this.rhs !== null) {
        this.log.info('closing serial port...');
        await this.rhs.close();
        this.log.info('serial port closed');
        this.rhs = null;
      }
      // reset connection state
      this.setState('info.connection', false, true);
      callback();
    } catch (e) {
      callback();
    }
  }

  /**
   * Handle RadioHeadSerial errors.
   * @param error The error.
   */
  @autobind
  private onRhsError (error: Error): void {
    this.log.error('RadioHeadSerial Errro: ' + error);
  }

  /**
   * Prepare some data to be used with the matcher for incoming data.
   * @param  data Array of strings for the data to match including placeholders * and D.
   * @return      DataArray to be used with the matcher.
   */
  private prepareDataForMatcher (data: string[]): DataArray {
    const newData: DataArray = [];
    data.forEach((val, idx) => {
      if (val === '*' || val === 'D') {
        newData[idx] = null;
      } else {
        newData[idx] = parseNumber(val);
      }
    });

    return newData;
  }

  /**
   * Handler for incoming RadioHead messages.
   * @param msg The received RadioHead message.
   */
  @autobind
  private onRhsData (msg: ReceivedMessage): void {
    this.setStateAsync('info.receivedCount', ++this.receivedCount, true);
    this.setStateAsync('info.lastReceived', new Date().toISOString(), true);

    // log data if enabled
    if (this.config.logAllData) {
      this.log.info(`received <${formatBufferAsHexString(msg.data)}> from ${hexNumber(msg.headerFrom)} to ${hexNumber(msg.headerTo)} msgID ${hexNumber(msg.headerId)}`);
    }

    const data: DataArray = [...msg.data]; // convert buffer to array

    // set the msg as incoming data, replacing the data buffer by the array
    this.setStateAsync('data.incoming', { val: JSON.stringify({...msg, data}) }, true);

    // check for matches
    this.incomingMatches.forEach((dataMatch) => {

      // filter addresses
      if (msg.headerFrom !== dataMatch.from && dataMatch.from !== null) return;
      if (msg.headerTo !== dataMatch.to && dataMatch.to !== null) return;

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
  @autobind
  private async handleMatchedMessage (msg: ReceivedMessage, dataMatch: IncomingDataMatch): Promise<void> {
    switch (dataMatch.role) {
      case 'button':
        // buttons are pushed only
        await this.setForeignStateAsync(dataMatch.objectId, true, true);
        break;

      case 'indecator':
      case 'switch':
        // switch and indecator can be set true/false or toggled
        if (dataMatch.numParts === 1) {
          // only one part... toggle
          const oldState = await this.getForeignStateAsync(dataMatch.objectId);
          await this.setForeignStateAsync(dataMatch.objectId, !(oldState && oldState.val), true);
        } else {
          // two parts ... part 0 = true, part 1 = false
          if (dataMatch.matchedPart == 0) {
            await this.setForeignStateAsync(dataMatch.objectId, true, true);
          } else {
            await this.setForeignStateAsync(dataMatch.objectId, false, true);
          }
        }
        break;

      default:
        // check if data start is defined
        if (dataMatch.bufferDataStart < 0) return;

        // get the value and set the state
        let val: number|boolean;
        if (dataMatch.type === 'boolean') {
          val = this.getValueFromBuffer(msg.data, 'uint8', dataMatch.bufferDataStart, dataMatch.objectId);
          val = !!val; // make is boolean
        } else { // number
          val = this.getValueFromBuffer(msg.data, dataMatch.bufferDataType, dataMatch.bufferDataStart, dataMatch.objectId);
          val = val * dataMatch.factor + dataMatch.offset;
          if (typeof dataMatch.decimals === 'number') {
            val = round(val, dataMatch.decimals);
          }
        }
        await this.setForeignStateAsync(dataMatch.objectId, val, true);
    }
  }

  /**
   * Helper method to check if some received data matches a predefined data.
   * @param  data    The data to check.
   * @param  matchTo The data to match.
   * @return         true is the data matches.
   */
  private checkDataMatch (data: DataArray, matchTo: DataArray): boolean {
    // check length
    if (matchTo.length === 0) return false;
    if (data.length < matchTo.length) return false;
    // loop through the bytes
    const l = matchTo.length;
    for (let idx = 0; idx < l; idx++) {
      // continue if the byte should be ignored (is null)
      if (matchTo[idx] === null) continue;

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
  private async updateRetransmissionsCount (): Promise<void> {
    if (!this.rhs) return;

    const newRetr = this.retransmissionsCountStart + this.rhs.getRetransmissions();
    if (newRetr !== this.retransmissionsCount) {
      this.retransmissionsCount = this.retransmissionsCountStart + this.rhs.getRetransmissions();
      await this.setStateAsync('info.retransmissionsCount', this.retransmissionsCount, true);
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
  private getValueFromBuffer (buf: Buffer, type: BufferDataType, start: number, objectId: string): number {
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
    } catch (err) {
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
  private writeValueToBuffer (val: number, buf: Buffer, type: BufferDataType, start: number, objectId: string): boolean {
    try {
      switch (type) {
        case 'int8': buf.writeInt8(val, start); break;
        case 'uint8': buf.writeUInt8(val, start); break;
        case 'int16_le': buf.writeInt16LE(val, start); break;
        case 'int16_be': buf.writeInt16BE(val, start); break;
        case 'uint16_le': buf.writeUInt16LE(val, start); break;
        case 'uint16_be': buf.writeUInt16BE(val, start); break;
        case 'int32_le': buf.writeInt32LE(val, start); break;
        case 'int32_be': buf.writeInt32BE(val, start); break;
        case 'uint32_le': buf.writeUInt32LE(val, start); break;
        case 'uint32_be': buf.writeUInt32BE(val, start); break;
        case 'float32_le': buf.writeFloatLE(val, start); break;
        case 'float32_be': buf.writeFloatBE(val, start); break;
        case 'double64_le': buf.writeDoubleLE(val, start); break;
        case 'double64_be': buf.writeDoubleBE(val, start); break;
        default:
          this.log.warn(`${objectId} config error! Invalid data type ${type}`);
          return false;
      }
    } catch (err) {
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
  @autobind
  private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
    if (obj) {
      // The object was changed
      this.log.debug(`object ${id} changed: ${JSON.stringify(obj)}`);
    } else {
      // The object was deleted
      this.log.debug(`object ${id} deleted`);
    }
  }

  /**
   * Is called if a subscribed state changes.
   * @param id    The ID of the state.
   * @param state The ioBroker state.
   */
  @autobind
  private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
    if (state) {
      // The state was changed
      this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack}) ` + JSON.stringify(state));

      // don't do anything if ack is set
      // we aren't able to send something if rhs is not initialized
      if (state.ack === true || !this.rhs) return;

      // handle special states
      switch (id) {
        case this.namespace + '.actions.resetCounters':
          this.log.info('reset information counters');

          this.retransmissionsCountStart = 0;
          this.rhs.resetRetransmissions();

          for (const id of infoCounters) {
            this[id] = 0;
            await this.setStateAsync('info.' + id, 0, true);
          }

          await this.setStateAsync(id, state, true);
          return;
      }

      // is this some outgoing data?
      if (this.outgoingMatches.hasOwnProperty(id)) {
        // prepare the data for sending
        let buf: Buffer | null = null;
        switch (this.outgoingMatches[id].role) {
          case 'switch':
          case 'indecator':
            // switch or indecator uses the second data group for false value if provied
            if (this.outgoingMatches[id].data.length > 1 && !state.val) {
              // send false
              buf = Buffer.from(this.outgoingMatches[id].data[1]) // copy the configured buffer to prevent issues
              break;
            }

          default:
            buf = Buffer.from(this.outgoingMatches[id].data[0]) // copy the configured buffer to prevent issues
        }

        // if there is a data start defined ...
        if (this.outgoingMatches[id].bufferDataStart >= 0) {
          if (this.outgoingMatches[id].type === 'boolean') {
            // boolean type values is always 0x01 (true) or 0x00 (false)
            buf[this.outgoingMatches[id].bufferDataStart] = (state.val) ? 0x01 : 0x00;
          } else {
            // write the value into the buffer
            if (!this.writeValueToBuffer(state.val as number, buf, this.outgoingMatches[id].bufferDataType, this.outgoingMatches[id].bufferDataStart, id)) {
              return;
            }
          }
        }

        // send the data
        await this.rhsSend(this.outgoingMatches[id].to, buf, id, state);
      }
    } else {
      // The state was deleted
      this.log.debug(`state ${id} deleted`);
    }
  }

  /**
   * Method to send some data using RadioHead.
   * @param  to              Address of the receiver.
   * @param  buf             The data to send as a buffer.
   * @param  sendingObjectId ID of the ioBroker object which triggered the sending.
   * @param  stateAck        ioBroker state so set the ack on when sent successfully.
   * @return                 A Promise which will be resolved when done. If there was an error the first argument will be the error.
   */
  @autobind
  private async rhsSend (to: number, buf: Buffer, sendingObjectId: string, stateAck?: ioBroker.State): Promise<Error | undefined> {
    if (!this.rhs || !this.rhs.isInitDone()) {
      this.log.warn(`unable to send new value of '${sendingObjectId}' because we are not ready to send`);
      return Promise.resolve(new Error('Unable to send, not ready'));
    }

    if (this.config.logAllData) {
      this.log.info(`sending <${formatBufferAsHexString(buf)}> to ${hexNumber(to)}`);
    }

    let err: Error | undefined = undefined;
    await this.rhs.send(to, buf)
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
        this.log.warn(`error sending message for ${sendingObjectId} to ${hexNumber(to)} - ${e}`);
        err = e;
      })
      // in any case update the retransmissions counter
      .then(() => this.updateRetransmissionsCount());

    return err;
  }

  /**
   * Some message was sent to this instance over message box (e.g. by a script).
   * @param obj The received ioBroker message.
   */
  @autobind
  private onMessage(obj: ioBroker.Message): void {
    this.log.debug('got message ' + JSON.stringify(obj));

    if (typeof obj === 'object' && obj.message) {
      if (obj.command === 'send') {
        // we should send some message...
        if (typeof obj.message !== 'object') {
          this.log.warn(`invalid send message from ${obj.from} received ` + JSON.stringify(obj.message));
          return;
        }

        const payload: MessagePayloadSend = obj.message as MessagePayloadSend;
        const to = parseAddress(payload.to);

        let buf: Buffer | null;
        try {
          buf = Buffer.from(payload.data as []);
        } catch (e) {
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
              this.sendTo(obj.from, obj.command, {error: error}, obj.callback);
            }
          });
      }
    }
  }

}

if (module.parent) {
  // Export the constructor in compact mode
  module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new RadioheadAdapter(options);
} else {
  // otherwise start the instance directly
  (() => new RadioheadAdapter())();
}
