# SYNOPSIS 

[![Greenkeeper badge](https://badges.greenkeeper.io/primea/js-primea-annotations.svg)](https://greenkeeper.io/)
[![NPM Package](https://img.shields.io/npm/v/primea-annotations.svg?style=flat-square)](https://www.npmjs.org/package/primea-annotations)
[![Build Status](https://img.shields.io/travis/primea/js-primea-annotations.svg?branch=master&style=flat-square)](https://travis-ci.org/primea/js-primea-annotations)
[![Coverage Status](https://img.shields.io/coveralls/primea/js-primea-annotations.svg?style=flat-square)](https://coveralls.io/r/primea/js-primea-annotations)

[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)  



# INSTALL
`npm install primea-annotations`

# USAGE

```javascript
const primeaAnnotations = require('primea-annotations')
const annotation = {
  'types': [{
    'form': 'func',
    'params': [
      'func'
    ]
  }],
  'typeMap': [{
    'func': 0,
    'type': 0
  }],
  'persist': [{
    'form': 'global'
    'index': 0,
    'type': 'data'
  }]
}

const injectWasmBinary = primeaAnnotations.encodeAndInject(annotation, wasmBinary)
```

# API
[./docs/](./docs/index.md)

# LICENSE
[MPL-2.0][LICENSE]

[LICENSE]: https://tldrlegal.com/license/mozilla-public-license-2.0-(mpl-2)
