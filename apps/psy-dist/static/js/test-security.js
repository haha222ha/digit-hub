/**
 * 测试页面安全工具库
 * 用于禁用右键菜单、开发者工具等，增强测试页面的安全性
 * 
 * 使用方法：
 * 1. 在HTML页面中引入此文件：<script src="/static/js/test-security.js"></script>
 * 2. 调用初始化方法：TestSecurity.enable()
 * 
 * 注意：
 * - 这些安全措施只能阻止普通用户，无法完全阻止有经验的技术人员
 * - 真正的安全应该在后端实现，这些措施只是辅助手段
 * - 在本地开发环境（localhost）中会自动禁用，方便开发调试
 */

(function() {
    'use strict';

    /**
     * 测试页面安全工具类
     */
    const TestSecurity = {
        /**
         * 配置选项
         */
        config: {
            disableRightClick: true,      // 禁用右键菜单
            disableDevTools: true,        // 禁用开发者工具相关快捷键
            disableTextSelect: false,     // 是否禁用文字选择（默认不禁用，影响用户体验）
            disableSavePage: true,        // 禁用保存网页（Ctrl+S）
            enableOnLocalhost: false,     // 是否在localhost环境启用（开发时建议设为false）
        },

        /**
         * 检测是否为本地开发环境
         */
        isLocalhost: function() {
            const hostname = window.location.hostname;
            return hostname === 'localhost' || 
                   hostname === '127.0.0.1' || 
                   hostname === '[::1]' ||
                   hostname.startsWith('192.168.') ||
                   hostname.startsWith('10.') ||
                   hostname.endsWith('.local');
        },

        /**
         * 禁用右键菜单
         */
        disableRightClickHandler: function() {
            // 禁用右键菜单
            document.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }, { passive: false });

            // 防止移动端长按触发右键
            document.addEventListener('touchstart', function(e) {
                if (e.touches.length > 1) {
                    e.preventDefault();
                }
            }, { passive: false });

            // 兼容旧版浏览器
            document.oncontextmenu = function() {
                return false;
            };
        },

        /**
         * 禁用文字选择（可选）
         */
        disableTextSelectHandler: function() {
            // 禁用文字选择事件
            document.addEventListener('selectstart', function(e) {
                e.preventDefault();
                return false;
            }, { passive: false });

            // 兼容旧版浏览器
            document.onselectstart = function() {
                return false;
            };

            // CSS方式禁用文字选择（作为补充）
            const style = document.createElement('style');
            style.textContent = '* { -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; }';
            document.head.appendChild(style);
        },

        /**
         * 禁用开发者工具相关快捷键
         */
        disableDevToolsHandler: function() {
            document.addEventListener('keydown', function(e) {
                // F12 - 打开开发者工具
                if (e.keyCode === 123) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }

                // Ctrl+Shift+I - Chrome/Edge 打开开发者工具
                if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }

                // Ctrl+Shift+J - Chrome/Edge 打开控制台
                if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }

                // Ctrl+Shift+C - Chrome/Edge 检查元素
                if (e.ctrlKey && e.shiftKey && e.keyCode === 67) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }

                // Ctrl+U - 查看源代码
                if (e.ctrlKey && e.keyCode === 85) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }

                // Ctrl+S - 保存网页（如果启用）
                if (TestSecurity.config.disableSavePage && e.ctrlKey && e.keyCode === 83) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
            }, { passive: false });
        },

        /**
         * 检测开发者工具是否打开（使用窗口尺寸检测）
         */
        detectDevTools: function() {
            const threshold = 160; // 阈值：窗口尺寸差异超过160px认为打开了开发者工具
            let devtools = { open: false };

            const checkDevTools = function() {
                const widthThreshold = window.outerWidth - window.innerWidth > threshold;
                const heightThreshold = window.outerHeight - window.innerHeight > threshold;

                if (widthThreshold || heightThreshold) {
                    if (!devtools.open) {
                        devtools.open = true;
                        // 开发者工具打开时的处理
                        // 可以选择刷新页面、显示警告或清空控制台
                        console.clear();
                        console.log('%c⚠️ 警告', 'color: red; font-size: 50px; font-weight: bold;');
                        console.log('%c请关闭开发者工具', 'color: red; font-size: 20px;');
                        console.log('%c开发者工具已检测到，请关闭后继续使用', 'color: red; font-size: 16px;');
                    }
                } else {
                    devtools.open = false;
                }
            };

            // 每500ms检查一次
            setInterval(checkDevTools, 500);
        },

        /**
         * 启用安全功能
         * @param {Object} options - 配置选项（可选）
         */
        enable: function(options) {
            // 合并配置选项
            if (options) {
                Object.assign(this.config, options);
            }

            // 如果是本地开发环境且未启用，则跳过
            if (this.isLocalhost() && !this.config.enableOnLocalhost) {
                console.log('[TestSecurity] 本地开发环境，安全功能已禁用');
                return;
            }

            // 禁用右键菜单
            if (this.config.disableRightClick) {
                this.disableRightClickHandler();
            }

            // 禁用文字选择（如果启用）
            if (this.config.disableTextSelect) {
                this.disableTextSelectHandler();
            }

            // 禁用开发者工具快捷键
            if (this.config.disableDevTools) {
                this.disableDevToolsHandler();
                // 检测开发者工具（可选，可能会影响性能）
                // this.detectDevTools();
            }

            console.log('[TestSecurity] 安全功能已启用');
        },

        /**
         * 禁用安全功能（主要用于调试）
         */
        disable: function() {
            // 这里可以添加禁用逻辑
            console.log('[TestSecurity] 安全功能已禁用');
        }
    };

    // 将 TestSecurity 暴露到全局
    window.TestSecurity = TestSecurity;

    // 如果页面加载完成后自动启用（可选）
    // 如果不需要自动启用，可以注释掉下面这段代码
    // if (document.readyState === 'loading') {
    //     document.addEventListener('DOMContentLoaded', function() {
    //         TestSecurity.enable();
    //     });
    // } else {
    //     TestSecurity.enable();
    // }

})();

