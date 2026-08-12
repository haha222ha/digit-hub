// 童年创伤测试主逻辑

// 初始化维度数据
var ocean = {};
var ocean_dict = {};
var ocean_keys = [];
var ocean_total = 0;
var iq_value = '';

function initOcean() {
    // 清空之前的数据，避免重复添加
    ocean = {};
    ocean_dict = {};
    ocean_keys = [];
    
    var dimensions = "A_情感虐待|B_身体虐待|C_性虐待|D_忽视|E_家庭功能失调|F_系统性创伤".split("|");
    for (var i = 0; i < dimensions.length; i++) {
        var parts = dimensions[i].split("_");
        var key = parts[0];
        var name = parts[1];
        ocean[key] = 0;
        ocean_dict[key] = name;
        ocean_keys.push(key);
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
            
            // 解析分值：第一个字符是维度（A-F），后面是分数
            var chars = val.split("");
            var dimension = chars[0];
            chars.shift();
            var score = Number(chars.join(""));
            
            // 累加分数
            if (ocean.hasOwnProperty(dimension)) {
                ocean[dimension] += score;
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
    // 绑定"再测一次"按钮（使用事件委托，确保在任何情况下都能工作）
    $(document).on("click", "#restart-btn", function(e) {
        e.preventDefault();
        
        // 清除本地测试结果（用于重新测试）
        if (window.linkValidator && typeof window.linkValidator.clearLocalResult === 'function') {
            window.linkValidator.clearLocalResult();
            console.log('已清除SDK本地测试结果');
        }
        
        // 清除localStorage中的测试结果
        try {
            localStorage.removeItem("trauma_test_result");
            
            // 如果使用了token保存，也清除
            if (window.linkValidator && window.linkValidator.token) {
                var token = window.linkValidator.token;
                localStorage.removeItem("trauma_test_result_" + token);
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
    // 注意：SDK的onLoad回调也会检查并显示结果页，这里的检查作为备用
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
        var tokenKey = "trauma_test_result_" + token;
        savedResult = localStorage.getItem(tokenKey);
    }
    
    // 方法3：如果还是没有，尝试从默认key获取（向后兼容）
    if (!savedResult) {
        savedResult = localStorage.getItem("trauma_test_result");
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
            
            // 确保tips_extra在雷达图下方
            var $sexchart = $("#sexchart");
            var $tipsExtra = $("#tips_extra");
            var $snapshotContainer = $("#snapshot-container");
            if ($sexchart.length && $tipsExtra.length && $snapshotContainer.length) {
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
                localStorage.removeItem("trauma_test_result");
                if (token) {
                    localStorage.removeItem("trauma_test_result_" + token);
                }
            } catch (error) {
                console.error("清除失败的结果数据失败:", error);
            }
        }
    }
    
    // 渲染所有题目
    renderQuestions();
    
    // 移除lib-unld类以显示开始按钮
    setTimeout(function() {
        $(".lib-unld").removeClass("lib-unld");
        $(".progress-button .content").css("opacity", "1");
    }, 600);
    
    // 开始测试按钮（使用类选择器，因为按钮类名已改为welcome-start-button）
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
        
        // 清除之前保存的结果
        localStorage.removeItem("trauma_test_result");
        window.location.hash = "";
        
        // 调用startTest函数（会在函数内部调用SDK的startTest方法）
        startTest();
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
        } else if (q.type === "check") {
            // 多选题 - 先创建选项按钮，稍后在特殊处理中转换
            q.options.forEach(function(opt) {
                var button = $("<button>")
                    .addClass("answer")
                    .attr("value", opt.value)
                    .html(opt.text + (q.hint && opt.value === "V" ? "" : ""));
                wrapper.append(button);
            });
            // 如果有提示，添加提示
            if (q.hint) {
                questionDiv.append($("<i>").text(" " + q.hint));
            }
        } else if (q.type === "sort") {
            // 排序题 - 先创建选项按钮，稍后在特殊处理中转换
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
        if (questionData.type === "check") {
            var options = [];
            var checkStates = [];
            var finalValue = "";
            var $finalButton = null;
            
            $li.find(".answer").each(function() {
                var $opt = $(this);
                var value = $opt.attr("value");
                
                if (value === "V") {
                    checkStates.push(1); // V表示需要选中的选项
                    options.push($opt.text());
                    $opt.remove();
                } else if (value === "0") {
                    checkStates.push(0); // 0表示不需要选中的选项
                    options.push($opt.text());
                    $opt.remove();
                } else {
                    // 这是"完成"按钮，保存其value作为最终分值
                    finalValue = value;
                    $finalButton = $opt;
                    $opt.attr("value", "0"); // 暂时设为0，选中正确选项后会更新
                }
            });
            
            // 使用题目数据中的checkConfig（如果存在）
            var config = questionData.checkConfig || ((finalValue || "0") + ":" + checkStates.join(""));
            
            // 创建多选组
            var checkGroup = $("<div>").addClass("cb_group");
            options.forEach(function(optText) {
                checkGroup.append($("<div>").addClass("cb_item").html(optText));
            });
            $question.after(checkGroup);
            $question.attr("cb-config", config);
            
            // 存储原始value到按钮的data属性
            if ($finalButton) {
                $finalButton.attr("data-original-value", finalValue);
                // 初始状态允许点击（得0分），选择正确选项后才能得分
                $finalButton.attr("value", "0");
                $finalButton.removeClass("unclickable");
            }
        }
        
        // 处理排序题
        if (questionData.type === "sort") {
            var options = [];
            var finalValue = "";
            var $finalButton = null;
            
            $li.find(".answer").each(function() {
                var $opt = $(this);
                var value = $opt.attr("value");
                
                if (value === "0") {
                    options.push($opt.text());
                    $opt.remove();
                } else {
                    // 这是"完成"按钮，保存其value作为最终分值
                    finalValue = value;
                    $finalButton = $opt;
                    $opt.attr("value", "0"); // 暂时设为0，排序正确后会更新
                }
            });
            
            // 生成随机顺序
            var indices = [];
            for (var i = 0; i < options.length; i++) {
                indices.push(i + 1);
            }
            // 打乱顺序
            for (var i = indices.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = indices[i];
                indices[i] = indices[j];
                indices[j] = temp;
            }
            
            // 正确顺序就是1,2,3...（因为题目要求按照用户认为的顺序排列，任何顺序都可以，只要完成排序就得分）
            // 但为了简化，我们假设正确顺序就是1-2-3-...的格式
            var correctOrder = [];
            for (var i = 1; i <= options.length; i++) {
                correctOrder.push(i);
            }
            
            // 创建排序组
            var sortGroup = $("<div>").addClass("ab_group");
            indices.forEach(function(randomIdx) {
                sortGroup.append($("<div>").addClass("ab_item").text(options[randomIdx - 1]));
            });
            $question.after(sortGroup);
            $question.attr("ab-config", (finalValue || "0") + ":" + correctOrder.join("-"));
            
            // 存储原始value到按钮的data属性
            if ($finalButton) {
                $finalButton.attr("data-original-value", finalValue);
                // 初始状态允许点击（得0分），排序完成后才能得分
                $finalButton.attr("value", "0");
                $finalButton.removeClass("unclickable");
            }
        }
    });
    
    // 绑定多选和排序的点击事件
    bindSpecialQuestionEvents();
}

// 绑定特殊题型的点击事件
function bindSpecialQuestionEvents() {
    // 多选题点击
    $("#collection").on("click", ".cb_item", function() {
        $(this).toggleClass("cb_selected");
        var $group = $(this).parent();
        var $question = $group.siblings(".question");
        var $questionWrapper = $question.parent();
        var config = $question.attr("cb-config");
        
        if (!config) return;
        
        var parts = config.split(":");
        var scoreValue = parts[0];
        var correctState = parts[1];
        
        // 获取当前选中状态
        var currentState = "";
        $group.find(".cb_item").each(function() {
            currentState += $(this).hasClass("cb_selected") ? "1" : "0";
        });
        
        // 找到对应的答案按钮（"完成"按钮）
        var $answerBtn = $questionWrapper.find(".answer[data-original-value]");
        
        if ($answerBtn.length === 0) {
            $answerBtn = $questionWrapper.find(".answer").last();
        }
        
        // 如果状态匹配，设置分值并启用按钮
        if (currentState === correctState) {
            var originalValue = $answerBtn.attr("data-original-value") || scoreValue;
            $answerBtn.attr("value", originalValue);
            $answerBtn.removeClass("unclickable");
        } else {
            // 即使不匹配，也允许点击（得0分）
            $answerBtn.attr("value", "0");
            $answerBtn.removeClass("unclickable");
        }
    });
    
    // 排序题点击
    $("#collection").on("click", ".ab_item", function() {
        var $item = $(this);
        var $group = $item.parent();
        var selectedIndices = $group.data("sort_data") || [];
        var currentIndex = $item.index();
        
        // 切换选中状态
        if (selectedIndices.indexOf(currentIndex) !== -1) {
            // 取消选中
            selectedIndices = selectedIndices.filter(function(i) {
                return i !== currentIndex;
            });
            $item.find(".ab_sort_id").remove();
            $item.removeClass("ab_selected");
        } else {
            // 选中
            selectedIndices.push(currentIndex);
            $item.addClass("ab_selected");
        }
        
        // 重新计算并更新所有已选中项的排序数字
        // 按照selectedIndices的顺序，给每个选中的项分配1, 2, 3...的数字
        $group.find(".ab_item").each(function() {
            var $currentItem = $(this);
            var itemIndex = $currentItem.index();
            var sortIndex = selectedIndices.indexOf(itemIndex);
            
            if (sortIndex !== -1) {
                // 这个项被选中了，显示排序数字
                if (!$currentItem.find(".ab_sort_id").length) {
                    $currentItem.append($("<b>").addClass("ab_sort_id"));
                }
                $currentItem.find(".ab_sort_id").text(sortIndex + 1); // sortIndex是0-based，显示时+1
            } else {
                // 这个项没有被选中，移除排序数字
                $currentItem.find(".ab_sort_id").remove();
                $currentItem.removeClass("ab_selected");
            }
        });
        
        $group.data("sort_data", selectedIndices);
        
        var $question = $group.siblings(".question");
        var config = $question.attr("ab-config");
        if (!config) return;
        
        var parts = config.split(":");
        var scoreValue = parts[0];
        
        // 检查是否所有选项都已选择
        var totalItems = $group.find(".ab_item").length;
        var $questionWrapper = $question.parent();
        var $answerBtn = $questionWrapper.find(".answer[data-original-value]");
        
        if ($answerBtn.length === 0) {
            $answerBtn = $questionWrapper.find(".answer").last();
        }
        
        // 即使没有全部排序，也允许点击"完成"按钮（得0分）
        if (selectedIndices.length < totalItems) {
            $answerBtn.attr("value", "0");
            $answerBtn.removeClass("unclickable");
            return;
        }
        
        // 对于排序题，只要所有选项都排序了就得分（简化处理）
        // 实际上排序题可能是要求按照用户认为的顺序排列，所以任何完整排序都应该得分
        var originalValue = $answerBtn.attr("data-original-value") || scoreValue;
        $answerBtn.attr("value", originalValue);
        $answerBtn.removeClass("unclickable");
    });
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
    
    // 显示第一题
    showQuestion(0);
    
    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// 显示指定题目
function showQuestion(index) {
    currentQuestionIndex = index;
    
    // 隐藏所有题目
    $("#collection > li").hide();
    
    // 显示当前题目
    var questionId = questionsData[index].id;
    var $questionLi = $("#" + questionId);
    $questionLi.show();
    
    // 确保题目可以被选择（移除pointer-events-none类，这样返回上一题时可以重新选择）
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
    
    // 隐藏"下一题"按钮（因为选择答案后会自动跳转）
    $("#next_button").hide();
    
    // 绑定答案点击事件
    bindAnswerEvents(index);
}

// 更新答题进度信息
function updateQuestionInfo(current) {
    var total = questionsData.length;
    $("#questionInfo").text("第 " + current + " 题 / 共 " + total + " 题");
}

// 绑定答案点击事件
function bindAnswerEvents(questionIndex) {
    var questionData = questionsData[questionIndex];
    var questionId = questionData.id;
    var $questionLi = $("#" + questionId);
    
    // 移除之前的事件监听器（使用命名空间）
    $questionLi.find(".answer").off("click.answerClick");
    
    // 绑定新的点击事件
    $questionLi.find(".answer").on("click.answerClick", function() {
        if ($(this).hasClass("unclickable")) {
            return;
        }
        
        var $button = $(this);
        var originalValue = $button.attr("value");
        var value = originalValue;
        
        // 允许value为"0"的选项也能选择（只是不计分）
        if (!value) {
            return;
        }
        
        // 保存当前答案（在更新分数之前）
        var previousOceanState = JSON.parse(iq_value);
        
        // 如果当前题目已经存在于answerHistory中（说明是重新选择答案），先移除旧答案
        // 找到当前题目之前的所有答案，保留它们，移除当前题目及之后的答案
        var currentQuestionAnswerIndex = -1;
        for (var i = answerHistory.length - 1; i >= 0; i--) {
            if (answerHistory[i].questionIndex === questionIndex) {
                currentQuestionAnswerIndex = i;
                break;
            }
        }
        
        // 如果找到了当前题目的旧答案，移除它及之后的所有答案（因为返回上一题后重新选择会改变后续答案）
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
            value = jumpMatch[1]; // 提取分值部分
            jumpTo = parseInt(jumpMatch[2]) - 1; // 转换为0-based索引
        }
        
        // 更新分数（即使value是"0"也要调用，但不会计分）
        updateValue(value);
        
        // 标记已选择
        $questionLi.find(".answer").removeClass("ans-on");
        $button.addClass("ans-on");
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
                // 显示结果
                showResult();
            } else {
                showQuestion(nextIndex);
            }
        }, 300);
    });
}

