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

// 控制AI思考状态显示
function showThinking() {
  const thinking = document.getElementById('ai-thinking');
  thinking.classList.add('visible');
}

function hideThinking() {
  const thinking = document.getElementById('ai-thinking');
  thinking.classList.remove('visible');
}

// 发送消息到后端
async function sendMessageToServer(userMsg) {
  try {
    showThinking(); // 显示AI思考状态
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
    hideThinking(); // 隐藏AI思考状态
  }
}

// 实时更新 AI 消息气泡
function updateAiMessage(content) {
  // 查找最后一条 AI 消息气泡
  let lastMsg = chatContainer.querySelector('.message.ai:last-child .bubble');
  if (!lastMsg) {
    // 没有则新建
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message ai';
    const bubble = document.createElement('div');
    bubble.className = 'bubble ai';
    
    // 创建消息内容容器
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;
    
    // 创建消息分析容器
    const analysisDiv = document.createElement('div');
    analysisDiv.className = 'message-analysis';
    
    // 提取关键词（简单实现，实际项目中可以使用更复杂的算法）
    const keywords = extractKeywords(content);
    if (keywords.length > 0) {
      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'keywords';
      keywordSpan.textContent = '关键词：' + keywords.join('、');
      analysisDiv.appendChild(keywordSpan);
    }
    
    // 分析情感倾向（简单实现）
    const sentiment = analyzeSentiment(content);
    const sentimentSpan = document.createElement('span');
    sentimentSpan.className = 'sentiment ' + sentiment;
    sentimentSpan.textContent = getSentimentText(sentiment);
    analysisDiv.appendChild(sentimentSpan);
    
    bubble.appendChild(contentDiv);
    bubble.appendChild(analysisDiv);
    msgDiv.appendChild(bubble);
    chatContainer.appendChild(msgDiv);
  } else {
    const contentDiv = lastMsg.querySelector('.message-content') || lastMsg;
    contentDiv.textContent = content;
  }
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// 提取关键词（简单实现）
function extractKeywords(text) {
  const stopWords = new Set(['的', '了', '和', '是', '在', '我', '你', '他', '她', '它', '这', '那', '都']);
  const words = text.split(/\s+|[,。！？、]/).filter(word => 
    word.length >= 2 && !stopWords.has(word)
  );
  return [...new Set(words)].slice(0, 3); // 返回前3个不重复的关键词
}

// 分析情感倾向（简单实现）
function analyzeSentiment(text) {
  const positiveWords = ['好', '棒', '优秀', '感谢', '喜欢', '开心', '希望'];
  const negativeWords = ['差', '糟', '失败', '抱歉', '问题', '错误', '难过'];
  
  let score = 0;
  positiveWords.forEach(word => {
    if (text.includes(word)) score++;
  });
  negativeWords.forEach(word => {
    if (text.includes(word)) score--;
  });
  
  return score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
}

// 获取情感文本
function getSentimentText(sentiment) {
  switch (sentiment) {
    case 'positive': return '😊 积极';
    case 'negative': return '😔 消极';
    default: return '😐 中性';
  }
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