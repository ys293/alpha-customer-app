# 艾尔法客服助手 - 构建指南

## 当前版本
艾尔法客服助手 v1.0

## 功能特性
- ✅ 文字输入润色
- ✅ 多图片上传分析
- ✅ AI智能润色（专业/亲切/简洁三种风格）
- ✅ 历史记录保存
- ✅ 复制/分享功能
- ⏳ 云端同步（待开发）

## 构建APK安装包

### 方式一：本地构建（推荐）

1. **安装依赖**
```bash
cd client
npm install
```

2. **配置EAS**
```bash
# 登录Expo账号
npx eas login

# 或设置环境变量（CI/CD场景）
# export EXPO_TOKEN="your_token"
```

3. **构建APK**
```bash
# 云端构建（自动处理所有依赖）
eas build --platform android --profile preview

# 本地构建（需要本地配置Android SDK）
eas build --platform android --profile preview --local
```

### 方式二：使用Expo Go预览

```bash
cd client
npx expo start
```

然后用Expo Go App扫描二维码即可预览。

## APK安装

构建完成后，APK文件会生成在：
- 云端构建：`https://expo.dev/artifacts/...`
- 本地构建：`android/app/build/outputs/apk/debug/app-debug.apk`

将APK文件传输到手机，安装即可使用。

## 后端服务配置

修改 `client/app.config.ts` 中的后端地址：

```typescript
apiBaseUrl: "http://你的服务器地址:9091"
```

## 联系支持
如有问题，请联系技术支持。