// 返回上一题
function goToPreviousQuestion() {
    if (currentQuestionIndex <= 0 || answerHistory.length === 0) {
        return;
    }
    
    // 恢复上一题的状态（pop出当前题目的答案）
    var lastAnswer = answerHistory.pop();
    ocean = JSON.parse(JSON.stringify(lastAnswer.oceanState));
    iq_value = JSON.stringify(ocean);
    
    // 隐藏当前题目并清除其选择状态
    var currentQuestionId = questionsData[currentQuestionIndex].id;
    $("#" + currentQuestionId).find(".questionWrapper").removeClass("pointer-events-none");
    $("#" + currentQuestionId).find(".answer").removeClass("ans-on");
    
    // 显示上一题（showQuestion会自动移除pointer-events-none类，使其可以重新选择）
    showQuestion(lastAnswer.questionIndex);
    
    // 恢复上一题的选择状态（显示之前选择的答案，但允许重新选择）
    var questionId = questionsData[lastAnswer.questionIndex].id;
    var $questionLi = $("#" + questionId);
    var questionData = questionsData[lastAnswer.questionIndex];
    
    // 处理跳转逻辑中的value
    var displayValue = lastAnswer.value;
    var jumpMatch = displayValue.match(/^(.+?),to,(\d+)$/);
    if (jumpMatch) {
        displayValue = jumpMatch[1];
    }
    
    // 恢复单选题的选择状态（显示之前的选择，但不添加pointer-events-none，允许重新选择）
    if (questionData.type === "single") {
        // 先清除所有选择状态
        $questionLi.find(".answer").removeClass("ans-on");
        // 然后恢复之前的选择（仅用于显示）
        var $selectedButton = $questionLi.find(".answer[value='" + displayValue + "']");
        if ($selectedButton.length) {
            $selectedButton.addClass("ans-on");
        }
    } else if (questionData.type === "check" || questionData.type === "sort") {
        // 特殊题型的选择状态恢复需要在特殊处理函数中实现
        // 这里暂时不处理，因为状态较复杂
        // 但至少确保可以重新选择（pointer-events-none已在showQuestion中移除）
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
    $("#progress").css("visibility", "hidden");
    
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
        var storageKey = "trauma_test_result_" + token;
        localStorage.setItem(storageKey, JSON.stringify(resultData));
        // 同时保存到默认key（向后兼容）
        localStorage.setItem("trauma_test_result", JSON.stringify(resultData));
    } else {
        // 向后兼容：使用默认key
        localStorage.setItem("trauma_test_result", JSON.stringify(resultData));
    }
    
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
    
    // 确保tips_extra在雷达图下方（通过DOM移动）
    var $sexchart = $("#sexchart");
    var $tipsExtra = $("#tips_extra");
    var $snapshotContainer = $("#snapshot-container");
    if ($sexchart.length && $tipsExtra.length && $snapshotContainer.length) {
        // 将tips_extra移动到snapshot-container之后
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
    
    // 计算总分并生成结果列表
    for (var key in ocean) {
        var score = ocean[key];
        if (score > 0) {
            ocean_total += score;
            resultList.push({
                name: ocean_dict[key],
                score: score,
                key: key
            });
        }
    }
    
    // 按分数排序
    resultList.sort(function(a, b) {
        return b.score - a.score;
    });
    
    // 更新总分显示
    $("#total-score").text(ocean_total);
    
    // 更新各维度分数显示
    $("#score-A").text(ocean.A || 0);
    $("#score-B").text(ocean.B || 0);
    $("#score-C").text(ocean.C || 0);
    $("#score-D").text(ocean.D || 0);
    $("#score-E").text(ocean.E || 0);
    $("#score-F").text(ocean.F || 0);
    
    // 绘制雷达图
    drawRadarChart();
}

// 绘制雷达图
function drawRadarChart() {
    if (typeof Highcharts === "undefined") {
        console.error("Highcharts未加载");
        // 如果Highcharts未加载，等待一下再试
        setTimeout(function() {
            if (typeof Highcharts !== "undefined") {
                drawRadarChart();
            }
        }, 500);
        return;
    }
    
    var categories = [];
    var data = [];
    
    ocean_keys.forEach(function(key) {
        categories.push(ocean_dict[key] + " (" + (ocean[key] || 0) + ")");
        data.push({
            y: ocean[key] || 0,
            name: ocean_dict[key]
        });
    });
    
    // 找到最高分
    var maxScore = Math.max.apply(null, data.map(function(d) { return d.y; }));
    
    // 标记最高分
    data.forEach(function(d, index) {
        if (d.y === maxScore && maxScore > 0) {
            categories[index] = '<b style="font-size:1.2em;font-weight:bold;color:red">' + categories[index] + '</b>';
            d.marker = {
                radius: 8,
                fillColor: "#f00",
                states: {
                    hover: {
                        radius: 10,
                        fillColor: "#f00"
                    }
                }
            };
        }
    });
    
    Highcharts.chart("sexchart", {
        chart: {
            plotBackgroundColor: null,
            plotBorderWidth: null,
            plotShadow: false,
            polar: true,
            type: "area"
        },
        title: {
            text: null
        },
        tooltip: {
            pointFormat: '<span style="color:{series.color}"><b>{point.y:,.0f}</b>',
            className: "arm-tooltip"
        },
        plotOptions: {
            animation: false
        },
        xAxis: {
            categories: categories,
            tickmarkPlacement: "on",
            lineWidth: 0
        },
        yAxis: {
            gridLineInterpolation: "polygon",
            lineWidth: 0,
            min: 0,
            max: 100
        },
        legend: {
            enabled: false
        },
        credits: {
            enabled: false
        },
        series: [{
            name: "",
            animation: false,
            data: data.map(function(d) { return d.y; }),
            lineWidth: 4
        }]
    });
}

