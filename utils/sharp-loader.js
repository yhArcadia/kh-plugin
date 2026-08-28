let sharpModulePromise

export async function loadSharp () {
  if (!sharpModulePromise) {
    sharpModulePromise = import('sharp').then(module => module.default || module).catch(error => {
      sharpModulePromise = null
      error.code = 'KH_SHARP_UNAVAILABLE'
      throw error
    })
  }
  return sharpModulePromise
}

export async function getSharp () {
  try {
    return await loadSharp()
  } catch (error) {
    if (error?.code === 'KH_SHARP_UNAVAILABLE') {
      throw new Error('此功能需要安装 sharp 依赖，请在插件目录执行：pnpm install sharp')
    }
    throw error
  }
}