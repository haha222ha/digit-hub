// 报告页逻辑 (report.js)
// 注意：此文件需要先加载 cities.js, dimensions.js

(function() {
    'use strict';

    // 全局变量
    let resultData = null;  // 存储测试结果数据
    let topCity = null;     // 排名第一的城市
    let otherCities = [];   // 排名第2、3的城市

    // 等待DOM加载完成
    document.addEventListener('DOMContentLoaded', function() {
        // 检查数据是否已加载
        if (typeof window.CITIES === 'undefined') {
            console.error('CITIES 未定义，请确保 cities.js 已正确加载');
            showError('数据文件未加载，请刷新页面重试');
            return;
        }

        // 初始化
        init();
    });

    /**
     * 初始化页面
     */
    function init() {
        // 步骤1: 从URL参数获取token和测试模式
        const token = getTokenFromURL();
        const isUnlimited = getUnlimitedFlagFromURL();
        
        if (!token) {
            showError('缺少测试结果标识，请重新进行测试');
            return;
        }

        // 步骤2: 从localStorage读取测试结果
        const data = loadResultFromStorage(token, isUnlimited);
        if (!data) {
            showError('测试结果不存在或已过期，请重新进行测试');
            return;
        }

        resultData = data;

        // 步骤3: 加载城市数据并显示
        loadAndDisplayResults();
    }

    /**
     * 从URL参数获取token
     * @returns {string|null} token值，如果不存在则返回null
     */
    function getTokenFromURL() {
        // 方法1：从URL查询参数获取
        const urlParams = new URLSearchParams(window.location.search);
        let token = urlParams.get('token');
        
        // 方法2：如果URL中没有token，尝试从SDK实例获取
        if (!token && window.linkValidator && window.linkValidator.token) {
            token = window.linkValidator.token;
        }
        
        return token;
    }

    /**
     * 从URL参数获取无限测试标识
     * @returns {boolean} 是否为无限测试模式
     */
    function getUnlimitedFlagFromURL() {
        // 方法1：从URL查询参数获取
        const urlParams = new URLSearchParams(window.location.search);
        const unlimited = urlParams.get('unlimited') === 'true';
        
        // 方法2：如果URL中没有，尝试从SDK实例获取
        if (!unlimited && window.linkValidator && window.linkValidator.unlimited) {
            return true;
        }
        
        return unlimited;
    }

    /**
     * 从localStorage读取测试结果
     * @param {string} token - token值
     * @param {boolean} isUnlimited - 是否为无限测试模式
     * @returns {Object|null} 测试结果数据，如果不存在则返回null
     */
    function loadResultFromStorage(token, isUnlimited) {
        try {
            // 无限测试：使用固定key
            // 普通测试：使用token作为key
            const storageKey = isUnlimited ? 'city_match_result_unlimited' : `city_match_result_${token}`;
            const dataString = localStorage.getItem(storageKey);
            
            if (!dataString) {
                return null;
            }

            const data = JSON.parse(dataString);
            return data;
        } catch (error) {
            console.error('读取测试结果失败:', error);
            return null;
        }
    }

    /**
     * 加载城市数据并显示结果
     */
    function loadAndDisplayResults() {
        if (!resultData || !resultData.result) {
            showError('测试结果数据不完整');
            return;
        }

        const matchResult = resultData.result;
        
        // 获取排名第一的城市
        if (matchResult.topCities && matchResult.topCities.length > 0) {
            topCity = matchResult.topCities[0];
        }

        // 获取排名第2、3的城市
        if (matchResult.topCities && matchResult.topCities.length > 1) {
            otherCities = matchResult.topCities.slice(1, 3);
        }

        // 显示结果
        displayResults();
    }

    /**
     * 显示所有结果
     */
    function displayResults() {
        // 显示匹配城市（步骤6.4）
        displayMatchCity();
        
        // 显示城市详情（步骤6.5-6.9）
        displayCityDetails();
        
        // 显示其他匹配城市（步骤6.10）
        displayOtherCities();
        
        // 绑定操作按钮（步骤6.11）
        bindActionButtons();
    }

    /**
     * 显示匹配城市（步骤6.4）
     */
    function displayMatchCity() {
        if (!topCity) {
            return;
        }

        const cityCode = topCity.code;
        const cityData = window.CITIES[cityCode];
        if (!cityData) {
            console.error('城市数据不存在:', cityCode);
            return;
        }

        // 显示白色卡片
        displayMatchCityWhite(cityData);
    }

    /**
     * 显示图2风格的白色卡片
     */
    function displayMatchCityWhite(cityData) {
        if (!cityData || !topCity) {
            return;
        }

        // 显示城市图片
        const cityImageContainer = document.getElementById('city-image-container');
        if (cityImageContainer && cityData.image) {
            let imagePath = cityData.image;
            // 如果路径不是以 / 开头，转换为相对于 /tests/cmt/ 的绝对路径
            if (!imagePath.startsWith('/')) {
                // 相对路径转换为绝对路径
                imagePath = '/tests/cmt/' + imagePath;
            } else {
                // 如果已经是绝对路径，确保路径正确
                imagePath = imagePath.replace(/^\/images\/cities\//, '/tests/cmt/images/').replace(/^\/images\//, '/tests/cmt/images/');
            }
            cityImageContainer.innerHTML = `<img src="${imagePath}" alt="${cityData.name}">`;
        }

        // 显示匹配度
        const scoreValueWhite = document.getElementById('score-value-white');
        if (scoreValueWhite) {
            scoreValueWhite.textContent = `${topCity.percentage || 0}%`;
        }

        // 显示城市名称
        const cityNameTextWhite = document.getElementById('city-name-text-white');
        if (cityNameTextWhite) {
            cityNameTextWhite.textContent = cityData.name || topCity.code;
        }

        // 显示标签（彩色）
        const cityKeywordsWhite = document.getElementById('city-keywords-white');
        if (cityKeywordsWhite && cityData.tags) {
            cityKeywordsWhite.innerHTML = '';
            cityData.tags.slice(0, 5).forEach((tag, index) => {
                const keywordEl = document.createElement('span');
                const colorClass = `keyword-color-${(index % 8) + 1}`;
                keywordEl.className = `keyword-white ${colorClass}`;
                keywordEl.textContent = tag;
                cityKeywordsWhite.appendChild(keywordEl);
            });
        }

        // 显示匹配理由
        const matchReasonEl = document.getElementById('city-match-reason');
        if (matchReasonEl && window.CITY_MATCH_REASONS) {
            const reason = window.CITY_MATCH_REASONS[cityData.name];
            if (reason) {
                matchReasonEl.textContent = reason;
            } else {
                matchReasonEl.textContent = '';
            }
        }
    }

    /**
     * 显示城市详情（步骤6.5-6.9）
     */
    function displayCityDetails() {
        if (!topCity) {
            return;
        }

        const cityCode = topCity.code;
        const cityData = window.CITIES[cityCode];
        if (!cityData) {
            return;
        }

        // 显示基本信息（步骤6.5）
        displayBasicInfo(cityData);

        // 显示美食（步骤6.6）
        displayCuisine(cityData);

        // 显示风景（步骤6.7）
        displayScenery(cityData);

        // 显示文化（步骤6.8）
        displayCulture(cityData);

        // 显示生活指南（步骤6.9）
        displayLivingGuide(cityData);
    }

    /**
     * 显示基本信息（步骤6.5）
     */
    function displayBasicInfo(cityData) {
        const contentEl = document.getElementById('basic-info-content');
        if (!contentEl) return;

        let html = '';

        // 城市简介
        if (cityData.description) {
            html += `<div class="info-item"><div class="info-value">${cityData.description}</div></div>`;
        }

        // 气候
        if (cityData.climate) {
            html += `<div class="info-item">
                <div class="info-label">🌤️ 气候</div>
                <div class="info-value">${cityData.climate}</div>
            </div>`;
        }

        // 生活方式
        if (cityData.lifestyle) {
            html += `<div class="info-item">
                <div class="info-label">🏠 生活方式</div>
                <div class="info-value">${cityData.lifestyle}</div>
            </div>`;
        }

        contentEl.innerHTML = html;
    }

    /**
     * 显示美食（步骤6.6）
     */
    function displayCuisine(cityData) {
        const contentEl = document.getElementById('cuisine-content');
        if (!contentEl || !cityData.cuisine) return;

        let html = '';

        // 美食摘要
        if (cityData.cuisine.summary) {
            html += `<div class="info-item"><div class="info-value">${cityData.cuisine.summary}</div></div>`;
        }

        // 特色美食列表
        if (cityData.cuisine.specialties && cityData.cuisine.specialties.length > 0) {
            html += `<div class="info-item">
                <div class="info-label">特色美食</div>
                <ul class="detail-list">`;
            cityData.cuisine.specialties.forEach(food => {
                html += `<li class="detail-list-item">
                    <span class="list-icon">🍽️</span>
                    <span class="list-text">${food}</span>
                </li>`;
            });
            html += `</ul></div>`;
        }

        // 必试美食推荐
        if (cityData.cuisine.mustTry) {
            html += `<div class="highlight-text">💡 必试推荐：${cityData.cuisine.mustTry}</div>`;
        }

        contentEl.innerHTML = html;
    }

    /**
     * 显示风景（步骤6.7）
     */
    function displayScenery(cityData) {
        const contentEl = document.getElementById('scenery-content');
        if (!contentEl || !cityData.scenery) return;

        let html = '';

        // 风景摘要
        if (cityData.scenery.summary) {
            html += `<div class="info-item"><div class="info-value">${cityData.scenery.summary}</div></div>`;
        }

        // 地标景点列表
        if (cityData.scenery.landmarks && cityData.scenery.landmarks.length > 0) {
            html += `<div class="info-item">
                <div class="info-label">地标景点</div>
                <ul class="detail-list">`;
            cityData.scenery.landmarks.forEach(landmark => {
                html += `<li class="detail-list-item">
                    <span class="list-icon">📍</span>
                    <span class="list-text">${landmark}</span>
                </li>`;
            });
            html += `</ul></div>`;
        }

        // 最佳游览季节
        if (cityData.scenery.bestSeason) {
            html += `<div class="highlight-text">📅 最佳游览季节：${cityData.scenery.bestSeason}</div>`;
        }

        contentEl.innerHTML = html;
    }

    /**
     * 显示文化（步骤6.8）
     */
    function displayCulture(cityData) {
        const contentEl = document.getElementById('culture-content');
        if (!contentEl || !cityData.culture) return;

        let html = '';

        // 文化摘要
        if (cityData.culture.summary) {
            html += `<div class="info-item"><div class="info-value">${cityData.culture.summary}</div></div>`;
        }

        // 传统文化列表
        if (cityData.culture.traditions && cityData.culture.traditions.length > 0) {
            html += `<div class="info-item">
                <div class="info-label">传统文化</div>
                <ul class="detail-list">`;
            cityData.culture.traditions.forEach(tradition => {
                html += `<li class="detail-list-item">
                    <span class="list-icon">🎭</span>
                    <span class="list-text">${tradition}</span>
                </li>`;
            });
            html += `</ul></div>`;
        }

        // 城市氛围描述
        if (cityData.culture.vibe) {
            html += `<div class="highlight-text">💭 城市氛围：${cityData.culture.vibe}</div>`;
        }

        contentEl.innerHTML = html;
    }

    /**
     * 显示生活指南（步骤6.9）
     */
    function displayLivingGuide(cityData) {
        const contentEl = document.getElementById('living-guide-content');
        if (!contentEl) return;

        let html = '';

        // 生活成本
        if (cityData.livingCost) {
            html += `<div class="info-item">
                <div class="info-label">💰 生活成本</div>`;
            if (cityData.livingCost.level) {
                html += `<div class="info-value" style="margin-bottom: 8px;"><strong>水平：${cityData.livingCost.level}</strong></div>`;
            }
            if (cityData.livingCost.rent) {
                html += `<div class="info-value" style="margin-bottom: 4px;">🏠 房租：${cityData.livingCost.rent}</div>`;
            }
            if (cityData.livingCost.food) {
                html += `<div class="info-value" style="margin-bottom: 4px;">🍜 餐饮：${cityData.livingCost.food}</div>`;
            }
            if (cityData.livingCost.summary) {
                html += `<div class="info-value">${cityData.livingCost.summary}</div>`;
            }
            html += `</div>`;
        }

        // 职业机会
        if (cityData.career) {
            html += `<div class="info-item">
                <div class="info-label">💼 职业机会</div>`;
            if (cityData.career.industries && cityData.career.industries.length > 0) {
                html += `<div class="info-value" style="margin-bottom: 8px;">
                    <strong>主要行业：</strong>${cityData.career.industries.join('、')}
                </div>`;
            }
            if (cityData.career.opportunities) {
                html += `<div class="info-value" style="margin-bottom: 8px;">${cityData.career.opportunities}</div>`;
            }
            if (cityData.career.averageSalary) {
                html += `<div class="info-value" style="margin-bottom: 8px;">${cityData.career.averageSalary}</div>`;
            }
            if (cityData.career.suggestion) {
                html += `<div class="highlight-text">💡 ${cityData.career.suggestion}</div>`;
            }
            html += `</div>`;
        }

        // 交通信息
        if (cityData.transportation) {
            html += `<div class="info-item">
                <div class="info-label">🚇 交通信息</div>`;
            if (cityData.transportation.score) {
                html += `<div class="info-value" style="margin-bottom: 8px;"><strong>交通评分：${cityData.transportation.score}</strong></div>`;
            }
            if (cityData.transportation.publicTransit) {
                html += `<div class="info-value" style="margin-bottom: 4px;">${cityData.transportation.publicTransit}</div>`;
            }
            if (cityData.transportation.airports && cityData.transportation.airports.length > 0) {
                html += `<div class="info-value" style="margin-bottom: 4px;">
                    <strong>机场：</strong>${cityData.transportation.airports.join('、')}
                </div>`;
            }
            if (cityData.transportation.highSpeedRail) {
                html += `<div class="info-value">${cityData.transportation.highSpeedRail}</div>`;
            }
            html += `</div>`;
        }

        // 推荐理由
        if (cityData.recommendation) {
            html += `<div class="info-item">
                <div class="info-label">✨ 推荐理由</div>`;
            if (cityData.recommendation.whyThisCity) {
                html += `<div class="info-value" style="margin-bottom: 12px;">${cityData.recommendation.whyThisCity}</div>`;
            }
            if (cityData.recommendation.idealFor && cityData.recommendation.idealFor.length > 0) {
                html += `<div class="info-value">
                    <strong>适合人群：</strong>${cityData.recommendation.idealFor.join('、')}
                </div>`;
            }
            html += `</div>`;
        }

        contentEl.innerHTML = html;
    }

    /**
     * 显示其他匹配城市（步骤6.10）
     */
    function displayOtherCities() {
        const gridEl = document.getElementById('other-cities-grid');
        if (!gridEl || otherCities.length === 0) {
            // 如果没有其他匹配城市，隐藏该区域
            const sectionEl = document.querySelector('.other-cities-section');
            if (sectionEl) {
                sectionEl.style.display = 'none';
            }
            return;
        }

        gridEl.innerHTML = '';

        otherCities.forEach(city => {
            const cityCode = city.code;
            const cityData = window.CITIES[cityCode];
            if (!cityData) {
                return;
            }

            const card = createOtherCityCard(city, cityData);
            gridEl.appendChild(card);
        });
    }

    /**
     * 创建其他城市卡片
     */
    function createOtherCityCard(city, cityData) {
        const card = document.createElement('div');
        card.className = 'other-city-card';

        let html = `<div class="other-city-name">${cityData.name || city.code}</div>`;
        html += `<div class="other-city-score">${city.percentage || 0}%</div>`;

        // 显示城市标签
        if (cityData.tags && cityData.tags.length > 0) {
            html += `<div class="other-city-tags">`;
            cityData.tags.slice(0, 3).forEach((tag, index) => {
                const colorClass = `keyword-color-${(index % 8) + 1}`;
                html += `<span class="other-city-tag ${colorClass}">${tag}</span>`;
            });
            html += `</div>`;
        }

        card.innerHTML = html;
        return card;
    }

    /**
     * 绑定操作按钮（步骤6.11）
     */
    function bindActionButtons() {
        // 分享按钮
        // 重新测试按钮（跳转到首页，需要包含token参数）
        const retestBtn = document.getElementById('retest-btn');
        if (retestBtn) {
            retestBtn.addEventListener('click', function() {
                // 清除本地测试结果（用于重新测试）
                if (window.linkValidator && typeof window.linkValidator.clearLocalResult === 'function') {
                    window.linkValidator.clearLocalResult();
                    console.log('已清除SDK本地测试结果');
                }
                
                // 清除localStorage中的测试结果
                if (resultData && resultData.token) {
                    // 根据是否为无限测试，使用不同的key清除结果
                    const isUnlimited = resultData.isUnlimited || (window.linkValidator && window.linkValidator.unlimited);
                    const storageKey = isUnlimited ? 'city_match_result_unlimited' : `city_match_result_${resultData.token}`;
                    try {
                        localStorage.removeItem(storageKey);
                        console.log('已清除localStorage中的测试结果:', storageKey);
                    } catch (error) {
                        console.error('清除localStorage失败:', error);
                    }
                }
                
                // 清除token列表
                try {
                    const tokenListKey = 'city_match_tokens';
                    localStorage.removeItem(tokenListKey);
                    console.log('已清除token列表');
                } catch (error) {
                    console.error('清除token列表失败:', error);
                }
                
                // 构建首页URL（需要包含token以便SDK验证）
                let indexUrl = 'index.html';
                const urlParams = new URLSearchParams();
                
                // 优先从URL参数获取token（最可靠）
                const currentUrlParams = new URLSearchParams(window.location.search);
                let token = currentUrlParams.get('token');
                let isUnlimited = currentUrlParams.get('unlimited') === 'true';
                
                // 如果URL中没有token，尝试从SDK实例获取
                if (!token && window.linkValidator && window.linkValidator.token) {
                    token = window.linkValidator.token;
                    isUnlimited = window.linkValidator.unlimited || false;
                }
                
                // 如果还是没有token，尝试从resultData获取
                if (!token && resultData && resultData.token) {
                    token = resultData.token;
                }
                
                // 如果有token，添加到URL参数
                if (token) {
                    if (isUnlimited) {
                        urlParams.set('unlimited', 'true');
                    }
                    urlParams.set('token', token);
                    // 添加restart参数，告诉首页这是重新测试
                    urlParams.set('restart', 'true');
                }
                
                // 构建完整的URL
                const queryString = urlParams.toString();
                if (queryString) {
                    indexUrl = `${indexUrl}?${queryString}`;
                }
                
                window.location.href = indexUrl;
            });
        }
    }


    /**
     * 显示错误信息
     * @param {string} message - 错误消息
     */
    function showError(message) {
        const container = document.querySelector('.report-container');
        if (container) {
            container.innerHTML = `
                <div class="error-message" style="text-align: center; padding: 60px 20px;">
                    <h2 style="color: #e53e3e; margin-bottom: 16px;">错误</h2>
                    <p style="color: #718096; margin-bottom: 24px;">${message}</p>
                    <a href="index.html" style="display: inline-block; padding: 12px 24px; background: #3182ce; color: #ffffff; text-decoration: none; border-radius: 8px;">返回首页</a>
                </div>
            `;
        }
    }

})();

