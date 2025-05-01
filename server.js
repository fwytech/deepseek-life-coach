// server.js
// Node.js 后端服务器，负责中转前端请求到火山方舟 DeepSeek R1 API，解决 CORS 问题

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = 3000;

// 允许所有来源跨域
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 提供静态文件服务
app.use(express.static('public'));

// API KEY 和 DeepSeek R1 API 地址
const API_KEY = '3c2d78ae-41b3-41cb-82b1-89d19063591a';
const API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

// 处理前端 /api/chat 请求
app.post('/api/chat', async (req, res) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    if (!req.body.messages || !Array.isArray(req.body.messages)) {
      res.status(400).json({ error: '无效的请求格式' });
      return;
    }

    const userMessages = req.body.messages;
    // 构造 API 请求体
    const payload = {
      model: 'deepseek-r1-250120',
      messages: userMessages,
      temperature: 0.6,
      stream: true
    };

    console.log('发送请求到火山方舟 API:', {
      url: API_URL,
      messages: userMessages.length
    });

    // 发起 API 请求
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': 'text/event-stream',
        'Connection': 'keep-alive'
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      timeout: 60000
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('火山方舟 API 响应错误:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      res.status(response.status).json({
        error: `AI 服务异常 (${response.status}): ${errorText}`
      });
      return;
    }

    // 设置流式响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 读取并转发流式数据
    const reader = response.body;
    const decoder = new TextDecoder();

    try {
      // 使用 for await...of 处理流式响应
      for await (const chunk of reader) {
        const text = decoder.decode(chunk);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              res.write('data: [DONE]\n\n');
              continue;
            }

            try {
              const json = JSON.parse(data);
              if (json.error) {
                throw new Error(json.error);
              }
              const content = json.choices[0]?.delta?.content;
              if (content) {
                res.write(`data: ${content}\n\n`);
              }
            } catch (e) {
              console.error('解析 SSE 数据失败:', {
                line: line,
                error: e.message
              });
              // 发送错误信息到客户端
              res.write(`data: {"error": "${e.message}"}\n\n`);
            }
          }
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (streamErr) {
      console.error('处理流数据时出错:', streamErr);
      res.write(`data: {"error": "${streamErr.message}"}\n\n`);
      res.end();
    }
  } catch (err) {
    console.error('API 请求失败:', err);
    res.status(500).json({
      error: 'AI 服务请求失败',
      message: err.message
    });
  } finally {
    clearTimeout(timeout);
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});