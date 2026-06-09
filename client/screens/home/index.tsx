import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Modal,
  Animated,
  Share,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { createFormDataFile } from '@/utils';
import Toast from 'react-native-toast-message';
import RNSSE from 'react-native-sse';

const API_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';
const STORAGE_KEY = '@alpha_helper_history';

  // 历史记录类型
interface HistoryItem {
  id: string;
  inputText: string;
  inputImageUri: string | null;
  resultText: string;
  style: string; // 润色风格
  timestamp: number;
}

// 润色风格类型
type PolishStyle = 'professional' | 'friendly' | 'concise';

// 快捷短语模板类型
interface TemplateItem {
  id: string;
  category: string;
  title: string;
  content: string;
}

// 口腔义齿行业快捷短语库
const TEMPLATE_LIBRARY: TemplateItem[] = [
  // ========== 订单确认类 ==========
  {
    id: 't1',
    category: '订单确认',
    title: '加工单确认',
    content: '您好，您的加工单已收到，我们将在确认模型及设计要求后安排生产，预计出货时间为XX日。如有任何疑问，请随时联系我们。',
  },
  {
    id: 't2',
    category: '订单确认',
    title: '加急确认',
    content: '您好，您的加急订单已确认。我们将优先安排生产，预计可在XX日前完成并发出。如需进一步沟通，请联系您的专属客服。',
  },
  {
    id: 't3',
    category: '订单确认',
    title: '设计稿确认',
    content: '您好，设计稿已完成，请您查看附件。如对设计有调整要求，请在XX日前反馈，逾期将默认确认并开始制作。感谢配合！',
  },

  // ========== 交期咨询类 ==========
  {
    id: 't4',
    category: '交期咨询',
    title: '交期回复',
    content: '您好，根据目前生产排单情况，您的订单预计可在XX日出货。我们会提前一天通知您发货，请保持电话畅通。',
  },
  {
    id: 't5',
    category: '交期咨询',
    title: '延期说明',
    content: '您好，非常抱歉告知，由于近期订单量较大，您的订单需要延后XX天完成。我们会加急处理，预计XX日出货，敬请谅解。',
  },
  {
    id: 't6',
    category: '交期咨询',
    title: '物流查询',
    content: '您好，您的订单已于XX日通过XX快递发出，单号为XXXXX，请注意查收。如有物流异常，请及时联系我们。',
  },

  // ========== 技术问题类 ==========
  {
    id: 't7',
    category: '技术问题',
    title: '备牙要求',
    content: '您好，关于您咨询的备牙问题，建议基牙预备时保证足够的肩台宽度（建议0.5mm以上）和良好的聚合度（建议6-8度），以确保修复体密合度。如有疑问，可参考我们提供的备牙指南或联系技术支持。',
  },
  {
    id: 't8',
    category: '技术问题',
    title: '比色说明',
    content: '您好，关于比色建议：①请在自然光下进行比色；②比色板应湿润但无多余水分；③建议拍摄患牙及邻牙照片供我们参考；④复杂病例可考虑使用比色仪。如需比色板，可联系客服申请。',
  },
  {
    id: 't9',
    category: '技术问题',
    title: '印模要求',
    content: '您好，请注意印模要求：①建议使用硅橡胶或聚醚橡胶取模；②印模必须清晰完整，无气泡、无撕裂；③咬合记录建议使用咬合纸或硅橡胶记录。感谢您的配合！',
  },

  // ========== 调改问题类 ==========
  {
    id: 't10',
    category: '调改问题',
    title: '调改确认',
    content: '您好，您的调改要求已确认。我们将尽快安排处理，预计可在原定交期基础上延长XX天。如需加急处理，请提前告知，我们会尽力协调。',
  },
  {
    id: 't11',
    category: '调改问题',
    title: '调改说明',
    content: '您好，关于调改问题，已安排技师处理。请您将调改后的义齿照片或具体调改位置描述发给我们，以便精准处理。感谢您的耐心等待！',
  },
  {
    id: 't12',
    category: '调改问题',
    title: '返工说明',
    content: '您好，非常抱歉给您带来不便。我们已收到您的返工件，将重新制作。预计完成时间为XX日，届时会第一时间通知您发货。',
  },

  // ========== 产品材质类 ==========
  {
    id: 't13',
    category: '产品材质',
    title: '材质说明',
    content: '您好，感谢您的咨询。该产品采用XX材质，具有XX特性（如：生物相容性好、强度高、美观性好等）。我们可提供材质证明及质量检测报告，如需了解更多信息，请随时告知。',
  },
  {
    id: 't14',
    category: '产品材质',
    title: '材质选择建议',
    content: '您好，根据您描述的临床需求，建议选择XX材质/方案。该方案在XX方面有优势，性价比高。如有其他要求或预算考量，也可提供参考方案。',
  },

  // ========== 费用核算类 ==========
  {
    id: 't15',
    category: '费用核算',
    title: '报价说明',
    content: '您好，您咨询的报价如下：XX产品XX元/颗，加工费XX元，合计XX元。以上为不含税价格，如需发票请另行告知。付款方式为XX。',
  },
  {
    id: 't16',
    category: '费用核算',
    title: '账单核对',
    content: '您好，本月账单已生成，详情如下：XX订单共计XX元。请于XX日前完成付款，以便我们及时安排生产。如有账单疑问，请联系财务核对。',
  },

  // ========== 物流快递类 ==========
  {
    id: 't17',
    category: '物流快递',
    title: '发货通知',
    content: '您好，您的订单已发货！快递单号：XXXXX，预计XX日送达。请注意查收并及时反馈签收情况。如有破损，请拒收并联系我们。',
  },
  {
    id: 't18',
    category: '物流快递',
    title: '签收确认',
    content: '您好，请问您是否已收到货物？请检查外包装是否完好、件数是否正确、义齿是否完整无损。签收后如有任何问题，请24小时内联系我们处理。',
  },

  // ========== 质量反馈类 ==========
  {
    id: 't19',
    category: '质量反馈',
    title: '问题受理',
    content: '您好，感谢您的反馈。我们已收到您描述的问题，将尽快核实处理。请您提供清晰的问题照片及义齿编号，以便我们快速定位原因并给出解决方案。',
  },
  {
    id: 't20',
    category: '质量反馈',
    title: '质量保证',
    content: '您好，我们对产品质量负责。如确认属于制作问题，我们将免费重新制作并承担来回运费。请您将问题义齿寄回，我们会尽快为您处理。',
  },

  // ========== 售后跟进类 ==========
  {
    id: 't21',
    category: '售后跟进',
    title: '使用回访',
    content: '您好，打扰一下，我是XX加工中心的客服。请问您近期制作的义齿使用情况如何？佩戴是否舒适？有无其他问题需要协助处理？',
  },
  {
    id: 't22',
    category: '售后跟进',
    title: '满意度调查',
    content: '您好，感谢您一直以来的支持！请您对本次服务进行评价（满意/一般/不满意），您的意见是我们改进的动力。如有任何建议，欢迎随时告知！',
  },

  // ========== 日常沟通类 ==========
  {
    id: 't23',
    category: '日常沟通',
    title: '节日问候',
    content: '您好，XX节将至，祝您XX节快乐！感谢您一直以来的信任与支持，我们将继续为您提供优质的服务。如有任何需要，请随时联系我们！',
  },
  {
    id: 't24',
    category: '日常沟通',
    title: '新品推荐',
    content: '您好，为您推荐我们的新品——XX。该产品采用XX技术，具有XX优势，特别适合XX病例。如有需要，可联系客服了解详情或申请试用。',
  },
  {
    id: 't25',
    category: '日常沟通',
    title: '感谢合作',
    content: '您好，感谢您长期以来的支持与信任！我们将继续努力，为您提供更优质的产品和服务。如有任何建议或需求，请随时告知，期待与您合作愉快！',
  },
];

