import type { Hyperdrive, Stat } from 'hyper-typings/promises'

// Based on hyper-sdk d.ts
declare module "multi-hyperdrive" {
  export default interface MultiHyperdrive extends Hyperdrive {
			readonly primary: Hyperdrive
			readonly writerOrPrimary: Hyperdrive
			readonly writer : Hyperdrive | undefined
			readonly drives : Hyperdrive[]

			constructor(primary: Hyperdrive)
			addDrive(drive: Hyperdrive, cb: (err: Error | null) => void)
			removeDrive(drive: Hyperdrive) : void
			hasDrive(key: Buffer | string) : boolean
			compareStats(stat1: Stat, stat2: Stat) : number
			resolveLatest(name: string, cb: (err : Error | null, drive: Hyperdrive) => void)
  }
}
