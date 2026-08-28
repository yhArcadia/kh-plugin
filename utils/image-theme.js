import fs from 'node:fs/promises';
import { loadSharp } from './sharp-loader.js';


export const DEFAULT_IMAGE_THEME = Object.freeze({
    accentColor: '#426f9d',
    outlineColor: '#d9e3ef',
    surfaceColor: '#e4eef9',
    borderColor: '#c7d8eb'
});

function clamp(value, min = 0, max = 255) {
    return Math.max(min, Math.min(max, Math.round(value)));
}

function rgbToHsl(r, g, b) {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    const lightness = (max + min) / 2;
    const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
    let hue = 0;
    if (delta !== 0) {
        if (max === red) hue = ((green - blue) / delta) % 6;
        else if (max === green) hue = (blue - red) / delta + 2;
        else hue = (red - green) / delta + 4;
        hue = (hue * 60 + 360) % 360;
    }
    return { hue, saturation, lightness };
}

function hslToRgb(hue, saturation, lightness) {
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = lightness - chroma / 2;
    let red = 0;
    let green = 0;
    let blue = 0;
    if (hue < 60) [red, green, blue] = [chroma, x, 0];
    else if (hue < 120) [red, green, blue] = [x, chroma, 0];
    else if (hue < 180) [red, green, blue] = [0, chroma, x];
    else if (hue < 240) [red, green, blue] = [0, x, chroma];
    else if (hue < 300) [red, green, blue] = [x, 0, chroma];
    else [red, green, blue] = [chroma, 0, x];
    return [clamp((red + m) * 255), clamp((green + m) * 255), clamp((blue + m) * 255)];
}

function rgbHex(rgb) {
    return `#${rgb.map(value => clamp(value).toString(16).padStart(2, '0')).join('')}`;
}

function mixRgb(from, to, weight) {
    return from.map((value, index) => value * (1 - weight) + to[index] * weight);
}

async function readImageSource(source, fetchImpl, timeoutMs) {
    if (Buffer.isBuffer(source) || source instanceof Uint8Array) return source;
    if (typeof source !== 'string') throw new TypeError('image source must be a URL, local path, or Buffer');
    if (!/^https?:\/\//i.test(source)) return fs.readFile(source);
    const response = await fetchImpl(source, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}

/**
 * 从 URL、本地文件路径或 Buffer 提取受约束、适合浅色 UI 的图片主题。
 *
 * @param {string|Buffer|Uint8Array} source
 * @param {{ fallback?: object, fetchImpl?: typeof fetch, timeoutMs?: number, sampleSize?: number, logDebug?: (message: string) => void, logFallback?: (message: string) => void }} options
 */
export async function extractImageTheme(source, options = {}) {
    const {
        fallback = DEFAULT_IMAGE_THEME,
        fetchImpl = globalThis.fetch,
        timeoutMs = 5000,
        sampleSize = 48,
        logDebug,
        logFallback
    } = options;
    try {
        const image = await readImageSource(source, fetchImpl, timeoutMs);
        const sharp = await loadSharp();
        const { data, info } = await sharp(image)
            .rotate()
            .resize(sampleSize, sampleSize, { fit: 'cover' })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        const buckets = new Map();
        for (let index = 0; index < data.length; index += info.channels) {
            const [red, green, blue, alpha = 255] = data.subarray(index, index + info.channels);
            if (alpha < 180) continue;
            const { hue, saturation, lightness } = rgbToHsl(red, green, blue);
            // 忽略纯白背景、纯黑阴影与灰阶，优先提取画面中有代表性的色相。
            if (saturation < 0.16 || lightness < 0.13 || lightness > 0.89) continue;
            const key = `${Math.round(hue / 12) * 12}:${Math.round(saturation * 8)}:${Math.round(lightness * 8)}`;
            const score = saturation * (0.6 + Math.min(lightness, 1 - lightness));
            const bucket = buckets.get(key) || { score: 0, red: 0, green: 0, blue: 0, weight: 0 };
            bucket.score += score;
            bucket.red += red * score;
            bucket.green += green * score;
            bucket.blue += blue * score;
            bucket.weight += score;
            buckets.set(key, bucket);
        }
        const dominant = [...buckets.values()].sort((a, b) => b.score - a.score)[0];
        if (!dominant?.weight) throw new Error('no usable image color');
        const { hue, saturation, lightness } = rgbToHsl(
            dominant.red / dominant.weight,
            dominant.green / dominant.weight,
            dominant.blue / dominant.weight
        );
        // 统一限制主题色，避免极亮、极暗、荧光或脏灰颜色破坏模板可读性。
        const accentRgb = hslToRgb(hue, Math.min(0.62, Math.max(0.34, saturation)), Math.min(0.48, Math.max(0.34, lightness)));
        return {
            accentColor: rgbHex(accentRgb),
            outlineColor: rgbHex(mixRgb(accentRgb, [255, 255, 255], 0.42)),
            surfaceColor: rgbHex(mixRgb(accentRgb, [255, 255, 255], 0.88)),
            borderColor: rgbHex(mixRgb(accentRgb, [255, 255, 255], 0.72))
        };
    } catch (error) {
        const message = `图片主题色提取失败：${error.message}`;
        logDebug?.(message);
        if (error?.code === 'KH_SHARP_UNAVAILABLE') {
            logFallback?.(`${message}，将采用默认主题色。请在插件目录执行：pnpm install sharp 以安装依赖`);
        }
        return { ...fallback };
    }
}