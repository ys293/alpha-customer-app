import React, { useState, useRef, useCallback } from 'react';
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
  style: string;
  timestamp: number;
}

// 润色风格类型（只保留亲切和简洁）
type PolishStyle = 'friendly' | 'concise';

// 风格配置（只保留亲切和简洁）
const POLISH_STYLES: { key: PolishStyle; label: string; icon: string; desc: string }[] = [
  { key: 'friendly', label: '亲切模式', icon: 'heart', desc: '温暖友好' },
  { key: 'concise', label: '简洁模式', icon: 'flash', desc: '简洁专业' },
];

// 快捷短语模板类型
interface TemplateItem {
  id: string;
  category: string;
  title: string;
  content: string;
}

// 口腔义齿行业快捷短语库
const TEMPLATE_LIBRARY: TemplateItem[] = [
  // 一、资料/物料缺失，无法排产
  { id: 't1', category: '物料缺失', title: '缺种植品牌/材料', content: 'XX 医生您好，XXX 患者此订单缺少【种植品牌系统/加工产品/加工材料/制作颜色/比色照/】，暂时无法安排生产。麻烦您补充相关资料信息，收到后我们第一时间排单，辛苦啦！' },
  { id: 't2', category: '物料缺失', title: '缺转移杆/咬合记录', content: 'XX 医生您好，XXX 患者此订单缺少【种植转移杆/咬合记录/】，暂时无法安排生产。麻烦您这边安排一下，收到后我们第一时间排单，辛苦啦！' },

  // 二、订单加急告知
  { id: 't3', category: '加急告知', title: '加急订单确认', content: 'XX 医生您好，收到您的加急需求，该订单我们已安排加急制作，预计 XX 时间可以交付。若出现特殊状况，我会及时告知您。' },

  // 三、订单特殊工艺/备注要求确认
  { id: 't4', category: '工艺确认', title: '特殊工艺确认', content: 'XX 医生您好，加工单备注要求【颈缘多延伸/切端通透/发设计图/上颌架后拍照/车瓷完成后拍照】，我们按此要求制作，您看是否还有其他补充要求？' },

  // 四、常规订单进度同步
  { id: 't5', category: '进度同步', title: '正常生产告知', content: 'XX 医生您好，查询了 XXX 患者的订单目前制作顺利，会按原定日期准时交货，请您安心。如遇突发情况，我会第一时间提前和您沟通。' },
  { id: 't6', category: '进度同步', title: '质检发货通知', content: 'XX 医生您好，同步下 XXX 患者订单进度：目前已完成制作，正在最终质检，稍后安排打包发货，快递单号/配送信息打包完成后将会发给您。' },

  // 五、货品已发货/配送通知
  { id: 't7', category: '发货通知', title: '发货/同城配送', content: 'XX 医生您好，您的货品已发出，快递单号：XXX，物流可自行查询；同城配送预计 XX 时间送达门诊，请注意查收。' },

  // 六、工期延后告知
  { id: 't8', category: '延期告知', title: '工艺/排单延期', content: 'XX 医生您好，跟您致歉，因【工艺复杂/原料调配/批量排单】原因，XXX 患者订单预计延迟至 XX 时间交付，给您带来不便非常抱歉，我们会加急赶工。' },
  { id: 't9', category: '延期告知', title: '质检不达标返工', content: 'XX 医生您好，非常抱歉。XXX 患者订单在【工序质检/最终终检】时发现细节问题，未达到出货标准，现已退回重新修整制作，今日无法交付，预计 XX 时间完成。我们会严格把控品质，还请您谅解。' },
  { id: 't10', category: '延期告知', title: '沟通耗时延期', content: 'XX 医生您好，非常抱歉。XXX 患者订单前期与临床制作沟通对接，占用了部分工时，导致订单进度延后，今日暂无法出货，预计 XX 时间交付，望您理解。' },
  { id: 't11', category: '延期告知', title: '工艺复杂延期', content: 'XX 医生您好，实在抱歉。XXX 患者订单因【加工要求特殊/加工项目复杂/多生产线制作】，制作耗时超出预期，今日无法交付，预计 XX 时间完成，还请您谅解。' },
  { id: 't12', category: '延期告知', title: '美学要求延期', content: 'XX 医生您好，非常抱歉。XXX 患者此订单【个性化制作要求较高/形态颜色美观要求高】技师需要反复打磨细节、多次微调，因此进度有所延后，今日无法交付，预计 XX 时间我们会完成出货。' },
  { id: 't13', category: '延期告知', title: '全厂质量复检', content: 'XX 医生您好，实在抱歉。车间近期对整批产品开展全面质量复检，该订单进度随之顺延，今日无法交付，预计 XX 时间完成，敬请包涵。' },

  // 七、模型/基牙异常
  { id: 't14', category: '模型异常', title: '咬合空间不足', content: 'XX 医生您好，制作 XXX 患者义齿时，发现模型基牙咬合空间不足，达不到对应材料的最小厚度要求，无法直接加工。想跟您确认：是在模型上修整基牙/对颌牙并做好标记，还是麻烦您重新备牙取模？' },
  { id: 't15', category: '模型异常', title: '邻牙存在倒凹', content: 'XX 医生您好，在制作 XXX 患者义齿时，发现模型存在邻牙倒凹，直接制作将会出现无法就位或邻接无接触等问题，无法直接加工制作。想跟您确认：是在模型上修整邻牙并作好标记，还是麻烦您重新备牙取模呢？' },
  { id: 't16', category: '模型异常', title: '少量倒凹处理', content: 'XX 医生您好，打扰您。XXX 患者的模型基牙存在少量倒凹，直接制作会引发义齿边缘不密合、飘空等情况，影响使用效果，所以不建议直接加工。若直接加工，易造成义齿边缘不密合、出现间隙飘空，因此不建议直接制作。想和您沟通处理方式：1.我们可修除模型倒凹并做标记，供您口内参照预备；2.也可直接填补倒凹制作；3.或是辛苦您重新备牙取模，您看哪种更合适？' },
  { id: 't17', category: '模型异常', title: '桥体倒凹处理', content: 'XX 医生您好，打扰您了。XXX 患者的模型桥体存在倒凹，暂无共同就位道，倒凹集中在（）区域。直接制作容易出现义齿就位不畅、边缘不密合、飘空等问题，故而不建议直接做至。想和您沟通下，是我们修整模型去除倒凹并做好标记再加工，还是辛苦您重新备牙取模呢？' },
  { id: 't18', category: '模型异常', title: '邻面形态异常', content: 'XX 医生您好，打扰您。XXX 患者模型邻面形态异常（见附图），系印模/口扫误差造成。直接加工易引发就位不畅、邻面接触异常，特此提醒。请您先确认：口内情况是否与模型一致？如一致，无其他要求我们按照现模型制作。若不一致，可选方案：1.我方刮除模型异常区域并标记，后续正常制作；2.重新约患者检查、再次取模。您看哪种更合适？' },

  // 八、咬合记录异常/缺失
  { id: 't19', category: '咬合记录', title: '缺咬合记录', content: 'XX 医生您好，打扰您了。制作 XXX 患者义齿时，发现模型咬合存在异常，随件也未附带咬合记录，目前无法正常上架制作。为保证咬合精度与成品效果，麻烦您抽空安排患者重新采集咬合记录。辛苦您了，收到消息还请抽空告知我一下，谢谢！' },
  { id: 't20', category: '咬合记录', title: '咬合精度不足', content: 'XX 医生您好，打扰您了。制作 XXX 患者义齿时，发现模型咬合存在异常，结合随附的咬合记录试配后，咬合状态仍不够精准，暂时无法正常上架制作。附图/视频是依据现有咬合记录模拟的效果，麻烦您核对下和患者口内实际情况是否存在偏差。若状态一致，我们就按当前咬合继续制作；若偏差较大，为保障成品使用效果，还请您安排患者重新采集咬合记录。辛苦您了，收到消息还望抽空回复，谢谢！' },

  // 九、比色/照片问题
  { id: 't21', category: '比色问题', title: '比色无法确定', content: 'XX 医生您好，打扰您。XXX 患者的比色照片，受拍摄光线、比色板摆放角度影响，且所选色号和邻牙色差较明显，暂时无法确定制作颜色。如果您还记得匹配邻牙的准确色板，麻烦告知我们，我们将按您的要求制作；若记忆不清，为保证最终色泽效果，还请您安排患者重新比色。辛苦您了，收到消息还请抽空回复，谢谢！' },
];

