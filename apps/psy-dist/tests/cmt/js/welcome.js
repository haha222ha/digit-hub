// 欢迎页逻辑 (welcome.js)
// 注意：此文件需要先加载 cities.js, questions.js, dimensions.js

(function() {
    'use strict';

    // 等待DOM加载完成
    document.addEventListener('DOMContentLoaded', function() {
        // 检查数据是否已加载
        if (typeof window.CITIES === 'undefined' || 
            typeof window.QUESTIONS === 'undefined' || 
            typeof window.DIMENSIONS === 'undefined') {
            console.error('数据文件未加载，请确保 cities.js, questions.js, dimensions.js 已正确加载');
            return;
        }

        // 初始化页面
        initPage();
    });

    /**
     * 初始化页面
     */
    function initPage() {
        // 更新统计信息
        updateStats();
        
        // 更新信息标签
        updateInfoTag();
        
        // 生成城市卡片并实现滚动
        renderCities();
        
        // 生成四大类型板块
        renderCityTypes();
        
        // 生成11项维度板块
        renderDimensions();
        
        // 绑定开始测试按钮事件
        bindStartTestButton();
        
        // 绑定准备开始按钮事件
        bindReadyStartButton();
    }

    /**
     * 更新统计信息
     */
    function updateStats() {
        const cityCount = Object.keys(window.CITIES).length;
        const questionCount = window.QUESTIONS.length;
        const dimensionCount = Object.keys(window.DIMENSIONS).length;

        const cityCountEl = document.getElementById('city-count');
        const questionCountEl = document.getElementById('question-count');

        if (cityCountEl) cityCountEl.textContent = cityCount;
        if (questionCountEl) questionCountEl.textContent = questionCount;
    }

    /**
     * 更新信息标签
     */
    function updateInfoTag() {
        const infoTextEl = document.getElementById('info-text');
        if (infoTextEl) {
            const questionCount = window.QUESTIONS.length;
            const dimensionCount = Object.keys(window.DIMENSIONS).length;
            const cityCount = Object.keys(window.CITIES).length;
            infoTextEl.textContent = `${questionCount}道测评·${dimensionCount}大维度·${cityCount}座城市`;
        }
    }

    /**
     * 生成城市卡片并实现滚动
     */
    function renderCities() {
        const citiesScroll = document.getElementById('cities-scroll');
        if (!citiesScroll) return;

        // 清空现有内容
        citiesScroll.innerHTML = '';

        // 获取所有城市
        const cities = Object.values(window.CITIES);
        
        // 生成城市卡片（生成两次，实现无缝滚动）
        // CSS动画从0%移动到-50%，所以需要两倍的内容
        for (let i = 0; i < 2; i++) {
            cities.forEach(city => {
                const card = createCityCard(city);
                citiesScroll.appendChild(card);
            });
        }
    }

    /**
     * 创建城市卡片元素（简化版，只显示城市名称）
     */
    function createCityCard(city) {
        const card = document.createElement('div');
        card.className = 'city-card';
        card.setAttribute('data-city', city.code);

        // 只显示城市名称
        card.innerHTML = `
            <h3 class="city-card-name">${city.name || city.code}</h3>
        `;

        return card;
    }

    /**
     * 生成四大类型板块
     */
    function renderCityTypes() {
        const typesGrid = document.getElementById('city-types-grid');
        if (!typesGrid) return;

        typesGrid.innerHTML = '';

        // 定义四大类型
        const cityTypes = [
            {
                id: 'first-tier',
                title: '一线城市',
                icon: '📊',
                iconClass: 'type-icon-red',
                cities: ['BEIJING', 'SHANGHAI', 'GUANGZHOU', 'SHENZHEN'],
                tagline: '国际视野·无限机遇·追梦之地'
            },
            {
                id: 'new-first-tier',
                title: '新一线城市',
                icon: '📈',
                iconClass: 'type-icon-blue',
                cities: ['CHENGDU', 'HANGZHOU', 'WUHAN', 'NANJING'],
                moreCount: 4,
                tagline: '品质生活·发展潜力·宜居宜业'
            },
            {
                id: 'second-tier',
                title: '宜居二线',
                icon: '🏠',
                iconClass: 'type-icon-green',
                cities: ['SUZHOU', 'XIAMEN', 'QINGDAO', 'ZHUHAI'],
                moreCount: 4,
                tagline: '舒适节奏·幸福指数·安居乐业'
            },
            {
                id: 'third-tier',
                title: '特色风情',
                icon: '☁️',
                iconClass: 'type-icon-orange',
                cities: ['DALI', 'SANYA', 'LHASA', 'LIJIANG'],
                moreCount: 4,
                tagline: '诗和远方·心灵净土·自在生活'
            }
        ];

        cityTypes.forEach(type => {
            const card = createCityTypeCard(type);
            typesGrid.appendChild(card);
        });
    }

    /**
     * 创建城市类型卡片
     */
    function createCityTypeCard(type) {
        const card = document.createElement('div');
        card.className = 'city-type-card';

        // 获取城市名称
        const cityNames = type.cities.map(code => {
            const city = window.CITIES[code];
            return city ? city.name : code;
        });

        let citiesHtml = cityNames.map(name => 
            `<span class="city-tag">${name}</span>`
        ).join('');

        if (type.moreCount) {
            citiesHtml += `<div class="type-more">+${type.moreCount}</div>`;
        }

        card.innerHTML = `
            <div class="type-icon ${type.iconClass}">${type.icon}</div>
            <h3 class="type-title">${type.title}</h3>
            <div class="type-cities">${citiesHtml}</div>
            <p class="type-tagline">${type.tagline}</p>
        `;

        return card;
    }

    /**
     * 生成11项维度板块
     */
    function renderDimensions() {
        const dimensionsGrid = document.getElementById('dimensions-grid');
        if (!dimensionsGrid) return;

        dimensionsGrid.innerHTML = '';

        // 按维度代码排序（A, B, C, ...）
        const dimensionKeys = Object.keys(window.DIMENSIONS).sort();
        const dimensionPreferences = window.DIMENSION_PREFERENCES || {};

        dimensionKeys.forEach((key, index) => {
            const dimension = window.DIMENSIONS[key];
            const preferences = dimensionPreferences[key] || {};
            const card = createDimensionCard(key, dimension, preferences, index + 1);
            dimensionsGrid.appendChild(card);
        });
    }

    /**
     * 创建维度卡片
     */
    function createDimensionCard(key, dimension, preferences, number) {
        const card = document.createElement('div');
        card.className = 'dimension-card';

        // 获取选项对比（A vs C 或 A vs B）
        const optionA = preferences.A || '选项A';
        const optionC = preferences.C || '选项C';
        const optionB = preferences.B || '选项B';
        const optionD = preferences.D || '选项D';

        // 根据维度选择合适的对比
        let optionsHtml = '';
        if (optionA && optionC) {
            optionsHtml = `<span class="option-left">${optionA}</span><span class="option-vs">vs</span><span class="option-right">${optionC}</span>`;
        } else if (optionA && optionB) {
            optionsHtml = `<span class="option-left">${optionA}</span><span class="option-vs">vs</span><span class="option-right">${optionB}</span>`;
        }

        card.innerHTML = `
            <div class="dimension-number">${String(number).padStart(2, '0')}</div>
            <div class="dimension-icon">${dimension.icon || '📋'}</div>
            <h3 class="dimension-name">${dimension.name || key}</h3>
            <div class="dimension-options">${optionsHtml}</div>
        `;

        return card;
    }

    /**
     * 绑定开始测试按钮事件
     */
    function bindStartTestButton() {
        const startTestBtn = document.getElementById('start-test-btn');
        if (!startTestBtn) return;

        startTestBtn.addEventListener('click', async function() {
            await handleStartTest();
        });
    }

    /**
     * 绑定准备开始按钮事件
     */
    function bindReadyStartButton() {
        const readyStartBtn = document.getElementById('ready-start-btn');
        if (!readyStartBtn) return;

        readyStartBtn.addEventListener('click', async function() {
            await handleStartTest();
        });
    }

    /**
     * 处理开始测试的逻辑（验证链接后跳转）
     */
    async function handleStartTest() {
        // 等待SDK初始化完成（最多等待3秒）
        let waitCount = 0;
        while (!window.linkValidator && waitCount < 30) {
            await new Promise(resolve => setTimeout(resolve, 100));
            waitCount++;
        }
        
        // 检查SDK是否初始化
        if (!window.linkValidator) {
            console.error('SDK未初始化，无法开始测试');
            alert('验证SDK未初始化，无法开始测试。请刷新页面重试。');
            return;
        }
        
        // 先验证链接有效性（如果无效会显示弹窗）
        let isValid = false;
        if (typeof window.linkValidator.validateForUserAction === 'function') {
            try {
                isValid = await window.linkValidator.validateForUserAction();
                console.log('验证结果:', { isValid, valid: window.linkValidator.valid, error: window.linkValidator.validationError });
                
                // 检查验证结果和验证状态（双重检查）
                if (!isValid || window.linkValidator.valid === false) {
                    // 链接无效，已显示弹窗，不进入答题页面
                    console.warn('链接验证失败，无法开始测试', {
                        isValid,
                        valid: window.linkValidator.valid,
                        error: window.linkValidator.validationError
                    });
                    return; // 重要：验证失败时return，阻止进入答题页
                }
            } catch (error) {
                // 验证失败，已显示弹窗，不进入答题页面
                console.error('链接验证失败:', error);
                if (window.linkValidator) {
                    window.linkValidator.valid = false;
                }
                return; // 重要：验证失败时return，阻止进入答题页
            }
        } else {
            // 如果validateForUserAction不存在，检查valid状态
            if (window.linkValidator.valid === false) {
                alert(window.linkValidator.validationError || '测试链接无效，请检查链接是否正确');
                return;
            }
            isValid = window.linkValidator.valid !== false;
        }
        
        // 最终检查：确保验证通过才进入答题页面
        if (!isValid || (window.linkValidator && window.linkValidator.valid === false)) {
            console.warn('最终验证检查失败，无法开始测试');
            return;
        }
        
        // 链接验证通过，构建测试页URL（需要包含token以便SDK验证）
        let testUrl = 'test.html';
        const urlParams = new URLSearchParams();
        const token = window.linkValidator && window.linkValidator.token;
        const isUnlimited = window.linkValidator && window.linkValidator.unlimited;
        
        // 如果是无限测试模式，添加unlimited和token参数
        if (isUnlimited && token) {
            urlParams.set('unlimited', 'true');
            urlParams.set('token', token);
        } else if (token) {
            // 普通模式，只添加token
            urlParams.set('token', token);
        }
        
        // 构建完整的URL
        const queryString = urlParams.toString();
        if (queryString) {
            testUrl = `${testUrl}?${queryString}`;
        }
        
        // 跳转到测试页
        window.location.href = testUrl;
    }

})();
