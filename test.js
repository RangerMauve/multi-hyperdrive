const test = require('tape')
const SDK = require('dat-sdk')

const multiHyperdrive = require('./')

test('Read from existing hyperdrive', (t) => {
  t.plan(2)

  SDK({ persist: false }).then(({ Hyperdrive, close }) => {
    const drive = Hyperdrive('example')

    const multi = multiHyperdrive(drive)

    drive.writeFile('example.txt', 'Hello World!', () => {
      multi.readFile('example.txt', 'utf8', (err, data) => {
        t.notOk(err, 'able to read')
        t.equal(data, 'Hello World!')
        t.end()
        close()
      })
    })
  }, (e) => t.error(e))
})