// 底部导航配置
const TAB_ITEMS = [
  { key: 'polish', label: '润色', icon: 'create-outline' },
  { key: 'history', label: '历史', icon: 'time-outline' },
  { key: 'templates', label: '话术库', icon: 'document-text-outline' },
  { key: 'knowledge', label: '知识库', icon: 'chatbubbles-outline' },
  { key: 'profile', label: '我的', icon: 'person-outline' },
];

const COLORS = {
  primary: '#4A6CF7',
  primaryLight: 'rgba(74,108,247,0.1)',
  background: '#F5F6FA',
  surface: '#FFFFFF',
  textPrimary: '#1A1D26',
  textSecondary: '#6B7280',
  textPlaceholder: '#9CA3AF',
  success: '#10B981',
  border: '#E5E7EB',
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('polish');
  const [inputText, setInputText] = useState('');
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [resultText, setResultText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [imagePreviewUri, setImagePreviewUri] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<PolishStyle>('friendly');
  const [selectedCategory, setSelectedCategory] = useState('全部');

  const sseRef = useRef<RNSSE | null>(null);
  const resultTextRef = useRef('');

  // 获取所有分类
  const categories = ['全部', ...Array.from(new Set(TEMPLATE_LIBRARY.map(t => t.category)))];
  const filteredTemplates = selectedCategory === '全部' 
    ? TEMPLATE_LIBRARY 
    : TEMPLATE_LIBRARY.filter(t => t.category === selectedCategory);

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

  // 初始化加载历史
  React.useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // 清理 SSE 连接
  React.useEffect(() => {
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
      }
    };
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

  // 删除历史记录
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
    Alert.alert('确认清空', '确定要清空所有历史记录吗？', [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: async () => {
        try {
          setHistoryList([]);
          await AsyncStorage.removeItem(STORAGE_KEY);
          Toast.show({ type: 'success', text1: '已清空', text2: '历史记录已清空' });
        } catch (error) {
          console.error('清空历史记录失败:', error);
        }
      }},
    ]);
  };

  // 恢复历史记录
  const restoreFromHistory = (item: HistoryItem) => {
    setInputText(item.inputText);
    setImageUris(item.inputImageUri ? [item.inputImageUri] : []);
    setResultText(item.resultText);
    setActiveTab('polish');
    Toast.show({ type: 'info', text1: '已恢复', text2: '历史记录已恢复到输入框' });
  };

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
        allowsEditing: false,
        quality: 0.8,
        allowsMultipleSelection: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        const newUris = result.assets.map(asset => asset.uri);
        setImageUris(prev => [...prev, ...newUris].slice(0, 5));
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
        allowsEditing: false,
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

  // AI润色处理
  const handlePolish = async () => {
    if (!inputText.trim() && imageUris.length === 0) {
      Alert.alert('提示', '请输入文字或上传截图');
      return;
    }

    if (sseRef.current) {
      sseRef.current.close();
    }

    try {
      setIsProcessing(true);
      setResultText('');
      resultTextRef.current = '';

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

      const sse = new RNSSE(`${API_BASE_URL}/api/v1/polish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, imageUrls, style: selectedStyle }),
      });

      sseRef.current = sse;

      sse.addEventListener('message', (event) => {
        if (event.data === '[DONE]') {
          setResultText(resultTextRef.current);
          saveHistory({
            inputText: inputText,
            inputImageUri: imageUris[0] || null,
            resultText: resultTextRef.current,
            style: selectedStyle,
          });
          sse.close();
        } else if (event.data) {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.content) {
              resultTextRef.current += parsed.content;
              setResultText(resultTextRef.current);
            }
          } catch (e) {}
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
      Toast.show({ type: 'success', text1: '已复制', text2: '润色结果已复制到剪贴板' });
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
      await Clipboard.setStringAsync(resultText);
      const shareResult = await Share.share({ message: resultText, title: '艾尔法客服助手' });
    } catch (error) {
      await Clipboard.setStringAsync(resultText);
      Toast.show({ type: 'success', text1: '已复制', text2: '内容已复制到剪贴板' });
    }
  };

  // 复制模板到剪贴板
  const copyTemplate = async (template: TemplateItem) => {
    try {
      await Clipboard.setStringAsync(template.content);
      Toast.show({ type: 'success', text1: '已复制到剪贴板', text2: template.title });
    } catch (error) {
      Alert.alert('错误', '复制失败');
    }
  };

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

  // 重新开始
  const resetPolish = () => {
    if (sseRef.current) sseRef.current.close();
    setInputText('');
    setImageUris([]);
    setResultText('');
    resultTextRef.current = '';
  };

  // ========== 渲染润色页面 ==========
  const renderPolishTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* 回复风格 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>回复风格</Text>
        <View style={styles.styleContainer}>
          {POLISH_STYLES.map((style) => (
            <TouchableOpacity
              key={style.key}
              style={[styles.styleButton, selectedStyle === style.key && styles.styleButtonActive]}
              onPress={() => setSelectedStyle(style.key)}
            >
              <Text style={[styles.styleLabel, selectedStyle === style.key && styles.styleLabelActive]}>
                {style.label}
              </Text>
              <Text style={[styles.styleDesc, selectedStyle === style.key && styles.styleDescActive]}>
                {style.desc}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 输入区域 */}
      <View style={styles.section}>
        <View style={styles.inputCard}>
          <TextInput
            style={styles.textInput}
            placeholder="请输入需要润色的咨询内容..."
            placeholderTextColor={COLORS.textPlaceholder}
            value={inputText}
            onChangeText={setInputText}
            multiline
            textAlignVertical="top"
          />
          <View style={styles.inputActions}>
            <TouchableOpacity style={styles.iconButton} onPress={pickImage}>
              <Ionicons name="image-outline" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={takePhoto}>
              <Ionicons name="camera-outline" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
            {(inputText || imageUris.length > 0) && (
              <TouchableOpacity style={styles.iconButton} onPress={() => { setInputText(''); setImageUris([]); }}>
                <Ionicons name="trash-outline" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* 图片预览 */}
      {imageUris.length > 0 && (
        <View style={styles.section}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
            {imageUris.map((uri, index) => (
              <TouchableOpacity key={uri} style={styles.imageThumb} onPress={() => setImagePreviewUri(uri)}>
                <Image source={{ uri }} style={styles.thumbImage} />
                <View style={styles.imageIndex}><Text style={styles.imageIndexText}>{index + 1}</Text></View>
                <TouchableOpacity style={styles.removeImage} onPress={() => removeImage(uri)}>
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 一键润色按钮 */}
      <TouchableOpacity
        style={[styles.primaryButton, (isProcessing || isUploading) && styles.primaryButtonDisabled]}
        onPress={handlePolish}
        disabled={isProcessing || isUploading}
      >
        {isProcessing || isUploading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <>
            <Ionicons name="sparkles" size={20} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>一键润色</Text>
          </>
        )}
      </TouchableOpacity>

      {/* 润色结果 */}
      {(resultText || isProcessing) && (
        <View style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>润色结果</Text>
            {resultText && (
              <View style={styles.resultActions}>
                <TouchableOpacity style={styles.resultActionBtn} onPress={copyResult}>
                  <Ionicons name="copy-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.resultActionText}>复制</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.resultActionBtn} onPress={shareResult}>
                  <Ionicons name="share-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.resultActionText}>分享</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          <View style={styles.resultContent}>
            {isProcessing && !resultText ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={COLORS.primary} size="small" />
                <Text style={styles.loadingText}>正在润色处理...</Text>
              </View>
            ) : (
              <Text style={styles.resultText}>{resultText}</Text>
            )}
          </View>
          <TouchableOpacity style={styles.resetButton} onPress={resetPolish}>
            <Ionicons name="refresh-outline" size={16} color={COLORS.textSecondary} />
            <Text style={styles.resetText}>重新润色</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );

  // ========== 渲染历史页面 ==========
  const renderHistoryTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>历史记录</Text>
        {historyList.length > 0 && (
          <TouchableOpacity onPress={clearHistory}>
            <Text style={styles.clearText}>清空</Text>
          </TouchableOpacity>
        )}
      </View>
      {historyList.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="time-outline" size={48} color={COLORS.textPlaceholder} />
          <Text style={styles.emptyText}>暂无历史记录</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {historyList.map((item) => {
            const isExpanded = expandedHistoryId === item.id;
            return (
              <View key={item.id} style={styles.historyItem}>
                <View style={styles.historyItemHeader}>
                  <Text style={styles.historyTime}>{formatTime(item.timestamp)}</Text>
                  <TouchableOpacity onPress={() => deleteHistoryItem(item.id)}>
                    <Ionicons name="trash-outline" size={18} color={COLORS.textPlaceholder} />
                  </TouchableOpacity>
                </View>
                <View style={styles.historyContent}>
                  {item.inputImageUri && (
                    <TouchableOpacity onPress={() => setImagePreviewUri(item.inputImageUri)}>
                      <Image source={{ uri: item.inputImageUri }} style={styles.historyThumb} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.historyInputArea} onPress={() => setExpandedHistoryId(isExpanded ? null : item.id)}>
                    <Text style={styles.historyInputText} numberOfLines={isExpanded ? undefined : 2}>
                      {item.inputText || '仅图片输入'}
                    </Text>
                    {item.inputText && item.inputText.length > 50 && (
                      <Text style={styles.expandText}>{isExpanded ? '收起' : '展开'}</Text>
                    )}
                  </TouchableOpacity>
                </View>
                <View style={styles.historyDivider}>
                  <View style={styles.dividerLine} />
                  <Ionicons name="arrow-down" size={14} color={COLORS.primary} />
                  <View style={styles.dividerLine} />
                </View>
                <TouchableOpacity style={styles.historyResultArea} onPress={() => setExpandedHistoryId(isExpanded ? null : item.id)}>
                  <Text style={styles.historyResultText} numberOfLines={isExpanded ? undefined : 3}>
                    {item.resultText}
                  </Text>
                  {item.resultText.length > 60 && (
                    <Text style={styles.expandText}>{isExpanded ? '收起' : '展开'}</Text>
                  )}
                </TouchableOpacity>
                <View style={styles.historyFooter}>
                  <TouchableOpacity style={styles.historyActionBtn} onPress={() => restoreFromHistory(item)}>
                    <Ionicons name="arrow-undo-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.historyActionText}>使用</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  // ========== 渲染话术库页面 ==========
  const renderTemplatesTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.templateHeader}>
        <Text style={styles.templateTitle}>话术库</Text>
        <Text style={styles.templateSubtitle}>口腔义齿行业常用沟通模板</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
        <View style={styles.categoryRow}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryItem, selectedCategory === cat && styles.categoryItemActive]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text style={[styles.categoryText, selectedCategory === cat && styles.categoryTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.templateList}>
        {filteredTemplates.map((template) => (
          <TouchableOpacity key={template.id} style={styles.templateItem} onPress={() => copyTemplate(template)}>
            <View style={styles.templateItemHeader}>
              <View style={styles.templateBadge}><Text style={styles.templateBadgeText}>{template.category}</Text></View>
              <Text style={styles.templateItemTitle}>{template.title}</Text>
            </View>
            <Text style={styles.templateItemContent} numberOfLines={3}>{template.content}</Text>
            <View style={styles.templateItemFooter}>
              <Text style={styles.templateInsertText}>点击复制到剪贴板</Text>
              <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  // ========== 渲染知识库页面 ==========
  const renderKnowledgeTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.knowledgeHeader}>
        <Ionicons name="book-outline" size={48} color={COLORS.primary} />
        <Text style={styles.knowledgeTitle}>口腔义齿知识库</Text>
        <Text style={styles.knowledgeSubtitle}>专业口腔修复知识指南</Text>
      </View>
      <View style={styles.knowledgeList}>
        <TouchableOpacity style={styles.knowledgeItem}>
          <Ionicons name="grid-outline" size={24} color={COLORS.primary} />
          <Text style={styles.knowledgeItemText}>备牙标准规范</Text>
          <Ionicons name="chevron-forward-outline" size={20} color={COLORS.textPlaceholder} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.knowledgeItem}>
          <Ionicons name="color-palette-outline" size={24} color={COLORS.primary} />
          <Text style={styles.knowledgeItemText}>比色技术指南</Text>
          <Ionicons name="chevron-forward-outline" size={20} color={COLORS.textPlaceholder} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.knowledgeItem}>
          <Ionicons name="layers-outline" size={24} color={COLORS.primary} />
          <Text style={styles.knowledgeItemText}>印模制取规范</Text>
          <Ionicons name="chevron-forward-outline" size={20} color={COLORS.textPlaceholder} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.knowledgeItem}>
          <Ionicons name="construct-outline" size={24} color={COLORS.primary} />
          <Text style={styles.knowledgeItemText}>常见问题解答</Text>
          <Ionicons name="chevron-forward-outline" size={20} color={COLORS.textPlaceholder} />
        </TouchableOpacity>
      </View>
      <View style={styles.knowledgeTip}>
        <Ionicons name="information-circle-outline" size={20} color={COLORS.textSecondary} />
        <Text style={styles.knowledgeTipText}>更多专业知识持续更新中...</Text>
      </View>
    </View>
  );

  // ========== 渲染我的页面 ==========
  const renderProfileTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.profileHeader}>
        <View style={styles.avatarContainer}>
          <Ionicons name="person" size={40} color={COLORS.primary} />
        </View>
        <Text style={styles.profileName}>艾尔法客服助手</Text>
        <Text style={styles.profileVersion}>v1.0.0</Text>
      </View>
      <View style={styles.profileMenu}>
        <TouchableOpacity style={styles.profileMenuItem}>
          <Ionicons name="cloud-upload-outline" size={22} color={COLORS.textSecondary} />
          <Text style={styles.profileMenuText}>云端同步</Text>
          <Ionicons name="chevron-forward-outline" size={20} color={COLORS.textPlaceholder} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.profileMenuItem}>
          <Ionicons name="settings-outline" size={22} color={COLORS.textSecondary} />
          <Text style={styles.profileMenuText}>设置</Text>
          <Ionicons name="chevron-forward-outline" size={20} color={COLORS.textPlaceholder} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.profileMenuItem}>
          <Ionicons name="help-circle-outline" size={22} color={COLORS.textSecondary} />
          <Text style={styles.profileMenuText}>使用帮助</Text>
          <Ionicons name="chevron-forward-outline" size={20} color={COLORS.textPlaceholder} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.profileMenuItem}>
          <Ionicons name="information-circle-outline" size={22} color={COLORS.textSecondary} />
          <Text style={styles.profileMenuText}>关于我们</Text>
          <Ionicons name="chevron-forward-outline" size={20} color={COLORS.textPlaceholder} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* 顶部标题 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>艾尔法客服助手</Text>
        <Text style={styles.headerSubtitle}>义齿加工 · 专业回复生成</Text>
      </View>

      {/* 内容区域 */}
      <View style={styles.content}>
        {activeTab === 'polish' && renderPolishTab()}
        {activeTab === 'history' && renderHistoryTab()}
        {activeTab === 'templates' && renderTemplatesTab()}
        {activeTab === 'knowledge' && renderKnowledgeTab()}
        {activeTab === 'profile' && renderProfileTab()}
      </View>

      {/* 底部导航栏 */}
      <View style={[styles.tabBar, { paddingBottom: insets.bottom || 12 }]}>
        {TAB_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.tabItem}
            onPress={() => setActiveTab(item.key)}
          >
            <Ionicons
              name={item.icon as any}
              size={24}
              color={activeTab === item.key ? COLORS.primary : COLORS.textPlaceholder}
            />
            <Text style={[styles.tabLabel, activeTab === item.key && styles.tabLabelActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 图片预览弹窗 */}
      <Modal visible={!!imagePreviewUri} transparent animationType="fade" onRequestClose={() => setImagePreviewUri(null)}>
        <TouchableOpacity style={styles.previewModal} activeOpacity={1} onPress={() => setImagePreviewUri(null)}>
          <View style={styles.previewContainer}>
            {imagePreviewUri && (
              <Image source={{ uri: imagePreviewUri }} style={styles.previewImage} resizeMode="contain" />
            )}
            <TouchableOpacity style={styles.previewClose} onPress={() => setImagePreviewUri(null)}>
              <Ionicons name="close-circle" size={32} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },

  // 风格选择
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  styleContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  styleButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  styleButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  styleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  styleLabelActive: {
    color: '#FFFFFF',
  },
  styleDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  styleDescActive: {
    color: 'rgba(255,255,255,0.8)',
  },

  // 输入区域
  inputCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    minHeight: 140,
  },
  textInput: {
    fontSize: 15,
    color: COLORS.textPrimary,
    minHeight: 100,
    lineHeight: 22,
  },
  inputActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 16,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  iconButton: {
    padding: 4,
  },

  // 图片预览
  imageRow: {
    flexDirection: 'row',
  },
  imageThumb: {
    position: 'relative',
    marginRight: 10,
  },
  thumbImage: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
  },
  imageIndex: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageIndexText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  removeImage: {
    position: 'absolute',
    top: -6,
    right: -6,
  },

  // 主按钮
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // 结果卡片
  resultCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  resultActions: {
    flexDirection: 'row',
    gap: 16,
  },
  resultActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resultActionText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '500',
  },
  resultContent: {
    minHeight: 60,
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
    lineHeight: 24,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  resetText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  // 历史记录
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  historyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  clearText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textPlaceholder,
    marginTop: 12,
  },
  historyItem: {
    backgroundColor: COLORS.surface,
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
    backgroundColor: COLORS.background,
  },
  historyInputArea: {
    flex: 1,
  },
  historyInputText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  expandText: {
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
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  historyResultArea: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 10,
  },
  historyResultText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  historyFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
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

  // 话术库
  templateHeader: {
    marginBottom: 12,
  },
  templateTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  templateSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  categoryScroll: {
    maxHeight: 50,
    marginBottom: 12,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 16,
  },
  categoryItem: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
  },
  categoryItemActive: {
    backgroundColor: COLORS.primary,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  templateList: {
    flex: 1,
  },
  templateItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  templateItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  templateBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  templateBadgeText: {
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
    borderTopColor: COLORS.border,
  },
  templateInsertText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '500',
  },

  // 知识库
  knowledgeHeader: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  knowledgeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 16,
  },
  knowledgeSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  knowledgeList: {
    gap: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    overflow: 'hidden',
  },
  knowledgeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.surface,
    gap: 12,
  },
  knowledgeItemText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  knowledgeTip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
    paddingVertical: 12,
  },
  knowledgeTipText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  // 我的
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 16,
  },
  profileVersion: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  profileMenu: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    overflow: 'hidden',
  },
  profileMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  profileMenuText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textPrimary,
  },

  // 底部导航栏
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 11,
    color: COLORS.textPlaceholder,
    marginTop: 2,
  },
  tabLabelActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },

  // 图片预览
  previewModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: '80%',
  },
  previewClose: {
    position: 'absolute',
    top: 50,
    right: 20,
  },
});
