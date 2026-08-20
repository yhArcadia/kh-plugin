import fs from 'node:fs';
import path from 'node:path';
import template from 'art-template';
import moment from 'moment';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import { headsDir, templateDir, pluginRoot } from '../components/paths.js';
import { escapeHtml } from '../utils/html.js';
import cfg from '../../../lib/config/config.js';
import { log } from '../utils/logger.js';

export async function renderHistory({ e, groupId, gname, member, inquirer, fullHistory, renderLimit = 0, showTimeline = true, redis, config, logger }) {

    let processedHistory = [];
    const history = (renderLimit > 0) ? fullHistory.slice(-renderLimit) : fullHistory;
    const offset = fullHistory.length - history.length;
    const targetUid = member.user_id;

    // 一个默认头像的 base64
    let defaultAvatarBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABPUlEQVR4Xu3aOw7CIBCE4X/ApnSftblEAoHh0N22sUBLI/EzUhNJ2P08pB/kTezQY61eOQEAAAAAAAAAAOCrAHzS+pr1rU+A3/0A/HeB3wD8DMB+Bb4F8DsA/xH4FcA/Avy7gK8C/O4e+L8DeBfAfyfwK4D/RsDXAQAAAAAAAAAAAAAAAAAAAAAAAI4I8K8K/Ebg1wD/IsBfS/wrwF8B/CeBb8J3kO8G/NsB/y3wTwP+XcDfAPx/Bv4L4J8H/NsB/zbgrwD+bODfBfyrgH8d8G8D/g0BAAAAAAAAAACADwL8L8BfBPgbgX8G+DcB/x7wVwH/FvDPAF8F+DcB/x7wbwP+Y8A/BvynAf8M8EcB/xzwBwH/JODPBvyTgv8k4J8E/BMAAAAAAAAAAADAJwB80vqa9a1PAAAAAAAAAADAP4G/A0N0bmzY5zYyAAAAAElFTkSuQmCC';

    // 计算时间
    const now = moment();
    const targetJoinTime = moment(member.join_time * 1000);
    const inquirerJoinTime = moment(inquirer.join_time * 1000);
    const lastSentTime = moment(member.last_sent_time * 1000);
    const shutUpTime = moment(member.shut_up_timestamp * 1000);

    // 一、"进群时间" 消息
    if (member && member.join_time) {
        const targetJoinTime = moment(member.join_time * 1000);
        processedHistory.push({
            content: `该用户于 ${targetJoinTime.format('YYYY年MM月DD日HH点mm分')} 加入本群`,
            isSystemMessage: true
        });
    } else {
        processedHistory.push({
            content: `这是该用户曾在本群留下的马甲记录`,
            isSystemMessage: true
        });
    }

    // // 二、"相处时间" 消息 (取最晚进群的个)
    // const laterJoinTime = (inquirer.join_time > member.join_time) ? inquirerJoinTime : targetJoinTime;
    // const timeTogetherSeconds = now.diff(laterJoinTime, 'seconds');
    // const timeTogetherMsg = `你们已经相处了${formatDuration(timeTogetherSeconds)}`;
    // processedHistory.push({
    //     content: timeTogetherMsg,
    //     isSystemMessage: true
    // });


    // 三、"最后发言时间" 消息
    // if (member && member.last_sent_time && Number(groupId) === Number(e.group_id)) {
    if (member && member.last_sent_time) {
        const lastSentTime = moment(member.last_sent_time * 1000);
        processedHistory.push({
            content: `最后发言于 ${lastSentTime.format('YYYY年MM月DD日HH点mm分')}`,
            isSystemMessage: true
        });
    }

    // // 四、"禁言解除时间" 消息
    // if (member.shut_up_timestamp != 0) {
    //     const shutUpTimeMsg = `禁言解除于 ${shutUpTime.format('YYYY年MM月DD日HH点mm分')}`;
    //     processedHistory.push({
    //         content: shutUpTimeMsg,
    //         isSystemMessage: true
    //     });
    // }

    // // 五、 "首次记录" 系统消息
    // const firstRecord = history[0];
    // processedHistory.push({
    //     content: `用户马甲首次记录于 ${moment(firstRecord.recordTime).format('YYYY-MM-DD HH:mm')}`,
    //     isSystemMessage: true
    // });

    // 六、遍历所有记录，生成状态快照消息
    // 1. 整体时间跨度
    const firstRecordTime = moment(history[0].recordTime).valueOf();
    const currentTimestamp = now.valueOf();
    const totalDuration = (currentTimestamp - firstRecordTime) || 1;
    const isSingleRecord = history.length === 1;

    for (let i = 0; i < history.length; i++) {
        const record = history[i];

        // 获取头像 base64
        let avatarBase64 = defaultAvatarBase64;
        if (record.headtime) {
            const headPicPath = path.join(headsDir, `${groupId}_${targetUid}_${record.headtime}.jpg`);
            if (fs.existsSync(headPicPath)) {
                try {
                    const avatarBuf = fs.readFileSync(headPicPath);
                    avatarBase64 = `data:image/jpeg;base64,${avatarBuf.toString('base64')}`;
                } catch (err) {
                    log.w(`渲染时读取文件失败: ${headPicPath}`, err)
                }
            } else {
                log.w(`渲染时文件丢失: ${headPicPath}`);
            }
        }

        // 获取显示昵称 (群名片优先)
        // const displayName = record.card || record.nickname || e.at.toString();
        const displayName = record.card || record.nickname || targetUid.toString();

        // 兼容旧数据
        const recordRole = record.role || 'member';
        const recordTitle = String(record.title || '');
        const safeRecordTitle = escapeHtml(recordTitle);

        let levelText = '';
        if (record.level === undefined || record.level === null) {
            levelText = `LV?`; // 旧数据
        } else {
            levelText = `LV${record.level}`; // 新数据
        }

        let mainText = '';
        let badgeColor = '#E3E3E3';
        let badgeTextColor = '#818181';

        if (recordTitle) {
            mainText = recordTitle;
        } else if (recordRole === 'owner') {
            mainText = '群主';
        } else if (recordRole === 'admin') {
            mainText = '管理员';
        }

        if (recordRole === 'owner') {
            badgeColor = '#FFE3C1'; // 狗群主
            badgeTextColor = '#FF7B01';
        } else if (recordRole === 'admin') {
            badgeColor = '#CFEFEC'; // 狗管理
            badgeTextColor = '#1FB19F';
        } else if (recordTitle) {
            badgeColor = '#F3D4FF'; // 紫色 (普通用户有头衔)
            badgeTextColor = '#AB5DD4';
        }

        const badgeText = mainText ? `${levelText} ${mainText}` : levelText;

        // 2. 时间轴处理
        const currentRecordTime = moment(record.recordTime).valueOf();
        const nextRecordTime = (i < history.length - 1)
            ? moment(history[i + 1].recordTime).valueOf()
            : currentTimestamp;

        const TOTAL_WIDTH_PX = 617; // 与 css 中 timeline-wrapper 的 width 保持一致

        // 计算绝对像素, 四舍五入
        let leftPx = Math.round(((currentRecordTime - firstRecordTime) / totalDuration) * TOTAL_WIDTH_PX);
        let widthPx = Math.round(((nextRecordTime - currentRecordTime) / totalDuration) * TOTAL_WIDTH_PX);

        // 边界与极值
        leftPx = Math.max(0, Math.min(TOTAL_WIDTH_PX, leftPx));
        widthPx = Math.max(0, Math.min(TOTAL_WIDTH_PX - leftPx, widthPx));

        if (widthPx < 2) widthPx = 2; // 最小 2px

        // 构建时间轴
        let timelineHtml = `<div class="timeline-spacer"><div class="timeline-wrapper"><div class="timeline-base"></div>`;
        if (!isSingleRecord && showTimeline) {
            timelineHtml += `<div class="timeline-slider" style="left: ${leftPx}px; width: ${widthPx}px;"></div>`;
        }
        timelineHtml += `</div></div>`;

        // 生成消息内容
        let messageContent = [];
        messageContent.push(`<b>头衔：</b>${safeRecordTitle || '无'}`);
        messageContent.push(`<b>昵称：</b>${escapeHtml(record.nickname || ' ')}`);
        messageContent.push(`<b>群名片：</b>${escapeHtml(record.card || ' ')}`);
        let finalContent = messageContent.join('<br>');
        finalContent += timelineHtml;
        finalContent += `<span class="content-time">${moment(record.recordTime).format('YYYY-MM-DD HH:mm')}</span>`;
        // finalContent += `<span class="record-index">#${i + 1}</span>`;
        finalContent += `<span class="record-index">#${offset + i + 1}</span>`;


        processedHistory.push({
            avatar: avatarBase64,
            nickname: displayName,
            title: recordTitle,
            badgeText: badgeText,
            badgeColor: badgeColor,
            badgeTextColor: badgeTextColor,
            content: finalContent,
            isSystemMessage: false
        });
    }

    // 七、备注
    // const remarkKey = `${config.redisPrefix}:remark:${groupId}:${e.at}`;
    const remarkKey = `${config.redisPrefix}:remark:${groupId}:${targetUid}`;
    const remarkData = await redis.get(remarkKey);

    if (remarkData) {
        let remarkList = [];
        try {
            remarkList = JSON.parse(remarkData);
        } catch (err) {
            log.w(`读取备注 JSON 失败: ${err}`);
        }

        if (Array.isArray(remarkList)) {
            remarkList.forEach((text, index) => {
                const label = remarkList.length > 1 ? `备注 ${index + 1}` : `备注`;
                processedHistory.push({
                    // 醒目标题
                    // content: `<span style="font-weight:bold; color:#ff5722;">【${label}】</span> ${text}`,
                    content: `${label}：${escapeHtml(text)}`,
                    // content: `${text}`,
                    isSystemMessage: true
                });
            });
        }
    }

    // 模板所需的主数据
    log.i(`群名称: ${gname}`);
    const khPluginVersion = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'package.json'), 'utf8')).version;
    const renderData = {
        history: processedHistory,
        groupName: gname || groupId.toString(),
        footer: `Created By ${cfg.package.name} v${cfg.package.version} & kh-plugin v${khPluginVersion}`
    };

    // 读取模板并渲染
    const templateContent = fs.readFileSync(path.join(templateDir, 'chat.html'), 'utf-8');
    const html = template.render(templateContent, renderData);

    // 使用 puppeteer 生成图片
    const img = await puppeteer.screenshot('who_are_you', {
        tplFile: path.join(templateDir, 'chat.html'),
        // saveId: `${groupId}_${e.at}`,
        saveId: `${groupId}_${targetUid}`,
        // 传递渲染数据给模板
        ...renderData
    });

    return img;
}
