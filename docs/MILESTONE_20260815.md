# 里程碑：IM 发消息可用（2026-08-15）

可回溯标签：`milestone-20260815-im-send-ok`

## 已验证

- 客服 IM 文本消息可发出（XhsRim + Vue3 setter）
- 发卡设置已接到自动发货（链接卡密 / 激活码模板）
- 测试单 `P802233881788021201` 已补发成功（3 条消息）
- 已发链接写入本地卡池订单号，库存 50→49
- 标题栏整条可拖动

## 还原

```
git checkout milestone-20260815-im-send-ok
```

或查看提交说明含 `milestone-20260815-im-send-ok` 的 commit。
