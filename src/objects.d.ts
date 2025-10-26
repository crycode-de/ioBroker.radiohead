declare interface IncomingDataObject extends ioBroker.StateObject {
  native: IncomingDataObjectNative;
}

declare interface IncomingDataObjectNative {
  fromAddress: string;
  toAddress: string;
  data: string;
  dataType: BufferDataType;
  factor: number;
  offset: number;
  decimals: number;
}

declare interface IncomingDataMatch {
  from: number | null;
  to: number | null;
  data: DataArray;
  objectId: string;
  role: string;
  type: ioBroker.CommonType;
  numParts: number;
  matchedPart: number;
  bufferDataType: BufferDataType;
  bufferDataStart: number;
  factor: number;
  offset: number;
  decimals: number;
}

declare interface OutgoingDataObject extends ioBroker.StateObject {
  native: OutgoingDataObjectNative;
}

declare interface OutgoingDataObjectNative {
  toAddress: string;
  data: string;
  dataType: BufferDataType;
}

declare interface OutgoingDataMatch {
  to: number;
  data: Buffer[];
  role: string;
  type: ioBroker.CommonType;
  bufferDataType: BufferDataType;
  bufferDataStart: number;
}

declare type BufferDataType = 'int8' | 'uint8' | 'int16_le' | 'int16_be' | 'uint16_le' | 'uint16_be' | 'int32_le' | 'int32_be' | 'uint32_le' | 'uint32_be' | 'float32_le' | 'float32_be' | 'double64_le' | 'double64_be' | 'float4_le' | 'float4_be' | 'double8_le' | 'doublle8_be';

declare type DataArray = (number | null)[];

declare interface MessagePayloadSend {
  to: number | string;
  data: number[] | Buffer;
}
