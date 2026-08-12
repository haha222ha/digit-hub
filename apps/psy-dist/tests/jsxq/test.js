// 精神需求测试主逻辑

// 初始化维度数据
var ocean = {};
var ocean_dict = {};
var ocean_keys = [];
var ocean_colors = [];
var ocean_icons = [];
var ocean_descs = [];
var ocean_total = 0;
var iq_value = '';

function initOcean() {
    // 清空之前的数据，避免重复添加
    ocean = {};
    ocean_dict = {};
    ocean_keys = [];
    ocean_colors = [];
    ocean_icons = [];
    ocean_descs = [];
    
    // 10个精神需求维度
    var dimensions = [
        {key: "A", name: "意义", color: "228B22", icon: "", desc: "有方向感和价值感，相信自己的存在和行动有其内在的重要性。"},
        {key: "B", name: "爱", color: "FF4791", icon: "", desc: "建立并维系深刻的、双向的情感纽带，体验接纳、关怀和亲密。"},
        {key: "C", name: "连接", color: "8080B7", icon: "", desc: "与社区、自然或全人类产生归属感和共鸣。"},
        {key: "D", name: "成长", color: "9ACD32", icon: "", desc: "追求不断扩展自己的能力、智慧和人格，实现自我潜能。"},
        {key: "E", name: "创造", color: "D07225", icon: "", desc: "将内心的想法和情感转化为新颖、独特的现实产物。"},
        {key: "F", name: "权力", color: "8A4242", icon: "", desc: "影响并掌控自身环境与他人，以感受自身的能力与重要性。"},
        {key: "G", name: "乐趣", color: "90DB33", icon: "", desc: "追求因活动本身而产生的纯粹快乐和愉悦。"},
        {key: "H", name: "安全感", color: "A136B0", icon: "", desc: "拥有稳定、安全和可预测的生活感受，从而免于恐惧和焦虑。"},
        {key: "I", name: "自由", color: "4AC4A6", icon: "", desc: "渴望根据自身价值观和意愿，主导自己的生活。"},
        {key: "J", name: "贡献", color: "B99C31", icon: "", desc: "通过行动、时间和资源，对他人或世界产生积极影响。"}
    ];
    
    for (var i = 0; i < dimensions.length; i++) {
        var dim = dimensions[i];
        ocean[dim.key] = 0;
        ocean_dict[dim.key] = dim.name;
        ocean_keys.push(dim.key);
        ocean_colors.push(dim.color);
        ocean_icons.push(dim.icon);
        ocean_descs.push(dim.desc);
    }
    iq_value = JSON.stringify(ocean);
}

// 计分函数
function updateValue(valueStr) {
    if (valueStr != "0" && valueStr) {
        // 处理跳转逻辑（如果有,to,）
        var jumpMatch = valueStr.match(/^(.+?),to,(\d+)$/);
        if (jumpMatch) {
            valueStr = jumpMatch[1];
            // 跳转逻辑在题目切换时处理
        }
        
        // 处理多个分值（用"x"分隔）
        valueStr.split("x").forEach(function(val) {
            if (!val) return;
            
            // 解析分值：第一个字符是维度（A-J），后面是分数
            var chars = val.split("");
            var dimension = chars[0];
            chars.shift();
            var score = Number(chars.join(""));
            
            // 累加分数
            if (ocean.hasOwnProperty(dimension)) {
                ocean[dimension] += score;
                ocean[dimension] = Math.min(100, ocean[dimension]); // 限制最大值为100
            } else {
                console.error("Undefined Property: " + dimension);
            }
        });
        iq_value = JSON.stringify(ocean);
    }
}

// 当前题目索引
var currentQuestionIndex = 0;
var answerHistory = []; // 存储答案历史，用于返回上一题

// 初始化
initOcean();

