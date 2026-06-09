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

  // 话术库数据 - 用于纯图片输入时自动匹配
  const templateLibrary = `【话术库】以下是常用的客服话术模板，当识别到对应场景时可直接引用或适当修改：

一、物料缺失（需要客户提供资料）
- "XX医生您好，XXX患者此订单缺少【XX】，暂时无法安排生产。麻烦您补充相关资料信息，收到后我们第一时间排单，辛苦啦！"

二、加急告知
- "XX医生您好，收到您的加急需求，该订单我们已安排加急制作，预计XX时间可以交付。若出现特殊状况，我会及时告知您。"

三、工艺确认
- "XX医生您好，加工单备注要求【颈缘多延伸/切端通透/发设计图/上颌架后拍照/车瓷完成后拍照】，我们按此要求制作，您看是否还有其他补充要求？"

四、交期/进度同步
- "XX医生您好，查询了XXX患者的订单目前制作顺利，会按原定日期准时交货，请您安心。如遇突发情况，我会第一时间提前和您沟通。"

五、发货通知
- "XX医生您好，您的货品已发出，快递单号：XXX，物流可自行查询；同城配送预计XX时间送达门诊，请注意查收。"

六、延期告知
- "XX医生您好，跟您致歉，因【工艺复杂/原料调配/批量排单】原因，XXX患者订单预计延迟至XX时间交付，给您带来不便非常抱歉，我们会加急赶工。"
- "XX医生您好，非常抱歉。XXX患者订单在质检时发现细节问题，未达到出货标准，现已退回重新修整制作，今日无法交付，预计XX时间完成。我们会严格把控品质，还请您谅解。"

七、模型异常/沟通处理方案
【基牙咬合空间不足】（重要：0.4mm以内只建议模型修整，超过0.4mm才提供重新备牙选项）
- "XX医生您好，制作XXX患者义齿时，发现模型基牙咬合空间不足，达不到对应材料的最小厚度要求，无法直接加工。和您确认一下是在模型上修整基牙/对颌牙并做好标记再制作？辛苦您了，收到消息还请抽空回复，谢谢！"
- 如果图片或文字中明确提到空间差值（如"差0.2mm"、"空间不足0.3mm"等），需要在话术中体现具体数值，例如："是在模型上修整基牙/对颌牙0.2mm并做好标记再制作？"
- 如果空间差值较大（超过0.4mm），可增加一句："若修整量较大，也可考虑重新备牙取模。"

【邻牙存在倒凹】
- "XX医生您好，在制作XXX患者义齿时，发现模型存在邻牙倒凹，直接制作将会出现无法就位或邻接无接触等问题，无法直接加工制作。想跟您确认：是在模型上修整邻牙并作好标记，还是麻烦您重新备牙取模呢？"

【基牙少量倒凹】
- "XX医生您好，打扰您。XXX患者的模型基牙存在少量倒凹，直接制作会引发义齿边缘不密合、飘空等情况，影响使用效果，所以不建议直接加工。想和您沟通处理方式：1.我们可修除模型倒凹并做标记；2.也可直接填补倒凹制作；3.或是辛苦您重新备牙取模，您看哪种更合适？"

【桥体有倒凹、无共同就位道】
- "XX医生您好，打扰您了。XXX患者的模型桥体存在倒凹，暂无共同就位道。直接制作容易出现义齿就位不畅、边缘不密合、飘空等问题，故而不建议直接做。想和您沟通下，是我们修整模型去除倒凹并做好标记再加工，还是辛苦您重新备牙取模呢？"

【邻面形态异常】
- "XX医生您好，打扰您。XXX患者模型邻面形态异常，系印模/口扫误差造成。直接加工易引发就位不畅、邻面接触异常，特此提醒。请您先确认口内情况是否与模型一致？如一致无其他要求我们按照现模型制作；若不一致，可选方案：1.刮除模型异常区域并标记；2.重新约患者检查、再次取模。"

八、咬合记录异常/缺失
- "XX医生您好，打扰您了。制作XXX患者义齿时，发现模型咬合存在异常，随件也未附带咬合记录，目前无法正常上架制作。为保证咬合精度与成品效果，麻烦您抽空安排患者重新采集咬合记录。辛苦您了，收到消息还请抽空告知我一下，谢谢！"

九、比色/照片问题
- "XX医生您好，打扰您。XXX患者的比色照片，受拍摄光线、比色板摆放角度影响，且所选色号和邻牙色差较明显，暂时无法确定制作颜色。如果您还记得匹配邻牙的准确色板，麻烦告知我们，我们将按您的要求制作；若记忆不清，为保证最终色泽效果，还请您安排患者重新比色。辛苦您了，收到消息还请抽空回复，谢谢！"
`;

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

