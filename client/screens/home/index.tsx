import React, { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { createFormDataFile } from '@/utils';
import Toast from 'react-native-toast-message';
import RNSSE from 'react-native-sse';

const API_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';

// 柔和卡片风配色
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
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [resultText, setResultText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const recordingRef = useRef<Audio.Recording | null>(null);
  const sseRef = useRef<RNSSE | null>(null);
  const resultTextRef = useRef('');

  // 请求麦克风权限
  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // 清理 SSE 连接
  useEffect(() => {
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
      }
    };
  }, []);

  // 开始录音
  const startRecording = async () => {
    if (!hasPermission) {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('需要权限', '请授予麦克风权限以使用语音输入');
        return;
      }
      setHasPermission(true);
    }

    if (recordingRef.current) {
      await recordingRef.current.stopAndUnloadAsync();
      recordingRef.current = null;
    }

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (error) {
      console.error('录音失败:', error);
      Alert.alert('错误', '录音启动失败，请重试');
    }
  };

  // 停止录音
  const stopRecording = async () => {
    if (!recordingRef.current) return;

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);

      if (uri) {
        await handleRecordingComplete(uri);
      }
    } catch (error) {
      console.error('停止录音失败:', error);
      setIsRecording(false);
    }
  };

  // 处理录音完成
  const handleRecordingComplete = async (uri: string) => {
    try {
      setIsUploading(true);
      const formData = new FormData();
      const file = await createFormDataFile(uri, 'recording.m4a', 'audio/m4a');
      formData.append('audio', file as any);

      const response = await fetch(`${API_BASE_URL}/api/v1/speech-to-text`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('语音识别失败');
      }

      const data = await response.json();
      
      if (data.text) {
        const newText = inputText ? `${inputText}\n${data.text}` : data.text;
        setInputText(newText);
        Toast.show({
          type: 'success',
          text1: '语音识别成功',
          text2: '已添加到输入框',
        });
      } else {
        Alert.alert('识别失败', '未能识别语音内容，请重试');
      }
    } catch (error) {
      console.error('上传失败:', error);
      Alert.alert('错误', '语音上传失败，请重试');
    } finally {
      setIsUploading(false);
    }
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
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setImageUri(result.assets[0].uri);
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
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('拍照失败:', error);
      Alert.alert('错误', '拍照失败，请重试');
    }
  };

  // 删除图片
  const removeImage = () => {
    setImageUri(null);
  };

  // AI润色处理 - 使用 SSE 流式
  const handlePolish = async () => {
    if (!inputText.trim() && !imageUri) {
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
      let imageUrl = '';
      if (imageUri) {
        setIsUploading(true);
        const formData = new FormData();
        const fileName = imageUri.split('/').pop() || 'image.jpg';
        const file = await createFormDataFile(imageUri, fileName, 'image/jpeg');
        formData.append('file', file as any);

        const uploadResponse = await fetch(`${API_BASE_URL}/api/v1/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error('图片上传失败');
        }

        const uploadData = await uploadResponse.json();
        imageUrl = uploadData.url;
        setIsUploading(false);
      }

      // 使用 SSE 流式请求
      const sse = new RNSSE(`${API_BASE_URL}/api/v1/polish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: inputText,
          imageUrl: imageUrl,
        }),
      });

      sseRef.current = sse;

      sse.addEventListener('message', (event) => {
        if (event.data === '[DONE]') {
          setResultText(resultTextRef.current);
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
      Toast.show({
        type: 'success',
        text1: '已复制',
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
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('提示', '当前设备不支持分享');
        return;
      }

      // 使用临时目录
      const tempDir = Platform.OS === 'ios' 
        ? (FileSystem as any).cacheDirectory || '/tmp/'
        : (FileSystem as any).cacheDirectory || '/data/local/tmp/';
      const fileUri = `${tempDir}polish_result.txt`;
      await (FileSystem as any).writeAsStringAsync(fileUri, resultText);
      
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/plain',
        dialogTitle: '分享润色结果',
      });
    } catch (error) {
      console.error('分享失败:', error);
      Alert.alert('错误', '分享失败');
    }
  };

  // 重新开始
  const resetPolish = () => {
    if (sseRef.current) {
      sseRef.current.close();
    }
    setInputText('');
    setImageUri(null);
    setResultText('');
    resultTextRef.current = '';
  };

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
          <Text style={styles.heroTitle}>客服回复润色助手</Text>
          <Text style={styles.heroSubtitle}>义齿加工技术支持 · 专业回复生成</Text>
        </View>

        {/* 输入区域 */}
        <View style={styles.inputCard}>
          <Text style={styles.sectionTitle}>客户问题 / 原始草稿</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="输入客户问题、对话截图的文字内容，或您想润色的原始回复草稿..."
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
              style={[
                styles.actionButton,
                isRecording && styles.actionButtonRecording,
              ]}
              onPressIn={startRecording}
              onPressOut={stopRecording}
              disabled={isUploading || isProcessing}
            >
              <Ionicons
                name={isRecording ? 'mic' : 'mic-outline'}
                size={22}
                color={isRecording ? '#FFFFFF' : COLORS.primary}
              />
              <Text
                style={[
                  styles.actionButtonText,
                  isRecording && styles.actionButtonTextRecording,
                ]}
              >
                {isRecording ? '录音中' : '语音输入'}
              </Text>
            </TouchableOpacity>

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
          </View>

          {/* 图片预览 */}
          {imageUri && (
            <View style={styles.imagePreviewContainer}>
              <Image source={{ uri: imageUri }} style={styles.imagePreview} />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={removeImage}
              >
                <Ionicons name="close-circle" size={28} color={COLORS.recording} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* 润色按钮 */}
        <TouchableOpacity
          style={[
            styles.primaryButton,
            (isProcessing || isUploading) && styles.primaryButtonDisabled,
          ]}
          onPress={handlePolish}
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
                {imageUri ? '多模态润色' : 'AI 润色'}
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
                  <TouchableOpacity
                    style={styles.resultActionButton}
                    onPress={copyResult}
                  >
                    <Ionicons name="copy-outline" size={18} color={COLORS.primary} />
                    <Text style={styles.resultActionText}>复制</Text>
                  </TouchableOpacity>
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

        {/* 重新开始按钮 */}
        {resultText && (
          <TouchableOpacity
            style={styles.resetButton}
            onPress={resetPolish}
          >
            <Ionicons name="refresh-outline" size={18} color={COLORS.textSecondary} />
            <Text style={styles.resetButtonText}>重新开始</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // Hero Section
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  heroIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.shadowDark,
        shadowOffset: { width: 6, height: 6 },
        shadowOpacity: 0.7,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },

  // Input Card
  inputCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.shadowDark,
        shadowOffset: { width: 6, height: 6 },
        shadowOpacity: 0.7,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  inputContainer: {
    backgroundColor: COLORS.inset,
    borderRadius: 16,
    padding: 16,
    minHeight: 120,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  textInput: {
    fontSize: 15,
    color: COLORS.textPrimary,
    minHeight: 100,
  },

  // Action Row
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryLight,
    borderRadius: 12,
    paddingVertical: 12,
    gap: 6,
  },
  actionButtonRecording: {
    backgroundColor: COLORS.recording,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  actionButtonTextRecording: {
    color: '#FFFFFF',
  },

  // Image Preview
  imagePreviewContainer: {
    position: 'relative',
    marginTop: 16,
  },
  imagePreview: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    resizeMode: 'cover',
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
  },

  // Primary Button
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 9999,
    paddingVertical: 16,
    paddingHorizontal: 32,
    gap: 8,
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  uploadingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },

  // Result Card
  resultCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.shadowDark,
        shadowOffset: { width: 6, height: 6 },
        shadowOpacity: 0.7,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultActions: {
    flexDirection: 'row',
    gap: 12,
  },
  resultActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resultActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  resultContainer: {
    backgroundColor: COLORS.inset,
    borderRadius: 16,
    padding: 16,
    minHeight: 100,
  },
  resultText: {
    fontSize: 15,
    color: COLORS.textPrimary,
    lineHeight: 24,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },

  // Reset Button
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    marginTop: 8,
  },
  resetButtonText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});
