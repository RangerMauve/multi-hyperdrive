// This file is auto generated by the protocol-buffers compiler

/* eslint-disable quotes */
/* eslint-disable indent */
/* eslint-disable no-redeclare */
/* eslint-disable camelcase */

// Remember to `npm install --save protocol-buffers-encodings`
var encodings = require('protocol-buffers-encodings')
var varint = encodings.varint
var skip = encodings.skip

var Tombstone = exports.Tombstone = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

defineTombstone()

function defineTombstone () {
  Tombstone.encodingLength = encodingLength
  Tombstone.encode = encode
  Tombstone.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (!defined(obj.active)) throw new Error("active is required")
    var len = encodings.bool.encodingLength(obj.active)
    length += 1 + len
    if (defined(obj.timestamp)) {
      var len = encodings.varint.encodingLength(obj.timestamp)
      length += 1 + len
    }
    return length
  }

  function encode (obj, buf, offset) {
    if (!offset) offset = 0
    if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
    var oldOffset = offset
    if (!defined(obj.active)) throw new Error("active is required")
    buf[offset++] = 8
    encodings.bool.encode(obj.active, buf, offset)
    offset += encodings.bool.encode.bytes
    if (defined(obj.timestamp)) {
      buf[offset++] = 16
      encodings.varint.encode(obj.timestamp, buf, offset)
      offset += encodings.varint.encode.bytes
    }
    encode.bytes = offset - oldOffset
    return buf
  }

  function decode (buf, offset, end) {
    if (!offset) offset = 0
    if (!end) end = buf.length
    if (!(end <= buf.length && offset <= buf.length)) throw new Error("Decoded message is not valid")
    var oldOffset = offset
    var obj = {
      active: false,
      timestamp: 0
    }
    var found0 = false
    while (true) {
      if (end <= offset) {
        if (!found0) throw new Error("Decoded message is not valid")
        decode.bytes = offset - oldOffset
        return obj
      }
      var prefix = varint.decode(buf, offset)
      offset += varint.decode.bytes
      var tag = prefix >> 3
      switch (tag) {
        case 1:
        obj.active = encodings.bool.decode(buf, offset)
        offset += encodings.bool.decode.bytes
        found0 = true
        break
        case 2:
        obj.timestamp = encodings.varint.decode(buf, offset)
        offset += encodings.varint.decode.bytes
        break
        default:
        offset = skip(prefix & 7, buf, offset)
      }
    }
  }
}

function defined (val) {
  return val !== null && val !== undefined && (typeof val !== 'number' || !isNaN(val))
}
