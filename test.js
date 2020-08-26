const test = require('tape')
const SDK = require('dat-sdk')

const multiHyperdrive = require('./')

test('Read from existing drive', (t) => {
  t.plan(6)

  SDK({ persist: false }).then(({ Hyperdrive, close }) => {
    const drive = Hyperdrive('example')

    const multi = multiHyperdrive(drive)

    drive.writeFile('example.txt', 'Hello World!', () => {
      multi.readFile('example.txt', 'utf8', (err, data) => {
        t.notOk(err, 'able to read')
        t.equal(data, 'Hello World!', 'got file contents')

        multi.readdir('/', (err2, files) => {
          t.notOk(err2, 'able to read dir')
          t.deepEqual(files, ['example.txt'], 'got files from drive')
          multi.readdir('/', { stat: true }, (err3, stats) => {
            t.notOk(err3, 'able to read dir stats')
            t.equal(stats.length, 1, 'got stats from drive')
            t.end()
            close()
          })
        })
      })
    })
  }, (e) => t.error(e))
})

test('Read from multiple non-conflicting drives', (t) => {
  t.plan(4)

  Promise.all([
    SDK({ persist: false }),
    SDK({ persist: false })
  ]).then(([{
    Hyperdrive: Hyperdrive1,
    close: close1
  }, {
    Hyperdrive: Hyperdrive2,
    close: close2
  }]) => {
    const drive1 = Hyperdrive1('example2')
    const drive2 = Hyperdrive2('example2')

    const multi = multiHyperdrive(drive1)

    multi.addDrive(drive2)

    prepare((e) => {
      if (e) t.error(e)
      verify((e) => {
        if (e) t.error(e)
        cleanup()
      })
    })

    function prepare (cb) {
      drive1.writeFile('example.txt', 'Hello World!', (e) => {
        if (e) return cb(e)
        drive2.writeFile('example2.txt', 'Hello World!', (e) => {
          if (e) return cb(e)
          cb()
        })
      })
    }

    function verify (cb) {
      multi.readFile('example2.txt', 'utf8', (err, data) => {
        t.notOk(err, 'able to read')
        t.equal(data, 'Hello World!', 'got file contents')

        multi.readdir('/', (err2, files) => {
          t.notOk(err2, 'able to read dir')
          t.deepEqual(files, ['example.txt', 'example2.txt'], 'got files from drives')
          t.end()
          cb()
        })
      })
    }

    function cleanup () {
      close1()
      close2()
    }
  }, (e) => t.error(e))
})

test('Read from multiple drives with conflicting files', (t) => {
  t.plan(4)

  Promise.all([
    SDK({ persist: false }),
    SDK({ persist: false })
  ]).then(([{
    Hyperdrive: Hyperdrive1,
    close: close1
  }, {
    Hyperdrive: Hyperdrive2,
    close: close2
  }]) => {
    const drive1 = Hyperdrive1('example2')
    const drive2 = Hyperdrive2('example2')

    const multi = multiHyperdrive(drive1)

    multi.addDrive(drive2)

    prepare((e) => {
      if (e) t.error(e)
      verify((e) => {
        if (e) t.error(e)
        cleanup()
      })
    })

    function prepare (cb) {
      drive1.writeFile('example.txt', 'Old', (e) => {
        if (e) return cb(e)
        setTimeout(() => {
          drive2.writeFile('example.txt', 'New', (e) => {
            if (e) return cb(e)
            cb()
          })
        }, 1000)
      })
    }

    function verify (cb) {
      multi.readFile('example.txt', 'utf8', (err, data) => {
        t.notOk(err, 'able to read')
        t.equal(data, 'New', 'got newer contents')

        multi.readdir('/', (err2, files) => {
          t.notOk(err2, 'able to read dir')
          t.deepEqual(files, ['example.txt'], 'got files from drives')
          t.end()
          cb()
        })
      })
    }

    function cleanup () {
      close1()
      close2()
    }
  }, (e) => t.error(e))
})

test('Write files to the drive', (t) => {
  t.plan(4)

  Promise.all([
    SDK({ persist: false }),
    SDK({ persist: false })
  ]).then(([{
    Hyperdrive: Hyperdrive1,
    close: close1
  }, {
    Hyperdrive: Hyperdrive2,
    close: close2
  }]) => {
    t.plan(2)

    const drive1 = Hyperdrive1('example')

    drive1.ready(() => {
      const drive2 = Hyperdrive2(drive1.key)

      const multi = multiHyperdrive(drive2)

      multi.writeFile('/example.txt', 'Hello World', (e) => {
        t.ok(e, 'error writing without writers')
        var drive3 = Hyperdrive2('example')

        multi.addDrive(drive3, () => {
          multi.writeFile('/example.txt', 'Hello World', (e) => {
            t.notOk(e, 'no error after adding a writer')
            cleanup()
          })
        })
      })
    })

    function cleanup () {
      t.end()
      close1()
      close2()
    }
  }, (e) => t.error(e))
})
