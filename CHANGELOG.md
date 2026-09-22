# Changelog

## 0.1.0 - Initial Release

### Features
- 动态目录路径：使用 Luxon 日期格式生成日志目录
- 固定模板：支持 `**date:FORMAT**`、`${date:FORMAT}`、`{{date:FORMAT}}` 三种日期占位符
- 任务结转：未完成的 `- [ ]` 任务自动从昨日日志结转到今日日志
- 章节级确认：章节下所有任务完成时弹窗询问需求是否闭环
- 章节状态标记：`<!-- req-status: pending|done|cancelled -->`
- 设置界面：可配置目录格式、文件名格式、模板路径、结转选项

### Commands
- 创建今日日志
- 打开今日日志