输入来源：
1. 【截图识别】截图用于识别客户的问题场景，提取有用信息（患者姓名、医生姓氏、问题描述等）
2. 【文字/语音输入】客服用语音或简短文字补充说明客户意思
3. 【回复草稿】客服可能直接给出一个草稿，需要润色

重要规则：
- 订单号不需要输出，不要在结果中出现任何订单号
- 图片和文字信息需要结合理解，生成完整专业的客户回复
- 回复需要：礼貌专业、体现关怀、维护公司利益（避免暴露对公司不利的真实原因）

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
      if (hasText) {
        // 有图片+有文字：结合图片信息和文字进行润色，同时检查是否匹配话术库
        userContent = `【截图识别】请仔细分析这些截图，提取：患者姓名、医生姓氏、问题描述、沟通场景、具体数值（如空间差值0.2mm等）等有用信息。不要提取订单号。\n\n`;
        userContent += `【补充文字/语音】：${text}\n\n`;
        userContent += `【任务要求】：
1. 根据截图和补充文字生成润色版本（保持原意，语言更专业礼貌）
2. 同时检查下方话术库，看是否有完全匹配的场景：
   - 如果有匹配的话术模板，直接引用并填充具体信息（XX替换为医生姓氏、患者姓名用XX）
   - 如果空间差值<0.4mm，话术中只建议模型修整，不提重新备牙取模
   - 如果空间差值>=0.4mm，话术中可增加"若修整量较大，也可考虑重新备牙取模"
3. 分别输出【润色版】和【话术库版】

${templateLibrary}

请按以下格式输出两个版本：
【润色版】：XX医生您好...（润色后的完整回复）
【话术库版】：XX医生您好...（如果有匹配的话术，直接引用；如无匹配则写"暂无匹配话术"）`;
      } else {
        // 只有图片（无文字）：自动匹配话术库
        userContent = `【纯图片识别任务】
请仔细分析这些截图，识别客户的问题场景，提取具体数值（如空间差值0.2mm等）。

请完成以下两个步骤：
1. 【识别场景】：从截图中识别这是什么情况（模型问题/交期咨询/物料缺失/质量问题等），特别注意提取具体数值
2. 【匹配话术】：从下方话术库中找到最匹配的一条，替换XX为从图片中提取的具体信息（患者姓名用XX代替医生姓氏）
   - 如果识别到空间差值（如"差0.2mm"、"0.3mm"等），需要在话术中体现具体数值
   - 如果空间差值<0.4mm，话术中只建议模型修整，不提重新备牙取模
   - 如果空间差值>=0.4mm，话术中可增加"若修整量较大，也可考虑重新备牙取模"

${templateLibrary}

请直接输出一条最匹配的话术，格式为：
【识别场景】：XXX（如有具体数值请标注，如"基牙咬合空间不足0.2mm"）
【推荐话术】：XX医生您好...`;

        // 如果既没有图片也没有文字，返回提示
        if (!userContent.trim()) {
          res.write(`data: ${JSON.stringify({ content: '请提供客户的问题描述或上传截图，我来帮您生成专业回复。' })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
      }
    } else if (hasText) {
      userContent += `请根据以上信息，生成一条专业、礼貌的客服回复。`;
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
    } else if (hasText) {
      // 无图片但有文字/语音：润色并检查是否匹配话术库
      userContent = `【客户原话/语音转文字】：${text}\n\n`;
      userContent += `【任务要求】：
1. 根据以上内容生成润色版本（保持原意，语言更专业礼貌）
2. 同时检查下方话术库，看是否有匹配的场景：
   - 如果有匹配的话术模板，直接引用并填充具体信息
   - 如果空间差值<0.4mm，话术中只建议模型修整，不提重新备牙取模
   - 如果空间差值>=0.4mm，话术中可增加"若修整量较大，也可考虑重新备牙取模"
3. 分别输出【润色版】和【话术库版】

${templateLibrary}

请按以下格式输出两个版本：
【润色版】：XX医生您好...（润色后的完整回复）
【话术库版】：XX医生您好...（如果有匹配的话术，直接引用；如无匹配则写"暂无匹配话术"）`;
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ];
    } else {
      // 既没有图片也没有文字
      res.write(`data: ${JSON.stringify({ content: '请提供客户的问题描述或上传截图，我来帮您生成专业回复。' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
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
