const EventEmitter = require('events')
const { PassThrough } = require('stream')
const { dirname, join } = require('path').posix
const { Tombstone } = require('./messages')

const THE_TOMB = '.tombstones'

class MultiHyperdrive extends EventEmitter {
  constructor (primary) {
    super()

    this.primary = primary
    this.sources = new Map()

    if (!primary) throw new TypeError('Must provide a primary drive')

    // TODO: Listen on events from primary drive and re-emit them

    this.addDrive(primary)

    const onContentFeed = (feed) => this.emit('content-feed', feed)
    const onMetadataFeed = (feed) => this.emit('metadata-feed', feed)
    const onMount = (trie) => this.emit('mount', trie)

    const onClose = () => this.emit('close')
    const onError = (err) => this.emit('error', err)
    const onUpdate = () => this.emit('update')

    const onPeerAdd = (peer) => this.emit('peer-add', peer)
    const onPeerOpen = (peer) => this.emit('peer-open', peer)
    const onPeerRemove = (peer) => this.emit('peer-remove', peer)

    primary.on('content-feed', onContentFeed)
    primary.on('metadata-feed', onMetadataFeed)
    primary.on('mount', onMount)

    primary.on('close', onClose)
    primary.on('error', onError)
    primary.on('update', onUpdate)

    primary.on('peer-add', onPeerAdd)
    primary.on('peer-open', onPeerOpen)
    primary.on('peer-remove', onPeerRemove)

    this._unlisten = () => {
      primary.removeListener('content-feed', onContentFeed)
      primary.removeListener('metadata-feed', onMetadataFeed)
      primary.removeListener('mount', onMount)

      primary.removeListener('close', onClose)
      primary.removeListener('error', onError)
      primary.removeListener('update', onUpdate)

      primary.removeListener('peer-add', onPeerAdd)
      primary.removeListener('peer-open', onPeerOpen)
      primary.removeListener('peer-remove', onPeerRemove)
    }
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
      if (cb) cb()
    })
    drive.once('close', () => {
      this.removeDrive(drive.key)
    })
  }

  hasDrive (key) {
    return this.sources.get(key.toString('hex'))
  }

  removeDrive (key) {
    return this.sources.delete(key.toString('hex'))
  }

  _runAll (method, args, cb) {
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

  _runAllDBs (method, args, cb) {
    const all = this.drives
    const total = all.length
    const results = []

    if (!total) return setTimeout(() => cb(null, []))
    for (const drive of all) {
      drive.db[method](...args, (err, value) => {
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
    if (stat1 && stat2) {
      const { ctime: date1 } = stat1
      const { ctime: date2 } = stat2

      const time1 = date1.getTime()
      const time2 = date2.getTime()

      return time2 - time1
    }
    if (!stat1 && !stat2) return 0
    if (stat1 && !stat2) return -1
    if (!stat1 && stat2) return 1
  }

  resolveLatest (name, cb) {
    this.existsTombstone(name, (err, exists) => {
      if (err) return cb(err)
      if (exists) return cb(null, exists)
      this._runAll('stat', [name], (err, results) => {
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
    })
  }

  // Resolves to the drive that says a tombstone exists for this path
  existsTombstone (name, cb) {
    const casket = join(THE_TOMB, name)

    this._runAllDBs('get', [casket, { hidden: true }], (err, results) => {
      if (err) return cb(err)

      const lastTime = 0
      let exists = null

      for (const { value: result, drive } of results) {
        if (!result) continue
        const { value } = result
        if (!value) continue
        const tombstone = Tombstone.decode(value)
        const { timestamp, active } = tombstone

        if ((timestamp - lastTime) > 0) {
          exists = active ? drive : null
        }
      }

      cb(null, exists)
    })
  }

  setTombstone (name, active, cb) {
    const timestamp = Date.now()
    const tombstone = Tombstone.encode({ timestamp, active })
    const casket = join(THE_TOMB, name)

    this.writerOrPrimary.db.put(casket, tombstone, { hidden: true }, cb)
  }

  eraseTombstone (name, cb) {
    const parent = dirname(name)

    const doErase = () => {
      this.existsTombstone(name, (err, exists) => {
        if (err) return cb(err)
        if (!exists) return cb(null)
        this.setTombstone(name, false, cb)
      })
    }

    if (parent === name) {
      doErase()
    } else {
      this.eraseTombstone(parent, (err) => {
        if (err) return cb(err)
        doErase()
      })
    }
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
      ensureDir(dirname(name), this.writerOrPrimary, (err) => {
        if (err) return cb(err)
        openFD(this.writerOrPrimary)
      })
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

    ensureDir(dirname(name), this.writerOrPrimary, (err) => {
      if (err) return stream.destroy(err)
      const dest = this.writerOrPrimary.createWriteStream(name, opts)
      stream.pipe(dest)

      this.eraseTombstone(name, (err) => {
        if (err) stream.destroy(err)
      })
    })

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
    if (typeof opts === 'function') return this.writeFile(name, buf, null, opts)
    ensureDir(dirname(name), this.writerOrPrimary, (err) => {
      if (err) return cb(err)
      this.writerOrPrimary.writeFile(name, buf, opts, (err, result) => {
        if (err) return cb(err)
        this.eraseTombstone(name, (err) => {
          if (err) return err
          cb(null, result)
        })
      })
    })
  }

  truncate (name, size, cb) {
    return this.writerOrPrimary.truncate(name, size, cb)
  }

  ftruncate (fd, size, cb) {
    return fd.drive.ftruncate(fd.fd, size, cb)
  }

  mkdir (name, opts, cb) {
    if (typeof opts === 'function') return this.mkdir(name, null, cb)
    ensureDir(name, this.writerOrPrimary, (err) => {
      if (err) return cb(err)
      this.eraseTombstone(name, cb)
    })
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
    this._runAll('access', [name, opts], (err, results) => {
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
    this._runAll('readdir', [name, opts], (err, results) => {
      if (err) return cb(err)
      // Honestly, I'm sorry for this code but it's a complex task
      if (opts && opts.includeStats) {
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
              if (this.compareStats(existing, stat) > 0) seenItems.set(name, stat)
            } else seenItems.set(name, stat)
          }
          const items = [...seenItems.entries()].map(([name, stat]) => {
            return { name, stat }
          })

          if (!items.length) return cb(lastError, items)

          let checked = 0
          const existingItems = []
          items.forEach((item) => {
            const { name: itemName } = item
            this.existsTombstone(join(name, itemName), (err, tombstone) => {
              if (err) {
                if (checked !== items.length) cb(err)
                checked = items.length
                return
              }
              if (!tombstone) existingItems.push(item)
              checked++
              if (checked === items.length) cb(null, existingItems)
            })
          })
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

        if (!items.length) return cb(lastError, items)

        let checked = 0
        const existingItems = []
        items.forEach((item) => {
          this.existsTombstone(join(name, item), (err, tombstone) => {
            if (err) {
              if (checked !== items.length) cb(err)
              checked = items.length
              return
            }
            if (!tombstone) existingItems.push(item)
            checked++
            if (checked === items.length) cb(null, existingItems)
          })
        })
      }
    })
  }

  unlink (name, cb) {
    this.setTombstone(name, true, (err) => {
      if (err) return cb(err)
      return this.writerOrPrimary.unlink(name, () => {
        // Even if we couldn't delete it, we added a tombstone so it's kind of a success
        cb(null)
      })
    })
  }

  rmdir (name, cb) {
    if (!cb) cb = noop
    // Even if we couldn't delete it, we added a tombstone so it's kind of a success
    this.writerOrPrimary.rmdir(name, (err) => {
      // If the directory isn't empty, we can't delete it.
      if (err.code === 'ENOTEMPTY') cb(err)
      this.setTombstone(name, true, (err) => {
        if (err) return cb(err)
        else cb(null)
      })
    })
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
      this._runAll('close', [], (err) => {
        this._unlisten()
        cb(err)
      })
    } else {
      fd.drive.close(fd.fd, cb)
    }
  }

  destroyStorage (cb) {
    throw new Error('Not Supported')
  }

  // This isn't really documented anywhere and I'm not sure if it's safe to use. 🤔
  stats (name, opts, cb) {
    if (typeof opts === 'function') return this.stats(name, null, opts)
    this.resolveLatest(name, (err, drive) => {
      if (err) return cb(err)
      drive.stats(name, opts, cb)
    })
  }

  watchStats (name, opts) {
    throw Error('Not Supported')
  }

  mirror () {
    throw Error('Not Supported')
  }

  clear (name, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = null
    }
    opts = opts || {}
    if (!cb) cb = noop
    this._runAll('clear', [name, opts], cb)
  }

  download (name, opts, cb) {
    // TODO: This needs to be reimplemented
    // We only want to download the latest files accross the board
    if (typeof opts === 'function') {
      cb = opts
      opts = null
    }
    opts = opts || {}
    if (!cb) cb = noop
    this._runAll('download', [name, opts], cb)
  }

  watch (name, onchange) {
    // TODO: Should we blindly take all updates?
    const watchers = this.drives.map((drive) => drive.watch(name, onchange))

    return { destroy: destroy }

    function destroy () {
      watchers.map((watcher) => watcher.destroy())
    }
  }

  mount (name, key, opts, cb) {
    if (typeof opts === 'function') return this.mount(name, key, null, opts)
    return this.writerOrPrimary.mount(name, key, opts, cb)
  }

  unmount (name, cb) {
    return this.writerOrPrimary.unmount(name, cb)
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

  setMetadata (name, key, value, cb) {
    return this.writerOrPrimary.setMetadata(name, key, value, cb)
  }

  removeMetadata (name, key, cb) {
    return this.writerOrPrimary.removeMetadata(name, key, cb)
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

module.exports = function multiHyperdrive (primary) {
  return new MultiHyperdrive(primary)
}

module.exports.MultiHyperdrive = MultiHyperdrive

function noop () {}

function ensureDir (path, drive, cb) {
  drive.exists(path, (exists) => {
    if (exists) return cb(null)
    const parent = dirname(path)
    ensureDir(parent, drive, (err) => {
      if (err) return cb(err)
      drive.mkdir(path, cb)
    })
  })
}
