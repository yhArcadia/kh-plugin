import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import fetch from 'node-fetch';
import moment from 'moment';
import { getProgressBar } from '../utils/format.js';
import { log } from '../utils/logger.js';
import { parseHistory } from '../components/storage.js';

export function createMemberUpdater({ redis, config, headsDir }) {
    const recordLocks = globalThis.__whoAreYouMemberRecordLocks ||= new Map();

    async function withMemberLock(gid, uid, task) {
        const key = `${gid}:${uid}`;
        const previous = recordLocks.get(key) || Promise.resolve();
        let release;
        const current = new Promise(resolve => { release = resolve; });
        recordLocks.set(key, current);
        await previous.catch(() => { });
        try {
            return await task();
        } finally {
            release();
            if (recordLocks.get(key) === current) recordLocks.delete(key);
        }
    }

    async function delFile(dirPath, deleteRootDir = false) {
        try {
            if (!fs.existsSync(dirPath)) return;
            const files = fs.readdirSync(dirPath);
            for (const file of files) {
                const currentPath = path.join(dirPath, file);
                if (fs.statSync(currentPath).isDirectory()) {
                    await delFile(currentPath, true);
                } else {
                    fs.unlinkSync(currentPath);
                }
            }
            if (deleteRootDir) {
                fs.rmdirSync(dirPath);
            }
        } catch (err) {
            log.w(`删除 ${dirPath} 时出错: ${err}`);
        }
    }

    // 更新指定群的群员信息
    async function updateGroupMemberInfo(gid, botInstance, shouldContinue = null) {
        if (!botInstance) {
            log.w(`updateGroupMemberInfo 未收到有效的 Bot 实例，无法更新群 ${gid}`);
            return [];
        }
        let updatedUids = [];
        let group;
        let gname = gid.toString();
        try {
            try {
                const groupInfo = botInstance.gl?.get(Number(gid)) || botInstance.gl?.get(String(gid));
                if (groupInfo) gname = groupInfo.group_name || groupInfo.name || gname;
            } catch (err) { }

            group = botInstance.pickGroup(gid);
            if (!group) {
                log.w(`无法找到群 ${gid}，可能 Bot 未加入该群。`);
                return updatedUids;
            }
            gname = group.name || gname;

            const memberMap = await group.getMemberMap();
            const totalMembers = memberMap.size;
            log.i(`开始检查群 ${gname} (${gid}) 的 ${totalMembers} 位成员...`);

            let currentIndex = 0;
            let lastLogedIndex = 0;
            let loggerGap = 20; //每隔20人，无论是否发现更新，均强制打印一次进度
            let delayTime = 100; //每获取一个人的信息，延迟100ms再拉取下个人

            for (const member of memberMap.values()) {
                if (shouldContinue && !await shouldContinue()) {
                    log.w(`群 ${gname} 的更新操作锁已失效，停止后续成员写入。`);
                    break;
                }
                currentIndex++;
                let currentMsg = '';
                let isUpdated = false;


                // 用户黑名单拦截
                if ((config.userBlacklist || []).includes(Number(member.user_id))) {
                    currentMsg = `用户 ${member.user_id} 处于黑名单,跳过。`;
                } else {
                    const { updated, msg } = await processMemberUpdate(member, gid, gname);
                    isUpdated = updated;
                    currentMsg = msg;
                    if (updated) {
                        updatedUids.push(member.user_id);
                    }
                }

                // 获取进度条
                const barStr = getProgressBar(currentIndex, totalMembers);

                if (currentMsg.includes('信息未变更，跳过')) {
                    if (currentIndex - lastLogedIndex >= loggerGap || currentIndex === totalMembers) {
                        logger.info(`扫描群【${gname}】${barStr} > 正在扫描...`);
                        lastLogedIndex = currentIndex;
                    }
                } else if (currentMsg.includes('头像体积相同，忽略该记录。')) {
                    if (currentIndex - lastLogedIndex >= loggerGap || currentIndex === totalMembers) {
                        // logger.info(`扫描群【${gname}】${barStr} > ${currentMsg}`);
                        logger.info(`扫描群【${gname}】${barStr} > 正在扫描...`);
                        lastLogedIndex = currentIndex;
                    }
                }
                else {
                    logger.info(`扫描群【${gname}】${barStr} > ${currentMsg}`);
                    lastLogedIndex = currentIndex;
                }

                // 这里保险起见如果一次性拉取太多人的信息，分阶段增加一些间隔
                if (currentIndex > 2000) {
                    delayTime = 400;
                } else if (currentIndex > 1000) {
                    delayTime = 300;
                } else if (currentIndex > 500) {
                    delayTime = 200;
                }
                await new Promise(resolve => setTimeout(resolve, delayTime)); // 延时 100ms
            }

            if (updatedUids.length > 0) {
                log.i(`群 ${gname} (${gid}) 本次更新检查完成，共更新了 ${updatedUids.length} 条记录。`);
            }

        } catch (error) {
            log.e(`更新群 ${gname} (${gid}) 成员信息时发生严重错误: ${error.message}`);
            if (error.stack && error.stack.includes('getMemberMap')) {
                log.e(`无法获取群 ${gname} 的成员列表，请检查 Bot 是否在该群及权限。`);
                log.e(`NapCat/oicqjs 错误: ${error.stack}`);
            } else {
                log.e(`错误: ${error.stack}`);
            }
        }
        return updatedUids;
    }


    /**
     * 检查并处理成员信息更新（获取、检查、下载、保存）
     * @param {object} member 成员信息对象
     * @param {number | string} gid 群号
     * @param {string | null} gname 群名仅用于日志
     * @returns {Promise<{
     * updated: boolean,
     * history: Array<object>
     * }>}{updated：是否执行了更新, history：最终的 history 数组 (无论是否更新)}
     */
    async function processMemberUpdate(member, gid, gname = null) {
        const uid = member?.user_id;
        if (!uid) {
            log.w(`(群 ${gname || gid}) 传入的 member 对象缺少 user_id，跳过处理。`, member);
            return { updated: false, history: [] };
        }
        return withMemberLock(gid, uid, async () => {
            log.d(`检查成员 ${JSON.stringify(member)} 的变更`);
            const displayName = member.card || member.nickname || uid;
            let statusMsg = '';

            const redisKey = `${config.redisPrefix}:${gid}:${uid}`;
            const historyJson = await redis.get(redisKey);
            const parsedHistory = parseHistory(historyJson);
            let history = parsedHistory.history;
            if (parsedHistory.corrupt) {
                log.w(`(群 ${gname || gid}) 用户 ${uid} 的历史记录 JSON 损坏，拒绝自动覆盖；请由主人修复后再更新。`);
                return {
                    updated: false,
                    history: [],
                    changes: [],
                    msg: `用户【${displayName}】(${uid}): 历史记录损坏，已跳过。`
                };
            }

            const latestRecord = history.length > 0 ? history[history.length - 1] : null;

            // ---检查更新---
            const avatarUrl = `https://q1.qlogo.cn/g?b=qq&s=0&nk=${uid}`;
            let currentHeadTime = null;
            let currentContentLength = null;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), config.avatarFetchTimeout);

            try {
                const response = await fetch(avatarUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (response.ok) {
                    currentHeadTime = response.headers.get("last-modified");
                    currentContentLength = response.headers.get("content-length");
                } else if (gname) {
                    log.w(`(群 ${gname}) 获取用户 ${uid} 头像信息失败: ${response.status}`);
                }
            } catch (fetchError) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError' && !gname) {
                    log.w(`请求用户 ${uid} 头像超时 (${config.avatarFetchTimeout}ms)`);
                } else if (fetchError.name !== 'AbortError') {
                    const logPrefix = gname ? `(群 ${gname}) ` : '';
                    log.w(`${logPrefix}请求用户 ${uid} 头像网络错误: ${fetchError}`);
                }
            }

            // 变更检测
            let changes = [];
            const nicknameChanged = latestRecord?.nickname !== (member.nickname || '');
            if (nicknameChanged && latestRecord) changes.push('昵称');
            const titleChanged = latestRecord?.title !== (member.title || '');
            if (titleChanged && latestRecord) changes.push('头衔');
            const cardChanged = latestRecord?.card !== (member.card || '');
            if (cardChanged && latestRecord) changes.push('群名片');
            const roleChanged = latestRecord?.role !== (member.role || 'member');
            if (roleChanged && latestRecord) changes.push('群权限');
            log.d(`检查用户 ${uid} 的变更：nicknameChanged=${nicknameChanged}, titleChanged=${titleChanged}, cardChanged=${cardChanged}, roleChanged=${roleChanged}`);
            const infoChanged = nicknameChanged || titleChanged || cardChanged || roleChanged;

            // let headChanged = !!(currentHeadTime && latestRecord?.headtime !== currentHeadTime);
            let headChanged = !!(currentHeadTime && latestRecord?.headtimeGMT !== currentHeadTime);

            // 拦截1990年幽灵头像
            if (headChanged && currentHeadTime) {
                if (currentHeadTime.includes("1990")) {
                    headChanged = false; // 直接否决此头像
                    log.i(`用户 ${uid} (昵称：${member.nickname || ''}) 头像时间 ${currentHeadTime} 。`);
                    statusMsg = `用户【${displayName}】(${uid}): 已拦截幽灵头像。`;

                    // 强制把 current 数据回退为上一次真实的头像数据
                    currentHeadTime = latestRecord?.headtimeGMT;
                    currentContentLength = latestRecord?.contentLength;
                }
            }

            // 图片去重
            if (headChanged) {
                const newLength = currentContentLength;
                const oldLength = latestRecord?.contentLength;

                if (newLength && oldLength && String(newLength) === String(oldLength)) {
                    headChanged = false;

                    if (!infoChanged) {
                        // const logPrefix = gname ? `[who_are_you] 群 ${gname}` : `[who_are_you]`;
                        // logger.info(`${logPrefix} 用户 ${uid}: 仅 headtime 改变但体积相同(${newLength})，判定为同一图片，忽略此记录。`);
                        statusMsg = `用户【${displayName}】(${uid}): 头像体积相同，忽略该记录。`;
                    }
                }
            }

            if (headChanged && latestRecord) changes.push('头像');

            const needsUpdate = !latestRecord || infoChanged || headChanged;

            if (!needsUpdate) {
                // 静默刷新最后发言时间
                if (latestRecord && member.last_sent_time && member.last_sent_time > (latestRecord.last_sent_time || 0)) {
                    latestRecord.last_sent_time = member.last_sent_time;
                    // 刷新最后发言时间存入Redis，但不算作 updated
                    await redis.set(redisKey, JSON.stringify(history));
                }
                // 未更新，直接返回当前数据
                return { updated: false, history: history, changes: [], msg: statusMsg || `用户【${displayName}】(${uid}): 信息未变更，跳过。` };
            }

            // ---执行更新---
            let actualHeadTimeToSave = currentHeadTime;
            let actualContentLengthToSave = currentContentLength;
            let headtimeAsTimestamp = null;

            if (currentHeadTime && (!latestRecord || headChanged)) {
                try {
                    const timeStr = currentHeadTime.replace(' GMT', '');
                    headtimeAsTimestamp = moment.utc(timeStr, "ddd, DD MMM YYYY HH:mm:ss", "en").utcOffset(8, true).valueOf();
                } catch (dateErr) {
                    headtimeAsTimestamp = Date.now();
                }

                const picpath = path.join(headsDir, `${gid}_${uid}_${headtimeAsTimestamp}.jpg`);
                const downloadController = new AbortController();
                const downloadTimeoutId = setTimeout(() => downloadController.abort(), config.avatarFetchTimeout * 2);

                try {
                    const downloadResponse = await fetch(avatarUrl, { signal: downloadController.signal });
                    clearTimeout(downloadTimeoutId);

                    if (downloadResponse.ok) {
                        const streamPipeline = promisify(pipeline);
                        await streamPipeline(downloadResponse.body, fs.createWriteStream(picpath));
                        actualContentLengthToSave = downloadResponse.headers.get("content-length") || actualContentLengthToSave;
                    } else {
                        log.w(`(群 ${gname || gid}) 重新下载头像失败 ${uid}: ${downloadResponse.status}`);
                        headtimeAsTimestamp = latestRecord?.headtime || null;
                        actualHeadTimeToSave = latestRecord?.headtimeGMT || null;
                        actualContentLengthToSave = latestRecord?.contentLength || null;
                    }
                } catch (saveError) {
                    clearTimeout(downloadTimeoutId);
                    if (saveError.name === 'AbortError') {
                        log.w(`(群 ${gname || gid}) 下载头像 ${picpath} 超时`);
                    } else {
                        log.w(`(群 ${gname || gid}) 保存头像 ${picpath} 失败: ${saveError}`);
                    }
                    headtimeAsTimestamp = latestRecord?.headtime || null;
                    actualHeadTimeToSave = latestRecord?.headtimeGMT || null;
                    actualContentLengthToSave = latestRecord?.contentLength || null;
                }
            } else if (latestRecord) {
                headtimeAsTimestamp = latestRecord.headtime;
                actualHeadTimeToSave = latestRecord.headtimeGMT;
                actualContentLengthToSave = latestRecord.contentLength;
            } else {
                headtimeAsTimestamp = null;
                actualHeadTimeToSave = null;
                actualContentLengthToSave = null;
            }

            // 创建新记录
            let newRecord = { ...member };

            // // headtime 字符串转为时间戳
            // let headtimeAsTimestamp = null;
            // if (actualHeadTimeToSave) {
            //     try {
            //         const timeStr = actualHeadTimeToSave.replace(' GMT', '');
            //         headtimeAsTimestamp = moment.utc(timeStr, "ddd, DD MMM YYYY HH:mm:ss", "en").utcOffset(8, true).valueOf();
            //     } catch (dateErr) {
            //         log.w(`headtime日期解析失败: ${actualHeadTimeToSave}`, dateErr);
            //     }
            // }

            // 记录时间：默认使用当前时间
            let newRecordTimeStr = moment().format("YYYY-MM-DD HH:mm:ss");

            // 如果仅头像改变，获取到了头像变更时间，作为记录时间
            if (headChanged && !infoChanged && headtimeAsTimestamp) {
                // 读取上一条记录的记录时间防倒挂
                let lastRecordTimeMs = 0;
                if (latestRecord && latestRecord.recordTime) {
                    lastRecordTimeMs = moment(latestRecord.recordTime, "YYYY-MM-DD HH:mm:ss").valueOf();
                }
                // 只当获取到的换头时间晚于本地上一条记录时间时才采用。
                if (headtimeAsTimestamp > lastRecordTimeMs) {
                    newRecordTimeStr = moment.utc(headtimeAsTimestamp).utcOffset(8).format("YYYY-MM-DD HH:mm:ss");
                }
            }

            // 覆盖/添加自定义字段
            newRecord.recordTime = newRecordTimeStr;
            newRecord.headtime = headtimeAsTimestamp;
            newRecord.headtimeGMT = actualHeadTimeToSave;
            newRecord.contentLength = actualContentLengthToSave;
            // 规范化使用的数据
            newRecord.nickname = member.nickname || '';
            newRecord.title = member.title || '';
            newRecord.card = member.card || '';
            newRecord.role = member.role || 'member';

            // 更新 history 数组并写入 Redis
            while (history.length >= config.maxSaveLength) {
                history.shift();
            }
            history.push(newRecord);

            await redis.set(redisKey, JSON.stringify(history));

            let finalMsg = `已记录/更新用户【${member.card || member.nickname}】(${uid}) 的信息`;
            if (statusMsg) finalMsg += ` [注: ${statusMsg}]`;

            return { updated: true, history: history, changes: changes, msg: finalMsg };
        });
    }


    return { delFile, updateGroupMemberInfo, processMemberUpdate };
}
