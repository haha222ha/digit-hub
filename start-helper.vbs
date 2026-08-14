' 启动小红书发货助手（心象测版，不是阿奇锁 Pro）
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "D:\eva\xhs-shipping-assistant"
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -File ""D:\eva\xhs-shipping-assistant\start-assistant.ps1""", 0, False
