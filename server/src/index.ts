import express from "express";
import cors from "cors";
import multer from "multer";
import { LLMClient, Config } from "coze-coding-dev-sdk";
import { S3Storage } from "coze-coding-dev-sdk";

const app = express();
const port = process.env.PORT || 9091;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Multer配置
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// 初始化存储和LLM
const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

const llmConfig = new Config();
const llmClient = new LLMClient(llmConfig);

// 健康检查
app.get('/api/v1/health', (req, res) => {
  console.log('Health check success');
  res.status(200).json({ status: 'ok' });
});

// 文件上传接口
app.post('/api/v1/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有文件' });
    }

    const { buffer, originalname, mimetype } = req.file;
    const fileName = `uploads/${Date.now()}_${originalname}`;

    // 上传到对象存储
    const fileKey = await storage.uploadFile({
      fileContent: buffer,
      fileName: fileName,
      contentType: mimetype,
    });

    // 生成签名URL
    const signedUrl = await storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 86400, // 24小时
    });

    res.json({ success: true, url: signedUrl, key: fileKey });
  } catch (error) {
    console.error('上传失败:', error);
    res.status(500).json({ error: '上传失败' });
  }
});

// 语音转文字接口（模拟）
app.post('/api/v1/speech-to-text', upload.single('audio'), async (req, res) => {
  try {
    // 由于没有真实的ASR服务，这里返回提示信息
    // 在实际生产环境中，可以接入阿里云、腾讯云等ASR服务
    res.json({
      text: '',
      error: '语音识别服务暂不可用，请使用文字输入'
    });
  } catch (error) {
    console.error('语音识别失败:', error);
    res.status(500).json({ error: '语音识别失败' });
  }
});

// AI润色接口 - SSE流式
app.post('/api/v1/polish', async (req, res) => {
  const { text, imageUrl } = req.body;

  // 设置SSE响应头
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, no-transform, must-revalidate');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // 构建系统提示词
  const systemPrompt = `你是口腔义齿加工中心的技术支持客服专员，负责协助客服人员润色回复客户（医生或诊所）的消息。

输入来源包括：
1. 【截图识别内容】截图用于识别客户的问题、对话场景、关键信息（如订单号、患者名、投诉点等）
2. 【语音/文字补充】客服可能用语音或简短文字补充说明客户的实际意思
3. 【原始回复草稿】客服也可能直接给出一个草稿，需要你润色

核心任务：
结合上述信息，生成一条适合发给客户的完整回复消息。回复需要同时兼顾：
- 礼貌、专业，体现对医生和患者的关怀
- 维护公司利益，避免直接暴露对公司不利的真实原因（如设备故障、人员失误等），改用更委婉、客观的表述方式

润色原则（关键！）：
遇到需要解释延误、返工、质量问题等情况时，请用以下表达替换真实原因：
| 真实原因 | 润色后的表述 |
|---------|-------------|
| 公司设备故障/机器坏了 | "因生产环节的小瑕疵被质检拦截"、"为保障义齿精度，临时进行了二次确认" |
| 员工操作失误/做错了 | "生产过程中发现个别数据需要重新确认"、"质检环节对咬合/边缘进行了优化调整" |
| 生产量太大、排期满了 | "近期订单较多，排产紧张"、"生产车间正在全力调配" |
| 前面沟通漏单/问单拖延 | "因前序沟通中部分信息需要补充核对，导致流程稍有延迟" |
| 物流运输损坏 | "运输途中偶有颠簸，我们已重新制作并安排加急发出" |

回复格式要求：
- 开头使用合适的称呼（如"张医生您好"、"尊敬的诊所老师好"）
- 正文清晰说明情况 + 解决方案 + 新时间承诺（如有延迟）
- 结尾致歉或感谢理解
- 整体语气温和、不卑不亢

输出要求：
只输出润色后的完整回复文案，不输出分析过程。如果信息不足，先礼貌请求补充必要信息（如患者姓名）。`;

  try {
    // 构建用户消息
    let userContent = '';

    if (imageUrl) {
      userContent = `【截图内容】：请分析这张截图中的客户问题信息\n\n`;
    }

    if (text && text.trim()) {
      userContent += `【补充文字】：${text}\n\n`;
    }

    if (!userContent.trim()) {
      res.write(`data: ${JSON.stringify({ content: '请提供客户的问题描述或上传截图，我来帮您生成专业回复。' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    userContent += `请根据以上信息，生成一条专业、礼貌的客服回复。`;

    // 构建消息数组
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ];

    // 如果有图片URL，添加图片
    if (imageUrl) {
      messages[1] = {
        role: 'user',
        content: [
          { type: 'text', text: userContent },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }
        ]
      };
    }

    // 使用流式调用
    const stream = llmClient.stream(messages, {
      model: 'doubao-seed-2-0-pro-260215',
      temperature: 0.7,
    });

    for await (const chunk of stream) {
      if (chunk.content) {
        res.write(`data: ${JSON.stringify({ content: chunk.content.toString() })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('润色处理失败:', error);
    res.write(`data: ${JSON.stringify({ content: '处理失败，请重试。' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});
