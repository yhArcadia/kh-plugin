import { setMsgEmojiLike, recallMessage, mentionedUserId } from '../utils/message.js'
import { isDivingGroup } from '../utils/group-policy.js'
import { getSharp } from '../utils/sharp-loader.js'
import { downloadAvatar } from '../utils/resolve-images.js'
import { config } from '../components/runtime.js'
import { log } from '../utils/logger.js'
import { renderCrop, renderReveal, cropBounds, randomCropCenter } from '../render/guess-group-member-renderer.js'

const CANDIDATE_LIMIT = 30
const INITIAL_CROP_SIDE = 50
const HINT_GROWTH = 1.55
const GAME_TTL_MS = 3 * 60 * 60 * 1000 // 3 小时
const CORRECT_EMOJI = 144 // 🎉 礼花
const WRONG_EMOJI = 123 // no
const activeGames = new Map()

async function recentSpeakers(groupId, selfId) {
  const prefix = `${config.redisPrefix}:${groupId}:`
  const keys = await redis.keys(`${prefix}*`)
  const speakers = []
  for (const key of keys) {
    try {
      const history = JSON.parse(await redis.get(key) || '[]')
      const record = history.at(-1)
      const userId = String(record?.user_id || key.slice(prefix.length))
      if (!record?.last_sent_time || record.is_robot || userId === String(selfId || ''))
        continue
      speakers.push({
        userId,
        lastSentTime: Number(record.last_sent_time),
        nickname: record.card || record.nickname || userId
      })
    } catch (error) {
      log.w(`[猜群友] 跳过无效活跃记录 ${key}：${error?.message || error}`)
    }
  }
  return speakers.sort((a, b) => b.lastSentTime - a.lastSentTime).slice(0, CANDIDATE_LIMIT)
}

async function createGame(groupId, selfId) {
  const pool = await recentSpeakers(groupId, selfId)
  if (!pool.length) throw new Error('who_are_you 中没有可用的近期发言记录')
  const sharp = await getSharp()
  // 个别头像下载可能暂时失败，换候选继续尝试。
  const candidates = [...pool].sort(() => Math.random() - 0.5)
  let lastError
  for (const member of candidates) {
    try {
      const avatar = await downloadAvatar(member.userId)
      const meta = await sharp(avatar).pipelineColourspace('srgb').metadata()
      const imageWidth = meta.width || 0
      const imageHeight = meta.height || 0
      if (!imageWidth || !imageHeight) throw new Error('头像尺寸无效')
      const cropSide = Math.min(INITIAL_CROP_SIDE, imageWidth, imageHeight)
      const { centerX, centerY } = randomCropCenter(imageWidth, imageHeight, cropSide)
      const game = { member, avatar, imageWidth, imageHeight, centerX, centerY, cropSide, hints: 0 }
      game.shownBounds = [cropBounds(game)]
      return game
    } catch (error) { lastError = error }
  }
  throw new Error(`近期群友头像均无法使用：${lastError?.message || '未知错误'}`)
}

function growCrop(game) {
  game.cropSide = Math.min(Math.max(game.imageWidth, game.imageHeight), game.cropSide * HINT_GROWTH)
  // 每次提示均使用新的随机点位，尺寸仍按既定倍率增长。
  Object.assign(game, randomCropCenter(game.imageWidth, game.imageHeight, game.cropSide))
  game.hints += 1
  return game.cropSide >= Math.max(game.imageWidth, game.imageHeight)
}

