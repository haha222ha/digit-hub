/* ============================================
   类型选择页JavaScript - select.js
   ============================================ */

/**
 * 类型选择页状态
 */
const SelectPageState = {
    selectedType: null,  // 当前选择的MBTI类型
    selectedButton: null  // 当前选中的按钮元素
};

/**
 * 类型选择页初始化
 */
function initSelectPage() {
    // 初始化类型按钮点击事件
    initTypeButtons();
    
    // 恢复之前的选择（如果有）
    restoreSelection();
    
    // 如果有保存的类型，应用主题
    const savedType = ThemeManager.getCurrentTheme();
    if (savedType) {
        const selectContainer = document.querySelector('.mbti16stage-questionnaire');
        if (selectContainer) {
            ThemeManager.setTheme(savedType, selectContainer);
        }
    }
    
    console.log('类型选择页初始化完成');
}

/**
 * 初始化类型按钮
 */
function initTypeButtons() {
    // 获取所有类型按钮
    const typeButtons = document.querySelectorAll('.type-button');
    
    if (typeButtons.length === 0) {
        console.warn('未找到类型按钮');
        return;
    }

    // 为每个按钮添加点击事件
    typeButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            // 添加点击反馈效果
            this.classList.add('button-ripple');
            setTimeout(() => {
                this.classList.remove('button-ripple');
            }, 600);
            
            handleTypeSelect(this);
        });

        // 添加键盘支持
        button.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleTypeSelect(this);
            }
        });
    });
}

/**
 * 处理类型选择
 * @param {HTMLElement} button - 被点击的按钮元素
 */
function handleTypeSelect(button) {
    // 获取类型代码
    const typeCodeElement = button.querySelector('.type-code');
    if (!typeCodeElement) {
        console.warn('未找到类型代码元素');
        return;
    }

    const typeCode = typeCodeElement.textContent.trim();
    
    // 验证类型代码是否有效
    if (!MBTITypes[typeCode]) {
        console.warn('无效的MBTI类型:', typeCode);
        return;
    }

    // 更新选择状态
    updateSelection(typeCode, button);
}

/**
 * 更新选择状态
 * @param {string} typeCode - MBTI类型代码
 * @param {HTMLElement} button - 选中的按钮元素
 */
function updateSelection(typeCode, button) {
    // 清除之前的选择状态
    if (SelectPageState.selectedButton) {
        SelectPageState.selectedButton.classList.remove('selected', 'is-selected');
    }

    // 更新当前选择
    SelectPageState.selectedType = typeCode;
    SelectPageState.selectedButton = button;

    // 添加选中状态
    button.classList.add('selected', 'is-selected');

    // 保存选择
    saveSelection(typeCode);

    // 应用主题颜色（预览效果）
    previewTheme(typeCode);

    console.log('已选择类型:', typeCode);
}

/**
 * 保存选择
 * @param {string} typeCode - MBTI类型代码
 * @returns {boolean} 是否成功
 */
function saveSelection(typeCode) {
    // 验证MBTI类型
    if (!typeCode || typeof typeCode !== 'string' || !MBTITypes[typeCode]) {
        console.warn('无效的MBTI类型:', typeCode);
        return false;
    }

    // 保存到localStorage
    const saveSuccess = Storage.save(StorageKeys.SELECTED_TYPE, typeCode);
    if (!saveSuccess) {
        console.warn('保存MBTI类型到localStorage失败');
        return false;
    }
    
    // 保存到URL参数
    try {
        URLUtils.setParam('type', typeCode);
    } catch (e) {
        console.warn('保存MBTI类型到URL参数失败:', e);
        // 不返回false，因为localStorage已保存成功
    }
    
    return true;
}

/**
 * 预览主题颜色
 * @param {string} typeCode - MBTI类型代码
 */
function previewTheme(typeCode) {
    // 应用主题到选择页容器（.mbti16stage-questionnaire）
    const selectContainer = document.querySelector('.mbti16stage-questionnaire');
    if (selectContainer) {
        ThemeManager.setTheme(typeCode, selectContainer);
    } else {
        // 如果找不到容器，应用到documentElement
        ThemeManager.setTheme(typeCode);
    }
}

/**
 * 恢复之前的选择
 */
