import sharp from 'sharp'
import { existsSync } from 'node:fs'

const sourcePath = 'C:/Users/admin/OneDrive/Desktop/unnamed.png'
const outputWebp = 'public/brand/background-space-hq.webp'
const outputJpg = 'public/brand/background-space.jpg'

if (!existsSync(sourcePath)) {
  console.error('Missing source file:', sourcePath)
  process.exit(1)
}

const image = sharp(sourcePath, { failOn: 'none' }).rotate()

await image
  .resize(3840, 2160, { fit: 'cover', position: 'centre', kernel: sharp.kernel.lanczos3 })
  .modulate({ brightness: 1.02, saturation: 1.05 })
  .sharpen({ sigma: 0.9, m1: 1.2, m2: 2.2, x1: 2, y2: 10, y3: 20 })
  .webp({ quality: 100, effort: 6 })
  .toFile(outputWebp)

await sharp(outputWebp)
  .jpeg({ quality: 96, mozjpeg: true, chromaSubsampling: '4:4:4' })
  .toFile(outputJpg)

const webpMeta = await sharp(outputWebp).metadata()
const jpgMeta = await sharp(outputJpg).metadata()

console.log('DONE', outputWebp, `${webpMeta.width}x${webpMeta.height}`)
console.log('DONE', outputJpg, `${jpgMeta.width}x${jpgMeta.height}`)
