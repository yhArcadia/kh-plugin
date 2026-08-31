import { getSharp } from '../utils/sharp-loader.js'

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export function randomCropCenter(imageWidth, imageHeight, cropSide) {
  const width = Math.min(imageWidth, Math.max(1, Math.round(cropSide)))
  const height = Math.min(imageHeight, Math.max(1, Math.round(cropSide)))
  return {
    centerX: width / 2 + Math.random() * (imageWidth - width),
    centerY: height / 2 + Math.random() * (imageHeight - height)
  }
}

export function cropBounds(game) {
  const side = Math.max(1, Math.round(game.cropSide))
  const width = Math.min(game.imageWidth, side)
  const height = Math.min(game.imageHeight, side)
  return {
    left: Math.round(clamp(game.centerX - width / 2, 0, game.imageWidth - width)),
    top: Math.round(clamp(game.centerY - height / 2, 0, game.imageHeight - height)),
    width,
    height
  }
}

export async function renderCrop(game) {
  const sharp = await getSharp()
  return sharp(game.avatar)
    .pipelineColourspace('srgb')
    .extract(cropBounds(game))
    .resize({ width: 360, withoutEnlargement: false })
    .webp({ quality: 92 })
    .toBuffer()
}

function isStrictlyContained(inner, outer) {
  const innerRight = inner.left + inner.width
  const innerBottom = inner.top + inner.height
  const outerRight = outer.left + outer.width
  const outerBottom = outer.top + outer.height
  const included = inner.left >= outer.left && inner.top >= outer.top && innerRight <= outerRight && innerBottom <= outerBottom
  return included && (inner.left > outer.left || inner.top > outer.top || innerRight < outerRight || innerBottom < outerBottom)
}

function setPixelRed(data, info, x, y) {
  if (x < 0 || y < 0 || x >= info.width || y >= info.height) return
  const offset = (y * info.width + x) * info.channels
  data[offset] = 255
  data[offset + 1] = 45
  data[offset + 2] = 45
  data[offset + 3] = 255
}

function drawRedFrame(data, info, bounds) {
  const x1 = clamp(bounds.left, 0, info.width - 1)
  const y1 = clamp(bounds.top, 0, info.height - 1)
  const x2 = clamp(bounds.left + bounds.width - 1, 0, info.width - 1)
  const y2 = clamp(bounds.top + bounds.height - 1, 0, info.height - 1)
  for (let x = x1; x <= x2; x++) {
    setPixelRed(data, info, x, y1)
    setPixelRed(data, info, x, y2)
  }
  for (let y = y1; y <= y2; y++) {
    setPixelRed(data, info, x1, y)
    setPixelRed(data, info, x2, y)
  }
}

export async function renderReveal(game) {
  const sharp = await getSharp()
  const { data, info } = await sharp(game.avatar)
    .pipelineColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const shownBounds = game.shownBounds?.length ? game.shownBounds : [cropBounds(game)]
  // 所有展示过的区域组成亮区并集；并不只高亮最后一张提示图。
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const visible = shownBounds.some(bounds => x >= bounds.left && x < bounds.left + bounds.width && y >= bounds.top && y < bounds.top + bounds.height)
      if (visible) continue
      const offset = (y * info.width + x) * info.channels
      data[offset] = Math.round(data[offset] * 0.41)
      data[offset + 1] = Math.round(data[offset + 1] * 0.41)
      data[offset + 2] = Math.round(data[offset + 2] * 0.41)
    }
  }
  // 仅在一个范围完整包含另一个范围时，给较小范围加 1px 红框；相交但不包含不画框。
  const framed = new Set()
  for (let i = 0; i < shownBounds.length; i++) {
    for (let j = 0; j < shownBounds.length; j++) {
      if (i !== j && isStrictlyContained(shownBounds[i], shownBounds[j])) framed.add(i)
    }
  }
  for (const index of framed)
    drawRedFrame(data, info, shownBounds[index])
  return sharp(data, { raw: info })
    .pipelineColourspace('srgb')
    .resize({ width: 640, withoutEnlargement: true })
    .webp({ quality: 92 })
    .toBuffer()
}