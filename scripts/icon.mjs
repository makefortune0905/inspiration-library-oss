import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
await mkdir('build/icon.iconset', { recursive: true })
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect x="48" y="48" width="928" height="928" rx="210" fill="#f2f4ed"/><g fill="#2d342a">${Array.from({length:5},(_,i)=>`<ellipse cx="512" cy="512" rx="57" ry="76" transform="rotate(${i*72} 512 512) translate(0 -175)"/>`).join('')}</g></svg>`
await writeFile('build/icon.svg',svg)
for (const size of [16,32,128,256,512]) for (const scale of [1,2]) await sharp(Buffer.from(svg)).resize(size*scale).png().toFile(`build/icon.iconset/icon_${size}x${size}${scale===2?'@2x':''}.png`)
execFileSync('iconutil',['-c','icns','build/icon.iconset','-o','build/icon.icns'])
