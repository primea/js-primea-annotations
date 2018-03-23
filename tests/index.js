const tape = require('tape')
const fs = require('fs')
const wabt = require('wabt')
const {wasm2json} = require('wasm-json-toolkit')
const types = require('../')

tape('basic', t => {
  const wat = fs.readFileSync(`${__dirname}/wast/caller.wast`).toString()
  const json = JSON.parse(fs.readFileSync(`${__dirname}/wast/caller.json`))
  const mod = wabt.parseWat('module.wast', wat)

  const buf = types.encode(json)
  const r = mod.toBinary({
    log: true
  })
  let binary = Buffer.from(r.buffer)
  binary = types.injectCustomSection(buf, binary)
  const moduleJSON = wasm2json(binary)

  const mergedJson = types.mergeTypeSections(moduleJSON)
  const expectedJson = {
    'types': [{
      'form': 'func',
      'params': [
        'func'
      ]
    }, {
      'form': 'func',
      'params': [
        'i32'
      ]
    }, {
      'form': 'func',
      'params': [],
      'return_type': 'i32'
    }],
    'indexes': {
      '1': 0,
      '2': 1,
      '3': 2
    },
    'exports': {
      'call': 1
    },
    'persist': []
  }

  t.deepEquals(mergedJson, expectedJson)
  t.end()
})

tape('empty', t => {
  const wat = fs.readFileSync(`${__dirname}/wast/empty.wast`).toString()
  const mod = wabt.parseWat('module.wast', wat)

  const r = mod.toBinary({
    log: true
  })
  let binary = Buffer.from(r.buffer)
  const moduleJSON = wasm2json(binary)

  const mergedJson = types.mergeTypeSections(moduleJSON)
  const expectedJson = {
    'types': [],
    'indexes': {},
    'exports': {},
    'persist': []
  }

  t.deepEquals(mergedJson, expectedJson)
  t.end()
})

tape('globals', t => {
  const wat = fs.readFileSync(`${__dirname}/wast/globals.wast`).toString()
  const json = JSON.parse(fs.readFileSync(`${__dirname}/wast/globals.json`))
  const mod = wabt.parseWat('module.wast', wat)

  const r = mod.toBinary({
    log: true
  })

  let binary = Buffer.from(r.buffer)
  binary = types.encodeAndInject(json, binary)
  const moduleJSON = wasm2json(binary)
  const mergedJson = types.mergeTypeSections(moduleJSON)
  const expectedJson = {
    'types': [{
      'form': 'func',
      'params': []
    }],
    'indexes': {
      '2': 0,
      '3': 0
    },
    'exports': {
      'load': 3,
      'store': 2
    },
    'persist': [{
      'form': 'global',
      'index': 0,
      'type': 'data'
    }]
  }

  t.deepEquals(mergedJson, expectedJson)

  t.end()
})

tape('invalid function type', t => {
  const wat = fs.readFileSync(`${__dirname}/wast/invalid.wast`).toString()
  const mod = wabt.parseWat('module.wast', wat)
  const r = mod.toBinary({
    log: true
  })
  let binary = Buffer.from(r.buffer)
  try {
    const moduleJSON = wasm2json(binary)
    types.mergeTypeSections(moduleJSON)
  } catch (e) {
    t.pass('should invaldate function with return types')
    t.end()
  }
})

tape('invalid function signature', t => {
  t.plan(1)
  const wat = fs.readFileSync(`${__dirname}/wast/globals.wast`).toString()
  const json = JSON.parse(fs.readFileSync(`${__dirname}/wast/invalid.json`))
  const mod = wabt.parseWat('module.wast', wat)

  const buf = types.encode(json)
  const r = mod.toBinary({
    log: true
  })
  let binary = Buffer.from(r.buffer)
  binary = types.injectCustomSection(buf, binary)

  try {
    const moduleJSON = wasm2json(binary)
    types.mergeTypeSections(moduleJSON)
  } catch (e) {
    t.pass('should invalidate function sings that dont match')
  }
})

tape('invalid function signature, wrong base type', t => {
  t.plan(1)
  const wat = fs.readFileSync(`${__dirname}/wast/invalidBaseType.wast`).toString()
  const json = JSON.parse(fs.readFileSync(`${__dirname}/wast/caller.json`))
  const mod = wabt.parseWat('module.wast', wat)

  const buf = types.encode(json)
  const r = mod.toBinary({
    log: true
  })
  let binary = Buffer.from(r.buffer)
  binary = types.injectCustomSection(buf, binary)

  try {
    const moduleJSON = wasm2json(binary)
    types.mergeTypeSections(moduleJSON)
  } catch (e) {
    t.pass('should invalidate function sings that dont match')
  }
})

tape('invalid type encoding', t => {
  t.plan(3)
  const json = JSON.parse(fs.readFileSync(`${__dirname}/wast/caller.json`))
  let buf = types.encodeType(json.types)
  const invalidBuf = Buffer.concat([buf, Buffer.from([0])])
  try {
    types.decodeType(invalidBuf)
  } catch (e) {
    t.pass('should catch invalid type encodings')
  }

  try {
    const invalidForm = Buffer.from(buf)
    invalidForm[1] = 0
    types.decodeType(invalidForm)
  } catch (e) {
    t.pass('should catch invalid type encoding, invild form')
  }

  try {
    const invalidParam = Buffer.from(buf)
    invalidParam[3] = 77
    types.decodeType(invalidParam)
  } catch (e) {
    t.pass('should catch invalid type encoding, invild param')
  }
})

tape('invalid typeMap encoding', t => {
  t.plan(1)
  const json = JSON.parse(fs.readFileSync(`${__dirname}/wast/caller.json`))
  let buf = types.encodeTypeMap(json.typeMap)
  const invalidBuf = Buffer.concat([buf, Buffer.from([0])])
  try {
    types.decodeTypeMap(invalidBuf)
  } catch (e) {
    t.pass('should catch invalid typeMap encodings')
  }
})

tape('invalid persist encoding', t => {
  t.plan(3)
  const json = JSON.parse(fs.readFileSync(`${__dirname}/wast/globals.json`))
  let buf = types.encodePersist(json.persist)
  try {
    const invalidBuf = Buffer.concat([buf, Buffer.from([0])])
    types.decodePersist(invalidBuf)
  } catch (e) {
    t.pass('should catch invalid persist encodings')
  }

  try {
    const invalidParam = Buffer.from(buf)
    invalidParam[3] = 77
    types.decodePersist(invalidParam)
  } catch (e) {
    t.pass('should catch invalid persist type encodings')
  }

  try {
    const invalidParam = Buffer.from(buf)
    invalidParam[1] = 77
    types.decodePersist(invalidParam)
  } catch (e) {
    t.pass('should catch invalid persist form encodings')
  }
})
