const EventEmitter = require('events')
const { PassThrough } = require('stream')
const makeDir = require('make-dir')
const { dirname } = require('path')

module.exports = function multiHyperdrive (primary) {
  return new MultiHyperdrive(primary)
}

class MultiHyperdrive extends EventEmitter {
  constructor (primary) {
    super()

    this.primary = primary
    this.sources = new Map()

    if (!primary) throw new TypeError('Must provide a primary drive')

    // TODO: Listen on events from primary drive and re-emit them

    this.addDrive(primary)
  }

  get key () {
    return this.primary.key
  }

  get discoveryKey () {
    return this.primary.discoveryKey
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

  get drives () {
    return [...this.sources.values()]
  }

  addDrive (drive, cb) {
    drive.ready(() => {
      this.sources.set(drive.key.toString('hex'), drive)
    })
  }

  runAll (method, args, cb) {
    const all = this.drives
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

  // Default checker function
  // Check the stats, and return the drive with the latest data for this path
  // If drive1 is newer, return < 0
  // If drive1 is older, return > 0
  // If they are the same return 0
  compareStats (stat1, stat2) {
    if (!stat1 && !stat2) return 0
    if (stat1 && !stat2) return -1
    if (!stat1 && stat2) return 1

    const { ctime: time1 } = stat1
    const { ctime: time2 } = stat2

    return time2 - time1
  }

  resolveLatest (path, cb) {
    this.runAll('stat', [path], (err, results) => {
      if (err) return cb(err)
      try {
        const sorted = results
          .filter(({ value }) => !!value)
          .sort(({ value: stat1 }, { value: stat2 }) => this.compareStats(stat1, stat2))

        if (!sorted.length) return cb(null, this.primary)
        const { drive } = sorted[0]
        cb(null, drive)
      } catch (e) {
        cb(e)
      }
    })
  }

  getContent (cb) {
    throw new Error('Not Supported')
  }

  // Open a file descriptor, special cases for writing and reading
  // See if it's writable or readable
  // If readable, resolve to latest and open
  // If writable, open on writer
  // FD should be an object with the raw FD and the drive to use
  // cb(null, {fd, drive})
  open (name, flags, cb) {
    if (typeof flags === 'function') return this.open(name, 'r', cb)

    const writable = flags.includes('a') || flags.includes('w')

    if (writable) {
      makeDir(dirname(name), { fs: this.writerOrPrimary }).then(() => {
        openFD(this.writerOrPrimary)
      }).catch(cb)
    } else {
      this.resolveLatest(name, (err, drive) => {
        if (err) return cb(err)
        openFD(drive)
      })
    }

    function openFD (drive) {
      drive.open(name, flags, (err, fd) => {
        if (err) return cb(err)
        cb(null, { fd, drive })
      })
    }
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
    if (!opts) opts = {}
    const stream = new PassThrough()

    makeDir(dirname(name), { fs: this.writerOrPrimary }).then(() => {
      const dest = this.writerOrPrimary.createWriteStream(name, opts)
      stream.pipe(dest)
    }).catch((e) => stream.destroy(e))

    return stream
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
    makeDir(dirname(name), { fs: this.writerOrPrimary }).then(() => {
      this.writerOrPrimary.writeFile(name, buf, opts, cb)
    }).catch(cb)
  }

  truncate (name, size, cb) {
    return this.writerOrPrimary.truncate(name, size, cb)
  }

  ftruncate (fd, size, cb) {
    return fd.drive.ftruncate(fd.fd, size, cb)
  }

  mkdir (name, opts, cb) {
    if (typeof opts === 'function') return this.mkdir(name, null, cb)
    makeDir(name, { fs: this.writerOrPrimary }).then(() => cb(null), cb)
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
      drive.lstat(name, opts, (err, stat) => {
        if (err) return cb(err)
        stat.drive = drive
        cb(null, stat)
      })
    })
  }

  stat (name, opts, cb) {
    if (typeof opts === 'function') return this.stat(name, null, opts)
    if (!opts) opts = {}
    return this.resolveLatest(name, (err, drive) => {
      if (err) return cb(err)
      drive.stat(name, opts, (err, stat) => {
        if (err) return cb(err)
        stat.drive = drive
        cb(null, stat)
      })
    })
  }

  access (name, opts, cb) {
    if (typeof opts === 'function') return this.exists(name, null, opts)
    this.runAll('access', [name, opts], (err, results) => {
      if (err) cb(err)
      const exists = results.find(({ err }) => !err)
      if (exists) return cb(null)
      const firstError = results.find(({ err }) => err)
      const gotErr = firstError ? firstError.err : null
      cb(gotErr)
    })
  }

  exists (name, opts = {}, cb) {
    if (typeof opts === 'function') return this.exists(name, null, opts)
    this.access(name, opts, (err) => {
      const exists = !err
      cb(exists)
    })
  }

  readdir (name, opts = {}, cb) {
    if (typeof opts === 'function') return this.readdir(name, null, opts)
    this.runAll('readdir', [name, opts], (err, results) => {
      if (err) return cb(err)
      // Honestly, I'm sorry for this code but it's a complex task
      if (opts && opts.stats) {
        // Map seen files to the latest stat for it
        // This is so that we can determine the latest item individually
        const seenItems = new Map()
        let lastError = null
        for (const { value, err, drive } of results) {
          if (err) {
            lastError = err
            continue
          }
          for (const { stat, name } of value) {
            stat.drive = drive
            if (seenItems.has(name)) {
              const existing = seenItems.get(name)
              // If the new stat is "newer" than the old one, replace it
              if (this.compareStats(existing, stat) > 0) seenItems.put(name, stat)
            } else seenItems.put(name, stat)
          }
          const items = [...seenItems.entries()].map(([name, stat]) => {
            return { name, stat }
          })
          if (!items.length && lastError) cb(lastError)
          else cb(null, items)
        }
      } else {
        let lastError = null
        const knownItems = new Set()
        for (const { value, err } of results) {
          if (err) {
            lastError = err
            continue
          }
          for (const item of value) knownItems.add(item)
        }

        const items = [...knownItems]
        if (!items.length && lastError) cb(lastError)
        else cb(null, items)
      }
    })
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

  // This isn't really documented anywhere and I'm not sure if it's safe to use. 🤔
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
    throw Error('Not Supported')
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
    const watchers = this.drives.map((drive) => drive.watch(name, onchange))

    return { destroy: destroy }

    function destroy () {
      watchers.map((watcher) => watcher.destroy())
    }
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