// 风格配置
const POLISH_STYLES: { key: PolishStyle; label: string; icon: string; desc: string }[] = [
  { key: 'professional', label: '专业', icon: 'briefcase', desc: '严谨专业' },
  { key: 'friendly', label: '亲切', icon: 'heart', desc: '温和友好' },
  { key: 'concise', label: '简洁', icon: 'flash', desc: '简明扼要' },
];

const COLORS = {
  primary: '#6C63FF',
  primaryLight: 'rgba(108,99,255,0.12)',
  background: '#F0F0F3',
  surface: '#FFFFFF',
  textPrimary: '#2D3436',
  textSecondary: '#636E72',
  textPlaceholder: '#B2BEC3',
  success: '#00B894',
  recording: '#FF6584',
  shadowDark: '#D1D9E6',
  inset: '#E8E8EB',
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [inputText, setInputText] = useState('');
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [resultText, setResultText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  
  // 新增功能状态
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [showPolishModal, setShowPolishModal] = useState(false);
  const [polishHint, setPolishHint] = useState('');
  const [imagePreviewUri, setImagePreviewUri] = useState<string | null>(null);
  const [copiedAnimation] = useState(new Animated.Value(0));
  const [selectedStyle, setSelectedStyle] = useState<PolishStyle>('professional'); // 默认专业风格
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  
  // 获取所有分类
  const categories = ['全部', ...Array.from(new Set(TEMPLATE_LIBRARY.map(t => t.category)))];

  const sseRef = useRef<RNSSE | null>(null);
  const resultTextRef = useRef('');

  // 复制成功动画
  const triggerCopyAnimation = () => {
    Animated.sequence([
      Animated.timing(copiedAnimation, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(copiedAnimation, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // 加载历史记录
  const loadHistory = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        setHistoryList(JSON.parse(stored));
      }
    } catch (error) {
      console.error('加载历史记录失败:', error);
    }
  }, []);

  // 保存历史记录
  const saveHistory = async (item: Omit<HistoryItem, 'id' | 'timestamp'>) => {
    try {
      const newItem: HistoryItem = {
        ...item,
        id: Date.now().toString(),
        timestamp: Date.now(),
      };
      const updatedList = [newItem, ...historyList].slice(0, 50);
      setHistoryList(updatedList);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
    } catch (error) {
      console.error('保存历史记录失败:', error);
    }
  };

  // 删除单条历史记录
  const deleteHistoryItem = async (id: string) => {
    try {
      const updatedList = historyList.filter(item => item.id !== id);
      setHistoryList(updatedList);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
    } catch (error) {
      console.error('删除历史记录失败:', error);
    }
  };

  // 清空历史记录
  const clearHistory = async () => {
    Alert.alert(
      '确认清空',
      '确定要清空所有历史记录吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清空',
          style: 'destructive',
          onPress: async () => {
            try {
              setHistoryList([]);
              await AsyncStorage.removeItem(STORAGE_KEY);
              Toast.show({
                type: 'success',
                text1: '已清空',
                text2: '历史记录已清空',
              });
            } catch (error) {
              console.error('清空历史记录失败:', error);
            }
          },
        },
      ]
    );
  };

  // 从历史记录恢复
  const restoreFromHistory = (item: HistoryItem) => {
    setInputText(item.inputText);
    setImageUris(item.inputImageUri ? [item.inputImageUri] : []);
    setResultText(item.resultText);
    setShowHistory(false);
    Toast.show({
      type: 'info',
      text1: '已恢复',
      text2: '历史记录已恢复到输入框',
    });
  };

  // 重新润色（从历史记录）
  const rePolishFromHistory = (item: HistoryItem) => {
    setInputText(item.inputText);
    setImageUris(item.inputImageUri ? [item.inputImageUri] : []);
    setResultText('');
    resultTextRef.current = '';
    setShowHistory(false);
    // 显示补充说明弹窗
    setPolishHint('');
    setShowPolishModal(true);
  };

  // 云端同步
    useEffect(() => {
      const syncFromCloud = async () => {
        try {
          const deviceId = await AsyncStorage.getItem('device_id');
          if (deviceId) {
            const response = await fetch(`${API_BASE_URL}/api/v1/records?device_id=${deviceId}`);
            if (response.ok) {
              const data = await response.json();
              if (data.records && data.records.length > 0) {
                const cloudHistory = data.records.map((r: any) => ({
                  id: r.id,
                  inputText: r.input_text,
                  polishedText: r.polished_text,
                  style: r.style,
                  inputImageUri: r.image_url,
                  createdAt: r.created_at,
                }));
                // 合并云端和本地数据
                const merged = [...cloudHistory];
                for (const local of historyList) {
                  if (!merged.find(r => r.id === local.id)) {
                    merged.push(local);
                  }
                }
                // 按时间排序
                merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                setHistoryList(merged.slice(0, 50));
                await AsyncStorage.setItem('history', JSON.stringify(merged.slice(0, 50)));
              }
            }
          }
        } catch (error) {
          console.log('云端同步失败:', error);
        }
      };
      syncFromCloud();
    }, []);

    // 初始化加载历史
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // 清理 SSE 连接
  useEffect(() => {
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
      }
    };
  }, []);

  // 选择图片
  const pickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('需要权限', '请授权访问相册');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false, // 关闭裁剪，由用户自行选择多张
        quality: 0.8,
        allowsMultipleSelection: true, // 支持多选
      });

      if (!result.canceled && result.assets.length > 0) {
        const newUris = result.assets.map(asset => asset.uri);
        setImageUris(prev => [...prev, ...newUris].slice(0, 5)); // 最多5张
      }
    } catch (error) {
      console.error('选择图片失败:', error);
      Alert.alert('错误', '选择图片失败，请重试');
    }
  };

  // 拍照
  const takePhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('需要权限', '请授权使用相机');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false, // 关闭裁剪
        quality: 0.8,
      });
    
      if (!result.canceled && result.assets[0]) {
        setImageUris(prev => [...prev, result.assets[0].uri].slice(0, 5));
      }
    } catch (error) {
      console.error('拍照失败:', error);
      Alert.alert('错误', '拍照失败，请重试');
    }
  };

  // 删除单张图片
  const removeImage = (uri: string) => {
    setImageUris(prev => prev.filter(u => u !== uri));
  };

  // 清空所有图片
  const clearAllImages = () => {
    setImageUris([]);
  };

  // AI润色处理 - 使用 SSE 流式
  const handlePolish = async (additionalHint?: string) => {
    if (!inputText.trim() && imageUris.length === 0) {
      Alert.alert('提示', '请输入文字或上传截图');
      return;
    }

    // 关闭之前的连接
    if (sseRef.current) {
      sseRef.current.close();
    }

    try {
      setIsProcessing(true);
      setResultText('');
      resultTextRef.current = '';

      // 如果有图片，先上传获取URL
      let imageUrls: string[] = [];
      if (imageUris.length > 0) {
        setIsUploading(true);
        for (const uri of imageUris) {
          const formData = new FormData();
          const fileName = uri.split('/').pop() || 'image.jpg';
          const file = await createFormDataFile(uri, fileName, 'image/jpeg');
          formData.append('file', file as any);

          const uploadResponse = await fetch(`${API_BASE_URL}/api/v1/upload`, {
            method: 'POST',
            body: formData,
          });

          if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json();
            imageUrls.push(uploadData.url);
          }
        }
        setIsUploading(false);
      }

      // 准备提示词
      let promptHint = '';
      if (additionalHint && additionalHint.trim()) {
        promptHint = `\n\n【补充说明】用户补充：${additionalHint.trim()}。请结合此补充要求重新润色。`;
      }

      // 使用 SSE 流式请求
      const sse = new RNSSE(`${API_BASE_URL}/api/v1/polish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: inputText + promptHint,
          imageUrls: imageUrls,
          style: selectedStyle, // 传递风格参数
        }),
      });

      sseRef.current = sse;

      sse.addEventListener('message', (event) => {
        if (event.data === '[DONE]') {
          setResultText(resultTextRef.current);
          // 保存到历史记录
          saveHistory({
            inputText: inputText,
            inputImageUri: imageUris[0] || null, // 只保存第一张作为封面
            resultText: resultTextRef.current,
            style: selectedStyle, // 保存风格
          });
          sse.close();
        } else if (event.data) {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.content) {
              resultTextRef.current += parsed.content;
              setResultText(resultTextRef.current);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      });

      sse.addEventListener('error', (error) => {
        console.error('SSE错误:', error);
        setIsProcessing(false);
        Alert.alert('错误', '润色处理失败，请重试');
      });

      sse.addEventListener('close', () => {
        setIsProcessing(false);
      });

    } catch (error) {
      console.error('润色失败:', error);
      Alert.alert('错误', '润色处理失败，请重试');
      setIsProcessing(false);
      setIsUploading(false);
    }
  };

  // 复制结果
  const copyResult = async () => {
    if (!resultText.trim()) {
      Alert.alert('提示', '没有可复制的内容');
      return;
    }

    try {
      await Clipboard.setStringAsync(resultText);
      triggerCopyAnimation();
      Toast.show({
        type: 'success',
        text1: '已复制 ✓',
        text2: '润色结果已复制到剪贴板',
      });
    } catch (error) {
      Alert.alert('错误', '复制失败');
    }
  };

  // 分享结果
  const shareResult = async () => {
    if (!resultText.trim()) {
      Alert.alert('提示', '没有可分享的内容');
      return;
    }

    try {
      // 先复制到剪贴板
      await Clipboard.setStringAsync(resultText);
      
      // 使用系统分享（支持微信）
      const shareResult = await Share.share({
        message: resultText,
        title: '艾尔法客服助手',
      });

      if (shareResult.action === Share.sharedAction) {
        // 分享成功
      } else if (shareResult.action === Share.dismissedAction) {
        // 用户取消分享，但内容已复制
      }
    } catch (error) {
      // 如果分享失败，确保剪贴板有内容
      await Clipboard.setStringAsync(resultText);
      Toast.show({
        type: 'success',
        text1: '已复制',
        text2: '内容已复制到剪贴板',
      });
    }
  };

  // 重新开始
  const resetPolish = () => {
    if (sseRef.current) {
      sseRef.current.close();
    }
    setInputText('');
    setImageUris([]);
    setResultText('');
    resultTextRef.current = '';
  };

  // 插入快捷短语模板
  const insertTemplate = (template: TemplateItem) => {
    setInputText(prev => prev ? `${prev}\n\n【${template.title}】\n${template.content}` : `【${template.title}】\n${template.content}`);
    setShowTemplateLibrary(false);
    Toast.show({
      type: 'success',
      text1: '已插入模板',
      text2: template.title,
    });
  };

  // 过滤模板列表
  const filteredTemplates = selectedCategory === '全部' 
    ? TEMPLATE_LIBRARY 
    : TEMPLATE_LIBRARY.filter(t => t.category === selectedCategory);

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // 渲染历史记录列表
  const renderHistoryList = () => (
    <View style={styles.historyPanel}>
      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>历史记录</Text>
        <View style={styles.historyActions}>
          {historyList.length > 0 && (
            <TouchableOpacity onPress={clearHistory} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>清空</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setShowHistory(false)} style={styles.closeButton}>
            <Ionicons name="close" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
      
      {historyList.length === 0 ? (
        <View style={styles.emptyHistory}>
          <Ionicons name="document-text-outline" size={48} color={COLORS.textPlaceholder} />
          <Text style={styles.emptyHistoryText}>暂无历史记录</Text>
        </View>
      ) : (
        <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false}>
          {historyList.map((item) => {
            const isExpanded = expandedHistoryId === item.id;
            return (
              <View key={item.id} style={styles.historyItem}>
                <View style={styles.historyItemHeader}>
                  <Text style={styles.historyTime}>{formatTime(item.timestamp)}</Text>
                  <TouchableOpacity
                    onPress={() => deleteHistoryItem(item.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="trash-outline" size={18} color={COLORS.textPlaceholder} />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.historyContent}>
                  {/* 输入图片 */}
                  {item.inputImageUri && (
                    <TouchableOpacity onPress={() => setImagePreviewUri(item.inputImageUri)}>
                      <Image source={{ uri: item.inputImageUri }} style={styles.historyThumb} />
                    </TouchableOpacity>
                  )}
                  
                  {/* 输入文字 - 可展开 */}
                  <TouchableOpacity 
                    style={styles.historyInputContainer}
                    onPress={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                  >
                    <Text style={styles.historyInput} numberOfLines={isExpanded ? undefined : 2}>
                      {item.inputText || '仅图片输入'}
                    </Text>
                    {item.inputText && item.inputText.length > 50 && (
                      <Text style={styles.expandHint}>
                        {isExpanded ? '收起' : '展开'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
                
                <View style={styles.historyDivider}>
                  <View style={styles.historyDividerLine} />
                  <Ionicons name="arrow-down" size={14} color={COLORS.primary} />
                  <View style={styles.historyDividerLine} />
                </View>
                
                {/* 润色结果 - 可展开 */}
                <TouchableOpacity 
                  style={styles.historyResult} 
                  onPress={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                >
                  <Text style={styles.historyResultText} numberOfLines={isExpanded ? undefined : 3}>
                    {item.resultText}
                  </Text>
                  {item.resultText.length > 60 && (
                    <Text style={styles.expandHint}>
                      {isExpanded ? '收起' : '展开'}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* 操作按钮 */}
                <View style={styles.historyActions2}>
                  <TouchableOpacity 
                    style={styles.historyActionBtn}
                    onPress={() => restoreFromHistory(item)}
                  >
                    <Ionicons name="arrow-undo-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.historyActionText}>恢复</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.historyActionBtn}
                    onPress={() => rePolishFromHistory(item)}
                  >
                    <Ionicons name="refresh-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.historyActionText}>重新润色</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 120,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero Header */}
        <View style={styles.heroSection}>
          <View style={styles.heroIconContainer}>
            <Ionicons name="chatbubbles" size={32} color={COLORS.primary} />
          </View>
          <Text style={styles.heroTitle}>艾尔法客服助手</Text>
          <Text style={styles.heroSubtitle}>义齿加工技术支持 · 专业回复生成</Text>
        </View>

        {/* 历史记录切换按钮 */}
        <TouchableOpacity
          style={styles.historyToggle}
          onPress={() => setShowHistory(!showHistory)}
        >
          <Ionicons name="time-outline" size={18} color={COLORS.primary} />
          <Text style={styles.historyToggleText}>
            {showHistory ? '返回编辑' : `历史记录 (${historyList.length})`}
          </Text>
        </TouchableOpacity>

        {/* 历史记录面板 */}
        {showHistory ? (
          renderHistoryList()
        ) : (
          <>
            {/* 输入区域 */}
            <View style={styles.inputCard}>
              <Text style={styles.sectionTitle}>客户问题 / 原始草稿</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.textInput}
                  placeholder="输入客户问题、对话截图的文字内容，或您想润色的原始回复草稿...\n\n提示：可使用手机自带输入法的语音输入功能"
                  placeholderTextColor={COLORS.textPlaceholder}
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              {/* 操作按钮行 */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={pickImage}
                  disabled={isUploading || isProcessing}
                >
                  <Ionicons name="image-outline" size={22} color={COLORS.primary} />
                  <Text style={styles.actionButtonText}>上传截图</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={takePhoto}
                  disabled={isUploading || isProcessing}
                >
                  <Ionicons name="camera-outline" size={22} color={COLORS.primary} />
                  <Text style={styles.actionButtonText}>拍照</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.templateButton]}
                  onPress={() => setShowTemplateLibrary(true)}
                >
                  <Ionicons name="document-text-outline" size={22} color={COLORS.primary} />
                  <Text style={styles.actionButtonText}>快捷短语</Text>
                </TouchableOpacity>
              </View>

              {/* 图片预览 - 支持多张 */}
              {imageUris.length > 0 && (
                <View style={styles.imagePreviewContainer}>
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.imageScrollContent}
                  >
                    {imageUris.map((uri, index) => (
                      <TouchableOpacity 
                        key={uri}
                        style={styles.imagePreviewWrapper}
                        onPress={() => setImagePreviewUri(uri)}
                      >
                        <Image source={{ uri }} style={styles.imagePreview} />
                        <View style={styles.imagePreviewOverlay}>
                          <Ionicons name="expand-outline" size={16} color="#FFFFFF" />
                        </View>
                        <View style={styles.imageIndexBadge}>
                          <Text style={styles.imageIndexText}>{index + 1}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.removeImageButton}
                          onPress={() => removeImage(uri)}
                        >
                          <Ionicons name="close-circle" size={24} color={COLORS.recording} />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                    {imageUris.length < 5 && (
                      <TouchableOpacity 
                        style={styles.addMoreImage}
                        onPress={pickImage}
                      >
                        <Ionicons name="add" size={32} color={COLORS.primary} />
                        <Text style={styles.addMoreText}>添加</Text>
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                  {imageUris.length > 0 && (
                    <TouchableOpacity 
                      style={styles.clearAllButton}
                      onPress={clearAllImages}
                    >
                      <Text style={styles.clearAllText}>清空全部</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            {/* 风格选择 */}
            {!resultText && (
              <View style={styles.styleSelector}>
                <Text style={styles.styleLabel}>选择风格</Text>
                <View style={styles.styleOptions}>
                  {POLISH_STYLES.map((style) => (
                    <TouchableOpacity
                      key={style.key}
                      style={[
                        styles.styleOption,
                        selectedStyle === style.key && styles.styleOptionActive,
                      ]}
                      onPress={() => setSelectedStyle(style.key)}
                    >
                      <Ionicons
                        name={style.icon as any}
                        size={18}
                        color={selectedStyle === style.key ? '#FFFFFF' : COLORS.primary}
                      />
                      <Text
                        style={[
                          styles.styleOptionText,
                          selectedStyle === style.key && styles.styleOptionTextActive,
                        ]}
                      >
                        {style.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* 润色按钮 */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (isProcessing || isUploading) && styles.primaryButtonDisabled,
              ]}
              onPress={() => {
                if (resultText) {
                  // 已有结果，显示补充说明弹窗
                  setPolishHint('');
                  setShowPolishModal(true);
                } else {
                  // 直接润色
                  handlePolish();
                }
              }}
              disabled={isProcessing || isUploading}
            >
              {isUploading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : isProcessing ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={20} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>
                    {resultText ? '补充说明并重新润色' : (imageUris.length > 0 ? `${POLISH_STYLES.find(s => s.key === selectedStyle)?.label}润色 (${imageUris.length}张)` : `${POLISH_STYLES.find(s => s.key === selectedStyle)?.label}润色`)}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {isUploading && (
              <Text style={styles.uploadingText}>正在上传图片...</Text>
            )}
            {isProcessing && (
              <Text style={styles.uploadingText}>正在生成专业回复...</Text>
            )}

            {/* 结果展示区 */}
            {(resultText || isProcessing) && (
              <View style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <Text style={styles.sectionTitle}>润色结果</Text>
                  {resultText && (
                    <View style={styles.resultActions}>
                      <Animated.View style={{ transform: [{ scale: copiedAnimation.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }] }}>
                        <TouchableOpacity
                          style={styles.resultActionButton}
                          onPress={copyResult}
                        >
                          <Ionicons name="copy-outline" size={18} color={COLORS.primary} />
                          <Text style={styles.resultActionText}>复制</Text>
                        </TouchableOpacity>
                      </Animated.View>
                      <TouchableOpacity
                        style={styles.resultActionButton}
                        onPress={shareResult}
                      >
                        <Ionicons name="share-outline" size={18} color={COLORS.primary} />
                        <Text style={styles.resultActionText}>分享</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                <View style={styles.resultContainer}>
                  {isProcessing && !resultText ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator color={COLORS.primary} size="small" />
                      <Text style={styles.loadingText}>正在润色处理...</Text>
                    </View>
                  ) : (
                    <Text style={styles.resultText}>{resultText}</Text>
                  )}
                </View>
              </View>
            )}


          </>
        )}
      </ScrollView>

      {/* 补充说明弹窗 */}
      <Modal
        visible={showPolishModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPolishModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowPolishModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>补充说明</Text>
                  <TouchableOpacity onPress={() => setShowPolishModal(false)}>
                    <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalSubtitle}>
                  添加补充要求，让AI重新润色（如：语气更正式/更简洁/强调某一点）
                </Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="例如：语气更委婉一些，或加上具体时间"
                  placeholderTextColor={COLORS.textPlaceholder}
                  value={polishHint}
                  onChangeText={setPolishHint}
                  multiline
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity 
                    style={styles.modalCancelBtn}
                    onPress={() => setShowPolishModal(false)}
                  >
                    <Text style={styles.modalCancelText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.modalConfirmBtn}
                    onPress={() => {
                      setShowPolishModal(false);
                      handlePolish(polishHint);
                    }}
                  >
                    <Text style={styles.modalConfirmText}>开始润色</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* 图片预览弹窗 */}
      <Modal
        visible={!!imagePreviewUri}
        transparent
        animationType="fade"
        onRequestClose={() => setImagePreviewUri(null)}
      >
        <TouchableOpacity 
          style={styles.imagePreviewModal}
          activeOpacity={1}
          onPress={() => setImagePreviewUri(null)}
        >
          <View style={styles.imagePreviewContainer2}>
            {imagePreviewUri && (
              <Image 
                source={{ uri: imagePreviewUri }} 
                style={styles.previewImage}
                resizeMode="contain"
              />
            )}
            <TouchableOpacity 
              style={styles.previewCloseBtn}
              onPress={() => setImagePreviewUri(null)}
            >
              <Ionicons name="close-circle" size={32} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 快捷短语库弹窗 */}
      <Modal
        visible={showTemplateLibrary}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTemplateLibrary(false)}
      >
        <View style={styles.templateModalOverlay}>
          <View style={styles.templateModalContent}>
            <View style={styles.templateModalHeader}>
              <View>
                <Text style={styles.templateModalTitle}>快捷短语库</Text>
                <Text style={styles.templateModalSubtitle}>口腔义齿行业常用沟通模板</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTemplateLibrary(false)}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* 分类筛选 */}
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.templateCategoryScroll}
              contentContainerStyle={styles.templateCategoryContent}
            >
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.templateCategoryItem,
                    selectedCategory === cat && styles.templateCategoryItemActive,
                  ]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text style={[
                    styles.templateCategoryText,
                    selectedCategory === cat && styles.templateCategoryTextActive,
                  ]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* 模板列表 */}
            <ScrollView 
              style={styles.templateList}
              showsVerticalScrollIndicator={false}
            >
              {filteredTemplates.map((template) => (
                <TouchableOpacity
                  key={template.id}
                  style={styles.templateItem}
                  onPress={() => insertTemplate(template)}
                >
                  <View style={styles.templateItemHeader}>
                    <View style={styles.templateCategoryBadge}>
                      <Text style={styles.templateCategoryBadgeText}>{template.category}</Text>
                    </View>
                    <Text style={styles.templateItemTitle}>{template.title}</Text>
                  </View>
                  <Text style={styles.templateItemContent} numberOfLines={3}>
                    {template.content}
                  </Text>
                  <View style={styles.templateItemFooter}>
                    <Text style={styles.templateInsertHint}>点击插入到输入框</Text>
                    <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// 需要添加 TouchableWithoutFeedback 导入
import { TouchableWithoutFeedback } from 'react-native';

const styles = StyleSheet.create({
  // Hero Section
  heroSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  heroIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },

  // 历史记录切换按钮
  historyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryLight,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 8,
    alignSelf: 'center',
  },
  historyToggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.primary,
  },

  // 历史记录面板
  historyPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 20,
    minHeight: 400,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  historyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearButtonText: {
    fontSize: 14,
    color: COLORS.recording,
    fontWeight: '500',
  },
  closeButton: {
    padding: 4,
  },
  emptyHistory: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyHistoryText: {
    fontSize: 14,
    color: COLORS.textPlaceholder,
    marginTop: 12,
  },
  historyList: {
    flex: 1,
  },
  historyItem: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  historyItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  historyTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  historyContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  historyThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
  },
  historyInputContainer: {
    flex: 1,
  },
  historyInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  expandHint: {
    fontSize: 12,
    color: COLORS.primary,
    marginTop: 4,
  },
  historyDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
    gap: 8,
  },
  historyDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.primaryLight,
  },
  historyResult: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
  },
  historyResultText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  historyActions2: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.primaryLight,
  },
  historyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyActionText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '500',
  },

  // 输入卡片
  inputCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: COLORS.shadowDark,
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  inputContainer: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 16,
    minHeight: 120,
  },
  textInput: {
    fontSize: 16,
    color: COLORS.textPrimary,
    lineHeight: 24,
    minHeight: 100,
  },

  // 操作按钮行
  actionRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryLight,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.primary,
  },

  // 图片预览
  imagePreviewContainer: {
    marginTop: 16,
    position: 'relative',
  },
  imageScrollContent: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 16,
  },
  imagePreviewWrapper: {
    position: 'relative',
  },
  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: COLORS.background,
  },
  imagePreviewOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    padding: 4,
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
  },
  imageIndexBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageIndexText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  addMoreImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMoreText: {
    color: COLORS.primary,
    fontSize: 12,
    marginTop: 4,
  },
  clearAllButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  clearAllText: {
    color: COLORS.primary,
    fontSize: 12,
  },

  // 风格选择器
  styleSelector: {
    marginBottom: 12,
  },
  styleLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 8,
    fontWeight: '500',
  },
  styleOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  styleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  styleOptionActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  styleOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.primary,
  },
  styleOptionTextActive: {
    color: '#FFFFFF',
  },

  // 主按钮
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 12,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  uploadingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
  },

  // 结果卡片
  resultCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 20,
    marginTop: 8,
    shadowColor: COLORS.shadowDark,
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultActions: {
    flexDirection: 'row',
    gap: 16,
  },
  resultActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resultActionText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },
  resultContainer: {
    minHeight: 80,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  resultText: {
    fontSize: 15,
    color: COLORS.textPrimary,
    lineHeight: 26,
  },

  // 重新开始按钮
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 8,
  },
  resetButtonText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },

  // 弹窗样式
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: COLORS.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  modalCancelText: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  modalConfirmBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  modalConfirmText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // 图片预览弹窗
  imagePreviewModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreviewContainer2: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: '80%',
  },
  previewCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
  },

  // 快捷短语库样式
  templateButton: {
    backgroundColor: 'rgba(0,184,148,0.12)',
  },
  templateModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  templateModalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 34,
  },
  templateModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.background,
  },
  templateModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  templateModalSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  templateCategoryScroll: {
    maxHeight: 50,
  },
  templateCategoryContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexDirection: 'row',
  },
  templateCategoryItem: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    marginRight: 8,
  },
  templateCategoryItemActive: {
    backgroundColor: COLORS.primary,
  },
  templateCategoryText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  templateCategoryTextActive: {
    color: '#FFFFFF',
  },
  templateList: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  templateItem: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  templateItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  templateCategoryBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  templateCategoryBadgeText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
  },
  templateItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  templateItemContent: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  templateItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.surface,
  },
  templateInsertHint: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '500',
  },
});
