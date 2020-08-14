const EventEmitter = require('events')
const { PassThrough } = require('stream')

module.exports = function multiHyperdrive (primary) {
  return new MultiHyperdrive(primary)
}

class MultiHyperdrive extends EventEmitter {
  constructor (primary) {
    super()

    this.primary = primary
    this.writer = null
    this.sources = new Map()

    if (!primary) throw new TypeError('Must provide a primary drive')

    this.addDrive(primary)
  }

  get version () {
    // TODO: Figure out what versions mean for multiple drives
    throw new Error('Not Supported')
  }

  get writable () {
    return !!this.writer
  }

  get contentWritable () {
    return this.writerOrPrimary.contentWritable
  }

  get peers () {
    return this.primary.peers
  }

  get writerOrPrimary () {
    return this.writer || this.primary
  }

  get writer () {
    for (const drive of this.sources.values()) {
      if (drive.writable) return drive
    }
  }

  addDrive (drive, cb) {
    drive.ready(() => {
      this.sources.set(drive.key.toString('hex'), drive)
    })
  }

  runAll (method, args, cb) {
    const all = [...this.sources.values()]
    const total = all.length
    const results = []

    if (!total) return setTimeout(() => cb(null, []))

    for (const drive of all) {
      drive[method](...args, (err, value) => {
        results.push({ drive, err, value })
        if (results.length === total) cb(null, results)
      })
    }
  }

  compareLatest (drive1, drive2, path, cb) {
    // Default checker function
    // Check the stats, and return the drive with the latest data for this path
  }

  resolveLatest (path, cb) {

  }

  getContent (cb) {
    throw new Error('Not Supported')
  }

  open (name, flags, cb) {
    // See if it's writable or readable
    // If readable, resolve to latest and open
    // If writable, open on writer
    // FD should be an object with the raw FD and the drive to use
    // cb(null, {fd, drive})
  }

  read (fd, buf, offset, len, pos, cb) {
    return fd.drive.read(fd.fd, buf, offset, len, pos, cb)
  }

  write (fd, buf, offset, len, pos, cb) {
    return fd.drive.write(fd.fd, buf, offset, len, pos, cb)
  }

  createReadStream (name, opts) {
    if (!opts) opts = {}
    const stream = new PassThrough()
    // Resolve to latest, and call read stream
    this.resolveLatest(name, (err, drive) => {
      if (err) stream.destroy(err)
      else {
        const source = drive.createReadStream(name, opts)

        source.pipe(stream)
      }
    })
    return stream
  }

  createDiffStream (other, prefix, opts) {
    throw new Error('Not supported')
  }

  createDirectoryStream (name, opts) {
    throw new Error('Not supported')
  }

  createWriteStream (name, opts) {
    return this.writerOrPrimary.createWriteStream(name, opts)
  }

  readFile (name, opts, cb) {
    if (typeof opts === 'function') return this.readFile(name, null, opts)
    if (typeof opts === 'string') opts = { encoding: opts }
    if (!opts) opts = {}
    return this.resolveLatest(name, (err, drive) => {
      if (err) cb(err)
      else drive.readFile(name, opts, cb)
    })
  }

  writeFile (name, buf, opts, cb) {
    return this.writerOrPrimary.writeFile(name, buf, opts, cb)
  }

  truncate (name, size, cb) {
    return this.writerOrPrimary.truncate(name, size, cb)
  }

  ftruncate (fd, size, cb) {
    return fd.drive.ftruncate(fd.fd, size, cb)
  }

  mkdir (name, opts, cb) {
    return this.writerOrPrimary.mkdir(name, opts, cb)
  }

  readlink (name, cb) {
    return this.resolveLatest(name, (err, drive) => {
      if (err) return cb(err)
      drive.readlink(name, cb)
    })
  }

  lstat (name, opts, cb) {
    if (typeof opts === 'function') return this.lstat(name, null, opts)
    if (!opts) opts = {}
    return this.resolveLatest(name, (err, drive) => {
      if (err) return cb(err)
      drive.lstat(name, opts, cb)
    })
  }