$(document).ready(function() {
    // 绑定"再测一次"按钮
    $(document).on("click", "#restart-btn", function(e) {
        e.preventDefault();
        
        // 清除本地测试结果（用于重新测试）
        if (window.linkValidator && typeof window.linkValidator.clearLocalResult === 'function') {
            window.linkValidator.clearLocalResult();
            console.log('已清除SDK本地测试结果');
        }
        
        // 清除localStorage中的测试结果
        try {
            localStorage.removeItem("spiritual_needs_test_result");
            localStorage.removeItem("spiritual_needs_test_progress");
            
            // 如果使用了token保存，也清除
            if (window.linkValidator && window.linkValidator.token) {
                var token = window.linkValidator.token;
                localStorage.removeItem("spiritual_needs_test_result_" + token);
            }
            
            console.log('已清除localStorage中的测试结果');
        } catch (error) {
            console.error('清除localStorage失败:', error);
        }
        
        // 构建首页URL（需要包含token以便SDK验证）
        var indexUrl = window.location.pathname;
        var urlParams = new URLSearchParams();
        
        // 获取token和测试模式
        var currentUrlParams = new URLSearchParams(window.location.search);
        var token = currentUrlParams.get('token');
        var isUnlimited = currentUrlParams.get('unlimited') === 'true';
        
        // 如果URL中没有token，尝试从SDK实例获取
        if (!token && window.linkValidator && window.linkValidator.token) {
            token = window.linkValidator.token;
            isUnlimited = window.linkValidator.unlimited || false;
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
        var queryString = urlParams.toString();
        if (queryString) {
            indexUrl = indexUrl + '?' + queryString;
        }
        
        // 跳转到首页（带restart参数）
        window.location.href = indexUrl;
    });
    
    // 检查是否有保存的结果状态（优先从token获取）
    var savedResult = null;
    var token = null;
    
    // 方法1：从URL参数获取token
    var urlParams = new URLSearchParams(window.location.search);
    token = urlParams.get('token');
    
    // 方法2：如果URL中没有token，尝试从SDK实例获取
    if (!token && window.linkValidator && window.linkValidator.token) {
        token = window.linkValidator.token;
    }
    
    // 如果有了token，尝试从token对应的key获取结果
    if (token) {
        var tokenKey = "spiritual_needs_test_result_" + token;
        savedResult = localStorage.getItem(tokenKey);
    }
    
    // 方法3：如果还是没有，尝试从默认key获取（向后兼容）
    if (!savedResult) {
        savedResult = localStorage.getItem("spiritual_needs_test_result");
    }
    
    if (savedResult) {
        try {
            var resultData = JSON.parse(savedResult);
            // 恢复ocean数据
            ocean = resultData.ocean || {};
            iq_value = JSON.stringify(ocean);
            
            // 显示结果页面
            $("#splash").hide();
            $("#question-view").hide();
            $("#result_details").show();
            
            // 计算结果并显示
            calculateResult();
            
            // 确保tips_extra在柱状图下方
            var $barchart = $("#barchart");
            var $tipsExtra = $("#tips_extra");
            var $snapshotContainer = $("#snapshot-container");
            if ($barchart.length && $tipsExtra.length && $snapshotContainer.length) {
                $snapshotContainer.after($tipsExtra);
            }
            
            // 调用addPromotionLink确保推广链接显示（结果页使用report-footer容器）
            setTimeout(function() {
                if (typeof PsyTestValidator !== 'undefined' && typeof PsyTestValidator.addPromotionLink === 'function') {
                    PsyTestValidator.addPromotionLink();
                }
            }, 500);
            
            return; // 如果已恢复结果，不再执行后续初始化
        } catch (e) {
            console.error("恢复结果数据失败:", e);
            try {
                localStorage.removeItem("spiritual_needs_test_result");
                if (token) {
                    localStorage.removeItem("spiritual_needs_test_result_" + token);
                }
            } catch (error) {
                console.error("清除失败的结果数据失败:", error);
            }
        }
    }
    
    // 渲染所有题目
    renderQuestions();
    
    // 尝试恢复答题进度
    if (!restoreProgress()) {
        // 如果没有保存的进度，显示首页
        $("#splash").show();
        $("#question-view").hide();
    }
    
    // 移除lib-unld类以显示开始按钮
    setTimeout(function() {
        $(".lib-unld").removeClass("lib-unld");
        $(".progress-button .content").css("opacity", "1");
    }, 600);
    
    // 开始测试按钮
    $(document).on("click", "#start, .welcome-start-button", async function() {
        // 等待SDK初始化完成（最多等待3秒）
        let waitCount = 0;
        while (!window.linkValidator && waitCount < 30) {
            await new Promise(function(resolve) {
                setTimeout(resolve, 100);
            });
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
                console.log('验证结果:', { isValid: isValid, valid: window.linkValidator.valid, error: window.linkValidator.validationError });
                
                // 检查验证结果和验证状态（双重检查）
                if (!isValid || window.linkValidator.valid === false) {
                    // 链接无效，已显示弹窗，不进入答题页面
                    console.warn('链接验证失败，无法开始测试', {
                        isValid: isValid,
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
        
        // 清除之前保存的结果和进度
        localStorage.removeItem("spiritual_needs_test_result");
        localStorage.removeItem("spiritual_needs_test_progress");
        window.location.hash = "";
        
        // 调用startTest函数（会在函数内部调用SDK的startTest方法）
        startTest();
    });
    
    // 绑定"得出结果"按钮（最后一题）
    $(document).on("click", "#next_button", function() {
        if ($(this).text() === "得出结果") {
            // 最后一题可以不选择直接得出结果，直接显示结果
            showResult().catch(function(error) {
                console.error('显示结果失败:', error);
            });
        }
    });
    
    // 返回上一题按钮
    $("#back_button").on("click", function() {
        goToPreviousQuestion();
    });
});

// 渲染所有题目
function renderQuestions() {
    var collection = $("#collection");
    collection.empty();
    
    questionsData.forEach(function(q, index) {
        var li = $("<li>").attr("id", q.id).css("display", "none");
        var wrapper = $("<div>").addClass("questionWrapper");
        
        // 题目文本
        var questionDiv = $("<div>").addClass("question").html(q.question);
        wrapper.append(questionDiv);
        
        // 根据题目类型渲染选项
        if (q.type === "single") {
            // 单选题
            q.options.forEach(function(opt) {
                var button = $("<button>")
                    .addClass("answer")
                    .attr("value", opt.value)
                    .text(opt.text);
                wrapper.append(button);
            });
        } else if (q.type === "tend") {
            // 倾向题 - 先创建选项按钮，稍后在特殊处理中转换为7点量表
            q.options.forEach(function(opt) {
                var button = $("<button>")
                    .addClass("answer")
                    .attr("value", opt.value)
                    .text(opt.text);
                wrapper.append(button);
            });
        } else if (q.type === "check") {
            // 多选题
            q.options.forEach(function(opt) {
                var button = $("<button>")
                    .addClass("answer")
                    .attr("value", opt.value)
                    .html(opt.text);
                wrapper.append(button);
            });
        } else if (q.type === "sort") {
            // 排序题
            q.options.forEach(function(opt) {
                var button = $("<button>")
                    .addClass("answer")
                    .attr("value", opt.value)
                    .text(opt.text);
                wrapper.append(button);
            });
        }
        
        li.append(wrapper);
        collection.append(li);
    });
    
    // 处理特殊题型
    processSpecialQuestions();
}

// 处理特殊题型（多选题和排序题）
function processSpecialQuestions() {
    $("#collection > li").each(function() {
        var $li = $(this);
        var questionId = $li.attr("id");
        var questionData = questionsData.find(q => q.id === questionId);
        
        if (!questionData) return;
        
        var $question = $li.find(".question");
        var questionText = $question.html();
        
        // 处理多选题
        if (questionText.includes("[checkpie]") || questionData.type === "check") {
            $question.html(questionText.replace("[checkpie]", ""));
            
            var $answers = $li.find(".answer");
            var $group = $("<div>").addClass("cb_group");
            
            $answers.each(function() {
                var $btn = $(this);
                var value = $btn.attr("value");
                var text = $btn.text();
                
                if (value === "Z") {
                    // "得出结果"按钮保留为普通按钮
                    $btn.attr("data-original-value", value);
                    return;
                }
                
                var $item = $("<div>")
                    .addClass("cb_item")
                    .attr("data-value", value)
                    .text(text);
                $group.append($item);
                $btn.remove();
            });
            
            // 添加"得出结果"按钮
            var $resultBtn = $li.find(".answer[data-original-value='Z']");
            if ($resultBtn.length) {
                $group.after($resultBtn);
            }
            
            $question.after($group);
            
            // 绑定多选题点击事件
            var $resultBtn = $li.find(".answer[data-original-value='Z']");
            if ($resultBtn.length) {
                $resultBtn.addClass("unclickable");
            }
            
            $group.find(".cb_item").on("click", function() {
                $(this).toggleClass("cb_selected");
                
                var selectedValues = [];
                $group.find(".cb_selected").each(function() {
                    selectedValues.push($(this).attr("data-value"));
                });
                
                // 组合所有选中项的值
                var combinedValue = selectedValues.length > 0 ? selectedValues.join("x") : "0";
                if ($resultBtn.length) {
                    $resultBtn.attr("value", combinedValue);
                    $resultBtn.removeClass("unclickable");
                }
            });
        }
        
        // 处理倾向题（7点量表）
        if (questionData.type === "tend") {
            var $answers = $li.find(".answer");
            var noValue = null;
            var yesValue = null;
            
            // 解析"否"和"是"的值
            $answers.each(function() {
                var $btn = $(this);
                var text = $btn.text().trim();
                var value = $btn.attr("value");
                
                if (text === "否") {
                    noValue = value;
                } else if (text === "是") {
                    yesValue = value;
                }
                $btn.remove();
            });
            
            // 创建7点量表
            var $tendGroup = $("<div>").addClass("tend-groups");
            var $indicatorGroup = $("<div>").addClass("indicator-groups");
            $indicatorGroup.append($("<div>").text("否"));
            $indicatorGroup.append($("<div>").text(""));
            $indicatorGroup.append($("<div>").text(""));
            $indicatorGroup.append($("<div>").text(""));
            $indicatorGroup.append($("<div>").text(""));
            $indicatorGroup.append($("<div>").text(""));
            $indicatorGroup.append($("<div>").text("是"));
            
            // 创建7个点（从1到7，1是最左边"否"，7是最右边"是"）
            for (var i = 1; i <= 7; i++) {
                var $dot = $("<div>")
                    .addClass("tend-dot")
                    .attr("data-position", i)
                    .attr("data-no-value", noValue || "0")
                    .attr("data-yes-value", yesValue || "0");
                
                // 根据位置设置颜色
                if (i === 1) {
                    $dot.css("border-color", "#f44336"); // 红色（否）
                } else if (i === 7) {
                    $dot.css("border-color", "#4caf50"); // 绿色（是）
                } else if (i <= 3) {
                    $dot.css("border-color", "#ff9800"); // 橙色（偏向否）
                } else if (i >= 5) {
                    $dot.css("border-color", "#8bc34a"); // 浅绿色（偏向是）
                } else {
                    $dot.css("border-color", "#9e9e9e"); // 灰色（中性）
                }
                
                // 设置大小：两端的点更大
                if (i === 1 || i === 7) {
                    $dot.css({
                        "width": "60px",
                        "height": "60px"
                    });
                } else {
                    $dot.css({
                        "width": "40px",
                        "height": "40px"
                    });
                }
                
                $tendGroup.append($dot);
            }
            
            $question.after($indicatorGroup);
            $question.after($tendGroup);
            
            // 绑定点击事件
            $tendGroup.find(".tend-dot").on("click", function() {
                var $clickedDot = $(this);
                var position = parseInt($clickedDot.attr("data-position"));
                var noVal = $clickedDot.attr("data-no-value");
                var yesVal = $clickedDot.attr("data-yes-value");
                
                // 移除所有选中状态
                $tendGroup.find(".tend-dot").removeClass("tend-dot-selected").css("background", "none");
                
                // 设置选中状态
                $clickedDot.addClass("tend-dot-selected");
                if (position === 1) {
                    $clickedDot.css("background", "#f44336");
                } else if (position === 7) {
                    $clickedDot.css("background", "#4caf50");
                } else if (position <= 3) {
                    $clickedDot.css("background", "#ff9800");
                } else if (position >= 5) {
                    $clickedDot.css("background", "#8bc34a");
                } else {
                    $clickedDot.css("background", "#9e9e9e");
                }
                
                // 计算分数：位置1（否）到位置7（是）的线性插值
                // 如果"否"有分数，位置1得满分，位置7得0分
                // 如果"是"有分数，位置1得0分，位置7得满分
                var calculatedValue = "0";
                if (noVal && noVal !== "0") {
                    // "否"有分数
                    var dimension = noVal.charAt(0);
                    var baseScore = parseInt(noVal.substring(1)) || 0;
                    // 位置1得满分，位置7得0分，线性递减
                    var score = Math.round(baseScore * (8 - position) / 7);
                    calculatedValue = dimension + score;
                } else if (yesVal && yesVal !== "0") {
                    // "是"有分数
                    var dimension = yesVal.charAt(0);
                    var baseScore = parseInt(yesVal.substring(1)) || 0;
                    // 位置1得0分，位置7得满分，线性递增
                    var score = Math.round(baseScore * (position - 1) / 6);
                    calculatedValue = dimension + score;
                }
                
                // 保存计算出的值到data属性
                $tendGroup.attr("data-calculated-value", calculatedValue);
                
                // 标记题目已回答
                $li.find(".questionWrapper").addClass("pointer-events-none");
                
                // 自动进入下一题
                var questionIndex = questionsData.findIndex(function(q) { return q.id === questionId; });
                if (questionIndex >= 0) {
                    // 更新分数
                    updateValue(calculatedValue);
                    
                    // 保存答案
                    var previousOceanState = JSON.parse(iq_value);
                    var currentQuestionAnswerIndex = -1;
                    for (var i = answerHistory.length - 1; i >= 0; i--) {
                        if (answerHistory[i].questionIndex === questionIndex) {
                            currentQuestionAnswerIndex = i;
                            break;
                        }
                    }
                    if (currentQuestionAnswerIndex >= 0) {
                        answerHistory = answerHistory.slice(0, currentQuestionAnswerIndex);
                    }
                    answerHistory.push({
                        questionIndex: questionIndex,
                        value: calculatedValue,
                        oceanState: JSON.parse(JSON.stringify(previousOceanState))
                    });
                    
                    // 延迟后切换到下一题或显示结果
                    setTimeout(function() {
                        var nextIndex = questionIndex + 1;
                        if (nextIndex >= questionsData.length) {
                            // 最后一题已回答，显示"得出结果"按钮
                            $("#next_button").text("得出结果").show().removeClass("inactive-button");
                        } else {
                            showQuestion(nextIndex);
                        }
                    }, 300);
                    
                    // 保存进度
                    saveProgress();
                }
            });
        }
        
        // 处理排序题
        if (questionText.includes("[sortpie]") || questionData.type === "sort") {
            $question.html(questionText.replace("[sortpie]", ""));
            
            var $answers = $li.find(".answer");
            var $group = $("<div>").addClass("ab_group");
            var sortData = [];
            
            $answers.each(function() {
                var $btn = $(this);
                var value = $btn.attr("value");
                var text = $btn.text();
                
                if (value === "Z") {
                    // "排序好了，下一题"按钮保留为普通按钮
                    $btn.attr("data-original-value", value);
                    return;
                }
                
                var $item = $("<div>")
                    .addClass("ab_item")
                    .attr("data-value", value)
                    .text(text);
                $group.append($item);
                sortData.push(value);
                $btn.remove();
            });
            
            $question.after($group);
            
            // 添加"排序好了"按钮（在group之后添加）
            var $sortBtn = $li.find(".answer[data-original-value='Z']");
            if ($sortBtn.length) {
                $group.after($sortBtn);
                $sortBtn.addClass("unclickable");
                // 确保按钮样式正确且可见
                $sortBtn.css({
                    "display": "block !important",
                    "width": "100%",
                    "margin-top": "15px",
                    "visibility": "visible",
                    "opacity": "0.5"
                });
                // 确保按钮文本正确
                if (!$sortBtn.text().trim()) {
                    $sortBtn.text("排序好了，下一题");
                }
            }
            
            // 绑定排序题点击事件
            // 使用data属性存储选中索引数组（按选择顺序）
            $group.data("selectedIndices", []);
            
            // 更新排序数字显示的函数
            function updateSortNumbers() {
                var selectedIndices = $group.data("selectedIndices") || [];
                
                // 先清除所有排序数字
                $group.find(".ab_item").each(function() {
                    var $currentItem = $(this);
                    var itemIndex = $currentItem.index();
                    
                    // 移除旧的排序数字
                    $currentItem.find(".ab_sort_id").remove();
                    
                    // 检查这个项是否在选中列表中
                    var sortIndex = selectedIndices.indexOf(itemIndex);
                    if (sortIndex !== -1) {
                        // 这个项被选中了，显示排序数字（从1开始）
                        $currentItem.addClass("ab_selected");
                        $currentItem.append($("<b>").addClass("ab_sort_id").text(sortIndex + 1));
                    } else {
                        // 这个项没有被选中
                        $currentItem.removeClass("ab_selected");
                    }
                });
                
                // 检查是否所有选项都已选择
                var totalItems = $group.find(".ab_item").length;
                var $sortBtn = $li.find(".answer[data-original-value='Z']");
                
                if (selectedIndices.length < totalItems) {
                    // 未完成排序
                    $sortBtn.attr("value", "0");
                    $sortBtn.addClass("unclickable");
                    // 确保按钮在未完成时不可点击，但仍然可见
                    var currentStyle = $sortBtn.attr("style") || "";
                    $sortBtn.attr("style", currentStyle + "; opacity: 0.5 !important; pointer-events: none !important; cursor: not-allowed !important; display: block !important; visibility: visible !important;");
                    return;
                }
                
                // 所有选项都已排序，计算分数
                var scoreValue = "";
                selectedIndices.forEach(function(selectedIndex, order) {
                    var $selectedItem = $group.find(".ab_item").eq(selectedIndex);
                    var value = $selectedItem.attr("data-value");
                    // 解析value：第一个字符是维度，后面是分数
                    var dimension = value.charAt(0);
                    var baseScore = parseInt(value.substring(1)) || 0;
                    // 权重：第1位得100%，第2位得50%，第3位得25%，以此类推
                    var weight = Math.pow(2, order);
                    var weightedScore = Math.round(baseScore / weight);
                    if (scoreValue) scoreValue += "x";
                    scoreValue += dimension + weightedScore;
                });
                
                if ($sortBtn.length) {
                    $sortBtn.attr("value", scoreValue);
                    $sortBtn.removeClass("unclickable");
                    // 确保按钮在排序完成后可见且可点击
                    // 使用 attr 设置 style 属性来覆盖 CSS 类
                    var currentStyle = $sortBtn.attr("style") || "";
                    $sortBtn.attr("style", currentStyle + "; opacity: 1 !important; pointer-events: auto !important; cursor: pointer !important; display: block !important; visibility: visible !important;");
                } else {
                    console.error("排序按钮未找到！");
                }
            }
            
            $group.find(".ab_item").on("click", function() {
                var $item = $(this);
                var index = $item.index();
                var selectedIndices = $group.data("selectedIndices") || [];
                
                if (selectedIndices.includes(index)) {
                    // 取消选择：从数组中移除这个索引
                    selectedIndices = selectedIndices.filter(function(i) {
                        return i !== index;
                    });
                } else {
                    // 添加选择：添加到数组末尾（按选择顺序）
                    selectedIndices.push(index);
                }
                
                // 保存更新后的选中索引
                $group.data("selectedIndices", selectedIndices);
                
                // 更新所有排序数字显示
                updateSortNumbers();
            });
        }
    });
}

// 保存答题进度
function saveProgress() {
    var progressData = {
        currentQuestionIndex: currentQuestionIndex,
        answerHistory: answerHistory,
        ocean: JSON.parse(iq_value),
        timestamp: new Date().getTime()
    };
    localStorage.setItem("spiritual_needs_test_progress", JSON.stringify(progressData));
}

// 恢复答题进度
function restoreProgress() {
    var savedProgress = localStorage.getItem("spiritual_needs_test_progress");
    if (savedProgress) {
        try {
            var progressData = JSON.parse(savedProgress);
            // 检查数据是否过期（24小时）
            var now = new Date().getTime();
            if (now - progressData.timestamp > 24 * 60 * 60 * 1000) {
                // 数据过期，清除
                localStorage.removeItem("spiritual_needs_test_progress");
                return false;
            }
            
            // 恢复状态
            currentQuestionIndex = progressData.currentQuestionIndex || 0;
            answerHistory = progressData.answerHistory || [];
            ocean = progressData.ocean || {};
            iq_value = JSON.stringify(ocean);
            
            // 显示题目视图
            $("#splash").hide();
            $("#question-view").show();
            
            // 恢复所有题目的选择状态
            answerHistory.forEach(function(answer) {
                var questionId = questionsData[answer.questionIndex].id;
                var $questionLi = $("#" + questionId);
                var questionData = questionsData[answer.questionIndex];
                
                // 恢复选择状态
                if (questionData.type === "single" || questionData.type === "tend") {
                    $questionLi.find(".answer[value='" + answer.value + "']").addClass("ans-on");
                    $questionLi.find(".questionWrapper").addClass("pointer-events-none");
                } else if (questionData.type === "check") {
                    // 多选题：恢复选中状态
                    var values = answer.value.split("x");
                    values.forEach(function(val) {
                        if (val && val !== "0") {
                            $questionLi.find(".cb_item[data-value='" + val + "']").addClass("cb_selected");
                        }
                    });
                    if (values.length > 0 && values[0] !== "0") {
                        $questionLi.find(".answer[data-original-value='Z']").removeClass("unclickable").attr("value", answer.value);
                    }
                } else if (questionData.type === "sort") {
                    // 排序题：恢复排序状态
                    var $group = $questionLi.find(".ab_group");
                    var values = answer.value.split("x");
                    // 这里需要根据保存的值恢复排序，但比较复杂，暂时跳过
                    // 用户需要重新排序
                }
            });
            
            // 显示当前题目
            showQuestion(currentQuestionIndex);
            
            // 滚动到顶部
            window.scrollTo({ top: 0, behavior: "smooth" });
            
            return true;
        } catch (e) {
            console.error("恢复答题进度失败:", e);
            localStorage.removeItem("spiritual_needs_test_progress");
            return false;
        }
    }
    return false;
}

// 开始测试
async function startTest() {
    // 调用测试开始API（单视角测试）
    if (window.linkValidator) {
        try {
            await window.linkValidator.startTest();
            console.log('测试开始记录成功');
        } catch (error) {
            console.error('记录测试开始失败:', error);
            // 测试开始失败，不阻止进入答题页，只记录错误
        }
    }
    
    // 隐藏首页
    $("#splash").hide();
    
    // 显示题目视图
    $("#question-view").show();
    
    // 重置状态
    currentQuestionIndex = 0;
    answerHistory = [];
    initOcean();
    
    // 清除之前的进度
    localStorage.removeItem("spiritual_needs_test_progress");
    
    // 显示第一题
    showQuestion(0);
    
    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// 显示指定题目
function showQuestion(index) {
    currentQuestionIndex = index;
    
    // 保存当前进度
    saveProgress();
    
    // 隐藏所有题目
    $("#collection > li").hide();
    
    // 显示当前题目
    var questionId = questionsData[index].id;
    var $questionLi = $("#" + questionId);
    $questionLi.show();
    
    // 确保题目可以被选择
    $questionLi.find(".questionWrapper").removeClass("pointer-events-none");
    
    // 更新进度条和进度信息
    updateProgress(index + 1);
    updateQuestionInfo(index + 1);
    
    // 更新返回按钮状态
    if (index === 0) {
        $("#back_button").addClass("inactive-button");
    } else {
        $("#back_button").removeClass("inactive-button");
    }
    
    // 检查是否是最后一题
    if (index === questionsData.length - 1) {
        // 最后一题，显示"得出结果"按钮
        $("#next_button").text("得出结果").show().removeClass("inactive-button");
    } else {
        // 隐藏"下一题"按钮（普通题目通过点击答案自动进入下一题）
        $("#next_button").hide();
    }
    
    // 绑定答案点击事件
    bindAnswerEvents(index);
}

// 更新答题进度信息
function updateQuestionInfo(current) {
    var total = questionsData.length;
    var part = current <= 50 ? "第一部分 - 自我鉴定" : "第二部分 - 情景测试";
    var partNum = current <= 50 ? current : current - 50;
    var partTotal = current <= 50 ? 50 : 10;
    $("#questionInfo").text(part + " - " + partNum + "/" + partTotal);
}

// 绑定答案点击事件
function bindAnswerEvents(questionIndex) {
    var questionData = questionsData[questionIndex];
    var questionId = questionData.id;
    var $questionLi = $("#" + questionId);
    
    // 移除之前的事件监听器
    $questionLi.find(".answer").off("click.answerClick");
    
    // 绑定新的点击事件
    $questionLi.find(".answer").on("click.answerClick", function() {
        if ($(this).hasClass("unclickable")) {
            return;
        }
        
        var $button = $(this);
        var originalValue = $button.attr("value");
        var value = originalValue;
        
        // 处理倾向题（7点量表）
        if (questionData.type === "tend") {
            var $tendGroup = $questionLi.find(".tend-groups");
            if ($tendGroup.length) {
                var calculatedValue = $tendGroup.attr("data-calculated-value");
                if (calculatedValue && calculatedValue !== "0") {
                    value = calculatedValue;
                } else {
                    // 如果没有选择，不允许继续
                    alert("请选择一个选项");
                    return;
                }
            }
        }
        
        // 处理特殊按钮（Z表示完成/得出结果）
        if (value === "Z" || $button.attr("data-original-value") === "Z") {
            // 检查是否满足条件
            if (questionData.type === "sort") {
                // 排序题需要所有选项都排序
                var $group = $questionLi.find(".ab_group");
                var selectedIndices = $group.data("selectedIndices") || [];
                var totalCount = $group.find(".ab_item").length;
                
                // 直接检查选中索引数组的长度
                if (selectedIndices.length < totalCount) {
                    alert("请完成所有选项的排序");
                    return;
                }
                
                // 使用按钮上计算出的实际值
                value = $button.attr("value");
                if (!value || value === "Z" || value === "0") {
                    // 如果还没有计算值，重新计算
                    // 重新计算分数
                    var scoreValue = "";
                    selectedIndices.forEach(function(selectedIndex, order) {
                        var $selectedItem = $group.find(".ab_item").eq(selectedIndex);
                        var itemValue = $selectedItem.attr("data-value");
                        var dimension = itemValue.charAt(0);
                        var baseScore = parseInt(itemValue.substring(1)) || 0;
                        var weight = Math.pow(2, order);
                        var weightedScore = Math.round(baseScore / weight);
                        if (scoreValue) scoreValue += "x";
                        scoreValue += dimension + weightedScore;
                    });
                    value = scoreValue;
                    $button.attr("value", value);
                }
            } else if (questionData.type === "check") {
                // 多选题，使用按钮上计算出的实际值
                value = $button.attr("value");
                if (!value || value === "Z") {
                    value = "0";
                }
            } else {
                // 其他情况，使用0
                value = "0";
            }
        }
        
        if (!value) {
            return;
        }
        
        // 保存当前答案
        var previousOceanState = JSON.parse(iq_value);
        
        // 如果当前题目已经存在于answerHistory中，先移除旧答案
        var currentQuestionAnswerIndex = -1;
        for (var i = answerHistory.length - 1; i >= 0; i--) {
            if (answerHistory[i].questionIndex === questionIndex) {
                currentQuestionAnswerIndex = i;
                break;
            }
        }
        
        if (currentQuestionAnswerIndex >= 0) {
            answerHistory = answerHistory.slice(0, currentQuestionAnswerIndex);
        }
        
        // 添加新的答案记录
        answerHistory.push({
            questionIndex: questionIndex,
            value: value,
            oceanState: JSON.parse(JSON.stringify(previousOceanState))
        });
        
        // 处理跳转逻辑
        var jumpMatch = value.match(/^(.+?),to,(\d+)$/);
        var jumpTo = null;
        if (jumpMatch) {
            value = jumpMatch[1];
            jumpTo = parseInt(jumpMatch[2]) - 1;
        }
        
        // 更新分数
        updateValue(value);
        
        // 标记已选择
        if (questionData.type !== "tend") {
            $questionLi.find(".answer").removeClass("ans-on");
            $button.addClass("ans-on");
        }
        $questionLi.find(".cb_item").removeClass("cb_selected");
        $questionLi.find(".questionWrapper").addClass("pointer-events-none");
        
        // 确定下一题索引
        var nextIndex;
        if (jumpTo !== null) {
            nextIndex = jumpTo;
        } else {
            nextIndex = questionIndex + 1;
        }
        
        // 延迟后切换到下一题或显示结果
        setTimeout(function() {
            if (nextIndex >= questionsData.length) {
                // 最后一题已回答，显示"得出结果"按钮
                $("#next_button").text("得出结果").show().removeClass("inactive-button");
            } else {
                showQuestion(nextIndex);
            }
        }, 300);
        
        // 保存进度
        saveProgress();
    });
}

// 返回上一题
function goToPreviousQuestion() {
    if (currentQuestionIndex <= 0 || answerHistory.length === 0) {
        return;
    }
    
    // 恢复上一题的状态
    var lastAnswer = answerHistory.pop();
    ocean = JSON.parse(JSON.stringify(lastAnswer.oceanState));
    iq_value = JSON.stringify(ocean);
    
    // 隐藏当前题目并清除其选择状态
    var currentQuestionId = questionsData[currentQuestionIndex].id;
    $("#" + currentQuestionId).find(".questionWrapper").removeClass("pointer-events-none");
    $("#" + currentQuestionId).find(".answer").removeClass("ans-on");
    
    // 显示上一题
    showQuestion(lastAnswer.questionIndex);
    
    // 恢复上一题的选择状态
    var questionId = questionsData[lastAnswer.questionIndex].id;
    var $questionLi = $("#" + questionId);
    var questionData = questionsData[lastAnswer.questionIndex];
    
    var displayValue = lastAnswer.value;
    var jumpMatch = displayValue.match(/^(.+?),to,(\d+)$/);
    if (jumpMatch) {
        displayValue = jumpMatch[1];
    }
    
    // 恢复单选题的选择状态
    if (questionData.type === "single") {
        $questionLi.find(".answer").removeClass("ans-on");
        var $selectedButton = $questionLi.find(".answer[value='" + displayValue + "']");
        if ($selectedButton.length) {
            $selectedButton.addClass("ans-on");
        }
    } else if (questionData.type === "tend") {
        // 倾向题：根据保存的值恢复选择（需要反向计算位置）
        // 这里简化处理，暂时不恢复，让用户重新选择
        $questionLi.find(".tend-dot").removeClass("tend-dot-selected").css("background", "none");
    }
}

// 更新进度条
function updateProgress(current) {
    var total = questionsData.length;
    var progress = (current / total) * 100;
    $("#progress-bg").css("width", progress + "%");
}

// 显示结果
async function showResult() {
    // 隐藏题目视图
    $("#question-view").hide();
    
    // 显示结果视图
    $("#result_details").show();
    
    // 计算结果
    calculateResult();
    
    // 准备测试结果数据
    var resultData = {
        ocean: ocean,
        ocean_total: ocean_total,
        timestamp: new Date().getTime()
    };
    
    // 优先使用SDK的token保存结果，如果没有则使用默认key
    var token = null;
    if (window.linkValidator && window.linkValidator.token) {
        token = window.linkValidator.token;
        // 使用token作为key的一部分
        var storageKey = "spiritual_needs_test_result_" + token;
        localStorage.setItem(storageKey, JSON.stringify(resultData));
        // 同时保存到默认key（向后兼容）
        localStorage.setItem("spiritual_needs_test_result", JSON.stringify(resultData));
    } else {
        // 向后兼容：使用默认key
        localStorage.setItem("spiritual_needs_test_result", JSON.stringify(resultData));
    }
    
    // 清除答题进度
    localStorage.removeItem("spiritual_needs_test_progress");
    
    // 调用测试完成API（单视角测试）
    if (window.linkValidator) {
        try {
            await window.linkValidator.completeTest(undefined, resultData);
            console.log('测试完成记录成功');
        } catch (error) {
            console.error('记录测试完成失败:', error);
            // 测试完成失败，不影响显示结果，只记录错误
        }
    }
    
    // 设置URL hash
    if (window.location.hash !== "#result") {
        window.location.hash = "#result";
    }
    
    // 确保tips_extra在柱状图下方
    var $barchart = $("#barchart");
    var $tipsExtra = $("#tips_extra");
    var $snapshotContainer = $("#snapshot-container");
    if ($barchart.length && $tipsExtra.length && $snapshotContainer.length) {
        $snapshotContainer.after($tipsExtra);
    }
    
    // 调用addPromotionLink确保推广链接显示（结果页使用report-footer容器）
    setTimeout(function() {
        if (typeof PsyTestValidator !== 'undefined' && typeof PsyTestValidator.addPromotionLink === 'function') {
            PsyTestValidator.addPromotionLink();
        }
    }, 500);
    
    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// 计算结果
function calculateResult() {
    ocean_total = 0;
    var resultList = [];
    
    // 计算总分并生成结果列表（包含所有维度，即使分数为0）
    ocean_keys.forEach(function(key) {
        var score = ocean[key] || 0;
        ocean_total += score;
        resultList.push({
            name: ocean_dict[key],
            score: score,
            key: key,
            percentage: 0 // 稍后计算
        });
    });
    
    // 按分数排序
    resultList.sort(function(a, b) {
        return b.score - a.score;
    });
    
    // 计算百分比（原代码逻辑：直接显示原始分数值，保留1位小数，加上百分号）
    resultList.forEach(function(item) {
        item.percentage = (item.score / 1).toFixed(1);
    });
    
    // 更新各维度分数显示
    $("#score-A").text((resultList.find(r => r.key === "A")?.percentage || "0") + "%");
    $("#score-B").text((resultList.find(r => r.key === "B")?.percentage || "0") + "%");
    $("#score-C").text((resultList.find(r => r.key === "C")?.percentage || "0") + "%");
    $("#score-D").text((resultList.find(r => r.key === "D")?.percentage || "0") + "%");
    $("#score-E").text((resultList.find(r => r.key === "E")?.percentage || "0") + "%");
    $("#score-F").text((resultList.find(r => r.key === "F")?.percentage || "0") + "%");
    $("#score-G").text((resultList.find(r => r.key === "G")?.percentage || "0") + "%");
    $("#score-H").text((resultList.find(r => r.key === "H")?.percentage || "0") + "%");
    $("#score-I").text((resultList.find(r => r.key === "I")?.percentage || "0") + "%");
    $("#score-J").text((resultList.find(r => r.key === "J")?.percentage || "0") + "%");
    
    // 绘制柱状图
    drawBarChart(resultList);
    
    // 按照分数排序重新排列详细介绍部分
    sortDimensionDetails(resultList);
}

// 按照分数排序重新排列详细介绍部分
function sortDimensionDetails(resultList) {
    // 获取所有subtip元素（排除submain）
    var $allSubtips = $("#tips_extra .subtip:not(.submain)");
    var subtipMap = {};
    
    // 建立维度key到subtip元素的映射
    $allSubtips.each(function() {
        var $subtip = $(this);
        var $h3 = $subtip.find("h3");
        var tipId = $h3.attr("data-tip-id");
        
        // 根据tip-id映射到维度key
        var keyMap = {
            "1": "A", "2": "B", "3": "C", "4": "D", "5": "E",
            "6": "F", "7": "G", "8": "H", "9": "I", "10": "J"
        };
        
        var key = keyMap[tipId];
        if (key) {
            subtipMap[key] = $subtip;
        }
    });
    
    // 按照resultList的顺序重新排列
    var $tipsExtra = $("#tips_extra");
    var $submainTitle = $tipsExtra.find(".subtip.submain").first();
    
    // 移除所有非submain的subtip
    $allSubtips.detach();
    
    // 在标题后按分数顺序插入
    resultList.forEach(function(item) {
        var $subtip = subtipMap[item.key];
        if ($subtip) {
            $submainTitle.after($subtip);
            $submainTitle = $subtip; // 更新插入位置
        }
    });
}

// 绘制柱状图（两行五列，使用原版样式）
function drawBarChart(resultList) {
    var $barchart = $("#barchart");
    $barchart.empty();
    
    if (resultList.length === 0) {
        $barchart.html("<p style='text-align:center;color:#999;padding:40px;'>暂无数据</p>");
        return;
    }
    
    // 不需要缩放，直接使用百分比（100%对应最高高度）
    // 柱子的高度应该直接对应百分比值，而不是相对于最大值
    
    // 创建柱状图结构（使用原版的bar-chart类）
    var $barChart = $("<div>").addClass("bar-chart");
    
    // 分成两行，每行5个
    var row1 = resultList.slice(0, 5);
    var row2 = resultList.slice(5, 10);
    
    // 创建第一行的bar和desc
    var $bar1 = $("<div>").addClass("bar");
    var $desc1 = $("<div>").addClass("desc");
    
    // 直接从CSS获取bar容器的实际高度，确保与CSS计算的高度一致
    // 用户要求：4条线（底部粗线+3条细线）对应0%-100%，使用完整容器高度作为100%基准
    // 注意：使用完整高度，不减去padding，因为4条线是从容器底部到顶部的完整范围
    
    // #region agent log - Hypothesis A: 临时元素在body中可能无法正确应用媒体查询
    var windowWidth = $(window).width();
    var windowInnerWidth = window.innerWidth;
    var documentWidth = $(document).width();
    
    // 创建一个临时元素来获取CSS计算后的高度
    var $tempBar = $("<div>").addClass("bar").css({
        "position": "absolute",
        "visibility": "hidden",
        "width": "100%",
        "top": "-9999px"
    });
    $("body").append($tempBar);
    
    // #region agent log - Hypothesis B: getComputedStyle可能返回0或错误值
    var computedStyle = window.getComputedStyle($tempBar[0]);
    var computedHeight = computedStyle.height;
    var computedMinHeight = computedStyle.minHeight;
    var offsetHeight = $tempBar[0].offsetHeight;
    var clientHeight = $tempBar[0].clientHeight;
    var scrollHeight = $tempBar[0].scrollHeight;
    
    var barContainerHeight = parseFloat(computedHeight) || offsetHeight;
    
    // #region agent log - Hypothesis C: 临时元素可能没有正确的父容器上下文
    var tempBarParent = $tempBar.parent();
    var tempBarParentWidth = tempBarParent.width();
    var tempBarParentClass = tempBarParent.attr('class');
    
    // 移除临时元素
    $tempBar.remove();
    
    // 如果获取失败，使用备用值
    if (!barContainerHeight || barContainerHeight <= 0) {
        if (windowWidth <= 480) {
            barContainerHeight = 53; // 移动端小屏：完整高度53px
        } else if (windowWidth <= 600) {
            barContainerHeight = 60; // 移动端：完整高度60px
        } else {
            barContainerHeight = 67; // 桌面端：完整高度67px
        }
    }
    
    
    // 4条线：底部粗线(0%)、第一条细线(33.33%)、第二条细线(66.66%)、顶部(100%)
    // 柱子从底部(0%)开始，按百分比值直接对应高度
    // 例如：88%的分数，柱子高度应该是容器高度的88%
    
    // 创建柱子的函数（统一使用，确保两行高度一致）
    function createBarItem(item, index, $barContainer) {
        var key = item.key;
        var percentage = parseFloat(item.percentage);
        var colorIndex = ocean_keys.indexOf(key);
        var color = ocean_colors[colorIndex] || "999999";
        var desc = ocean_descs[colorIndex] || "";
        
        // 创建柱子
        var $barItem = $("<div>").addClass("bar-item")
            .attr("data-index", index)
            .attr("data-percentage", percentage); // 存储百分比值，用于重新计算
        var $barItemInner = $("<div>")
            .addClass("bar-item-inner bar-item-inner-" + key)
            .css({
                "background-color": "#" + color,
                "width": "50px",
                "height": "100%"
            });
        var $barItemText = $("<div>").addClass("bar-item-text").attr("data-index", index).text("0%");
        
        $barItemInner.append($barItemText);
        $barItem.append($barItemInner);
        $barContainer.append($barItem);
        
        // 计算柱子高度：直接使用百分比值
        // percentage值直接对应容器高度的百分比
        // 例如：88% = 容器高度的88%，应该超过66.66%的线
        setTimeout(function() {
            
            // 直接按百分比计算：percentage / 100 * barContainerHeight
            // 注意：barContainerHeight是完整容器高度（67px/60px/53px），4条线对应0%-100%
            var actualHeight = (percentage / 100) * barContainerHeight;
            
            // #region agent log
            // 计算4条线的位置：底部粗线(0%)、第一条细线(33.33%)、第二条细线(66.66%)、顶部(100%)
            var line0Percent = 0;
            var line33Percent = barContainerHeight * 0.3333;
            var line66Percent = barContainerHeight * 0.6666;
            var line100Percent = barContainerHeight;
            
            // 最小高度2px（确保可见）
            if (actualHeight < 2) actualHeight = 2;
            // 最大高度不超过容器高度（100%）
            if (actualHeight > barContainerHeight) actualHeight = barContainerHeight;
            
            
            // 检查是否已经重新计算过（通过data属性标记）
            // 如果已经重新计算过，跳过初始计算，避免覆盖重新计算的结果
            if ($barItem.attr("data-recalculated") === "true") {
                return; // 已经重新计算过，跳过初始计算
            }
            
            // 设置柱子高度，确保从底部对齐
            // 直接设置style属性，确保优先级最高，覆盖CSS中的height: 0
            var styleStr = "height: " + actualHeight + "px !important; min-height: " + actualHeight + "px !important; margin: 0; padding: 0; align-self: flex-end; display: flex; align-items: flex-end;";
            $barItem.attr("style", styleStr);
            
            // 同时设置CSS变量（如果CSS支持）
            $barItem[0].style.setProperty("--bar-item-height", actualHeight + "px", "important");
            
            // 确保bar-item-inner也正确对齐
            $barItemInner.css({
                "height": "100%",
                "margin": "0",
                "padding": "0"
            });
            
            // #region agent log
            var computedHeight = $barItem.css("height");
            var computedMinHeight = $barItem.css("min-height");
            var actualComputedHeight = $barItem[0].offsetHeight;
            var parentHeight = $barContainer.height();
            var parentPaddingTop = parseInt($barContainer.css("padding-top")) || 0;
            var parentPaddingBottom = parseInt($barContainer.css("padding-bottom")) || 0;
            
            $barItemText.text(percentage + "%");
            
            // 如果高度超过容器高度的16%，将文字移到柱子内部
            if (actualHeight >= barContainerHeight * 0.16) {
                $barItemText.addClass("in");
            }
        }, index * 100);
        
        return $barItem;
    }
    
    // 创建第一行的柱子
    row1.forEach(function(item, index) {
        var key = item.key;
        var colorIndex = ocean_keys.indexOf(key);
        var color = ocean_colors[colorIndex] || "999999";
        var desc = ocean_descs[colorIndex] || "";
        
        createBarItem(item, index, $bar1);
        
        // 创建描述（包含图标和标签）
        var $descItem = $("<div>").addClass("desc-item");
        var iconMap = {"A": "1", "B": "2", "C": "3", "D": "4", "E": "5", "F": "6", "G": "7", "H": "8", "I": "9", "J": "10"};
        var iconNum = iconMap[key] || "1";
        var $descIcon = $("<div>").addClass("desc-item-icon").css({
            "background-image": "url(icons/icon_" + iconNum + ".png)",
            "width": "50px",
            "height": "50px"
        });
        var $descText = $("<div>").addClass("desc-item-text desc-item-text-" + key).css("color", "#000").text(item.name);
        
        var $tooltip = $("<div>")
            .addClass("desc-tooltip")
            .text(desc);
        
        $descItem.append($descIcon).append($descText).append($tooltip);
        $desc1.append($descItem);
    });
    
    // 创建第二行的bar和desc
    var $bar2 = $("<div>").addClass("bar");
    var $desc2 = $("<div>").addClass("desc");
    
    // 创建第二行的柱子（使用相同的高度基准）
    row2.forEach(function(item, index) {
        var key = item.key;
        var colorIndex = ocean_keys.indexOf(key);
        var color = ocean_colors[colorIndex] || "999999";
        var desc = ocean_descs[colorIndex] || "";
        
        createBarItem(item, index + 5, $bar2);
        
        // 创建描述（包含图标和标签）
        var $descItem = $("<div>").addClass("desc-item");
        var iconMap = {"A": "1", "B": "2", "C": "3", "D": "4", "E": "5", "F": "6", "G": "7", "H": "8", "I": "9", "J": "10"};
        var iconNum = iconMap[key] || "1";
        var $descIcon = $("<div>").addClass("desc-item-icon").css({
            "background-image": "url(icons/icon_" + iconNum + ".png)",
            "width": "50px",
            "height": "50px"
        });
        var $descText = $("<div>").addClass("desc-item-text desc-item-text-" + key).css("color", "#000").text(item.name);
        
        var $tooltip = $("<div>")
            .addClass("desc-tooltip")
            .text(desc);
        
        $descItem.append($descIcon).append($descText).append($tooltip);
        $desc2.append($descItem);
    });
    
    // 添加所有维度的样式
    resultList.forEach(function(item) {
        var key = item.key;
        var colorIndex = ocean_keys.indexOf(key);
        var color = ocean_colors[colorIndex] || "999999";
        var style = $("<style>").text(
            ".bar-item-inner-" + key + "{background-color:#" + color + "!important;}" +
            ".desc-item-text-" + key + "{color:#000!important;}"
        );
        $("head").append(style);
    });
    
    // 组装：第一行的bar和desc，第二行的bar和desc
    $barChart.append($bar1).append($desc1).append($bar2).append($desc2);
    $barchart.append($barChart);
    
    // #region agent log - Hypothesis E: 实际渲染后的bar容器高度，并重新计算柱子高度
    // 等待DOM更新后获取实际高度，然后重新计算所有柱子的高度
    // 延迟1500ms确保所有初始计算的setTimeout（最后一个在900ms）都已完成
    setTimeout(function() {
        var bar1ComputedStyle = window.getComputedStyle($bar1[0]);
        var actualBar1ComputedHeight = parseFloat(bar1ComputedStyle.height);
        var actualBar1OffsetHeight = $bar1[0].offsetHeight;
        var bar2ComputedStyle = window.getComputedStyle($bar2[0]);
        var actualBar2ComputedHeight = parseFloat(bar2ComputedStyle.height);
        var actualBar2OffsetHeight = $bar2[0].offsetHeight;
        
        
        // 如果实际CSS计算的高度与计算值不一致，说明容器被内容拉伸了
        // 应该使用CSS定义的固定高度（barContainerHeight）作为基准，而不是被拉伸后的高度
        // 同时需要确保bar容器的高度固定，防止被内容拉伸
        if (actualBar1ComputedHeight !== barContainerHeight || actualBar2ComputedHeight !== barContainerHeight) {
            // 强制设置bar容器的高度为CSS定义的固定值，防止被内容拉伸
            // 不使用overflow: hidden，因为会隐藏bar-item-text（百分比文字）
            $bar1.css({
                "height": barContainerHeight + "px",
                "max-height": barContainerHeight + "px"
            });
            $bar2.css({
                "height": barContainerHeight + "px",
                "max-height": barContainerHeight + "px"
            });
            
            // 使用CSS定义的固定高度（barContainerHeight）重新计算，而不是被拉伸后的高度
            var actualBar1ContainerHeight = barContainerHeight;
            var actualBar2ContainerHeight = barContainerHeight;
            
            // ===== Step 1: 已禁用所有移动端间距修复逻辑 - 避免 JS 干预布局 =====
            // 以下代码已全部注释，不再通过 JS 设置负 margin 或 position 来调整布局
            var windowWidth = $(window).width();
            
            // 禁用移动端间距修复 - 避免 JS 干预布局
            /*
            if (windowWidth <= 480) {
                // 小屏移动端：激进地减少间距，使用!important确保生效
                // 关键：减少desc容器的gap，这是导致高度过大的主要原因
                $desc1[0].style.setProperty("margin-top", "2px", "important");
                $desc1[0].style.setProperty("margin-bottom", "2px", "important"); // 使用更大的负margin减少与bar2的间距
                $desc1[0].style.setProperty("gap", "0px", "important"); // 从10px减少到0px
                $desc1[0].style.setProperty("height", "auto", "important"); // 设置desc容器高度，让容器自动适应内容高度
                // 同时减少bar2的margin-top
                $bar2[0].style.setProperty("margin-top", "-115px", "important"); // 使用负margin向上移动
                // 不限制desc1的高度，避免内容被裁剪
                $desc1.find('.desc-item-icon').each(function() {
                    this.style.setProperty("margin-top", "0px", "important");
                    this.style.setProperty("margin-bottom", "0px", "important");
                    this.style.setProperty("width", "28px", "important"); // 从30px减少到28px
                    this.style.setProperty("height", "28px", "important"); // 从30px减少到28px
                    this.style.setProperty("min-height", "28px", "important");
                    this.style.setProperty("max-height", "28px", "important");
                });
                $desc1.find('.desc-item-text').each(function() {
                    this.style.setProperty("margin", "0px", "important");
                    this.style.setProperty("margin-top", "1px", "important"); // 从2px减少到1px
                    this.style.setProperty("margin-bottom", "0px", "important");
                    this.style.setProperty("font-size", "0.6em", "important"); // 从0.65em减少到0.6em
                    this.style.setProperty("line-height", "1.1", "important"); // 从1.2减少到1.1
                    this.style.setProperty("padding", "0", "important");
                    // 移除max-height限制，避免文字被裁剪
                });
                // 确保desc-tooltip不影响布局
                $desc1.find('.desc-tooltip').each(function() {
                    this.style.setProperty("position", "absolute", "important");
                    this.style.setProperty("display", "none", "important");
                });
                // 不设置desc-item的高度限制，避免文字被裁剪
                // 只减少间距，不限制内容高度
                // 同样处理desc2
                $desc2[0].style.setProperty("margin-top", "2px", "important");
                $desc2[0].style.setProperty("margin-bottom", "10px", "important");
                $desc2[0].style.setProperty("gap", "0px", "important"); // 从10px减少到0px
                $desc2[0].style.setProperty("height", "auto", "important"); // 设置desc容器高度，让容器自动适应内容高度
                // 确保bar2没有额外的margin
                $bar2[0].style.setProperty("margin-bottom", "0px", "important");
                // 不限制desc2的高度，避免内容被裁剪
                $desc2.find('.desc-item-icon').each(function() {
                    this.style.setProperty("margin-top", "0px", "important");
                    this.style.setProperty("margin-bottom", "0px", "important");
                    this.style.setProperty("width", "28px", "important"); // 从30px减少到28px
                    this.style.setProperty("height", "28px", "important"); // 从30px减少到28px
                    this.style.setProperty("min-height", "28px", "important");
                    this.style.setProperty("max-height", "28px", "important");
                });
                $desc2.find('.desc-item-text').each(function() {
                    this.style.setProperty("margin", "0px", "important");
                    this.style.setProperty("margin-top", "1px", "important"); // 从2px减少到1px
                    this.style.setProperty("margin-bottom", "0px", "important");
                    this.style.setProperty("font-size", "0.6em", "important"); // 从0.65em减少到0.6em
                    this.style.setProperty("line-height", "1.1", "important"); // 从1.2减少到1.1
                    this.style.setProperty("padding", "0", "important");
                    // 移除max-height限制，避免文字被裁剪
                });
                // 确保desc-tooltip不影响布局
                $desc2.find('.desc-tooltip').each(function() {
                    this.style.setProperty("position", "absolute", "important");
                    this.style.setProperty("display", "none", "important");
                });
                // 不设置desc-item的高度限制，避免文字被裁剪
                // 只减少间距，不限制内容高度
            }
            */
            
            // 禁用移动端间距修复 - 避免 JS 干预布局
            /*
            if (windowWidth <= 600) {
                // 移动端：减少间距
                $desc1[0].style.setProperty("margin-top", "5px", "important");
                $desc1[0].style.setProperty("margin-bottom", "2px", "important");
                $desc1.find('.desc-item-icon').each(function() {
                    this.style.setProperty("margin-top", "3px", "important");
                });
                $desc1.find('.desc-item-text').each(function() {
                    this.style.setProperty("margin", "3px 0", "important");
                });
                // 同样处理desc2
                $desc2[0].style.setProperty("margin-top", "5px", "important");
                $desc2[0].style.setProperty("margin-bottom", "2px", "important");
                $desc2.find('.desc-item-icon').each(function() {
                    this.style.setProperty("margin-top", "3px", "important");
                });
                $desc2.find('.desc-item-text').each(function() {
                    this.style.setProperty("margin", "3px 0", "important");
                });
            }
            */
            
            // 等待浏览器重新计算布局
            $desc1[0].offsetHeight; // 强制重排
            
            // #region agent log - 检查每个desc-item的详细高度
            var descItemHeights = [];
            $desc1.find('.desc-item').each(function(index) {
                var $item = $(this);
                var $icon = $item.find('.desc-item-icon');
                var $text = $item.find('.desc-item-text');
                var $tooltip = $item.find('.desc-tooltip');
                var iconHeight = $icon.height();
                var iconOffsetHeight = $icon[0].offsetHeight;
                var textHeight = $text.height();
                var textOffsetHeight = $text[0].offsetHeight;
                var tooltipHeight = $tooltip.height();
                var tooltipOffsetHeight = $tooltip[0].offsetHeight;
                var itemHeight = $item.height();
                var itemOffsetHeight = $item[0].offsetHeight;
                var itemComputedStyle = window.getComputedStyle($item[0]);
                descItemHeights.push({
                    index: index,
                    itemHeight: itemHeight,
                    itemOffsetHeight: itemOffsetHeight,
                    itemMinHeight: itemComputedStyle.minHeight,
                    itemMaxHeight: itemComputedStyle.maxHeight,
                    iconHeight: iconHeight,
                    iconOffsetHeight: iconOffsetHeight,
                    iconComputedHeight: window.getComputedStyle($icon[0]).height,
                    textHeight: textHeight,
                    textOffsetHeight: textOffsetHeight,
                    textComputedHeight: window.getComputedStyle($text[0]).height,
                    textLineHeight: window.getComputedStyle($text[0]).lineHeight,
                    tooltipHeight: tooltipHeight,
                    tooltipOffsetHeight: tooltipOffsetHeight,
                    tooltipDisplay: window.getComputedStyle($tooltip[0]).display,
                    tooltipPosition: window.getComputedStyle($tooltip[0]).position,
                    iconMarginTop: $icon.css("margin-top"),
                    textMargin: $text.css("margin")
                });
            });
            
            // #region agent log - 检查desc的margin设置和实际间距
            var desc1MarginBottom = parseInt($desc1.css("margin-bottom")) || 0;
            var desc1MarginTop = parseInt($desc1.css("margin-top")) || 0;
            var desc1Height = $desc1.height();
            var desc1OffsetTop = $desc1.offset().top;
            var bar1OffsetTop = $bar1.offset().top;
            var bar1Height = $bar1.height();
            var bar2OffsetTop = $bar2.offset().top;
            var bar2Height = $bar2.height();
            var spacingBetweenRows = bar2OffsetTop - (bar1OffsetTop + bar1Height + desc1Height);
            var desc1ComputedMarginBottom = window.getComputedStyle($desc1[0]).marginBottom;
            var desc1ComputedMarginTop = window.getComputedStyle($desc1[0]).marginTop;
            
            
            // 重新计算第一行的所有柱子
            $bar1.find('.bar-item').each(function() {
                var $barItem = $(this);
                // 从data属性获取百分比值，而不是从文本中解析
                var percentage = parseFloat($barItem.attr('data-percentage'));
                
                if (!isNaN(percentage) && percentage > 0) {
                    // 使用实际容器高度重新计算
                    var actualHeight = (percentage / 100) * actualBar1ContainerHeight;
                    if (actualHeight < 2) actualHeight = 2;
                    if (actualHeight > actualBar1ContainerHeight) actualHeight = actualBar1ContainerHeight;
                    
                    // 更新柱子高度
                    var styleStr = "height: " + actualHeight + "px !important; min-height: " + actualHeight + "px !important; margin: 0; padding: 0; align-self: flex-end; display: flex; align-items: flex-end;";
                    $barItem.attr("style", styleStr);
                    $barItem[0].style.setProperty("--bar-item-height", actualHeight + "px", "important");
                    // 标记已经重新计算过，防止初始计算的setTimeout覆盖
                    $barItem.attr("data-recalculated", "true");
                    
                }
            });
            
            // 重新计算第二行的所有柱子
            $bar2.find('.bar-item').each(function() {
                var $barItem = $(this);
                // 从data属性获取百分比值，而不是从文本中解析
                var percentage = parseFloat($barItem.attr('data-percentage'));
                
                if (!isNaN(percentage) && percentage > 0) {
                    // 使用实际容器高度重新计算
                    var actualHeight = (percentage / 100) * actualBar2ContainerHeight;
                    if (actualHeight < 2) actualHeight = 2;
                    if (actualHeight > actualBar2ContainerHeight) actualHeight = actualBar2ContainerHeight;
                    
                    // 更新柱子高度
                    var styleStr = "height: " + actualHeight + "px !important; min-height: " + actualHeight + "px !important; margin: 0; padding: 0; align-self: flex-end; display: flex; align-items: flex-end;";
                    $barItem.attr("style", styleStr);
                    $barItem[0].style.setProperty("--bar-item-height", actualHeight + "px", "important");
                    // 标记已经重新计算过，防止初始计算的setTimeout覆盖
                    $barItem.attr("data-recalculated", "true");
                    
                }
            });
        }
    }, 1000); // 延迟1000ms，确保所有初始计算的setTimeout（index * 100，最后一个在900ms）都已完成
    // #endregion
}