function restoreSelection() {
    // 从URL参数或localStorage获取之前的选择
    let savedType = URLUtils.getParam('type');
    if (!savedType) {
        savedType = Storage.load(StorageKeys.SELECTED_TYPE, null);
    }
    
    // 验证类型是否有效
    if (!savedType || !MBTITypes[savedType]) {
        return;
    }
    
    // 同步数据：确保URL和localStorage都有值
    if (!URLUtils.getParam('type')) {
        URLUtils.setParam('type', savedType);
    }
    if (!Storage.load(StorageKeys.SELECTED_TYPE, null)) {
        Storage.save(StorageKeys.SELECTED_TYPE, savedType);
    }
    
    // 查找对应的按钮
    const typeButtons = document.querySelectorAll('.type-button');
    typeButtons.forEach(button => {
        const typeCodeElement = button.querySelector('.type-code');
        if (typeCodeElement && typeCodeElement.textContent.trim() === savedType) {
            // 恢复选择状态
            updateSelection(savedType, button);
            // 应用主题
            previewTheme(savedType);
        }
    });
}

/**
 * 确认选择并跳转到答题页
 * @param {string} typeCode - MBTI类型代码（可选，默认使用当前选择）
 */
function confirmAndStart(typeCode = null) {
    const selectedType = typeCode || SelectPageState.selectedType;
    
    if (!selectedType) {
        console.warn('请先选择MBTI类型');
        return;
    }

    if (!MBTITypes[selectedType]) {
        console.warn('无效的MBTI类型:', selectedType);
        return;
    }

    // 保存选择的类型
    const saveSuccess = saveSelection(selectedType);
    if (!saveSuccess) {
        console.error('保存MBTI类型失败');
        alert('保存类型失败，请重试');
        return;
    }
    
    // 应用主题颜色到选择页容器（确保主题已设置）
    const selectContainer = document.querySelector('.mbti16stage-questionnaire');
    if (selectContainer) {
        ThemeManager.setTheme(selectedType, selectContainer);
    } else {
        ThemeManager.setTheme(selectedType);
    }
    
    // 清除之前的答题数据（开始新的测试）
    const clearSuccess = TestDataManager.clearTestData();
    if (!clearSuccess) {
        console.warn('清除旧数据失败，但继续执行');
    }
    
    // 保存测试开始时间
    const timeSaveSuccess = TestDataManager.saveTestStartTime();
    if (!timeSaveSuccess) {
        console.warn('保存测试开始时间失败，但继续执行');
    }
    
    // 初始化测试状态
    const stateSaveSuccess = TestDataManager.saveTestState({
        currentQuestionIndex: 0,
        totalQuestions: 32,
        startTime: Date.now()
    });
    if (!stateSaveSuccess) {
        console.warn('保存测试状态失败，但继续执行');
    }

    // 构建答题页URL参数（需要包含token以便SDK验证）
    const params = { type: selectedType };
    
    // 优先从URL参数获取token（从index.html传递过来的）
    let token = URLUtils.getParam('token');
    let isUnlimited = URLUtils.getParam('unlimited') === 'true';
    
    // 如果URL中没有token，尝试从SDK实例获取
    if (!token && window.linkValidator && window.linkValidator.token) {
        token = window.linkValidator.token;
        isUnlimited = window.linkValidator.unlimited || false;
    }
    
    // 如果有token，添加到URL参数
    if (token) {
        if (isUnlimited) {
            params.unlimited = 'true';
        }
        params.token = token;
    }
    
    // 跳转到答题页（select.html在pages/目录下，所以使用相对路径）
    Navigation.navigateTo('question.html', params);
}

/**
 * 修改handleTypeSelect函数，添加自动跳转或延迟跳转
 */
function handleTypeSelect(button) {
    // 获取类型代码
    const typeCodeElement = button.querySelector('.type-code');
    if (!typeCodeElement) {
        console.warn('未找到类型代码元素');
        return;
    }

    const typeCode = typeCodeElement.textContent.trim();
    
    // 验证类型代码是否有效
    if (!MBTITypes[typeCode]) {
        console.warn('无效的MBTI类型:', typeCode);
        return;
    }

    // 更新选择状态
    updateSelection(typeCode, button);

    // 延迟跳转（给用户一个视觉反馈的时间）
    setTimeout(() => {
        confirmAndStart(typeCode);
    }, 300); // 300ms延迟，让选中效果显示出来
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSelectPage);
} else {
    // DOM已经加载完成
    initSelectPage();
}

