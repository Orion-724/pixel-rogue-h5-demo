# 素材来源与致谢

感谢 **0x72（Robert）** 及原素材页提及的 **GrafxKid** 为公开美术资源所作的贡献。本项目使用这些资源完成静态美术集成与少量派生处理，不将它们宣称为项目负责人原创绘制的素材。

## 原始素材包

- 名称：**16x16 DungeonTileset II**（使用 v1.7 包中的选定帧）。
- 发布作者：[0x72](https://0x72.itch.io/)。
- 原始页面：[DungeonTileset II](https://0x72.itch.io/dungeontileset-ii)。
- 原页面描述提及 Version II 的 **GrafxKid 重着色贡献**。
- 许可依据：2026-11-07 核验时，作者页面注明 **CC-0**，并表示可用于各种用途、不强制署名。
- CC0 说明：[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)。

**许可记录边界**：原下载 ZIP 中没有独立 LICENSE/COPYRIGHT 许可文件；本项目的许可依据是原作者页面声明，不应描述为“ZIP 内附许可证”。致谢不表示作者参与、认可或为本项目背书；本文不构成法律意见或零风险保证。

## 本项目使用与派生处理

| 运行文件 | 原始帧 / 来源 | 本项目处理 |
|---|---|---|
| player.png | elf_f_idle_anim_f0 | 原帧选取，保留原配色与透明边界 |
| mob-goblin.png | goblin_idle_anim_f0 | 原帧选取；运行时生成血量轮廓与压暗变体 |
| mob-lizard.png | lizard_m_idle_anim_f0 | 同上 |
| mob-orc.png | masked_orc_idle_anim_f0 | 同上 |
| elite-ogre.png | ogre_idle_anim_f0 | 原帧选取；使用精英轮廓配色与压暗变体 |
| boss-knight-violet.png | knight_m_idle_anim_f0 | 盔甲两段调色为紫色，保留其它原色与 Alpha |
| floor-coarse.png | floor_1 | 4×4 源像素块平均降采样后，最近邻放大为低细节地面；运行中低透明度铺设 |

Boss 盔甲调色：#72D6CE → #A363DB，#417089 → #5B3A86。角色轮廓与压暗缓存由运行时代码生成；这些是素材适配处理，不是原创角色设计。当前使用单帧静态角色，不包含动作帧动画。

本项目未使用该素材页另行提供的 doc.png；展示所需的是上述七张运行 PNG，不需要分发完整原始 ZIP 或其它未使用资源。

## AI 辅助与原创性说明

开发中使用 Codex 等 AI 工具辅助方案、代码、验证与文档工作。AI 辅助生成的代码/说明与第三方美术的来源分别记录；本版角色和地面并非由图像生成模型重新原创制作。

## 许可适用范围

第三方美术的 CC0 声明仅适用于相应资源，不自动给项目源码、项目说明或项目名称授予同样许可。当前没有为本仓库源码另行选择开源许可证；请勿因仓库公开就默认可按 MIT 或 CC0 再分发全部代码。
