/*
 * @Author: 渔火Arcadia  https://github.com/yhArcadia
 * @Date: 2026-10-03 17:08:19
 * @LastEditors: 渔火Arcadia
 * @LastEditTime: 2026-10-03 18:53:06
 * @FilePath: /kh-plugin/apps/louvre.js
 * @Description: 卢浮宫滤镜
 * 
 * Copyright (c) 2026 by 渔火Arcadia 1761869682@qq.com, All Rights Reserved. 
 */
import { BaseApp } from '../components/base-app.js';
import { resolveImages, getAvatarUrl } from '../utils/resolve-images.js';
import { mentionedUserId } from '../utils/message.js';
import { isDivingGroup } from '../utils/group-policy.js';
import { parseLouvreOptions } from '../utils/louvre-options.js';
import { renderLouvre } from '../services/louvre-renderer.js';
import { log } from '../utils/logger.js';

let running = false;
export class Louvre extends BaseApp {
  constructor() {
    super({
      name: 'kh插件-卢浮宫',
      dsc: 'One Last Kiss 图片滤镜',
      priority: 4999,
      rule: [
        {
          reg: '^#?(卢浮宫|louvre)([\\s\\S]*)$',
          fnc: 'generate'
        }]
    });
  }
  async generate(e) {
    if (isDivingGroup(e, this.config)) return false;
    if (/帮助|help/i.test(e.msg || '')) {
      // return false;
      await e.reply('卢浮宫滤镜：\n  #卢浮宫\n  #卢浮宫+图片\n  #卢浮宫+引用图片回复\n  #卢浮宫@某人\n\n自定义参数：\n  线条：精细、一般、稍粗、超粗、极粗、浮雕、线稿\n  开关：开/关降噪、开/关Kiss、开/关水印、开/关初回\n  线迹80-126（默认118），调子20-200（默认108）\n默认：一般、降噪/Kiss/水印/初回开启。初回仅在开启水印时生效。\n例：#卢浮宫 超粗 关水印 调子150\n\n在线使用：https://lab.magiconch.com/one-last-image/');
      return true;
    }
    
    if (running) { await e.reply('当前有图片正在处理，请稍后再试。'); return true; }
    running = true;

    try {
      const images = await resolveImages(e);
      let url = images.reply[0] || e.img?.[0]?.url || e.img?.[0]
        || e.message?.find(item => item.type === 'image')?.url;
        
      if (!url && e.source) {
        const source = typeof e.getReply === 'function' ? await e.getReply()
          : e.group?.getChatHistory ? (await e.group.getChatHistory(e.source.seq, 1))?.pop() : null;
        url = source?.message?.find(item => item.type === 'image')?.url;
      }

      const at = mentionedUserId(e);

      if (!url) {
        if(at){
          url = getAvatarUrl(at);
        }else{
          url = getAvatarUrl(e.sender.user_id);
        }
      }
      
      // await e.reply('正在生成卢浮宫风格图片，请稍候…');
      const image = await renderLouvre(url, parseLouvreOptions(e.msg));
      await e.reply(segment.image(image));
    } catch (error) {
      log.e(`卢浮宫图片处理失败：${error.stack || error.message}`);
      await e.reply('图片处理失败，请检查图片是否有效及 Yunzai 浏览器是否正常；大图可缩小后重试。');
    } finally { running = false; }
    return true;
  }
}