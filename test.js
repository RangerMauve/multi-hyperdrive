const test = require('tape')
const SDK = require('dat-sdk')

const multiHyperdrive = require('./')

test('Read from existing drive', (t) => {
  t.plan(4)

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
          t.end()
          close()
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
    const drive2 = Hyperdrive1('example2')

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
    const drive2 = Hyperdrive1('example2')

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
