// main.js
// 负责前端与后端交互，处理用户输入和对话展示

// 获取 DOM 元素
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const chatContainer = document.getElementById('chat-container');

// 消息历史数组
let messages = [
  { role: 'system', content: '你是豆包，是由字节跳动开发的 AI 人工智能助手.' }
];

// 渲染对话内容
function renderMessages() {
  chatContainer.innerHTML = '';
  messages.forEach(msg => {
    if (msg.role === 'system') return; // 不显示 system 消息
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message ' + (msg.role === 'user' ? 'user' : 'ai');
    const bubble = document.createElement('div');
    bubble.className = 'bubble ' + (msg.role === 'user' ? 'user' : 'ai');
    bubble.textContent = msg.content;
    msgDiv.appendChild(bubble);
    chatContainer.appendChild(msgDiv);
  });
  // 滚动到底部
  chatContainer.scrollTop = chatContainer.scrollHeight;
}



// 发送消息到后端
// 显示AI思考状态
function showThinkingIndicator() {
  const indicator = document.getElementById('thinking-indicator');
  indicator.style.display = 'flex';
  setTimeout(() => indicator.classList.add('visible'), 10);
}

// 隐藏AI思考状态
function hideThinkingIndicator() {
  const indicator = document.getElementById('thinking-indicator');
  indicator.classList.remove('visible');
  setTimeout(() => indicator.style.display = 'none', 300);
}

// 分析消息情感
function analyzeSentiment(text) {
  const positiveWords = ['开心', '快乐', '好', '棒', '优秀', '喜欢', '感谢', '希望'];
  const negativeWords = ['难过', '伤心', '不好', '糟糕', '讨厌', '失望', '焦虑'];
  
  let positiveCount = 0;
  let negativeCount = 0;
  
  positiveWords.forEach(word => {
    if (text.includes(word)) positiveCount++;
  });
  
  negativeWords.forEach(word => {
    if (text.includes(word)) negativeCount++;
  });
  
  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

// 提取关键词
function extractKeywords(text) {
  const stopWords = ['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这'];
  const words = text.split(/\s+|[,。！？，.!?]/).filter(word => word.length > 0);
  const keywords = words.filter(word => !stopWords.includes(word));
  return keywords.slice(0, 3).join(', ');
}

async function sendMessageToServer(userMsg) {
  try {
    showThinkingIndicator();

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages.concat({ role: 'user', content: userMsg }) })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '网络错误');
    }

    // 创建 EventSource 解析器
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let aiMsg = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            finalizeAiMessage(aiMsg);
            return;
          }
          try {
            const jsonData = JSON.parse(data);
            if (jsonData.error) {
              throw new Error(jsonData.error);
            }
            // 直接使用服务器返回的文本内容
            aiMsg += jsonData;
            updateAiMessage(aiMsg);
          } catch (e) {
            // 如果解析 JSON 失败，说明是普通文本
            if (data && data !== '[DONE]') {
              aiMsg += data;
              updateAiMessage(aiMsg);
            }
          }
        }
      }
    }

    if (buffer) {
      const data = buffer.replace('data: ', '').trim();
      if (data && data !== '[DONE]') {
        aiMsg += data;
      }
    }

    finalizeAiMessage(aiMsg);
  } catch (err) {
    console.error('AI 回复错误:', err);
    finalizeAiMessage(`AI 回复失败: ${err.message}`);
  } finally {
    hideThinkingIndicator();
  }
}

// 实时更新 AI 消息气泡
function updateAiMessage(content) {
  // 分析消息情感和关键词
  const sentiment = analyzeSentiment(content);
  const keywords = extractKeywords(content);

  // 查找最后一条 AI 消息气泡
  let lastMsg = chatContainer.querySelector('.message.ai:last-child .bubble');
  if (!lastMsg) {
    // 没有则新建
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message ai';
    const bubble = document.createElement('div');
    bubble.className = 'bubble ai';
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.textContent = content;
    bubble.appendChild(messageContent);

    const messageAnalysis = document.createElement('div');
    messageAnalysis.className = 'message-analysis';
    messageAnalysis.innerHTML = `
      <div class="keywords">${keywords}</div>
      <div class="sentiment ${sentiment}">${sentiment === 'positive' ? '积极' : sentiment === 'negative' ? '消极' : '中性'}</div>
    `;
    bubble.appendChild(messageAnalysis);
    msgDiv.appendChild(bubble);
    chatContainer.appendChild(msgDiv);
  } else {
    const messageContent = lastMsg.querySelector('.message-content') || lastMsg;
    messageContent.textContent = content;
    
    // 更新分析结果
    let messageAnalysis = lastMsg.querySelector('.message-analysis');
    if (!messageAnalysis) {
      messageAnalysis = document.createElement('div');
      messageAnalysis.className = 'message-analysis';
      lastMsg.appendChild(messageAnalysis);
    }
    messageAnalysis.innerHTML = `
      <div class="keywords">${keywords}</div>
      <div class="sentiment ${sentiment}">${sentiment === 'positive' ? '积极' : sentiment === 'negative' ? '消极' : '中性'}</div>
    `;
  }
  chatContainer.scrollTop = chatContainer.scrollHeight;
}



// 最终确定 AI 消息内容
function finalizeAiMessage(content) {
  // 移除最后一条 AI 消息（流式），重新插入最终内容
  let lastMsg = chatContainer.querySelector('.message.ai:last-child');
  if (lastMsg) chatContainer.removeChild(lastMsg);
  messages.push({ role: 'assistant', content });
  renderMessages();
}

// 监听表单提交
chatForm.addEventListener('submit', function(e) {
  e.preventDefault();
  const userMsg = userInput.value.trim();
  if (!userMsg) return;
  messages.push({ role: 'user', content: userMsg });
  renderMessages();
  userInput.value = '';
  sendMessageToServer(userMsg);
});

// 初始渲染
renderMessages();