  stat (name, opts, cb) {
    if (typeof opts === 'function') return this.stat(name, null, opts)
    if (!opts) opts = {}
    return this.resolveLatest(name, (err, drive) => {
      if (err) return cb(err)
      drive.stat(name, opts, cb)
    })
  }

  access (name, opts, cb) {
  // TODO: This seems important
  }

  exists (name, opts, cb) {
  // TODO: This seems important
  }

  readdir (name, opts, cb) {
    if (typeof opts === 'function') return this.readdir(name, null, opts)
    // Do a praralell readdir on all sources
    // Merge each one based on stats
  }

  unlink (name, cb) {
    // TODO: Add tombstones
    return this.writerOrPrimary.unlink(name, cb)
  }

  rmdir (name, cb) {
    if (!cb) cb = noop
    // TODO: Add tombstones
    return this.writerOrPrimary.rmdir(name, cb)
  }

  replicate (isInitiator, opts) {
    // TODO: Maybe add replication eventually?
    // PRs welcome. 😂
    throw new Error('Not supported')
  }

  checkout (version, opts) {
    // TODO: Figure out along with version
    throw new Error('Not Supported')
  }

  close (fd, cb) {
    if (typeof fd === 'function') {
      this.runAll('close', [], cb)
    } else {
      fd.drive.close(fd.fd, cb)
    }
  }

  destroyStorage (cb) {
    throw new Error('Not Supported')
  }

  stats (path, opts, cb) {
    if (typeof opts === 'function') return this.stats(path, null, opts)
    this.resolveLatest(path, (err, drive) => {
      if (err) return cb(err)
      drive.stats(path, opts, cb)
    })
  }

  watchStats (path, opts) {
    throw Error('Not Supported')
  }

  mirror () {
    return unmirror

    function unmirror () {
    }
  }

  clear (path, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = null
    }
    opts = opts || {}
    if (!cb) cb = noop
    this.runAll('clear', [path, opts], cb)
  }

  download (path, opts, cb) {
    // TODO: This needs to be reimplemented
    // We only want to download the latest files accross the board
    if (typeof opts === 'function') {
      cb = opts
      opts = null
    }
    opts = opts || {}
    if (!cb) cb = noop
  }

  watch (name, onchange) {
    // TODO: Should we blindly take all updates?

    return unwatch

    function unwatch () {}
  }

  mount (path, key, opts, cb) {
    if (typeof opts === 'function') return this.mount(path, key, null, opts)
    return this.writerOrPrimary.mount(path, key, opts, cb)
  }

  unmount (path, cb) {
    return this.writerOrPrimary.unmount(path, cb)
  }

  symlink (target, linkName, cb) {
    return this.writerOrPrimary.symlink(target, linkName, cb)
  }

  createMountStream (opts) {
    // TODO: Combine mount streams from others
  }

  getAllMounts (opts, cb) {
    // TODO: Combine mount list from others
  }

  registerExtension (name, handlers) {
    return this.primary.registerExtension(name, handlers)
  }

  setMetadata (path, key, value, cb) {
    return this.writerOrPrimary.setMetadata(path, key, value, cb)
  }

  removeMetadata (path, key, cb) {
    return this.writerOrPrimary.removeMetadata(path, key, cb)
  }

  copy (from, to, cb) {
    return this.writerOrPrimary.copy(from, to, cb)
  }

  createTag (name, version, cb) {
    // TODO: Figure out what versions mean for multiple drives
    throw new Error('Not Supported')
  }

  getAllTags (cb) {
    // TODO: Figure out what versions mean for multiple drives
    throw new Error('Not Supported')
  }

  deleteTag (name, cb) {
    // TODO: Figure out what versions mean for multiple drives
    throw new Error('Not Supported')
  }

  getTaggedVersion (name, cb) {
    // TODO: Figure out what versions mean for multiple drives
    throw new Error('Not Supported')
  }
}

function noop () {}
