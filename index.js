const Stream = require('buffer-pipe')
const leb = require('leb128')
const {findSections} = require('wasm-json-toolkit')

const LANGUAGE_TYPES_STRG = {
  'actor': 0x0,
  'buf': 0x1,
  'elem': 0x2,
  'link': 0x3,
  'id': 0x4,
  'i32': 0x7f,
  'i64': 0x7e,
  'f32': 0x7d,
  'f64': 0x7c,
  'func': 0x60
}

const LANGUAGE_TYPES_BIN = {
  0x0: 'actor',
  0x1: 'buf',
  0x02: 'elem',
  0x03: 'link',
  0x04: 'id',
  0x7f: 'i32',
  0x7e: 'i64',
  0x7d: 'f32',
  0x7c: 'f64',
  0x60: 'func'
}

function encodeJSON (json) {
  const stream = new Stream()
  encodeCustomSection('types', json, stream, encodeType)
  encodeCustomSection('typeMap', json, stream, encodeTypeMap)
  encodeCustomSection('globals', json, stream, encodeGlobals)

  return stream.buffer
}

function encodeCustomSection (name, json, stream, encodingFunc) {
  let payload = new Stream()
  json = json[name]

  if (json) {
    stream.write([0])
    // encode type
    leb.unsigned.write(name.length, payload)
    payload.write(name)
    encodingFunc(json, payload)
    // write the size of the payload
    leb.unsigned.write(payload.bytesWrote, stream)
    stream.write(payload.buffer)
  }
  return stream
}

function encodeGlobals (json, stream = new Stream()) {
  leb.unsigned.write(json.length, stream)
  for (const entry of json) {
    leb.unsigned.write(entry.index, stream)
    leb.unsigned.write(LANGUAGE_TYPES_STRG[entry.type], stream)
  }
  return stream.buffer
}

function decodeGlobals (buf) {
  const stream = new Stream(Buffer.from(buf))
  let numOfEntries = leb.unsigned.read(stream)
  const json = []
  while (numOfEntries--) {
    const index = leb.unsigned.readBn(stream).toNumber()
    const type = LANGUAGE_TYPES_BIN[leb.unsigned.readBn(stream).toNumber()]
    if (!type) {
      throw new Error('invalid param')
    }
    json.push({
      index,
      type
    })
  }

  if (stream.buffer.length) {
    throw new Error('invalid buffer length')
  }

  return json
}

function encodeTypeMap (json, stream = new Stream()) {
  leb.unsigned.write(json.length, stream)
  for (let entry of json) {
    leb.unsigned.write(entry.func, stream)
    leb.unsigned.write(entry.type, stream)
  }
  return stream.buffer
}

function decodeTypeMap (buf) {
  const stream = new Stream(Buffer.from(buf))
  let numOfEntries = leb.unsigned.read(stream)
  const json = []
  while (numOfEntries--) {
    json.push({
      func: leb.unsigned.readBn(stream).toNumber(),
      type: leb.unsigned.readBn(stream).toNumber()
    })
  }
  if (stream.buffer.length) {
    throw new Error('invalid buffer length')
  }
  return json
}

function encodeType (json, stream = new Stream()) {
  let binEntries = new Stream()

  leb.unsigned.write(json.length, binEntries)
  for (let entry of json) {
    // a single type entry binary encoded
    binEntries.write([LANGUAGE_TYPES_STRG[entry.form]]) // the form

    const len = entry.params.length // number of parameters
    leb.unsigned.write(len, binEntries)
    binEntries.write(entry.params.map(type => LANGUAGE_TYPES_STRG[type])) // the paramter types
    binEntries.write([0])
    // binEntries.write([entry.return_type ? 1 : 0]) // number of return types
    // if (entry.return_type) {
    //   binEntries.write([LANGUAGE_TYPES[entry.return_type]])
    //   throw new Error('return type are not allowed')
    // }
  }

  stream.write(binEntries.buffer)
  return stream.buffer
}

function decodeType (buf) {
  const stream = new Stream(Buffer.from(buf))
  const numberOfEntries = leb.unsigned.readBn(stream).toNumber()
  const json = []
  for (let i = 0; i < numberOfEntries; i++) {
    let type = stream.read(1)[0]
    const form = LANGUAGE_TYPES_BIN[type]
    if (form !== 'func') {
      throw new Error('invalid form')
    }
    const entry = {
      form,
      params: []
    }

    let paramCount = leb.unsigned.readBn(stream).toNumber()

    // parse the entries
    while (paramCount--) {
      const type = stream.read(1)[0]
      const param = LANGUAGE_TYPES_BIN[type]
      if (!param) {
        throw new Error('invalid param')
      }
      entry.params.push(param)
    }
    // remove the last byte
    leb.unsigned.readBn(stream)
    // const numOfReturns = leb.unsigned.readBn(stream).toNumber()
    // if (numOfReturns) {
    //   type = stream.read(1)[0]
    //   entry.return_type = LANGUAGE_TYPES[type]
    // }

    json.push(entry)
  }

  if (stream.buffer.length) {
    throw new Error('invalid buffer length')
  }
  return json
}

function injectCustomSection (custom, wasm) {
  const preramble = wasm.subarray(0, 8)
  const body = wasm.subarray(8)
  return Buffer.concat([preramble, custom, body])
}

function inject (wasm, json) {
  const buf = encodeJSON(json)
  return injectCustomSection(buf, wasm)
}

function mergeTypeSections (json) {
  const result = {
    types: [],
    indexes: {},
    exports: {},
    globals: []
  }

  const wantedSections = ['types', 'typeMap', 'globals', 'type', 'import', 'function', 'export']
  const iterator = findSections(json, wantedSections)
  const mappedFuncs = new Map()
  const mappedTypes = new Map()
  const {value: customType} = iterator.next()
  if (customType) {
    const type = decodeType(customType.payload)
    result.types = type
  }
  let {value: typeMap} = iterator.next()
  if (typeMap) {
    decodeTypeMap(typeMap.payload).forEach(map => mappedFuncs.set(map.func, map.type))
  }

  let {value: globals} = iterator.next()
  if (globals) {
    result.globals = decodeGlobals(globals.payload)
  }

  const {value: type} = iterator.next()
  const {value: imports = {entries: []}} = iterator.next()
  const {value: functions = {entries: []}} = iterator.next()
  functions.entries.forEach((typeIndex, funcIndex) => {
    const newType = type.entries[typeIndex]
    // validate that no function signature have no return types
    if (newType.return_type) {
      throw new Error('no return types allowed')
    }
    let customIndex = mappedFuncs.get(funcIndex)
    if (customIndex === undefined) {
      customIndex = mappedTypes.get(typeIndex)
    } else {
      const customType = result.types[customIndex]
      if (customType.params.length !== newType.params.length) {
        throw new Error('invalid param length')
      }

      if (!newType.params.every(param => param === 'i32')) {
        throw new Error('invalid base param type')
      }
    }

    if (customIndex === undefined) {
      customIndex = result.types.push(newType) - 1
      mappedTypes.set(typeIndex, customIndex)
    }
    result.indexes[funcIndex + imports.entries.length] = customIndex
  })

  const {value: exports = {entries: []}} = iterator.next()
  exports.entries.forEach(entry => {
    if (entry.kind === 'function') {
      result.exports[entry.field_str] = entry.index
    }
  })
  return result
}

module.exports = {
  injectCustomSection,
  inject,
  decodeType,
  decodeTypeMap,
  decodeGlobals,
  encodeType,
  encodeTypeMap,
  encodeGlobals,
  encodeJSON,
  mergeTypeSections
}
