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

// 口腔行业专业术语列表（用于提示模型）
const DENTAL_TERMS = `口腔行业专业术语参考：
- 义齿：代替缺失天然牙的修复体
- 全瓷冠：全部由瓷材料制成的牙冠
- 金属烤瓷冠：内层金属、外层烤瓷的牙冠
- 种植牙：通过种植体支持的修复牙
- 二氧化锆：常用的全瓷材料
- 密合度：修复体与牙体的贴合程度
- 咬合：上下牙齿的接触关系
- 边缘：修复体与牙体交接的边缘区域
- 蜡型：蜡制成的牙齿形态模型
- 包埋：用石膏等材料包埋蜡型
- 打磨抛光：修复体表面的精加工处理
- 排牙：排列人工牙
- 充胶：用树脂材料填充
- 车瓷：用牙科手机修整形态
- 染色上釉：给义齿上色和增加光泽`;

// AI润色接口 - SSE流式
app.post('/api/v1/polish', async (req, res) => {
  const { text, imageUrl, imageUrls, style } = req.body;
  
  // 兼容单图和多图
  const imageUrlList: string[] = [];
  if (imageUrl) imageUrlList.push(imageUrl);
  if (imageUrls && Array.isArray(imageUrls)) {
    imageUrlList.push(...imageUrls);
  }

  // 设置SSE响应头
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, no-transform, must-revalidate');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // 风格指令映射
  const styleInstructions: Record<string, string> = {
    gentle: `回复风格要求：
- 语言温和客气，礼貌周到
- 多用"您好"、"麻烦您"、"辛苦啦"等礼貌用语
- 表达委婉，尊重对方
- 示例用语："您好，打扰您了"、"麻烦您抽空确认一下"、"辛苦您啦"`,

    friendly: `回复风格要求：
- 语言亲切温暖，有情感温度
- 多用"您"、"咱们"拉近距离
- 适当使用表情符号以外的情感词汇
- 示例用语："让您少跑一趟"、"咱们一起想办法"`,

    concise: `回复风格要求：
- 语言简洁精炼，直击重点
- 删除所有不必要的客套话
- 一句话能说清的不要用两句
- 示例用语：直接说明情况和解决方案，不加"非常抱歉"`
  };

  const styleInstruction = styleInstructions[style] || styleInstructions.professional;

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

${styleInstruction}

润色原则（关键！）：
遇到需要解释延误、返工、质量问题等情况时，请用以下表达替换真实原因：
| 真实原因 | 润色后的表述 |
|---------|-------------|
| 公司设备故障/机器坏了 | "因生产环节的小瑕疵被质检拦截"、"为保障义齿精度，临时进行了二次确认" |
| 员工操作失误/做错了 | "生产过程中发现个别数据需要重新确认"、"质检环节对咬合/边缘进行了优化调整" |
| 生产量太大、排期满了 | "近期订单较多，排产紧张"、"生产车间正在全力调配" |
| 前面沟通漏单/问单拖延 | "因前序沟通中部分信息需要补充核对，导致流程稍有延迟" |
| 物流运输损坏 | "运输途中偶有颠簸，我们已重新制作并安排加急发出" |

回复格式要求（重要！简短为主）：
- 总字数控制在100字以内
- 称呼 + 一句话说明情况 + 解决方案即可
- 不要过度道歉或重复感谢
- 语言简洁专业，一气呵成

输出要求：
只输出润色后的完整回复文案，不要任何解释说明。`;

  try {
    // 构建用户消息
    let userContent = '';

    // 检查是否有图片（单图或多图）
    const hasImages = imageUrlList.length > 0;
    const hasText = text && text.trim();

    if (hasImages) {
      userContent = `【截图内容】：请分析这些截图中的客户问题信息，包括订单号、患者姓名、具体问题描述等\n\n`;
    }

    if (hasText) {
      userContent += `【补充文字】：${text}\n\n`;
    }

    // 如果既没有图片也没有文字，返回提示
    if (!userContent.trim()) {
      res.write(`data: ${JSON.stringify({ content: '请提供客户的问题描述或上传截图，我来帮您生成专业回复。' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // 根据是否有图片构建不同格式的用户消息
    let messages: any[] = [];

    if (imageUrlList.length > 0) {
      // 有图片：使用多模态消息格式
      const contentArray: any[] = [
        { type: 'text', text: userContent }
      ];
      
      imageUrlList.forEach(url => {
        contentArray.push({ type: 'image_url', image_url: { url, detail: 'high' } });
      });
      
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contentArray }
      ];
    } else {
      // 无图片：使用纯文本格式
      userContent += `请根据以上信息，生成一条专业、礼貌的客服回复。`;
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ];
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

// 语音识别接口 - 使用豆包ASR
app.post('/api/v1/transcribe', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有音频文件' });
    }

    const { buffer, mimetype } = req.file;

    // 调用豆包语音识别
    const audioBase64 = buffer.toString('base64');
    const audioData = `data:${mimetype};base64,${audioBase64}`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: any }> = [
      {
        role: 'user',
        content: [
          {
            type: 'audio',
            audio: {
              url: audioData
            }
          },
          {
            type: 'text',
            text: '请识别这段语音的内容，直接输出识别出的文字，不要任何解释。如果音频中没有人声或无法识别，请输出"未能识别到语音内容"。'
          }
        ]
      }
    ];

    // 使用非流式调用
    let transcription = '';
    const stream = llmClient.stream(messages as any, {
      model: 'doubao-seed-2-0-pro-260215',
    });

    for await (const chunk of stream) {
      if (chunk.content) {
        transcription += chunk.content.toString();
      }
    }

    // 如果识别结果提示无法识别，返回友好提示
    if (transcription.includes('未能识别') || !transcription.trim()) {
      return res.json({ text: '', error: '未能识别到语音内容' });
    }

    res.json({ text: transcription });

  } catch (error) {
    console.error('语音识别失败:', error);
    res.status(500).json({ error: '语音识别失败' });
  }
});

// 导入路由
import recordsRouter from './routes/records';

// 挂载路由
app.use('/api/v1/records', recordsRouter);

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});
