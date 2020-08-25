# multi-hyperdrive
Take a bunch of hyperdrives, and read from them as if they were one.

Inspired by [peerfs](https://github.com/karissa/peerfs/) and [kappa-drive](https://gitlab.com/coboxcoop/kappa-drive)

## Goals

- Don't manage drives
  - No opinion on storage
  - Doesn't store list of drives
  - Doesn't handle replication for you
- Support (most) hyperdrive methods / properties

## Usage

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

## API

### multiHyperdrive(primary)

Create a new MultiHyperdrive from a primary drive.

Every multi-hyperdrive needs an initial primary drive for identifying it and serving as the initial source of files.

### multi.key

Get the `key` for the `primary` drive to be used for sharing with others.

### multi.discoveryKey

Get the discovery key for the `primary` drive which can be used for peer discovery.

### multi.version

**NOT SUPPORTED**

### multi.writable

Boolean flag that tells you whether you can safely write to the multi-hyperdrive.

### multi.peers

Get the list of `peers` for the `primary` drive.

### multi.primary

Get the `primary` drive that was passed in the constructor

### multi.writer

Get the first `writable` hyperdrive instance that was added.

### multi.drives

Get the list of all drives that were added to this multi-hyperdrive.

### multi.addDrive (drive, cb)

Add a hyperdrive to this multi-hyperdrive.
Each drive will be added to the resolution mechanism.

### multi.runAll (method, args, cb)

Run a method on all drives at once and collect results.
`method` should be the string method to invoke on the drives.
`args` should be an array of arguments to pass to the method.
`cb` will get invoked with either an error or `null` and an array of results that look like `{drive, err, value}`.

### multi.compareStats (stat1, stat2)

This is the function used to resolve which drive has the latest version of a path.
It must return `0` if two drives have the same version, `-1` if the first stat has a newer version, or `1` if the second `stat` has a newer version.
This can be replaced with custom resolving logic.

### multi.resolveLatest (path, cb)

Use this for finding which drive has the latest version of a path.
The callback will get a reference to the `hyperdrive` that has the latest version, or an error if none is found.

### multi.open (path, flags, cb)

Open a file descriptor for the given path with the given flags. Same as [node.js fs.open](https://nodejs.org/api/fs.html#fs_fs_open_path_flags_mode_callback).
Requires a writable drive to be added first if you wish to open a writable file descriptor.
The latest version of the file will be found among all the hyperdrives if you open a readable file descriptor.

### multi.read (fd, buf, offset, len, pos, cb)

Read some data from a file descriptor. Same as [node.js fs.read](https://nodejs.org/api/fs.html#fs_fs_read_fd_buffer_offset_length_position_callback)

### multi.write (fd, buf, offset, len, pos, cb)

Write some data to a file descriptor. Same as [node.js fs.write](https://nodejs.org/api/fs.html#fs_fs_write_fd_buffer_offset_length_position_callback)

### multi.createReadStream (path, opts)

Read a file from the given path as a stream.
The latest version of the file will be found among all the hyperdrives and read.
`opts` can be an `encoding` like `utf8` to read the file as a string, else it'll read a buffer.

### multi.createWriteStream (path, opts)

Write a file to a given path using a stream.
Requires a writable drive to be added first.
`opts` can contain all of the options of [node's fs.createWriteStream](https://nodejs.org/api/fs.html#fs_fs_createwritestream_path_options)

### multi.readFile (path, opts, cb)

Read a file from the given path.
The latest version of the file will be found among all the hyperdrives and read.
`opts` can be an `encoding` like `utf8` to read the file as a string, else it'll read a buffer.

### multi.writeFile (path, buf, opts, cb)

Write a file to a given path.
Requires a writable drive to be added first.
`buf` can be either a string, a buffer, or a TypedArray.
`opts` can either be a `string` for the encoding to use, or an object containing `{encoding, mode, flag}`.

### multi.truncate (path, size, cb)

Truncat a file to a specified length.
Requires a writable drive to be added first.
This only works if your writable drive was the one that wrote the file.

### multi.ftruncate (fd, size, cb)

Same as `multi.truncate` but with a file descriptor instead of a path.

### multi.mkdir (path, opts, cb)

Create a directory at a given path.
Requires a writable drive to be added first.

### multi.readlink (path, cb)

Honestly, I have no clue what this does, but it's in the [node.js fs API](https://nodejs.org/api/fs.html#fs_fs_readlink_path_options_callback)

### multi.stat (path, opts, cb)

Get the `stat` for the item at a given path.
Will try to get the latest stat among all the drives.
The `stat` describes the file or folder at the path.
It contains all the properties of the [node.js fs.Stats](https://nodejs.org/api/fs.html#fs_class_fs_stats) object, plus some hyperdrive specific stats.

The full list can be found [here](https://github.com/hypercore-protocol/hyperdrive-schemas/blob/master/schemas/hyperdrive.proto)

Namely, you might be interested in `stat.metadata` which is an object containing key-value pairs from `drive.setMetadata()`.
This metadata doesn't get merged among peers yet.

Another useful property is `stat.mount` which contains `{key, version, hash}` for the hyperdrive mounted there.

### multi.lstat (path, opts, cb)

`lstat()` is identical to `stat()`, except that if path is a symbolic link, then the link itself is stat-ed, not the file that it refers to.

### multi.access (path, opts, cb)

Try to load data at a given path. Will result in an error if the path doesn't exist on any drives.

### multi.readdir (path, opts = {}, cb)

Read the files within a directory as an array of file/folder names.
Files from the directories of all drives will be combined together.
You can pass `stats: true` to get a list of objects that look like `{stat, name}` to get the stats in addition to the name.

### multi.unlink (path, cb)

Delete a file from your drive.
You cannot delete other people's files.
Requires a writable drive to be added first.

### multi.rmdir (path, cb)

Delete a directory from your drive.
You currently cannot delete directories from others' drives.
Requires a writable drive to be added first.

### multi.replicate (isInitiator, opts)

**NOT SUPPORTED**

### multi.checkout (version, opts)

**NOT SUPPORTED**

### multi.close (cb)

Close the multi-hyperdrive and all of it's added drives.
Frees up any resources that the drives loaded and closes their connections.

### multi.close (fd, cb)

Close an opened file descriptor.

### multi.destroyStorage (cb)

**NOT SUPPORTED**

### multi.mirror ()

**NOT SUPPORTED**

### multi.clear (path, opts, cb)

**NOT SUPPORTED**

### multi.download (path, opts, cb)

**NOT SUPPORTED**

### multi.watch (path, onchange)

**NOT SUPPORTED**

### multi.mount (path, key, opts, cb)

Mount another hyperdrive at a path within your drive.
Requires a writable drive to be added first.

### multi.unmount (path, cb)

Remove a mount within your hyperdrive.
You cannot remove other people's mounts.

### multi.symlink (target, linkName, cb)

Create a link at `linkName` which points to `target`

### multi.createMountStream (opts)

**NOT SUPPORTED**

### multi.getAllMounts (opts, cb)

**NOT SUPPORTED**

### ext = multi.registerExtension (path, handlers)

Register an extension message on the primary hyperdrive.
This can be used to send messages over the primary hyperdrive's replication stream.

```js
{
  encoding: 'json' | 'binary' | 'utf-8' | anyAbstractEncoding,
  onmessage (message, peer) {
    // called when a message is received from a peer
    // will be decoded using the encoding you provide
  },
  onerror (err) {
    // called in case of an decoding error
  }
}
```

### multi.setMetadata (path, key, value, cb)

Set some metadata for a file or folder in the hyperdrive.
Requires a writable drive to be added first.

### multi.removeMetadata (path, key, cb)

Remove some metadata from a file or folder in the hyperdrive.
Requires a writable drive to be added first.

### multi.createTag (path, version, cb)

**NOT SUPPORTED**

### multi.getAllTags (cb)

**NOT SUPPORTED**

### multi.deleteTag (path, cb)

**NOT SUPPORTED**

### multi.getTaggedVersion (path, cb)

**NOT SUPPORTED**

## TODO:

- [ ] Handle `stats` option in `readdir`
- [ ] Watch for changes
- [ ] Autocreate own folders when writing to dir that only exists on other drives
- Tombstones for deleted files
 - [ ] Basic tombstones for deletion. Stored in hidden folder in the trie
 - [ ] Override old tombstones on write
- [ ] Support listing mounts from all writers at once
- [ ] Error out when writing a file where another peer has a folder or vise versa
- Vector clocks or blook clocks in metadata
 - [ ] When writing to a file, include vector of versions of all drives. Maybe use bloom clocks?
 - [ ] Resolve conflicts with vector clocks instead of wall clocks
- [ ] Figure out what 'version' means for multi-hyperdrive
 - [ ] Encode `version` as a bloom clock or something
 - [ ] Support `tags` feature
- [ ] Support `truncate` being called on files not in your writer drive.
- Manage download/upload to only include latest files across all drives
 - [ ] `download` should traverse multi-hyperdrive
