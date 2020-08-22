# multi-hyperdrive
Take a bunch of hyperdrives, and read from them as if they were one.

Inspired by [peerfs](https://github.com/karissa/peerfs/) and [kappa-drive](https://gitlab.com/coboxcoop/kappa-drive)

## Goals

- Don't manage drives
  - No opinion on storage
  - Doesn't store list of drives
  - Doesn't handle replication for you
- Support (most) hyperdrive methods / properties

## API

```js
const MultiDrive = require('multi-hyperdrive')

// You must specify a dirve for the `key` and `peers` and stuff
const drives = new MultiDrive(primaryDrive)

drives.addDrive(drive1)
drives.addDrive(drive2)

// Will stat each dirve and get return the file with the latest mtime
drives.readFile('/example.txt', 'utf8', (err, data) => {
  console.log(err || data)
})

// Will readdir in each drive and return a set of all file names
drives.readdir('/', (err, files) => {
  console.log(err||files)
})

// Will iterate through drives until it finds a writable one and will write to it
drives.writeFile('/example.txt', 'hello world', (err) => {
  console.log(err || 'Done!')
})
```

## Concerns

- What does 'version' mean for multiwriter?
- How should file tombstones be stored?
- What happens when there's both a file and folder?
  - Try to error when writing?
  - Error when reading?
- Vector clocks?