function prune() {
  for (const [id, game] of activeGames) {
    if (game.expiresAt <= Date.now()) activeGames.delete(id)
  }
}
function saveGame(messageId, game, groupId) {
  if (messageId === undefined || messageId === null) return false
  prune()
  activeGames.set(
    String(messageId),
    {
      ...game, groupId: String(groupId || ''),
      expiresAt: Date.now() + GAME_TTL_MS
    })
  return true
}
function referencedGame(e) {
  prune()
  const game = activeGames.get(String(e?.reply_id))
  return game?.groupId === String(e.group_id || '') ? game : null
}
function latestGame(groupId) {
  prune()
  let found = null
  for (const [messageId, game] of activeGames) {
    if (game.groupId === String(groupId || '') && (!found || Number(messageId) > Number(found.messageId))) {
      found = { messageId, game }
    }
  }
  return found
}
function latestMessageForGame(game) {
  return [...activeGames.entries()]
    .filter(([, current]) =>
      current === game ||
      (current.member.userId === game.member.userId &&
        current.groupId === game.groupId &&
        current.expiresAt === game.expiresAt)
    )
    .sort((a, b) => Number(b[0]) - Number(a[0]))[0]?.[0]
}
function clearGame(game) {
  for (const [id, current] of activeGames) {
    if (
      current === game ||
      (current.member.userId === game.member.userId &&
        current.groupId === game.groupId &&
        current.expiresAt === game.expiresAt)
    ) {
      activeGames.delete(id)
    }
  }
}

export class GuessGroupMember extends plugin {
  constructor() {
    super({
      name: 'kh插件-猜群友',
      dsc: 'kh插件 猜群友',
      event: 'message.group',
      priority: 5000,
      startScheduler: false,
      rule: [
        {
          reg: '^#猜群友$',
          fnc: 'startGame'
        },
        {
          reg: '^(?:#?提示)\\s*$',
          fnc: 'hintGame',
          log: false
        },
        {
          reg: '^(?!#).*$',
          fnc: 'answerGame',
          log: false
        }
      ]
    })
  }

  async startGame(e) {
    if (isDivingGroup(e)) return false
    if (!e.group_id) return false
    try {
      const game = await createGame(e.group_id, e.self_id)
      const result = await e.reply(segment.image(await renderCrop(game)))
      if (!saveGame(result?.message_id, game, e.group_id))
        log.w('[猜群友] 未取得题图消息 ID')
    } catch (error) {
      log.e('[猜群友] 出题失败', error)
      await e.reply(`无法出题：${error.message}`)
    }
    return true
  }

  async hintGame(e) {
    if (isDivingGroup(e))
      return false
    // 必须引用仍在进行中的本局题图
    const game = referencedGame(e)
    if (!game)
      return false
    const isAlreadyFull = game.cropSide >= Math.max(game.imageWidth, game.imageHeight)
    // 完整头像再次被引用提示时，直接揭晓并结束，避免无意义重复发图。
    if (isAlreadyFull) {
      await e.reply(['答案是 ', segment.at(game.member.userId), ` ${game.member.nickname}`])
      clearGame(game)
      return true
    }
    const oldMessageId = latestMessageForGame(game) || String(e.reply_id)
    growCrop(game)
    game.shownBounds = [...game.shownBounds, cropBounds(game)]
    const result = await e.reply(segment.image(await renderCrop(game)))
    if (saveGame(result?.message_id, game, e.group_id)) {
      activeGames.delete(String(oldMessageId))
      await recallMessage(e, oldMessageId)
    } else {
      log.w('[猜群友] 未取得提示图消息 ID')
    }
    return true
  }

  async answerGame(e) {
    if(!e.at) return false
    if (isDivingGroup(e)) return false
    const game = referencedGame(e)
    if (!game) return false
    const targetId = mentionedUserId(e)
    if (!targetId) return false
    if (targetId === game.member.userId) {
      const reacted = await setMsgEmojiLike(e, CORRECT_EMOJI)
      if (!reacted) {
        const fallback = await e.reply('🎉 猜对啦！')
        setTimeout(() => recallMessage(e, fallback?.message_id), 5000)
      }
      await e.reply([`🎉 猜对啦！是 ${game.member.nickname}`, segment.image(await renderReveal(game))])
      clearGame(game)
    } else {
      const reacted = await setMsgEmojiLike(e, 174)
      if (!reacted) {
        const fallback = await e.reply('❌ 猜错了~')
        setTimeout(() => recallMessage(e, fallback?.message_id), 5000)
      }
    }
    return true
  }
}