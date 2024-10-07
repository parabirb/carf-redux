// deps
import rs from "$lib/reedSolomon";

// array of message types
export const MESSAGE_TYPES = [
    "init",
    "join",
    "start",
    "place",
    "choose",
    "end",
    "INVALID_1",
    "INVALID_2"
];

// array for callsign encoding
export const CALLSIGN_ENCODING = [
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V",
    "W",
    "X",
    "Y",
    "Z",
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9"
];

// packet class
export class Packet {
    // construct a message from its type, callsign, and payload
    constructor(type = null, callsign = null, payload = null) {
        this.type = type;
        this.callsign = callsign;
        this.payload = payload;
        this.encoder = new rs.ReedSolomonEncoder(rs.GenericGF.AZTEC_DATA_8());
        this.decoder = new rs.ReedSolomonDecoder(rs.GenericGF.AZTEC_DATA_8());
    }

    // create a message from bytes
    fromBytes(bytes) {
        // convert our buffer to an array after decode
        this.decoder.decode(bytes, 8);
        console.log(bytes);
        let array = [...bytes.slice(0, 6)];
        // turn this array into a string of bits
        array = array.map(x => x.toString(2).padStart(8, "0").split("")).reduce((prev, cur) => [...prev, ...cur], []);
        // set our type
        this.type = MESSAGE_TYPES[parseInt(array.slice(0, 3).join(""), 2)];
        // decode our payload, if it exists
        if (this.type === "init" || this.type === "join" || this.type === "end") this.payload = null;
        else {
            // yes i know using parseint for these uneven alignments is cancer i don't care
            this.payload = parseInt(array.slice(3, 12).join(""), 2);
        };
        // form the callsign
        this.callsign = "";
        for (let i = 0; i < 6; i++) {
            let letter = CALLSIGN_ENCODING[parseInt(array.slice(12 + i * 6, 18 + i * 6).join(""), 2)];
            if (!!letter) this.callsign += letter;
        }
    }

    // convert a message to bytes
    toBytes() {
        // init a bit array
        let bitArray = [];
        // push the message type
        let typeIndex = MESSAGE_TYPES.indexOf(this.type);
        for (let i = 2; i >= 0; i--) {
            bitArray.push((typeIndex & (0x1 << i)) >> i);
        }
        // push the payload
        for (let i = 8; i >= 0; i--) {
            bitArray.push((this.payload & (0x1 << i)) >> i);
        }
        // encode the callsign
        for (let i = 0; i < 6; i++) {
            if (i > this.callsign.length) bitArray.push(1, 1, 1, 1, 1, 1);
            else for (let j = 5; j >= 0; j--) bitArray.push((CALLSIGN_ENCODING.indexOf(this.callsign[i]) & (0x1 << j)) >> j);
        }
        // create a uint8array
        let byteArray = new Uint8Array(14);
        // push shit to the byte array
        for (let i = 0; i < 48; i++) {
            byteArray[Math.floor(i / 8)] <<= 1;
            byteArray[Math.floor(i / 8)] |= +bitArray[i];
        }
        // encode the message
        this.encoder.encode(byteArray, 8);
        // return a bytearray
        return byteArray;
    }
}