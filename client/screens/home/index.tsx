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
  { id: 't1', category: '订单确认', title: '加工单确认', content: '您好，您的加工单已收到，我们将在确认模型及设计要求后安排生产，预计出货时间为XX日。如有任何疑问，请随时联系我们。' },
  { id: 't2', category: '订单确认', title: '加急确认', content: '您好，您的加急订单已确认。我们将优先安排生产，预计可在XX日前完成并发出。如需进一步沟通，请联系您的专属客服。' },
  { id: 't3', category: '订单确认', title: '设计稿确认', content: '您好，设计稿已完成，请您查看附件。如对设计有调整要求，请在XX日前反馈，逾期将默认确认并开始制作。感谢配合！' },
  { id: 't4', category: '交期咨询', title: '交期回复', content: '您好，根据目前生产排单情况，您的订单预计可在XX日出货。我们会提前一天通知您发货，请保持电话畅通。' },
  { id: 't5', category: '交期咨询', title: '延期说明', content: '您好，非常抱歉告知，由于近期订单量较大，您的订单需要延后XX天完成。我们会加急处理，预计XX日出货，敬请谅解。' },
  { id: 't6', category: '交期咨询', title: '物流查询', content: '您好，您的订单已于XX日通过XX快递发出，单号为XXXXX，请注意查收。如有物流异常，请及时联系我们。' },
  { id: 't7', category: '技术问题', title: '备牙要求', content: '您好，关于您咨询的备牙问题，建议基牙预备时保证足够的肩台宽度（建议0.5mm以上）和良好的聚合度（建议6-8度），以确保修复体密合度。' },
  { id: 't8', category: '技术问题', title: '比色说明', content: '您好，关于比色建议：①请在自然光下进行比色；②比色板应湿润但无多余水分；③建议拍摄患牙及邻牙照片供我们参考。' },
  { id: 't9', category: '技术问题', title: '印模要求', content: '您好，请注意印模要求：①建议使用硅橡胶或聚醚橡胶取模；②印模必须清晰完整，无气泡、无撕裂。' },
  { id: 't10', category: '调改问题', title: '调改确认', content: '您好，您的调改要求已确认。我们将尽快安排处理，预计可在原定交期基础上延长XX天。' },
  { id: 't11', category: '调改问题', title: '返工说明', content: '您好，非常抱歉给您带来不便。我们已收到您的返工件，将重新制作。预计完成时间为XX日。' },
  { id: 't12', category: '产品材质', title: '材质说明', content: '您好，感谢您的咨询。该产品采用XX材质，具有生物相容性好、强度高、美观性好等特性。' },
  { id: 't13', category: '费用核算', title: '报价说明', content: '您好，您咨询的报价如下：XX产品XX元/颗，加工费XX元，合计XX元。以上为不含税价格。' },
  { id: 't14', category: '物流快递', title: '发货通知', content: '您好，您的订单已发货！快递单号：XXXXX，预计XX日送达。请注意查收并及时反馈签收情况。' },
  { id: 't15', category: '质量反馈', title: '问题受理', content: '您好，感谢您的反馈。我们已收到您描述的问题，将尽快核实处理。请您提供清晰的问题照片及义齿编号。' },
  { id: 't16', category: '售后跟进', title: '使用回访', content: '您好，打扰一下，请问您近期制作的义齿使用情况如何？佩戴是否舒适？有无其他问题需要协助处理？' },
  { id: 't17', category: '日常沟通', title: '节日问候', content: '您好，XX节将至，祝您XX节快乐！感谢您一直以来的信任与支持，我们将继续为您提供优质的服务！' },
  { id: 't18', category: '日常沟通', title: '感谢合作', content: '您好，感谢您长期以来的支持与信任！我们将继续努力，为您提供更优质的产品和服务！' },
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

  // 插入模板
  const insertTemplate = (template: TemplateItem) => {
    setInputText(prev => prev ? `${prev}\n\n【${template.title}】\n${template.content}` : `【${template.title}】\n${template.content}`);
    setActiveTab('polish');
    Toast.show({ type: 'success', text1: '已插入', text2: template.title });
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
          <TouchableOpacity key={template.id} style={styles.templateItem} onPress={() => insertTemplate(template)}>
            <View style={styles.templateItemHeader}>
              <View style={styles.templateBadge}><Text style={styles.templateBadgeText}>{template.category}</Text></View>
              <Text style={styles.templateItemTitle}>{template.title}</Text>
            </View>
            <Text style={styles.templateItemContent} numberOfLines={3}>{template.content}</Text>
            <View style={styles.templateItemFooter}>
              <Text style={styles.templateInsertText}>点击插入到输入框</Text>
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
