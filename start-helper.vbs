' Launch xhs-shipping-assistant (use bat to avoid PS encoding issues)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "D:\eva\xhs-shipping-assistant"
sh.Run "D:\eva\xhs-shipping-assistant\start-assistant.bat", 0, False
