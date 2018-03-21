const Stream = require('buffer-pipe')
const leb = require('leb128')
const {findSections} = require('wasm-json-toolkit')

const FUNC_TYPE = 0x60
const LANGUAGE_TYPES_STRG = {
  'i32': 0x7f,
  'i64': 0x7e,
  'f32': 0x7d,
  'f64': 0x7c,
  'anyref': 0x70,
  'module': 0x6f,
  'func': 0x6e,
  'data': 0x6d,
  'elem': 0x6c,
  'link': 0x6b,
  'id': 0x6a
}

const LANGUAGE_TYPES_BIN = {
  0x7f: 'i32',
  0x7e: 'i64',
  0x7d: 'f32',
  0x7c: 'f64',
  0x70: 'anyref',
  0x6f: 'module',
  0x6e: 'func',
  0x6d: 'data',
  0x6c: 'elem',
  0x6b: 'link',
  0x6a: 'id'
}

const EXTERNAL_KIND_BIN = {
  0x0: 'func',
  0x1: 'table',
  0x2: 'memory',
  0x3: 'global'
}

const EXTERNAL_KIND_STRG = {
  'func': 0x0,
  'table': 0x1,
  'memory': 0x2,
  'global': 0x3
}

/**
 * encodes the type annotations
 * @param {Object} annotations
 * @return {Buffer}
 */
function encode (annotations) {
  const stream = new Stream()
  encodeCustomSection('types', annotations, stream, encodeType)
  encodeCustomSection('typeMap', annotations, stream, encodeTypeMap)
  encodeCustomSection('persist', annotations, stream, encodePersist)

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

/**
 * encodes the type annoations for persist
 * @param {Object} annoations
 * @param {buffer-pipe} [stream]
 * @return {Buffer}
 */
function encodePersist (annotations, stream = new Stream()) {
  leb.unsigned.write(annotations.length, stream)
  for (const entry of annotations) {
    const form = EXTERNAL_KIND_STRG[entry.form]
    leb.unsigned.write(form, stream)
    leb.unsigned.write(entry.index, stream)
    leb.unsigned.write(LANGUAGE_TYPES_STRG[entry.type], stream)
  }
  return stream.buffer
}

/**
 * decodes the persist annotations
 * @param {Buffer} buf
 * @param {Object}
 */
function decodePersist (buf) {
  const stream = new Stream(Buffer.from(buf))
  let numOfEntries = leb.unsigned.read(stream)
  const json = []
  while (numOfEntries--) {
    const form = EXTERNAL_KIND_BIN[leb.unsigned.readBn(stream).toNumber()]
    if (!form) {
      throw new Error('invalid form')
    }
    const index = leb.unsigned.readBn(stream).toNumber()
    const type = LANGUAGE_TYPES_BIN[leb.unsigned.readBn(stream).toNumber()]
    if (!type) {
      throw new Error('invalid param')
    }
    json.push({
      form,
      index,
      type
    })
  }

  if (stream.buffer.length) {
    throw new Error('invalid buffer length')
  }

  return json
}

/**
 * encodes a typeMap definition
 * @param {Object} definition
 * @param {buffer-pipe} [stream]
 * @return {Buffer}
 */
function encodeTypeMap (definition, stream = new Stream()) {
  leb.unsigned.write(definition.length, stream)
  for (let entry of definition) {
    leb.unsigned.write(entry.func, stream)
    leb.unsigned.write(entry.type, stream)
  }
  return stream.buffer
}

/**
 * decodes the TypeMap section
 * @param {Buffer} buf
 * @param {Object}
 */
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

/**
 * encodes the type annotations
 * @param {Object} definition
 * @param {buffer-pipe} [stream]
 * @return {Buffer}
 */
function encodeType (annotations, stream = new Stream()) {
  let binEntries = new Stream()

  leb.unsigned.write(annotations.length, binEntries)
  for (let entry of annotations) {
    // a single type entry binary encoded
    binEntries.write([FUNC_TYPE])

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

/**
 * decodes the Type section
 * @param {Buffer} buf
 * @param {Object}
 */
function decodeType (buf) {
  const stream = new Stream(Buffer.from(buf))
  const numberOfEntries = leb.unsigned.readBn(stream).toNumber()
  const json = []
  for (let i = 0; i < numberOfEntries; i++) {
    let type = stream.read(1)[0]
    if (type !== FUNC_TYPE) {
      throw new Error('invalid form')
    }
    const entry = {
      form: 'func',
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

/**
 * injects custom sections into a wasm binary
 * @param {Buffer} custom - the custom section(s)
 * @param {Buffer} wasm - the wasm binary
 * @return {Buffer}
 */
function injectCustomSection (custom, wasm) {
  const preramble = wasm.subarray(0, 8)
  const body = wasm.subarray(8)
  return Buffer.concat([
    Buffer.from(preramble),
    Buffer.from(custom),
    Buffer.from(body)
  ])
}

/**
 * encodes a json definition and injects it into a wasm binary
 * @param {Object} annotation - the type definition
 * @param {Buffer} wasm - the wasm binary to inject
 */
function encodeAndInject (annotation, wasm) {
  const buf = encode(annotation)
  return injectCustomSection(buf, wasm)
}

function mergeTypeSections (json) {
  const result = {
    types: [],
    indexes: {},
    exports: {},
    persist: []
  }

  const wantedSections = ['types', 'typeMap', 'persist', 'type', 'import', 'function', 'export']
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

  let {value: persist} = iterator.next()
  if (persist) {
    result.persist = decodePersist(persist.payload)
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
  encodeAndInject,
  decodeType,
  decodeTypeMap,
  decodePersist,
  encodeType,
  encodeTypeMap,
  encodePersist,
  encode,
  mergeTypeSections
}
